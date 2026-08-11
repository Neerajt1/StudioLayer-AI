import type { StudioCreditTransaction } from "@workspace/db";
import { formatMonthKey, isUsageReasonCode } from "./labels.js";

/** Paid memberships reset the credit pool on each UTC billing-cycle boundary. */
export function membershipResetsEachBillingCycle(tier: string): boolean {
  return tier !== "free";
}

/**
 * Balance effect of one COMPLETED ledger row on the customer pool.
 * Positive amounts add credits; usage reason codes deduct; other negatives deduct too.
 */
export function completedTransactionBalanceEffect(
  tx: StudioCreditTransaction,
): number {
  if (tx.amount > 0) {
    return tx.amount;
  }

  if (tx.amount < 0) {
    if (isUsageReasonCode(tx.reasonCode)) {
      return tx.amount;
    }
    return tx.amount;
  }

  return 0;
}

export interface StatementBalanceContext {
  allowance: number;
  tier: string;
  isAdmin: boolean;
  generatedAt: Date;
  transactions: readonly StudioCreditTransaction[];
  liveRemaining: number;
}

export interface MonthlyBalanceFields {
  openingBalance: number;
  closingBalance: number;
}

/**
 * Running balance after each completed transaction in chronological order.
 *
 * Paid tiers: pool resets to membership allowance at each UTC month boundary.
 * Complimentary tier: single lifetime pool — unused credits are not replenished.
 */
export function computeLedgerRunningBalances(
  ctx: StatementBalanceContext,
): number[] {
  if (ctx.isAdmin) {
    return ctx.transactions.map(() => 0);
  }

  const resets = membershipResetsEachBillingCycle(ctx.tier);
  let running = ctx.allowance;
  let currentCycleMonth: string | null = null;
  const balances: number[] = [];

  for (const tx of ctx.transactions) {
    const txMonth = formatMonthKey(tx.createdAt);

    if (resets && txMonth !== currentCycleMonth) {
      currentCycleMonth = txMonth;
      running = ctx.allowance;
    }

    running += completedTransactionBalanceEffect(tx);
    running = Math.max(0, running);
    balances.push(running);
  }

  return balances;
}

export function computeLedgerRunningBalance(
  ctx: StatementBalanceContext,
  txIndex: number,
): number {
  const balances = computeLedgerRunningBalances(ctx);
  return balances[txIndex] ?? 0;
}

export interface MonthlyActivityTotals {
  monthKey: string;
  creditsAdded: number;
  creditsUsed: number;
}

/**
 * Derive opening/closing balances for monthly summary rows.
 *
 * Paid tiers: each UTC month opens with the membership allowance (no carry-forward).
 * Complimentary tier: opening chains from the prior month's closing balance.
 */
export function applyMonthlyBalanceFields(
  ctx: StatementBalanceContext,
  rows: readonly MonthlyActivityTotals[],
): MonthlyBalanceFields[] {
  if (ctx.isAdmin) {
    return rows.map(() => ({ openingBalance: 0, closingBalance: 0 }));
  }

  const currentMonthKey = formatMonthKey(ctx.generatedAt);
  const resets = membershipResetsEachBillingCycle(ctx.tier);
  const results: MonthlyBalanceFields[] = [];
  let complimentaryOpening = ctx.allowance;

  for (const row of rows) {
    const openingBalance = resets ? ctx.allowance : complimentaryOpening;
    let closingBalance = Math.max(
      0,
      openingBalance + row.creditsAdded - row.creditsUsed,
    );

    if (resets && row.monthKey === currentMonthKey) {
      closingBalance = Math.max(0, ctx.liveRemaining);
    }

    results.push({ openingBalance, closingBalance });

    if (!resets) {
      complimentaryOpening = closingBalance;
    }
  }

  return results;
}

/** Current billing-cycle balance check: allowance + ledger additions − usage. */
export function computeBillingCycleBalanceSummary(ctx: {
  allowance: number;
  creditsAddedInCycle: number;
  creditsUsedInCycle: number;
  liveRemaining: number;
}): {
  computedClosing: number;
  matchesLiveRemaining: boolean;
} {
  const computedClosing = Math.max(
    0,
    ctx.allowance + ctx.creditsAddedInCycle - ctx.creditsUsedInCycle,
  );

  return {
    computedClosing,
    matchesLiveRemaining: computedClosing === ctx.liveRemaining,
  };
}

export function finalLedgerRunningBalance(ctx: StatementBalanceContext): number {
  const balances = computeLedgerRunningBalances(ctx);
  if (balances.length === 0) {
    return ctx.allowance;
  }
  return balances[balances.length - 1]!;
}
