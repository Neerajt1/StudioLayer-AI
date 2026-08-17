import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { eq, and, desc, ne, inArray } from "drizzle-orm";
import { creditCostForGenerationType, creditCostPerCompletedImageInBatch, isValidCustomCampaignImageCount, normalizeOutputResolution, type OutputResolution } from "@workspace/studio-credit-engine";
import { db, rendersTable, usersTable, renderDeletionEventsTable } from "@workspace/db";
import { CreateRenderBody, GetRenderParams } from "@workspace/api-zod";
import { runAIPipeline } from "../services/ai-pipeline";
import { saveRenderPoseSelection } from "../services/pose-history-service";
import {
  resolveRenderLedgerMetadata,
  type GenerationType,
} from "../services/render-ledger-metadata.js";
import {
  assertStudioCreditsAvailable,
  beginGenerationCreditTransaction,
  failStudioCreditTransaction,
  finalizeGenerationCreditTransaction,
  getStudioCreditBalance,
} from "../services/studio-credit-service.js";
import {
  getCachedBillingCycleActivityStats,
  invalidateBillingCycleActivityStatsCache,
} from "../services/account-statement/billing-cycle-activity.js";
import {
  failStaleActiveGenerations,
  findActiveGenerationBatch,
  scheduleDeferredCommercialReconciliation,
  withUserGenerationLock,
} from "../services/generation-idempotency.js";
import {
  GENERATION_BUSY_ERROR_CODE,
  GENERATION_BUSY_HTTP_STATUS,
  isGenerationLockBusyError,
} from "../services/generation-lock.js";
import { ACTIVE_GENERATION_STATUSES } from "../services/generation-lifecycle.js";
import { logger } from "../lib/logger";
import { traceRenderFailure } from "../lib/render-pipeline-trace.js";
import {
  createPipelineTrace,
  logPipelineStage,
  PipelineStage,
} from "../lib/render-pipeline-observability.js";
import { streamRenderImageDownload } from "../lib/r2-download.js";
import {
  assertValidRefinementRequest,
  RefinementValidationError,
} from "../services/refinement/refinement-engine.js";
import { resolveMasterRenderFromDb } from "../services/image-architecture/master-asset.js";
import {
  resolveAssetLineageForMaster,
  resolveAssetLineageForRefinement,
  buildAssetLineageRecord,
} from "../services/image-architecture/asset-lineage.js";
import type { RefinementType } from "../services/refinement/refinement-types.js";
import {
  getPreviewImageUrl,
  hydratePreviewCache,
  clearPreviewAvailability,
} from "../services/image-processing/preview-registry.js";
import { deleteRenderPreviewFromR2 } from "../services/image-processing/preview-storage.js";
import { scheduleRenderPreviewGeneration } from "../services/image-processing/schedule-render-preview.js";
import { isFalBackgroundRemovalConfigured } from "../services/image-processing/index.js";

const router: IRouter = Router();

const PRESET_IMAGE_COUNTS = new Set([1, 2, 4]);

function validateGenerationImageCount(input: {
  imageCount: number | undefined;
  customCampaign: boolean | undefined;
}): { ok: true; shots: number; customCampaign: boolean } | { ok: false; error: string } {
  const count = input.imageCount ?? 1;
  const customCampaign = input.customCampaign === true;

  if (!Number.isInteger(count)) {
    return { ok: false, error: "imageCount must be an integer." };
  }

  if (customCampaign) {
    if (!isValidCustomCampaignImageCount(count)) {
      return {
        ok: false,
        error: "Custom Campaign image count must be an integer from 4 to 20.",
      };
    }
    return { ok: true, shots: count, customCampaign: true };
  }

  if (!PRESET_IMAGE_COUNTS.has(count)) {
    return {
      ok: false,
      error: "imageCount must be 1, 2, or 4 unless customCampaign is true.",
    };
  }

  return { ok: true, shots: count, customCampaign: false };
}

function serializeRender(render: typeof rendersTable.$inferSelect) {
  const previewImageUrl = getPreviewImageUrl(render.id);
  return {
    ...render,
    workspaceId: render.userId,
    assetLineage: buildAssetLineageRecord(render),
    previewImageUrl: previewImageUrl ?? null,
  };
}

function devErrorPayload(error: unknown): Record<string, unknown> | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;
  if (error instanceof Error) {
    const pg = error as Error & { code?: string; detail?: string };
    return {
      message: error.message,
      code: pg.code,
      detail: pg.detail,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

router.get("/renders/usage", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  scheduleDeferredCommercialReconciliation(userId);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const tier = user.subscriptionTier;
  const limit = user.isAdmin ? null : null;
  const balance = await getStudioCreditBalance({
    userId,
    tier,
    limit,
    isAdmin: user.isAdmin,
  });
  const cycleStats = await getCachedBillingCycleActivityStats(userId, tier);

  res.json({
    used: balance.used,
    limit: user.isAdmin ? null : balance.limit,
    tier,
    canRender: balance.canRender,
    isAdmin: user.isAdmin,
    remaining: user.isAdmin ? null : balance.remaining,
    cycleStats,
  });
});

router.get("/renders", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  scheduleDeferredCommercialReconciliation(userId);

  const renders = await db
    .select()
    .from(rendersTable)
    .where(eq(rendersTable.userId, userId))
    .orderBy(desc(rendersTable.createdAt));

  await hydratePreviewCache(renders.map((render) => render.id));

  res.json(renders.map(serializeRender));
});

router.post("/renders", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const ownerUserId = userId;

  const pipelineTrace = createPipelineTrace({
    generationSessionId: null,
    primaryRenderId: 0,
    renderIds: [],
    userId,
    shots: 0,
    httpRequestId: req.id == null ? undefined : String(req.id),
  });

  logPipelineStage(pipelineTrace, PipelineStage.REQUEST_RECEIVED);

  const parsed = CreateRenderBody.safeParse(req.body);
  if (!parsed.success) {
    traceRenderFailure(PipelineStage.VALIDATION_COMPLETE, parsed.error, {
      pipelineTrace,
      userId,
    });
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  logPipelineStage(pipelineTrace, PipelineStage.VALIDATION_COMPLETE);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const tier = user.subscriptionTier;
  const {
    sourceImageUrl,
    modelPersona,
    locationEnvironment,
    modelDemographics,
    imageDimensions,
    smartLighting,
    modelPose,
    modelGender,
    modelAgeRange,
    cameraFraming,
    garmentPlacement,
    garmentLengthSelection,
    modelIdentityId,
    outfitStyle,
    imageCount,
    customCampaign,
    outputResolution: rawOutputResolution,
    refinementPrompt,
    refinementType,
    parentRenderId,
    usedCameraAngles,
    usedPoses,
  } = parsed.data;

  let validatedRefinementType: RefinementType | undefined;
  try {
    if (parentRenderId && (refinementType || refinementPrompt)) {
      validatedRefinementType = assertValidRefinementRequest({
        parentRenderId,
        refinementType,
        refinementPrompt,
      });
    }
  } catch (error) {
    if (error instanceof RefinementValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const isRefinement = Boolean(parentRenderId && validatedRefinementType);
  const outputResolution: OutputResolution = isRefinement
    ? "2K"
    : normalizeOutputResolution(rawOutputResolution);
  const imageCountValidation = validateGenerationImageCount({
    imageCount: isRefinement ? 1 : imageCount,
    customCampaign: isRefinement ? false : customCampaign,
  });

  if (!imageCountValidation.ok) {
    traceRenderFailure(PipelineStage.VALIDATION_COMPLETE, new Error(imageCountValidation.error), {
      pipelineTrace,
      userId,
    });
    res.status(400).json({ error: imageCountValidation.error });
    return;
  }

  // Fail before creating a child render / credit hold when FAL is not configured.
  // Without FAL_KEY the pipeline uses NotImplemented and never reaches fal.subscribe.
  if (validatedRefinementType === "remove_background" && !isFalBackgroundRemovalConfigured()) {
    logger.error(
      { userId, parentRenderId, pipelineTrace },
      "Remove Background rejected: FAL_KEY is not configured on the API service",
    );
    res.status(503).json({
      error:
        "Remove Background is temporarily unavailable. Your original image is unchanged.",
    });
    return;
  }

  const { shots, customCampaign: isCustomCampaign } = imageCountValidation;

  let creditTransactionId: string | undefined;

  try {
    type GenerationLockResult =
      | { type: "duplicate"; renders: (typeof rendersTable.$inferSelect)[] }
      | { type: "forbidden"; message: string }
      | { type: "not_found"; message: string }
      | {
          type: "created";
          insertedRows: (typeof rendersTable.$inferSelect)[];
          creditTransactionId: string;
          generationSessionId: string | null;
          previousOutputUrl: string | null;
        };

    scheduleDeferredCommercialReconciliation(userId);

    const lockResult = await withUserGenerationLock<GenerationLockResult>(
      userId,
      async (tx) => {
        await failStaleActiveGenerations(userId, tx);

        if (isRefinement && parentRenderId) {
          const activeOnParent = await tx
            .select()
            .from(rendersTable)
            .where(
              and(
                eq(rendersTable.userId, userId),
                eq(rendersTable.parentRenderId, parentRenderId),
                inArray(rendersTable.status, ["pending", "processing"]),
              ),
            );

          if (activeOnParent.length > 0) {
            return { type: "duplicate", renders: activeOnParent };
          }
        }

        const activeBatch = await findActiveGenerationBatch(userId, tx);
        if (activeBatch.length > 0) {
          return { type: "duplicate", renders: activeBatch };
        }

        const creditCheck = await assertStudioCreditsAvailable({
          userId,
          tier,
          limit: null,
          isAdmin: user.isAdmin,
          imageCount: shots,
          isRefinement,
          customCampaign: isCustomCampaign,
          outputResolution: isRefinement ? "2K" : outputResolution,
        });

        if (!creditCheck.ok) {
          return { type: "forbidden", message: creditCheck.message };
        }

        let previousOutputUrl: string | null = null;
        let parentMetadata = null;
        let parentRender: (typeof rendersTable.$inferSelect) | undefined;
        let masterRender: (typeof rendersTable.$inferSelect) | undefined;
        let assetLineage = resolveAssetLineageForMaster();

        if (parentRenderId) {
          const [foundParent] = await tx
            .select()
            .from(rendersTable)
            .where(
              and(eq(rendersTable.id, parentRenderId), eq(rendersTable.userId, userId)),
            );

          if (!foundParent) {
            return { type: "not_found", message: "Parent render not found" };
          }
          parentRender = foundParent;
          previousOutputUrl = foundParent.outputImageUrl ?? null;

          masterRender = await resolveMasterRenderFromDb(foundParent, async (id) => {
            const [row] = await tx
              .select()
              .from(rendersTable)
              .where(and(eq(rendersTable.id, id), eq(rendersTable.userId, userId)));
            return row;
          });

          if (isRefinement && validatedRefinementType) {
            assetLineage = resolveAssetLineageForRefinement(
              foundParent,
              masterRender,
              validatedRefinementType,
            );
          }

          const metadataSource = isRefinement && masterRender ? masterRender : foundParent;
          const metadataType = (metadataSource.generationType ?? "hero") as GenerationType;
          parentMetadata = {
            generationType: metadataType,
            studioCreditsUsed:
              metadataSource.studioCreditsUsed ?? creditCostForGenerationType(metadataType),
            refinementCount: foundParent.refinementCount ?? 0,
          };
        }

        const ledgerMetadata = resolveRenderLedgerMetadata(
          parentRenderId ?? null,
          parentMetadata,
          shots,
          {
            customCampaign: isCustomCampaign,
            outputResolution: isRefinement ? "2K" : outputResolution,
          },
        );

        const generationSessionId =
          isRefinement && masterRender
            ? masterRender.generationSessionId ?? randomUUID()
            : isRefinement && parentRender
              ? parentRender.generationSessionId ?? null
              : randomUUID();

        const insertedRows: (typeof rendersTable.$inferSelect)[] = [];
        for (let i = 0; i < shots; i++) {
          const [row] = await tx
            .insert(rendersTable)
            .values({
              userId,
              sourceImageUrl,
              modelPersona,
              locationEnvironment,
              status: "pending",
              parentRenderId: assetLineage.parentRenderId,
              masterRenderId: assetLineage.masterRenderId,
              assetVersion: assetLineage.assetVersion,
              assetType: assetLineage.assetType,
              refinementType: assetLineage.refinementType,
              sourceAssetVersion: assetLineage.sourceAssetVersion,
              cropPreset: assetLineage.cropPreset,
              generationType: ledgerMetadata.generationType,
              studioCreditsUsed: ledgerMetadata.studioCreditsUsed,
              refinementCount: ledgerMetadata.refinementCount,
              generationSessionId,
              outputResolution: isRefinement ? "2K" : outputResolution,
            })
            .returning();
          insertedRows.push(row!);
        }

        if (!isRefinement) {
          for (const row of insertedRows) {
            await tx
              .update(rendersTable)
              .set({ masterRenderId: row.id })
              .where(eq(rendersTable.id, row.id));
            row.masterRenderId = row.id;
          }
        }

        pipelineTrace.generationSessionId = generationSessionId;
        pipelineTrace.primaryRenderId = insertedRows[0]!.id;
        pipelineTrace.renderIds = insertedRows.map((row) => row.id);
        pipelineTrace.shots = shots;

        logPipelineStage(pipelineTrace, PipelineStage.DATABASE_INSERT_COMPLETE, {
          renderIds: pipelineTrace.renderIds,
        });

        const newCreditTransactionId = await beginGenerationCreditTransaction({
          userId,
          imageCount: shots,
          isRefinement,
          customCampaign: isCustomCampaign,
          outputResolution: isRefinement ? "2K" : outputResolution,
          renderId: insertedRows[0]!.id,
          executor: tx,
        });

        logPipelineStage(pipelineTrace, PipelineStage.CREDIT_DEDUCTION_COMPLETE, {
          creditTransactionId: newCreditTransactionId,
        });

        for (const row of insertedRows) {
          await tx
            .update(rendersTable)
            .set({ status: "processing" })
            .where(eq(rendersTable.id, row.id));
        }

        return {
          type: "created" as const,
          insertedRows,
          creditTransactionId: newCreditTransactionId,
          generationSessionId,
          previousOutputUrl,
        };
      },
      { reqId: req.id == null ? undefined : String(req.id) },
    );

    if (lockResult.type === "duplicate") {
      logPipelineStage(pipelineTrace, PipelineStage.API_RESPONSE_RETURNED, {
        renderIds: lockResult.renders.map((row) => row.id),
        httpStatus: 200,
        deduplicated: true,
      });
      res.setHeader("X-Studio-Generation-Deduplicated", "true");
      res.status(200).json(
        lockResult.renders.map((row) =>
          serializeRender({ ...row, status: "processing" }),
        ),
      );
      return;
    }

    if (lockResult.type === "forbidden") {
      res.status(403).json({ error: lockResult.message });
      return;
    }

    if (lockResult.type === "not_found") {
      res.status(404).json({ error: lockResult.message });
      return;
    }

    const { insertedRows } = lockResult;
    creditTransactionId = lockResult.creditTransactionId;
    const previousOutputUrl = lockResult.previousOutputUrl;

    const batchTracker = {
      completed: 0,
      failed: 0,
      finalized: false,
    };

    const creditPerCompletedImage = creditCostPerCompletedImageInBatch({
      imageCount: shots,
      customCampaign: isCustomCampaign,
      isRefinement,
      outputResolution: isRefinement ? "2K" : outputResolution,
    });

    async function finalizeCreditTransaction(): Promise<void> {
      if (batchTracker.finalized || !creditTransactionId) return;
      batchTracker.finalized = true;

      const { chargedCredits } = await finalizeGenerationCreditTransaction({
        transactionId: creditTransactionId,
        completedCount: batchTracker.completed,
        creditPerCompletedImage,
      });
      invalidateBillingCycleActivityStatsCache(ownerUserId);

      if (chargedCredits > 0) {
        await db
          .update(rendersTable)
          .set({ studioCreditsUsed: chargedCredits })
          .where(inArray(rendersTable.id, insertedRows.map((row) => row.id)));
      }

      logPipelineStage(pipelineTrace, PipelineStage.CREDIT_TRANSACTION_FINALIZED, {
        creditTransactionId,
        allSucceeded: batchTracker.completed === shots && batchTracker.failed === 0,
        chargedCredits,
        completedCount: batchTracker.completed,
        failedCount: batchTracker.failed,
      });
    }

    async function noteBatchProgress(kind: "complete" | "fail"): Promise<void> {
      if (kind === "complete") {
        batchTracker.completed += 1;
      } else {
        batchTracker.failed += 1;
      }

      if (batchTracker.completed + batchTracker.failed >= shots) {
        await finalizeCreditTransaction();
      }
    }

    void runAIPipeline({
      renderId: insertedRows[0]!.id,
      userId,
      sourceImageUrl,
      modelPersona,
      locationEnvironment,
      modelDemographics,
      imageDimensions,
      smartLighting,
      modelPose,
      modelGender,
      modelAgeRange,
      cameraFraming,
      garmentPlacement,
      garmentLengthSelection,
      modelIdentityId,
      outfitStyle,
      shots,
      generationType: (insertedRows[0]!.generationType ?? "hero") as GenerationType,
      customCampaign: isCustomCampaign,
      outputResolution: isRefinement ? "2K" : outputResolution,
      previousOutputUrl,
      refinementPrompt,
      refinementType: validatedRefinementType,
      usedCameraAngles: usedCameraAngles ?? undefined,
      usedPoses: usedPoses ?? undefined,
      pipelineTrace,
      onComplete: async (outputImageUrl, imageIndex, poseSelection) => {
        const row = insertedRows[imageIndex];
        if (!row) return;
        const updated = await db
          .update(rendersTable)
          .set({ status: "completed", outputImageUrl })
          .where(
            and(
              eq(rendersTable.id, row.id),
              inArray(rendersTable.status, [...ACTIVE_GENERATION_STATUSES]),
            ),
          )
          .returning({ id: rendersTable.id });

        if (updated.length === 0) {
          logger.warn(
            { renderId: row.id, imageIndex },
            "onComplete ignored — render is no longer an active generation",
          );
          return;
        }

        logPipelineStage(pipelineTrace, PipelineStage.DATABASE_UPDATE_COMPLETED, {
          renderId: row.id,
          imageIndex,
          status: "completed",
        });

        await noteBatchProgress("complete");

        if (poseSelection) {
          try {
            await saveRenderPoseSelection({
              renderId: row.id,
              poseName: poseSelection.poseName,
              poseFamily: poseSelection.poseFamily,
            });
          } catch (poseError) {
            logger.warn(
              {
                renderId: row.id,
                imageIndex,
                err: poseError instanceof Error ? poseError.message : String(poseError),
              },
              "pose metadata save failed — render completed",
            );
          }
        }

        scheduleRenderPreviewGeneration({
          renderId: row.id,
          sourceImageUrl: outputImageUrl,
          preserveAlpha: row.refinementType === "remove_background",
        });
      },
      onShotError: async (_error, imageIndex) => {
        const row = insertedRows[imageIndex];
        if (!row) return;
        const updated = await db
          .update(rendersTable)
          .set({ status: "failed" })
          .where(
            and(
              eq(rendersTable.id, row.id),
              inArray(rendersTable.status, [...ACTIVE_GENERATION_STATUSES]),
            ),
          )
          .returning({ id: rendersTable.id });

        if (updated.length === 0) {
          return;
        }

        logPipelineStage(pipelineTrace, PipelineStage.DATABASE_UPDATE_COMPLETED, {
          renderId: row.id,
          imageIndex,
          status: "failed",
        });

        await noteBatchProgress("fail");
      },
      onError: async (error) => {
        traceRenderFailure(PipelineStage.RENDER_FAILED, error, {
          pipelineTrace,
          renderIds: insertedRows.map((r) => r.id),
        });
        await Promise.all(
          insertedRows.map((row) =>
            db
              .update(rendersTable)
              .set({ status: "failed" })
              .where(
                and(
                  eq(rendersTable.id, row.id),
                  ne(rendersTable.status, "completed"),
                ),
              ),
          ),
        );

        batchTracker.failed = shots - batchTracker.completed;
        await finalizeCreditTransaction();
      },
    }).catch(async (error) => {
      if (batchTracker.finalized) return;

      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(
        {
          userId,
          renderIds: insertedRows.map((r) => r.id),
          err: err.message,
        },
        "AI pipeline: unhandled failure — forcing credit finalization",
      );

      try {
        await Promise.all(
          insertedRows.map((row) =>
            db
              .update(rendersTable)
              .set({ status: "failed" })
              .where(
                and(
                  eq(rendersTable.id, row.id),
                  ne(rendersTable.status, "completed"),
                ),
              ),
          ),
        );
        batchTracker.failed = shots - batchTracker.completed;
        await finalizeCreditTransaction();
      } catch (finalizeError) {
        logger.error(
          {
            userId,
            creditTransactionId,
            err:
              finalizeError instanceof Error
                ? finalizeError.message
                : String(finalizeError),
          },
          "AI pipeline: credit finalization failed after unhandled error",
        );
      }
    });

    logPipelineStage(pipelineTrace, PipelineStage.API_RESPONSE_RETURNED, {
      renderIds: pipelineTrace.renderIds,
      httpStatus: 201,
    });

    res.status(201).json(
      insertedRows.map((row) => serializeRender({ ...row, status: "processing" })),
    );
  } catch (error) {
    if (isGenerationLockBusyError(error)) {
      const activeBatch = await findActiveGenerationBatch(userId);
      if (activeBatch.length > 0) {
        logPipelineStage(pipelineTrace, PipelineStage.API_RESPONSE_RETURNED, {
          renderIds: activeBatch.map((row) => row.id),
          httpStatus: 200,
          deduplicated: true,
          lockBusy: true,
        });
        res.setHeader("X-Studio-Generation-Deduplicated", "true");
        res.status(200).json(
          activeBatch.map((row) =>
            serializeRender({ ...row, status: "processing" }),
          ),
        );
        return;
      }

      res.status(GENERATION_BUSY_HTTP_STATUS).json({
        error: "Studio is still preparing this Shoot.",
        code: GENERATION_BUSY_ERROR_CODE,
      });
      return;
    }

    if (creditTransactionId) {
      try {
        await failStudioCreditTransaction(creditTransactionId);
      } catch (failError) {
        logger.error(
          {
            userId,
            creditTransactionId,
            err:
              failError instanceof Error ? failError.message : String(failError),
          },
          "POST /renders failed to mark pending credit transaction as failed",
        );
      }
    }

    traceRenderFailure(PipelineStage.RENDER_FAILED, error, {
      pipelineTrace,
      userId,
      shots,
      isRefinement,
    });
    logger.error(
      {
        userId,
        shots,
        isRefinement,
        err: error instanceof Error ? error.message : String(error),
      },
      "POST /renders failed before provider dispatch",
    );
    res.status(500).json({
      error: "Internal server error",
      ...(devErrorPayload(error) ? { details: devErrorPayload(error) } : {}),
    });
  }
});

router.delete("/renders/:id", async (req, res): Promise<void> => {
  const userId = Number(req.session?.userId);
  if (!userId || isNaN(userId)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid render ID" });
    return;
  }

  const [render] = await db
    .select()
    .from(rendersTable)
    .where(and(eq(rendersTable.id, id), eq(rendersTable.userId, userId)));

  if (!render) {
    res.status(404).json({ error: "Render not found" });
    return;
  }

  const [user] = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  await db.insert(renderDeletionEventsTable).values({
    userId,
    renderId: render.id,
    generationSessionId: render.generationSessionId,
    generationType: render.generationType,
    originalCreditsConsumed: render.studioCreditsUsed,
    deletedBy: user?.isAdmin ? "admin" : "user",
  });

  await deleteRenderPreviewFromR2(render.id);
  clearPreviewAvailability(render.id);

  await db
    .delete(rendersTable)
    .where(and(eq(rendersTable.id, id), eq(rendersTable.userId, userId)));

  res.status(204).send();
});

router.get("/renders/:id", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetRenderParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  scheduleDeferredCommercialReconciliation(userId);

  const [render] = await db
    .select()
    .from(rendersTable)
    .where(
      and(
        eq(rendersTable.id, params.data.id),
        eq(rendersTable.userId, userId),
      ),
    );

  if (!render) {
    res.status(404).json({ error: "Render not found" });
    return;
  }

  await hydratePreviewCache([render.id]);

  res.json(serializeRender(render));
});

router.get("/renders/:id/download", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid render ID" });
    return;
  }

  const [render] = await db
    .select()
    .from(rendersTable)
    .where(and(eq(rendersTable.id, id), eq(rendersTable.userId, userId)));

  if (!render?.outputImageUrl) {
    res.status(404).json({ error: "Render image not found" });
    return;
  }

  const extMatch = render.outputImageUrl.split("?")[0]?.match(/\.(png|jpe?g|webp)$/i);
  const ext = extMatch?.[1]?.toLowerCase().replace("jpeg", "jpg") ?? "png";
  const filename = `studiolayer-hero-${id}.${ext}`;

  try {
    logger.info(
      { userId, renderId: id, outputImageUrl: render.outputImageUrl },
      "render-download: streaming image",
    );
    await streamRenderImageDownload(render.outputImageUrl, res, filename);
  } catch (error) {
    logger.error(
      {
        userId,
        renderId: id,
        outputImageUrl: render.outputImageUrl,
        err: error instanceof Error ? error.message : String(error),
      },
      "render-download: failed",
    );
    if (!res.headersSent) {
      res.status(502).json({ error: "Download failed" });
    }
  }
});

router.get("/renders/:id/download/transparent", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid render ID" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [render] = await db
    .select()
    .from(rendersTable)
    .where(and(eq(rendersTable.id, id), eq(rendersTable.userId, userId)));

  if (!render?.outputImageUrl) {
    res.status(404).json({ error: "Render image not found" });
    return;
  }

  const filename = `studiolayer-transparent-${id}.png`;
  const cachedTransparentUrl = render.transparentOutputImageUrl;

  if (!cachedTransparentUrl) {
    res.status(404).json({
      error: "Transparent PNG not available. Use Remove Background first.",
      code: "TRANSPARENT_NOT_AVAILABLE",
    });
    return;
  }

  try {
    logger.info(
      { userId, renderId: id, transparentUrl: cachedTransparentUrl },
      "render-download: streaming transparent PNG (free)",
    );
    await streamRenderImageDownload(cachedTransparentUrl, res, filename);
  } catch (error) {
    logger.error(
      {
        userId,
        renderId: id,
        err: error instanceof Error ? error.message : String(error),
      },
      "render-download: transparent download failed",
    );
    if (!res.headersSent) {
      res.status(502).json({ error: "Download failed" });
    }
  }
});

export default router;
