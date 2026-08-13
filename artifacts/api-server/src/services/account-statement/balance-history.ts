import type { StudioCreditTransaction } from "@workspace/db";
import {
  StudioCreditReasonCode,
  studioPassExpiresAt,
} from "@workspace/studio-credit-engine";
import { formatMonthKey, isUsageReasonCode } from "./labels.js";

/** Paid memberships reset the membership pool on each billing-cycle boundary. */
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

/** Optional allocation period hints (Razorpay / explicit lots). */
export interface StatementMembershipPeriodHint {
  ledgerTransactionId: string | null;
  startsAt: Date;
  expiresAt: Date | null;
  periodKey?: string | null;
  originalAmount: number;
}

export interface StatementBalanceContext {
  allowance: number;
  tier: string;
  isAdmin: boolean;
  generatedAt: Date;
  transactions: readonly StudioCreditTransaction[];
  liveRemaining: number;
  /**
   * When present (or when membership_allocation ledger rows exist), running
   * balance uses allocation starts_at/expires_at instead of UTC calendar months.
   */
  membershipPeriodHints?: readonly StatementMembershipPeriodHint[];
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

function hasExplicitMembershipGrants(
  ctx: StatementBalanceContext,
): boolean {
  if ((ctx.membershipPeriodHints?.length ?? 0) > 0) return true;
  return ctx.transactions.some(
    (tx) =>
      tx.amount > 0 &&
      tx.reasonCode === StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
  );
}

function expireMembershipIfNeeded(
  pools: { membership: number; pass: number; topUp: number; other: number },
  membershipExpiresAt: Date | null,
  at: Date,
): Date | null {
  if (membershipExpiresAt && at.getTime() >= membershipExpiresAt.getTime()) {
    pools.membership = 0;
    return null;
  }
  return membershipExpiresAt;
}

type PassLot = { remaining: number; expiresAt: Date };

function expirePassLots(passLots: PassLot[], pools: { pass: number }, at: Date): void {
  let passTotal = 0;
  for (const lot of passLots) {
    if (at.getTime() >= lot.expiresAt.getTime()) {
      lot.remaining = 0;
    }
    passTotal += lot.remaining;
  }
  pools.pass = passTotal;
}

function applyUsageToPassLots(passLots: PassLot[], take: number): number {
  let remaining = take;
  for (const lot of passLots) {
    if (remaining <= 0) break;
    const use = Math.min(lot.remaining, remaining);
    lot.remaining -= use;
    remaining -= use;
  }
  return take - remaining;
}

/**
 * Running balance after each completed transaction in chronological order.
 *
 * Legacy (no membership_allocation rows / hints): paid tiers refresh membership
 * at each UTC month boundary (pre-Razorpay statement interpretation).
 *
 * Forward Razorpay / explicit grants: membership follows allocation
 * starts_at / expires_at (period_key), not UTC calendar months.
 * Top-Up carries across membership boundaries. Pass expires after 7 days.
 */
export function computeLedgerRunningBalances(
  ctx: StatementBalanceContext,
): number[] {
  if (ctx.isAdmin) {
    return ctx.transactions.map(() => 0);
  }

  const resets = membershipResetsEachBillingCycle(ctx.tier);
  const useAllocationPeriods = resets && hasExplicitMembershipGrants(ctx);

  const pools = {
    membership: useAllocationPeriods ? 0 : resets ? 0 : ctx.allowance,
    pass: 0,
    topUp: 0,
    other: 0,
  };
  let currentCycleMonth: string | null = null;
  let membershipExpiresAt: Date | null = null;
  const passLots: PassLot[] = [];
  const balances: number[] = [];

  const hintsByLedgerId = new Map<string, StatementMembershipPeriodHint>();
  for (const hint of ctx.membershipPeriodHints ?? []) {
    if (hint.ledgerTransactionId) {
      hintsByLedgerId.set(hint.ledgerTransactionId, hint);
    }
  }

  for (const tx of ctx.transactions) {
    if (useAllocationPeriods) {
      membershipExpiresAt = expireMembershipIfNeeded(
        pools,
        membershipExpiresAt,
        tx.createdAt,
      );
      expirePassLots(passLots, pools, tx.createdAt);
    } else if (resets) {
      const txMonth = formatMonthKey(tx.createdAt);
      if (txMonth !== currentCycleMonth) {
        currentCycleMonth = txMonth;
        // Membership no-carry-forward; Pass/Top-Up survive.
        pools.membership = ctx.allowance;
      }
    }

    if (tx.amount > 0) {
      const kind = poolKindForReason(tx.reasonCode);
      if (kind === "membership") {
        pools.membership = tx.amount;
        const hint =
          hintsByLedgerId.get(tx.transactionId) ??
          (ctx.membershipPeriodHints ?? []).find(
            (h) =>
              h.originalAmount === tx.amount &&
              h.startsAt.getTime() <= tx.createdAt.getTime() &&
              (h.expiresAt == null ||
                h.expiresAt.getTime() > tx.createdAt.getTime()),
          );
        membershipExpiresAt = hint?.expiresAt ?? null;
      } else if (kind === "pass") {
        const expiresAt = studioPassExpiresAt(tx.createdAt);
        passLots.push({ remaining: tx.amount, expiresAt });
        pools.pass += tx.amount;
      } else {
        pools[kind] += tx.amount;
      }
    } else if (tx.amount < 0) {
      const usageAbs = Math.abs(tx.amount);
      if (useAllocationPeriods) {
        let remaining = usageAbs;
        remaining -= applyUsageToPassLots(passLots, remaining);
        pools.pass = passLots.reduce((sum, lot) => sum + lot.remaining, 0);
        const restPools = {
          membership: pools.membership,
          pass: 0,
          topUp: pools.topUp,
          other: pools.other,
        };
        applyUsageToPools(restPools, remaining);
        pools.membership = restPools.membership;
        pools.topUp = restPools.topUp;
        pools.other = restPools.other;
      } else {
        applyUsageToPools(pools, usageAbs);
      }
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
 *
 * Note: monthly summary remains calendar-month grouped for statement UX;
 * ledger running balances (above) use Razorpay allocation periods when grants exist.
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
