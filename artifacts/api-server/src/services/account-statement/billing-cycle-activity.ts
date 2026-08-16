import { and, asc, eq } from "drizzle-orm";
import {
  StudioCreditTransactionStatus,
  type BillingCycleLedgerStats,
} from "@workspace/studio-credit-engine";
import {
  db,
  renderDeletionEventsTable,
  rendersTable,
  studioCreditTransactionsTable,
} from "@workspace/db";
import { billingCycleStart } from "../studio-credit-service.js";
import {
  buildMasterCreativeActivity,
  deriveBillingCycleActivityStats,
  filterMasterRowsForCycle,
  type CreativeActivityContext,
} from "./creative-activity-master.js";

async function loadCreativeActivityContext(
  userId: number,
  tier: string,
): Promise<CreativeActivityContext> {
  const [transactions, renders, deletionEvents] = await Promise.all([
    db
      .select()
      .from(studioCreditTransactionsTable)
      .where(
        and(
          eq(studioCreditTransactionsTable.userId, userId),
          eq(
            studioCreditTransactionsTable.status,
            StudioCreditTransactionStatus.COMPLETED,
          ),
        ),
      )
      .orderBy(
        asc(studioCreditTransactionsTable.createdAt),
        asc(studioCreditTransactionsTable.id),
      ),
    db
      .select()
      .from(rendersTable)
      .where(eq(rendersTable.userId, userId))
      .orderBy(asc(rendersTable.createdAt)),
    db
      .select()
      .from(renderDeletionEventsTable)
      .where(eq(renderDeletionEventsTable.userId, userId))
      .orderBy(asc(renderDeletionEventsTable.deletedAt)),
  ]);

  return {
    user: { subscriptionTier: tier },
    cycleStart: billingCycleStart(),
    transactions,
    renders,
    deletionEvents,
  };
}

/**
 * Billing-cycle creative analytics from the Creative Activity Master.
 * Gallery, Account Summary, and Monthly Summary share this single source.
 */
export async function getBillingCycleActivityStats(
  userId: number,
  tier: string,
): Promise<BillingCycleLedgerStats> {
  const ctx = await loadCreativeActivityContext(userId, tier);
  const master = buildMasterCreativeActivity(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);

  return deriveBillingCycleActivityStats(cycleRows);
}

/** Short-lived reuse of already-calculated Gallery cycle stats. Not used by Account Statement. */
const GALLERY_CYCLE_STATS_CACHE_TTL_MS = 30_000;

interface CachedCycleStats {
  tier: string;
  stats: BillingCycleLedgerStats;
  expiresAt: number;
}

const cycleStatsCache = new Map<number, CachedCycleStats>();
const cycleStatsInFlight = new Map<number, Promise<BillingCycleLedgerStats>>();

export function invalidateBillingCycleActivityStatsCache(userId: number): void {
  cycleStatsCache.delete(userId);
}

/** @internal Test-only reset. */
export function resetBillingCycleActivityStatsCache(): void {
  cycleStatsCache.clear();
  cycleStatsInFlight.clear();
}

/**
 * Same numbers as getBillingCycleActivityStats — reused for GET /renders/usage only.
 * Account Statement and commercial reconciliation continue to compute uncached.
 */
export async function getCachedBillingCycleActivityStats(
  userId: number,
  tier: string,
): Promise<BillingCycleLedgerStats> {
  const cached = cycleStatsCache.get(userId);
  if (cached && cached.tier === tier && cached.expiresAt > Date.now()) {
    return cached.stats;
  }

  const inFlight = cycleStatsInFlight.get(userId);
  if (inFlight) {
    return inFlight;
  }

  const pending = getBillingCycleActivityStats(userId, tier)
    .then((stats) => {
      cycleStatsCache.set(userId, {
        tier,
        stats,
        expiresAt: Date.now() + GALLERY_CYCLE_STATS_CACHE_TTL_MS,
      });
      return stats;
    })
    .finally(() => {
      cycleStatsInFlight.delete(userId);
    });

  cycleStatsInFlight.set(userId, pending);
  return pending;
}

export {
  deriveBillingCycleActivityStats,
  buildMasterCreativeActivity,
  filterMasterRowsForCycle,
};
