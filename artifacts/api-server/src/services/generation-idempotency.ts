import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  rendersTable,
  studioCreditTransactionsTable,
  type Render,
} from "@workspace/db";
import {
  GENERATION_LOCK_ACQUIRE_FN,
  GENERATION_LOCK_TIMEOUT,
  GenerationLockBusyError,
  extractPostgresBackendPid,
  isPostgresLockTimeoutError,
} from "./generation-lock.js";
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
import {
  ACTIVE_GENERATION_STATUSES,
  STALE_GENERATION_TTL_MS,
} from "./generation-lifecycle.js";
import { discardRenderGalleryPreview } from "./image-processing/preview-storage.js";

const ACTIVE_RENDER_STATUSES = ACTIVE_GENERATION_STATUSES;

export { STALE_GENERATION_TTL_MS };

/** Drizzle pool or a transaction client — protected writes must use the tx. */
export type GenerationExecutor = Pick<typeof db, "select" | "insert" | "update" | "execute">;

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
 * Live pipelines heartbeat `updatedAt`; only rows whose heartbeat is older
 * than the TTL are treated as abandoned. Wall-clock age since create is
 * not enough to fail a still-running OpenRouter generation.
 *
 * Idempotent: only pending/processing renders and pending credit transactions
 * are modified; completed charges and failed zero-amount rows are untouched.
 */
export async function reconcileStaleCommercialState(
  userId: number,
): Promise<StaleReconcileResult> {
  const refinementCutoff = new Date(Date.now() - STALE_REFINEMENT_TTL_MS);
  const failedTransactionIds: string[] = [];

  const staleIds = await failStaleActiveGenerations(userId, db);

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
 * Marks this user's abandoned in-flight renders failed.
 * Bounded: only currently pending/processing rows, not historical credit scans.
 * Pass the generation transaction client so this runs on the lock connection.
 */
export async function failStaleActiveGenerations(
  userId: number,
  executor: GenerationExecutor = db,
): Promise<number[]> {
  const generationCutoff = new Date(Date.now() - STALE_GENERATION_TTL_MS);
  const refinementCutoff = new Date(Date.now() - STALE_REFINEMENT_TTL_MS);

  const staleRenders = await executor
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
  if (staleIds.length === 0) return [];

  await executor
    .update(rendersTable)
    .set({ status: "failed" })
    .where(
      and(
        inArray(rendersTable.id, staleIds),
        inArray(rendersTable.status, [...ACTIVE_RENDER_STATUSES]),
      ),
    );

  await Promise.all(
    staleIds.map((renderId) => discardRenderGalleryPreview(renderId)),
  );

  logger.warn(
    { userId, staleRenderIds: staleIds, count: staleIds.length },
    "commercial-reconcile: marked stale in-flight renders as failed",
  );

  return staleIds;
}

/**
 * Returns the most recent in-flight generation batch for a user, if any.
 * Rows are grouped by generationSessionId when present.
 * Pass the generation transaction client when used inside the lock.
 */
export async function findActiveGenerationBatch(
  userId: number,
  executor: GenerationExecutor = db,
): Promise<Render[]> {
  const activeRows = await executor
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

export interface GenerationLockOptions {
  reqId?: string | number;
}

/**
 * Serializes generation creation for one user on a single transaction connection.
 * Uses pg_advisory_xact_lock + local lock_timeout. No session-level unlock.
 */
export async function withUserGenerationLock<T>(
  userId: number,
  fn: (tx: GenerationExecutor) => Promise<T>,
  options: GenerationLockOptions = {},
): Promise<T> {
  const startedAt = Date.now();
  const reqId = options.reqId ?? null;

  logger.info(
    {
      event: "generation_lock_wait_start",
      userId,
      reqId,
      elapsedMs: 0,
      pid: process.pid,
    },
    "generation_lock_wait_start",
  );

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as unknown as GenerationExecutor;
      await executor.execute(sql`SELECT set_config('lock_timeout', ${GENERATION_LOCK_TIMEOUT}, true)`);
      await executor.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);

      const pidResult = await executor.execute(sql`SELECT pg_backend_pid() AS pid`);
      const postgresBackendPid = extractPostgresBackendPid(pidResult);

      logger.info(
        {
          event: "generation_lock_acquired",
          userId,
          reqId,
          elapsedMs: Date.now() - startedAt,
          pid: process.pid,
          postgresBackendPid,
          lockFn: GENERATION_LOCK_ACQUIRE_FN,
        },
        "generation_lock_acquired",
      );

      const value = await fn(executor);

      logger.info(
        {
          event: "generation_transaction_complete",
          userId,
          reqId,
          elapsedMs: Date.now() - startedAt,
          pid: process.pid,
          postgresBackendPid,
        },
        "generation_transaction_complete",
      );

      return value;
    });
  } catch (error) {
    if (isPostgresLockTimeoutError(error)) {
      logger.info(
        {
          event: "generation_lock_busy",
          userId,
          reqId,
          elapsedMs: Date.now() - startedAt,
          pid: process.pid,
        },
        "generation_lock_busy",
      );
      throw new GenerationLockBusyError();
    }
    throw error;
  }
}
