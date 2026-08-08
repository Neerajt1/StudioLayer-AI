import { and, desc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import {
  db,
  pool,
  rendersTable,
  studioCreditTransactionsTable,
  type Render,
} from "@workspace/db";
import {
  STUDIO_CREDIT_USAGE_REASON_CODES,
  StudioCreditTransactionStatus,
} from "@workspace/studio-credit-engine";
import {
  failStudioCreditTransaction,
  reverseOrphanCompletedStudioCreditTransaction,
} from "./studio-credit-service.js";
import { logger } from "../lib/logger.js";

const ACTIVE_RENDER_STATUSES = ["pending", "processing"] as const;

/** Renders older than this in pending/processing are treated as abandoned (crash/timeout). */
export const STALE_GENERATION_TTL_MS = 20 * 60 * 1000;

/** Refinements are single-shot — shorter TTL than multi-shot generations. */
export const STALE_REFINEMENT_TTL_MS = 5 * 60 * 1000;

export interface StaleReconcileResult {
  staleRenderIds: number[];
  failedTransactionIds: string[];
  reversedOrphanTransactionIds: string[];
}

/**
 * Reverses completed usage charges when every render in the session failed.
 * Server-side reconciliation only — repairs legacy/orphan billing inconsistencies.
 */
export async function reconcileFailedSessionOrphanCharges(
  userId: number,
): Promise<string[]> {
  const completedUsage = await db
    .select({
      transactionId: studioCreditTransactionsTable.transactionId,
      renderId: studioCreditTransactionsTable.renderId,
    })
    .from(studioCreditTransactionsTable)
    .where(
      and(
        eq(studioCreditTransactionsTable.userId, userId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.COMPLETED,
        ),
        inArray(
          studioCreditTransactionsTable.reasonCode,
          STUDIO_CREDIT_USAGE_REASON_CODES as unknown as string[],
        ),
      ),
    );

  const reversed: string[] = [];

  for (const tx of completedUsage) {
    if (tx.renderId == null) continue;

    const [anchorRender] = await db
      .select({
        generationSessionId: rendersTable.generationSessionId,
      })
      .from(rendersTable)
      .where(
        and(eq(rendersTable.id, tx.renderId), eq(rendersTable.userId, userId)),
      );

    if (!anchorRender?.generationSessionId) continue;

    const sessionRenders = await db
      .select({ status: rendersTable.status })
      .from(rendersTable)
      .where(
        and(
          eq(rendersTable.userId, userId),
          eq(rendersTable.generationSessionId, anchorRender.generationSessionId),
        ),
      );

    if (sessionRenders.length === 0) continue;

    const allFailed = sessionRenders.every((row) => row.status === "failed");
    if (!allFailed) continue;

    const didReverse = await reverseOrphanCompletedStudioCreditTransaction(
      tx.transactionId,
    );
    if (didReverse) {
      reversed.push(tx.transactionId);
    }
  }

  if (reversed.length > 0) {
    logger.warn(
      { userId, count: reversed.length, transactionIds: reversed },
      "commercial-reconcile: reversed orphan completed charges for failed sessions",
    );
  }

  return reversed;
}

/**
 * Reconciles stuck generations and orphan pending credit transactions.
 * Prevents users from being permanently blocked after process crashes.
 *
 * Idempotent: only pending/processing renders and pending credit transactions
 * are modified; completed charges and failed zero-amount rows are untouched.
 */
export async function reconcileStaleCommercialState(
  userId: number,
): Promise<StaleReconcileResult> {
  const generationCutoff = new Date(Date.now() - STALE_GENERATION_TTL_MS);
  const refinementCutoff = new Date(Date.now() - STALE_REFINEMENT_TTL_MS);
  const failedTransactionIds: string[] = [];

  const staleRenders = await db
    .select({ id: rendersTable.id })
    .from(rendersTable)
    .where(
      and(
        eq(rendersTable.userId, userId),
        inArray(rendersTable.status, [...ACTIVE_RENDER_STATUSES]),
        or(
          and(
            isNotNull(rendersTable.parentRenderId),
            lt(rendersTable.updatedAt, refinementCutoff),
          ),
          and(
            isNull(rendersTable.parentRenderId),
            lt(rendersTable.updatedAt, generationCutoff),
          ),
        ),
      ),
    );

  const staleIds = staleRenders.map((row) => row.id);

  if (staleIds.length > 0) {
    await db
      .update(rendersTable)
      .set({ status: "failed" })
      .where(
        and(
          inArray(rendersTable.id, staleIds),
          inArray(rendersTable.status, [...ACTIVE_RENDER_STATUSES]),
        ),
      );

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
      failedTransactionIds.push(tx.transactionId);
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
        lt(studioCreditTransactionsTable.createdAt, refinementCutoff),
      ),
    );

  for (const tx of orphanPending) {
    await failStudioCreditTransaction(tx.transactionId);
    failedTransactionIds.push(tx.transactionId);
  }

  if (orphanPending.length > 0) {
    logger.warn(
      { userId, count: orphanPending.length },
      "commercial-reconcile: failed orphan pending credit transactions",
    );
  }

  const reversedOrphanTransactionIds =
    await reconcileFailedSessionOrphanCharges(userId);

  return {
    staleRenderIds: staleIds,
    failedTransactionIds: [...new Set(failedTransactionIds)],
    reversedOrphanTransactionIds,
  };
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
