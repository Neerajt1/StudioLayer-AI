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
  finalizeGenerationCreditTransaction,
  reverseOrphanCompletedStudioCreditTransaction,
} from "./studio-credit-service.js";
import {
  isGenerationCreditReasonCode,
  isRefinementOrphanReasonCode,
  resolvePendingGenerationFinalization,
} from "./generation-credit-reconciliation.js";
import { invalidateBillingCycleActivityStatsCache } from "./account-statement/billing-cycle-activity.js";
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
  finalizedGenerationTransactionIds: string[];
}

const deferredReconcileInFlight = new Set<number>();
const deferredReconcileQueued = new Set<number>();

/**
 * Runs commercial reconciliation without blocking the caller.
 * Coalesces concurrent schedules for the same user (e.g. Gallery list + usage).
 */
export function scheduleDeferredCommercialReconciliation(userId: number): void {
  if (deferredReconcileInFlight.has(userId)) {
    deferredReconcileQueued.add(userId);
    return;
  }

  deferredReconcileInFlight.add(userId);
  void reconcileStaleCommercialState(userId)
    .then(() => {
      invalidateBillingCycleActivityStatsCache(userId);
    })
    .catch((error) => {
      logger.error(
        { userId, err: error },
        "commercial-reconcile: deferred reconciliation failed",
      );
    })
    .finally(() => {
      deferredReconcileInFlight.delete(userId);
      if (deferredReconcileQueued.delete(userId)) {
        scheduleDeferredCommercialReconciliation(userId);
      }
    });
}

/** @internal Test-only reset for deferred reconciliation coalescing state. */
export function resetDeferredCommercialReconciliationState(): void {
  deferredReconcileInFlight.clear();
  deferredReconcileQueued.clear();
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
 * Finalizes still-PENDING generation credit transactions when their linked
 * generation session has reached a terminal state.
 */
export async function reconcilePendingGenerationCreditFinalization(
  userId: number,
): Promise<string[]> {
  const pendingGeneration = await db
    .select({
      transactionId: studioCreditTransactionsTable.transactionId,
      renderId: studioCreditTransactionsTable.renderId,
      amount: studioCreditTransactionsTable.amount,
      reasonCode: studioCreditTransactionsTable.reasonCode,
    })
    .from(studioCreditTransactionsTable)
    .where(
      and(
        eq(studioCreditTransactionsTable.userId, userId),
        eq(
          studioCreditTransactionsTable.status,
          StudioCreditTransactionStatus.PENDING,
        ),
      ),
    );

  const finalized: string[] = [];

  for (const tx of pendingGeneration) {
    if (tx.renderId == null) continue;
    if (!isGenerationCreditReasonCode(tx.reasonCode)) continue;

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
      .select()
      .from(rendersTable)
      .where(
        and(
          eq(rendersTable.userId, userId),
          eq(
            rendersTable.generationSessionId,
            anchorRender.generationSessionId,
          ),
        ),
      );

    const finalization = resolvePendingGenerationFinalization({
      holdAmount: tx.amount,
      sessionRenders,
    });

    if (!finalization) continue;

    const before = await db
      .select({ status: studioCreditTransactionsTable.status })
      .from(studioCreditTransactionsTable)
      .where(
        eq(studioCreditTransactionsTable.transactionId, tx.transactionId),
      );

    if (
      before[0]?.status !== StudioCreditTransactionStatus.PENDING
    ) {
      continue;
    }

    await finalizeGenerationCreditTransaction({
      transactionId: tx.transactionId,
      completedCount: finalization.completedCount,
      creditPerCompletedImage: finalization.creditPerCompletedImage,
    });

    const [after] = await db
      .select({ status: studioCreditTransactionsTable.status })
      .from(studioCreditTransactionsTable)
      .where(
        eq(studioCreditTransactionsTable.transactionId, tx.transactionId),
      );

    if (
      after?.status === StudioCreditTransactionStatus.COMPLETED
      || after?.status === StudioCreditTransactionStatus.FAILED
    ) {
      finalized.push(tx.transactionId);
    }
  }

  if (finalized.length > 0) {
    logger.warn(
      { userId, count: finalized.length, transactionIds: finalized },
      "commercial-reconcile: finalized pending generation credit transactions",
    );
  }

  return finalized;
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

    logger.warn(
      { userId, staleRenderIds: staleIds, count: staleIds.length },
      "commercial-reconcile: marked stale in-flight renders as failed",
    );
  }

  const orphanPending = await db
    .select({
      transactionId: studioCreditTransactionsTable.transactionId,
      reasonCode: studioCreditTransactionsTable.reasonCode,
    })
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
    if (!isRefinementOrphanReasonCode(tx.reasonCode)) continue;
    await failStudioCreditTransaction(tx.transactionId);
    failedTransactionIds.push(tx.transactionId);
  }

  if (orphanPending.some((tx) => isRefinementOrphanReasonCode(tx.reasonCode))) {
    logger.warn(
      {
        userId,
        count: orphanPending.filter((tx) =>
          isRefinementOrphanReasonCode(tx.reasonCode),
        ).length,
      },
      "commercial-reconcile: failed orphan pending refinement credit transactions",
    );
  }

  const finalizedGenerationTransactionIds =
    await reconcilePendingGenerationCreditFinalization(userId);

  const reversedOrphanTransactionIds =
    await reconcileFailedSessionOrphanCharges(userId);

  return {
    staleRenderIds: staleIds,
    failedTransactionIds: [...new Set(failedTransactionIds)],
    reversedOrphanTransactionIds,
    finalizedGenerationTransactionIds,
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
