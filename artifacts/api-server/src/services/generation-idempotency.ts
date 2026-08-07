import { and, desc, eq, inArray, lt } from "drizzle-orm";
import {
  db,
  pool,
  rendersTable,
  studioCreditTransactionsTable,
  type Render,
} from "@workspace/db";
import { StudioCreditTransactionStatus } from "@workspace/studio-credit-engine";
import { failStudioCreditTransaction } from "./studio-credit-service.js";
import { logger } from "../lib/logger.js";

const ACTIVE_RENDER_STATUSES = ["pending", "processing"] as const;

/** Renders older than this in pending/processing are treated as abandoned (crash/timeout). */
const STALE_GENERATION_TTL_MS = 20 * 60 * 1000;

/**
 * Reconciles stuck generations and orphan pending credit transactions.
 * Prevents users from being permanently blocked after process crashes.
 */
export async function reconcileStaleCommercialState(userId: number): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_GENERATION_TTL_MS);

  const staleRenders = await db
    .select({ id: rendersTable.id })
    .from(rendersTable)
    .where(
      and(
        eq(rendersTable.userId, userId),
        inArray(rendersTable.status, [...ACTIVE_RENDER_STATUSES]),
        lt(rendersTable.updatedAt, cutoff),
      ),
    );

  if (staleRenders.length > 0) {
    const staleIds = staleRenders.map((row) => row.id);

    await db
      .update(rendersTable)
      .set({ status: "failed" })
      .where(inArray(rendersTable.id, staleIds));

    const linkedPending = await db
      .select({ transactionId: studioCreditTransactionsTable.transactionId })
      .from(studioCreditTransactionsTable)
      .where(
        and(
          eq(studioCreditTransactionsTable.userId, userId),
          eq(
            studioCreditTransactionsTable.status,
            StudioCreditTransactionStatus.PENDING,
          ),
          inArray(studioCreditTransactionsTable.renderId, staleIds),
        ),
      );

    for (const tx of linkedPending) {
      await failStudioCreditTransaction(tx.transactionId);
    }

    logger.warn(
      { userId, staleRenderIds: staleIds, count: staleIds.length },
      "commercial-reconcile: marked stale in-flight renders as failed",
    );
  }

  const orphanPending = await db
    .select({ transactionId: studioCreditTransactionsTable.transactionId })
    .from(studioCreditTransactionsTable)
    .where(
      and(
        eq(studioCreditTransactionsTable.userId, userId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.PENDING,
        ),
        lt(studioCreditTransactionsTable.createdAt, cutoff),
      ),
    );

  for (const tx of orphanPending) {
    await failStudioCreditTransaction(tx.transactionId);
  }

  if (orphanPending.length > 0) {
    logger.warn(
      { userId, count: orphanPending.length },
      "commercial-reconcile: failed orphan pending credit transactions",
    );
  }
}

/**
 * Returns the most recent in-flight generation batch for a user, if any.
 * Rows are grouped by generationSessionId when present.
 */
export async function findActiveGenerationBatch(userId: number): Promise<Render[]> {
  const activeRows = await db
    .select()
    .from(rendersTable)
    .where(
      and(
        eq(rendersTable.userId, userId),
        inArray(rendersTable.status, [...ACTIVE_RENDER_STATUSES]),
      ),
    )
    .orderBy(desc(rendersTable.createdAt));

  if (activeRows.length === 0) return [];

  const anchor = activeRows[0]!;
  const sessionId = anchor.generationSessionId;
  if (sessionId) {
    return activeRows.filter((row) => row.generationSessionId === sessionId);
  }

  return [anchor];
}

/**
 * Serializes concurrent POST /renders requests for the same user so only one
 * generation batch can begin at a time. Uses a dedicated pool connection so
 * pg advisory lock/unlock run on the same session.
 */
export async function withUserGenerationLock<T>(
  userId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [userId]);
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [userId]);
    client.release();
  }
}
