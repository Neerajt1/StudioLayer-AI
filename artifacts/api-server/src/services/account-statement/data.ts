import { and, asc, eq } from "drizzle-orm";
import {
  StudioCreditTransactionStatus,
  isStudioAdmin,
  membershipAllowanceForTier,
} from "@workspace/studio-credit-engine";
import {
  db,
  renderDeletionEventsTable,
  rendersTable,
  studioCreditTransactionsTable,
  usersTable,
  type Render,
  type RenderDeletionEvent,
  type StudioCreditTransaction,
  type User,
} from "@workspace/db";
import {
  billingCycleStart,
  getStudioCreditBalance,
} from "../studio-credit-service.js";
import { reconcileStaleCommercialState } from "../generation-idempotency.js";
import {
  formatMonthKey,
  isMembershipAllocationReasonCode,
  isPromotionalReasonCode,
  isPurchasedReasonCode,
  isUsageReasonCode,
} from "./labels.js";
import {
  aggregateMasterByMonth,
  buildMasterCreativeActivity,
  countMasterImagesGenerated,
  countMasterRefinements,
  filterMasterRowsForCycle,
  reconcileMasterWithLedger,
  type CreativeActivityRow,
  type MasterCreativeActivityResult,
  type UnmappedHistoricalTransaction,
} from "./creative-activity-master.js";
import { getBillingCycleActivityStats } from "./billing-cycle-activity.js";
import {
  applyMonthlyBalanceFields,
  computeLedgerRunningBalance as computeLedgerRunningBalanceFromHistory,
  type StatementBalanceContext,
} from "./balance-history.js";

export interface AccountStatementContext {
  user: User;
  generatedAt: Date;
  allowance: number;
  isAdmin: boolean;
  balance: Awaited<ReturnType<typeof getStudioCreditBalance>>;
  cycleStats: Awaited<ReturnType<typeof getBillingCycleActivityStats>>;
  cycleStart: Date;
  transactions: StudioCreditTransaction[];
  renders: Render[];
  deletionEvents: RenderDeletionEvent[];
  creditsPurchasedInCycle: number;
  promotionalCreditsInCycle: number;
  totalCreditsAddedInCycle: number;
  imagesDeletedInCycle: number;
  allTimeImagesDeleted: number;
}

export interface MonthlySummaryRow {
  monthKey: string;
  openingBalance: number;
  creditsAdded: number;
  /** Authoritative completed ledger deductions for the month. */
  creditsUsed: number;
  /** Master-derived successful billable activity credits for the month. */
  activityCreditsUsed: number;
  /** Ledger creditsUsed minus activityCreditsUsed when they differ. */
  creditsReconciliationGap: number;
  imagesGenerated: number;
  refinements: number;
  imagesDeleted: number;
  closingBalance: number;
}

export interface StatementReconciliation {
  ledgerCreditsUsed: number;
  activityCreditsUsed: number;
  reconciliationGap: number;
  unmappedLedgerCredits: number;
  unmappedTransactions: UnmappedHistoricalTransaction[];
  creditsReconcile: boolean;
}

export type {
  CreativeActivityRow,
  MasterCreativeActivityResult,
  UnmappedHistoricalTransaction,
} from "./creative-activity-master.js";

function isWithinStatementScope(ctx: AccountStatementContext, date: Date): boolean {
  if (ctx.user.subscriptionTier === "free") return true;
  return date >= ctx.cycleStart;
}

/** Transactions included in the current statement period. */
export function filterTransactionsForStatementScope(
  ctx: AccountStatementContext,
): StudioCreditTransaction[] {
  return ctx.transactions.filter((tx) => isWithinStatementScope(ctx, tx.createdAt));
}

function masterForContext(ctx: AccountStatementContext): MasterCreativeActivityResult {
  return buildMasterCreativeActivity(ctx);
}

export function computeMasterCreativeActivityResult(
  ctx: AccountStatementContext,
): MasterCreativeActivityResult {
  return masterForContext(ctx);
}

/** Completed ledger usage deductions for the statement period — financial authority. */
export function sumStatementLedgerCreditsUsed(
  ctx: AccountStatementContext,
): number {
  return filterTransactionsForStatementScope(ctx)
    .filter((tx) => tx.amount < 0 && isUsageReasonCode(tx.reasonCode))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

/** Successful billable activity credits for the statement period — master authority. */
export function sumStatementActivityCreditsUsed(
  ctx: AccountStatementContext,
): number {
  const master = masterForContext(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);
  return cycleRows.reduce((sum, row) => sum + row.creditsUsed, 0);
}

function scopedMasterForReconciliation(
  ctx: AccountStatementContext,
): MasterCreativeActivityResult {
  const master = masterForContext(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);
  const unmappedTransactions = master.unmappedTransactions.filter((tx) =>
    isWithinStatementScope(ctx, tx.date),
  );

  return { rows: cycleRows, unmappedTransactions };
}

/** Compares ledger deductions with mapped master activity for the statement period. */
export function computeStatementReconciliation(
  ctx: AccountStatementContext,
): StatementReconciliation {
  const scopedTransactions = filterTransactionsForStatementScope(ctx);
  const scopedMaster = scopedMasterForReconciliation(ctx);
  const reconciliation = reconcileMasterWithLedger(
    {
      user: ctx.user,
      cycleStart: ctx.cycleStart,
      transactions: scopedTransactions,
      renders: ctx.renders,
      deletionEvents: ctx.deletionEvents,
    },
    scopedMaster,
  );

  const unmappedLedgerCredits = reconciliation.unmappedTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0,
  );

  return {
    ledgerCreditsUsed: reconciliation.ledgerCreditsUsed,
    activityCreditsUsed: reconciliation.masterCreditsUsed,
    reconciliationGap:
      reconciliation.ledgerCreditsUsed - reconciliation.masterCreditsUsed,
    unmappedLedgerCredits,
    unmappedTransactions: reconciliation.unmappedTransactions,
    creditsReconcile: reconciliation.creditsReconcile,
  };
}

/** Authoritative Studio Credits Used for Account Summary — ledger, not activity. */
export function computeStatementLedgerCreditsUsed(
  ctx: AccountStatementContext,
): number {
  if (ctx.isAdmin) {
    return sumStatementLedgerCreditsUsed(ctx);
  }

  return ctx.balance.used;
}

/** Billable generation images in billing-cycle scope — derived from master activity rows. */
export function computeStatementCycleImagesGenerated(
  ctx: AccountStatementContext,
): number {
  const master = masterForContext(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);
  return countMasterImagesGenerated(cycleRows);
}

/** Billable refinement images in billing-cycle scope — derived from master activity rows. */
export function computeStatementCycleRefinements(
  ctx: AccountStatementContext,
): number {
  const master = masterForContext(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);
  return countMasterRefinements(cycleRows);
}

function statementBalanceContext(
  ctx: AccountStatementContext,
): StatementBalanceContext {
  return {
    allowance: ctx.allowance,
    tier: ctx.user.subscriptionTier,
    isAdmin: ctx.isAdmin,
    generatedAt: ctx.generatedAt,
    transactions: ctx.transactions,
    liveRemaining: ctx.balance.remaining,
  };
}

/** Membership allowance for the customer's plan — not a historical ledger balance. */
export function computeMembershipAllowance(ctx: AccountStatementContext): number {
  if (ctx.isAdmin) return 0;
  return ctx.allowance;
}

export async function loadAccountStatementContext(
  userId: number,
): Promise<AccountStatementContext | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return null;

  await reconcileStaleCommercialState(userId);

  const generatedAt = new Date();
  const cycleStart = billingCycleStart(generatedAt);
  const limit = null;
  const allowance = membershipAllowanceForTier(user.subscriptionTier, limit);
  const isAdmin = isStudioAdmin(user);

  const [balance, cycleStats, transactions, renders, deletionEvents] =
    await Promise.all([
      getStudioCreditBalance({
        userId,
        tier: user.subscriptionTier,
        limit,
        isAdmin: user.isAdmin,
      }),
      getBillingCycleActivityStats(userId, user.subscriptionTier),
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

  const cycleTransactions = transactions.filter(
    (tx) => tx.createdAt >= cycleStart,
  );

  let creditsPurchasedInCycle = 0;
  let promotionalCreditsInCycle = 0;
  let membershipCreditsInCycle = 0;

  for (const tx of cycleTransactions) {
    if (tx.amount <= 0) continue;
    if (isPurchasedReasonCode(tx.reasonCode)) {
      creditsPurchasedInCycle += tx.amount;
    } else if (isPromotionalReasonCode(tx.reasonCode)) {
      promotionalCreditsInCycle += tx.amount;
    } else if (isMembershipAllocationReasonCode(tx.reasonCode)) {
      membershipCreditsInCycle += tx.amount;
    }
  }

  const totalCreditsAddedInCycle =
    creditsPurchasedInCycle +
    promotionalCreditsInCycle +
    membershipCreditsInCycle;

  const imagesDeletedInCycle = deletionEvents.filter(
    (event) => event.deletedAt >= cycleStart,
  ).length;

  return {
    user,
    generatedAt,
    allowance,
    isAdmin,
    balance,
    cycleStats,
    cycleStart,
    transactions,
    renders,
    deletionEvents,
    creditsPurchasedInCycle,
    promotionalCreditsInCycle,
    totalCreditsAddedInCycle,
    imagesDeletedInCycle,
    allTimeImagesDeleted: deletionEvents.length,
  };
}

export function computeMonthlySummaryRows(
  ctx: AccountStatementContext,
): MonthlySummaryRow[] {
  const master = masterForContext(ctx);
  const masterByMonth = aggregateMasterByMonth(master.rows);
  const monthMap = new Map<string, MonthlySummaryRow>();

  const ensureMonth = (monthKey: string): MonthlySummaryRow => {
    const existing = monthMap.get(monthKey);
    if (existing) return existing;
    const row: MonthlySummaryRow = {
      monthKey,
      openingBalance: 0,
      creditsAdded: 0,
      creditsUsed: 0,
      activityCreditsUsed: 0,
      creditsReconciliationGap: 0,
      imagesGenerated: 0,
      refinements: 0,
      imagesDeleted: 0,
      closingBalance: 0,
    };
    monthMap.set(monthKey, row);
    return row;
  };

  for (const tx of ctx.transactions) {
    const monthKey = formatMonthKey(tx.createdAt);
    const row = ensureMonth(monthKey);

    if (tx.amount > 0) {
      row.creditsAdded += tx.amount;
    }
  }

  const ledgerCreditsByMonth = new Map<string, number>();
  for (const tx of ctx.transactions) {
    if (tx.amount < 0 && isUsageReasonCode(tx.reasonCode)) {
      const monthKey = formatMonthKey(tx.createdAt);
      ledgerCreditsByMonth.set(
        monthKey,
        (ledgerCreditsByMonth.get(monthKey) ?? 0) + Math.abs(tx.amount),
      );
    }
  }

  for (const [monthKey, activity] of masterByMonth) {
    const row = ensureMonth(monthKey);
    row.imagesGenerated = activity.imagesGenerated;
    row.refinements = activity.refinements;
    row.activityCreditsUsed = activity.creditsUsed;
  }

  for (const [monthKey, ledgerUsed] of ledgerCreditsByMonth) {
    const row = ensureMonth(monthKey);
    row.creditsUsed = ledgerUsed;
    row.creditsReconciliationGap = ledgerUsed - row.activityCreditsUsed;
  }

  for (const event of ctx.deletionEvents) {
    const monthKey = formatMonthKey(event.deletedAt);
    ensureMonth(monthKey).imagesDeleted += 1;
  }

  if (monthMap.size === 0) {
    ensureMonth(formatMonthKey(ctx.generatedAt));
  }

  const sortedMonths = [...monthMap.keys()].sort();
  const activityRows = sortedMonths.map((monthKey) => {
    const row = monthMap.get(monthKey)!;
    return {
      monthKey,
      creditsAdded: row.creditsAdded,
      creditsUsed: ledgerCreditsByMonth.get(monthKey) ?? 0,
    };
  });
  const balanceFields = applyMonthlyBalanceFields(
    statementBalanceContext(ctx),
    activityRows,
  );

  return sortedMonths.map((monthKey, index) => {
    const row = monthMap.get(monthKey)!;
    const balances = balanceFields[index]!;
    row.openingBalance = balances.openingBalance;
    row.closingBalance = balances.closingBalance;
    return row;
  });
}

export function computeLedgerRunningBalance(
  ctx: AccountStatementContext,
  txIndex: number,
): number {
  return computeLedgerRunningBalanceFromHistory(
    statementBalanceContext(ctx),
    txIndex,
  );
}

export function computeCreativeActivityRows(
  ctx: AccountStatementContext,
): CreativeActivityRow[] {
  return masterForContext(ctx).rows;
}

export function computeUnmappedLedgerTransactions(
  ctx: AccountStatementContext,
): UnmappedHistoricalTransaction[] {
  return scopedMasterForReconciliation(ctx).unmappedTransactions;
}
