import { and, eq, inArray } from "drizzle-orm";
import { db, rendersTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  ACTIVE_GENERATION_STATUSES,
  GENERATION_HEARTBEAT_INTERVAL_MS,
} from "./generation-lifecycle.js";

/**
 * Touches updatedAt on in-flight render rows while the pipeline is alive.
 * Stale reconciliation uses updatedAt as the liveness signal.
 */
export function startGenerationHeartbeat(renderIds: number[]): () => void {
  const ids = [...new Set(renderIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) {
    return () => {};
  }

  let stopped = false;

  const beat = async (): Promise<void> => {
    if (stopped) return;
    try {
      await db
        .update(rendersTable)
        .set({ updatedAt: new Date() })
        .where(
          and(
            inArray(rendersTable.id, ids),
            inArray(rendersTable.status, [...ACTIVE_GENERATION_STATUSES]),
          ),
        );
    } catch (error) {
      logger.warn(
        {
          renderIds: ids,
          err: error instanceof Error ? error.message : String(error),
        },
        "generation-heartbeat: failed to touch in-flight renders",
      );
    }
  };

  void beat();
  const timer = setInterval(() => {
    void beat();
  }, GENERATION_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
