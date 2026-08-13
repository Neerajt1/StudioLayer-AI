import type { StudioCreditTransaction } from "@workspace/db";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import { formatMonthKey, isUsageReasonCode } from "./labels.js";

/** Paid memberships reset the membership pool on each UTC billing-cycle boundary. */
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

type PoolKind = "membership" | "pass" | "topUp" | "other";

function poolKindForReason(reasonCode: string): PoolKind {
  if (reasonCode === StudioCreditReasonCode.MEMBERSHIP_ALLOCATION) {
    return "membership";
  }
  if (reasonCode === StudioCreditReasonCode.STUDIO_PASS_ALLOCATION) {
    return "pass";
  }
  if (reasonCode === StudioCreditReasonCode.TOP_UP_ALLOCATION) {
    return "topUp";
  }
  return "other";
}

/**
 * Apply usage against carry pools first (Pass → Top-Up → other → Membership),
 * matching live allocation consumption order.
 */
function applyUsageToPools(
  pools: { membership: number; pass: number; topUp: number; other: number },
  usageAbs: number,
): void {
  let remaining = Math.max(0, usageAbs);
  const order: Array<keyof typeof pools> = [
    "pass",
    "topUp",
    "other",
    "membership",
  ];
  for (const key of order) {
    if (remaining <= 0) break;
    const take = Math.min(pools[key], remaining);
    pools[key] -= take;
    remaining -= take;
  }
}

function totalPools(pools: {
  membership: number;
  pass: number;
  topUp: number;
  other: number;
}): number {
  return pools.membership + pools.pass + pools.topUp + pools.other;
}

/**
 * Running balance after each completed transaction in chronological order.
 *
 * Paid tiers: membership pool refreshes at each UTC month boundary (no
 * carry-forward). Top-Up and unexpired Pass credits carry across boundaries.
 * Complimentary tier: single lifetime pool — unused credits are not replenished.
 */
export function computeLedgerRunningBalances(
  ctx: StatementBalanceContext,
): number[] {
  if (ctx.isAdmin) {
    return ctx.transactions.map(() => 0);
  }

  const resets = membershipResetsEachBillingCycle(ctx.tier);
  const pools = {
    membership: resets ? 0 : ctx.allowance,
    pass: 0,
    topUp: 0,
    other: 0,
  };
  let currentCycleMonth: string | null = null;
  const balances: number[] = [];

  for (const tx of ctx.transactions) {
    const txMonth = formatMonthKey(tx.createdAt);

    if (resets && txMonth !== currentCycleMonth) {
      currentCycleMonth = txMonth;
      // Membership no-carry-forward; Pass/Top-Up survive.
      pools.membership = ctx.allowance;
    }

    if (tx.amount > 0) {
      const kind = poolKindForReason(tx.reasonCode);
      if (kind === "membership") {
        // Explicit membership grant replaces implicit allowance for that period.
        pools.membership = tx.amount;
      } else {
        pools[kind] += tx.amount;
      }
    } else if (tx.amount < 0) {
      applyUsageToPools(pools, Math.abs(tx.amount));
    }

    balances.push(Math.max(0, totalPools(pools)));
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
 * Paid tiers: each UTC month opens with membership allowance + carried
 * Top-Up/Pass remainder (membership itself never carries).
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
  let purchasedCarry = 0;

  for (const row of rows) {
    const openingBalance = resets
      ? ctx.allowance + purchasedCarry
      : complimentaryOpening;

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
    } else {
      // Expire unused membership; carry only non-membership remainder.
      const membershipPool = ctx.allowance;
      let flexible = purchasedCarry + row.creditsAdded;
      let used = row.creditsUsed;
      const fromFlexible = Math.min(used, flexible);
      flexible -= fromFlexible;
      used -= fromFlexible;
      const membershipLeft = Math.max(0, membershipPool - used);
      void membershipLeft; // expired at boundary — intentionally not carried
      purchasedCarry = Math.max(0, flexible);
    }
  }

  return results;
}

/**
 * Current billing-cycle balance check.
 * Membership allowance + purchased/promo additions − usage − pending holds.
 * Do not include membership_allocation ledger rows in creditsAddedInCycle —
 * those would double-count against allowance.
 */
export function computeBillingCycleBalanceSummary(ctx: {
  allowance: number;
  creditsAddedInCycle: number;
  creditsUsedInCycle: number;
  liveRemaining: number;
  pendingHeld?: number;
}): {
  computedClosing: number;
  matchesLiveRemaining: boolean;
} {
  const pendingHeld = Math.max(0, ctx.pendingHeld ?? 0);
  const computedClosing = Math.max(
    0,
    ctx.allowance + ctx.creditsAddedInCycle - ctx.creditsUsedInCycle - pendingHeld,
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
