// ---------------------------------------------------------------------------
// Furniture usage persistence — per-user 100-gen exact-asset cooldown.
// ---------------------------------------------------------------------------

import { desc, eq } from "drizzle-orm";
import { db, furnitureUsageEventsTable } from "@workspace/db";
import {
  FURNITURE_USER_COOLDOWN,
  type FurnitureFamily,
} from "../intelligence/furniture-catalog";
import type { FurnitureUsageRecord } from "../intelligence/furniture-selector";
import { logger } from "../lib/logger";

export async function loadRecentFurnitureUsage(params: {
  userId: number;
  limit?: number;
}): Promise<FurnitureUsageRecord[]> {
  const limit = params.limit ?? FURNITURE_USER_COOLDOWN;
  const rows = await db
    .select({
      furnitureAssetId: furnitureUsageEventsTable.furnitureAssetId,
      furnitureFamily: furnitureUsageEventsTable.furnitureFamily,
    })
    .from(furnitureUsageEventsTable)
    .where(eq(furnitureUsageEventsTable.userId, params.userId))
    .orderBy(desc(furnitureUsageEventsTable.createdAt))
    .limit(limit);

  return rows.map((row, index) => ({
    furnitureAssetId: row.furnitureAssetId,
    furnitureFamily: row.furnitureFamily as FurnitureFamily,
    index,
  }));
}

/**
 * Record one successful furniture-bearing image.
 * Failed / non-furniture generations must NOT call this.
 */
export async function recordFurnitureUsage(params: {
  userId: number;
  furnitureAssetId: string;
  furnitureFamily: string;
  renderId?: number;
  generationSessionId?: string | null;
}): Promise<void> {
  try {
    await db.insert(furnitureUsageEventsTable).values({
      userId: params.userId,
      furnitureAssetId: params.furnitureAssetId,
      furnitureFamily: params.furnitureFamily,
      renderId: params.renderId,
      generationSessionId: params.generationSessionId ?? null,
    });
  } catch (error) {
    logger.warn(
      {
        userId: params.userId,
        furnitureAssetId: params.furnitureAssetId,
        err: error instanceof Error ? error.message : String(error),
      },
      "furniture usage record failed — generation already completed",
    );
  }
}
