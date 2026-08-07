import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { eq, and, desc, ne } from "drizzle-orm";
import { creditCostForGenerationType } from "@workspace/studio-credit-engine";
import { db, rendersTable, usersTable, renderDeletionEventsTable } from "@workspace/db";
import { CreateRenderBody, GetRenderParams } from "@workspace/api-zod";
import { runAIPipeline } from "../services/ai-pipeline";
import {
  resolveRenderLedgerMetadata,
  type GenerationType,
} from "../services/render-ledger-metadata.js";
import {
  assertStudioCreditsAvailable,
  beginGenerationCreditTransaction,
  completeStudioCreditTransaction,
  failStudioCreditTransaction,
  getBillingCycleLedgerStats,
  getStudioCreditBalance,
} from "../services/studio-credit-service.js";
import {
  findActiveGenerationBatch,
  reconcileStaleCommercialState,
  withUserGenerationLock,
} from "../services/generation-idempotency.js";
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

const router: IRouter = Router();

function serializeRender(render: typeof rendersTable.$inferSelect) {
  return {
    ...render,
    workspaceId: render.userId,
    assetLineage: buildAssetLineageRecord(render),
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
  const cycleStats = await getBillingCycleLedgerStats(userId, tier);

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

  const renders = await db
    .select()
    .from(rendersTable)
    .where(eq(rendersTable.userId, userId))
    .orderBy(desc(rendersTable.createdAt));

  res.json(renders.map(serializeRender));
});

router.post("/renders", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const pipelineTrace = createPipelineTrace({
    generationSessionId: null,
    primaryRenderId: 0,
    renderIds: [],
    userId,
    shots: 0,
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
  const shots = isRefinement ? 1 : ((imageCount ?? 1) as 1 | 2 | 4);

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

    const lockResult = await withUserGenerationLock<GenerationLockResult>(
      userId,
      async () => {
        await reconcileStaleCommercialState(userId);

        const activeBatch = await findActiveGenerationBatch(userId);
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
          const [foundParent] = await db
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
            const [row] = await db
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
        );

        const generationSessionId =
          isRefinement && masterRender
            ? masterRender.generationSessionId ?? randomUUID()
            : isRefinement && parentRender
              ? parentRender.generationSessionId ?? null
              : randomUUID();

        const insertedRows = await Promise.all(
          Array.from({ length: shots }, () =>
            db
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
              })
              .returning()
              .then(([row]) => row!),
          ),
        );

        if (!isRefinement) {
          await Promise.all(
            insertedRows.map((row) =>
              db
                .update(rendersTable)
                .set({ masterRenderId: row.id })
                .where(eq(rendersTable.id, row.id)),
            ),
          );
          for (const row of insertedRows) {
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

        let newCreditTransactionId: string | undefined;
        try {
          newCreditTransactionId = await beginGenerationCreditTransaction({
            userId,
            imageCount: shots,
            isRefinement,
            renderId: insertedRows[0]!.id,
          });

          logPipelineStage(pipelineTrace, PipelineStage.CREDIT_DEDUCTION_COMPLETE, {
            creditTransactionId: newCreditTransactionId,
          });

          await Promise.all(
            insertedRows.map((row) =>
              db
                .update(rendersTable)
                .set({ status: "processing" })
                .where(eq(rendersTable.id, row.id)),
            ),
          );
        } catch (setupError) {
          if (newCreditTransactionId) {
            await failStudioCreditTransaction(newCreditTransactionId);
          }
          await Promise.all(
            insertedRows.map((row) =>
              db
                .update(rendersTable)
                .set({ status: "failed" })
                .where(eq(rendersTable.id, row.id)),
            ),
          );
          throw setupError;
        }

        return {
          type: "created",
          insertedRows,
          creditTransactionId: newCreditTransactionId,
          generationSessionId,
          previousOutputUrl,
        };
      },
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

    async function finalizeCreditTransaction(): Promise<void> {
      if (batchTracker.finalized || !creditTransactionId) return;
      batchTracker.finalized = true;

      const allSucceeded =
        batchTracker.completed === shots && batchTracker.failed === 0;

      if (allSucceeded) {
        await completeStudioCreditTransaction(creditTransactionId);
      } else {
        await failStudioCreditTransaction(creditTransactionId);
      }

      logPipelineStage(pipelineTrace, PipelineStage.CREDIT_TRANSACTION_FINALIZED, {
        creditTransactionId,
        allSucceeded,
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
      previousOutputUrl,
      refinementPrompt,
      refinementType: validatedRefinementType,
      usedCameraAngles: usedCameraAngles ?? undefined,
      usedPoses: usedPoses ?? undefined,
      pipelineTrace,
      onComplete: async (outputImageUrl, imageIndex) => {
        const row = insertedRows[imageIndex];
        if (!row) return;
        await db
          .update(rendersTable)
          .set({ status: "completed", outputImageUrl })
          .where(eq(rendersTable.id, row.id));

        logPipelineStage(pipelineTrace, PipelineStage.DATABASE_UPDATE_COMPLETED, {
          renderId: row.id,
          imageIndex,
          status: "completed",
        });

        await noteBatchProgress("complete");
      },
      onShotError: async (_error, imageIndex) => {
        const row = insertedRows[imageIndex];
        if (!row) return;
        await db
          .update(rendersTable)
          .set({ status: "failed" })
          .where(eq(rendersTable.id, row.id));

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
      error: "Transparent PNG not available. Use Remove Background refinement first.",
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
