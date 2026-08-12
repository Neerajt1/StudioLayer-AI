// ---------------------------------------------------------------------------
// Pose History Service — Phase 2
//
// Loads prior pose selections for the same user + uploaded garment (sourceImageUrl).
// Garment article identity uses the existing stable sourceImageUrl — no new article ID.
// ---------------------------------------------------------------------------

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, rendersTable } from "@workspace/db";
import type { PoseFamily, PoseName, ShootType } from "../intelligence/pose-library";
import {
  buildPoseProfileKey,
  type RecentPoseSelection,
} from "../intelligence/pose-selection-engine";
import type { GarmentProfile } from "../intelligence/types";
import { logger } from "../lib/logger";

export const POSE_HISTORY_LOOKBACK = 48;

const POSE_HISTORY_INDEX = "renders_user_source_pose_history_idx";

/** Stable garment article key — same upload URL = same garment article. */
export function buildGarmentArticleKey(sourceImageUrl: string): string {
  return sourceImageUrl.trim();
}

/** Extract safe PostgreSQL error fields from Drizzle/pg error chains. */
export function extractPostgresErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const chain: Error[] = [];
  let current: Error | undefined = error;
  while (current) {
    chain.push(current);
    current = current.cause instanceof Error ? current.cause : undefined;
  }

  const pg = chain.find(
    (entry): entry is Error & {
      code?: string;
      detail?: string;
      constraint?: string;
      table?: string;
      column?: string;
    } => typeof (entry as { code?: string }).code === "string",
  );

  return {
    message: error.message,
    pgCode: pg?.code,
    pgDetail: pg?.detail,
    pgConstraint: pg?.constraint,
    pgTable: pg?.table,
    pgColumn: pg?.column,
  };
}

function isPoseHistoryIndexRowSizeError(error: unknown): boolean {
  const details = extractPostgresErrorDetails(error);
  if (details.pgCode === "54000") return true;

  const message = typeof details.message === "string" ? details.message : "";
  return message.includes("index row requires") && message.includes("maximum size is 8191");
}

/**
 * Migration 010 indexed full source_image_url for pose history lookups.
 * Data-URI garment uploads exceed PostgreSQL btree index row limits once
 * selected_pose_name is set on a completed render.
 */
async function dropPoseHistoryIndexIfOversized(error: unknown): Promise<boolean> {
  if (!isPoseHistoryIndexRowSizeError(error)) return false;

  logger.warn(
    {
      ...extractPostgresErrorDetails(error),
      index: POSE_HISTORY_INDEX,
    },
    "pose history index exceeds PostgreSQL row-size limit — dropping index so pose metadata can persist",
  );

  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${POSE_HISTORY_INDEX}`));
  return true;
}

async function runRenderUpdateWithPoseIndexRecovery(
  renderId: number,
  setValues: {
    status: "completed";
    outputImageUrl: string;
    selectedPoseName?: PoseName;
    selectedPoseFamily?: PoseFamily;
  },
): Promise<void> {
  const applyUpdate = async () => {
    const updated = await db
      .update(rendersTable)
      .set(setValues)
      .where(eq(rendersTable.id, renderId))
      .returning({ id: rendersTable.id });

    if (updated.length === 0) {
      throw new Error(`Render ${renderId} not found for completion update`);
    }
  };

  try {
    await applyUpdate();
  } catch (error) {
    if (await dropPoseHistoryIndexIfOversized(error)) {
      await applyUpdate();
      return;
    }
    throw error;
  }
}

function shootTypeFromGenerationType(generationType: string | null): ShootType {
  if (generationType === "editorial") return "editorial";
  if (generationType === "campaign") return "campaign";
  return "hero";
}

export async function loadRecentPoseSelections(params: {
  userId: number;
  sourceImageUrl: string;
  profile: GarmentProfile;
  shootType?: ShootType;
  limit?: number;
}): Promise<RecentPoseSelection[]> {
  const { userId, sourceImageUrl, profile, shootType, limit = POSE_HISTORY_LOOKBACK } = params;
  const profileKey = buildPoseProfileKey(profile);
  const garmentKey = buildGarmentArticleKey(sourceImageUrl);

  const rows = await db
    .select({
      selectedPoseName: rendersTable.selectedPoseName,
      selectedPoseFamily: rendersTable.selectedPoseFamily,
      generationType: rendersTable.generationType,
    })
    .from(rendersTable)
    .where(
      and(
        eq(rendersTable.userId, userId),
        eq(rendersTable.sourceImageUrl, garmentKey),
        eq(rendersTable.status, "completed"),
        isNotNull(rendersTable.selectedPoseName),
      ),
    )
    .orderBy(desc(rendersTable.createdAt))
    .limit(limit);

  const results: RecentPoseSelection[] = [];
  for (const row of rows) {
    const name = row.selectedPoseName as PoseName;
    const rowShootType = shootTypeFromGenerationType(row.generationType);
    if (shootType && rowShootType !== shootType) continue;
    results.push({
      poseName: name,
      shootType: rowShootType,
      profileKey,
      poseFamily: (row.selectedPoseFamily as PoseFamily | null) ?? undefined,
    });
  }
  return results;
}

export async function completeRenderWithPoseMetadata(params: {
  renderId: number;
  outputImageUrl: string;
  poseSelection?: {
    poseName: PoseName;
    poseFamily: PoseFamily;
  };
}): Promise<void> {
  await runRenderUpdateWithPoseIndexRecovery(params.renderId, {
    status: "completed",
    outputImageUrl: params.outputImageUrl,
    ...(params.poseSelection
      ? {
          selectedPoseName: params.poseSelection.poseName,
          selectedPoseFamily: params.poseSelection.poseFamily,
        }
      : {}),
  });
}

export async function saveRenderPoseSelection(params: {
  renderId: number;
  poseName: PoseName;
  poseFamily: PoseFamily;
}): Promise<void> {
  const applyUpdate = async () => {
    const updated = await db
      .update(rendersTable)
      .set({
        selectedPoseName: params.poseName,
        selectedPoseFamily: params.poseFamily,
      })
      .where(eq(rendersTable.id, params.renderId))
      .returning({ id: rendersTable.id });

    if (updated.length === 0) {
      throw new Error(`Render ${params.renderId} not found for pose metadata save`);
    }
  };

  try {
    await applyUpdate();
  } catch (error) {
    if (await dropPoseHistoryIndexIfOversized(error)) {
      await applyUpdate();
      return;
    }

    logger.error(
      {
        renderId: params.renderId,
        poseName: params.poseName,
        poseFamily: params.poseFamily,
        ...extractPostgresErrorDetails(error),
      },
      "pose metadata save failed",
    );
    throw error;
  }
}
