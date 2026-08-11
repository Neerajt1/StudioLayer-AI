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
import { reconcileStaleCommercialState } from "../generation-idempotency.js";
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
  await reconcileStaleCommercialState(userId);

  const ctx = await loadCreativeActivityContext(userId, tier);
  const master = buildMasterCreativeActivity(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);

  return deriveBillingCycleActivityStats(cycleRows);
}

export {
  deriveBillingCycleActivityStats,
  buildMasterCreativeActivity,
  filterMasterRowsForCycle,
};
