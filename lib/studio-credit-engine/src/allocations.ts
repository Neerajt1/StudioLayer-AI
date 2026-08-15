import { MembershipCreditAllowances } from './membership';
import { StudioCreditReasonCode } from './reason-codes';

/** Allocation lot statuses. */
export const StudioCreditAllocationStatus = {
  ACTIVE: 'active',
  EXHAUSTED: 'exhausted',
  EXPIRED: 'expired',
} as const;

export type StudioCreditAllocationStatusValue =
  (typeof StudioCreditAllocationStatus)[keyof typeof StudioCreditAllocationStatus];

/** Reason codes that create spendable allocation lots. */
export const STUDIO_CREDIT_ALLOCATION_REASON_CODES = [
  StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
  StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION,
  StudioCreditReasonCode.TOP_UP_ALLOCATION,
  StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
] as const;

export type StudioCreditAllocationReasonCode =
  (typeof STUDIO_CREDIT_ALLOCATION_REASON_CODES)[number];

export const STUDIO_PASS_VALIDITY_DAYS = 7;

/**
 * When true (default until Razorpay is live), paid members without an active
 * membership lot covering `now` still receive an implicit membership pool of
 * `allowance − completed usage in the temporary UTC legacy window`.
 *
 * Production cutover: set STUDIO_CREDIT_LEGACY_MEMBERSHIP_BRIDGE=false once
 * Razorpay membership grants are authoritative. While ON, computeLegacyMembershipBridgeCredits
 * returns 0 whenever hasActiveMembershipLot is true (Razorpay lots win).
 */
export const STUDIO_CREDIT_LEGACY_MEMBERSHIP_BRIDGE_ENV =
  'STUDIO_CREDIT_LEGACY_MEMBERSHIP_BRIDGE';

export function isLegacyMembershipBridgeEnabled(
  env: Record<string, string | undefined> = {},
): boolean {
  const raw = env[STUDIO_CREDIT_LEGACY_MEMBERSHIP_BRIDGE_ENV];
  if (raw == null || raw === '') return true;
  return raw !== '0' && raw.toLowerCase() !== 'false';
}

export function isStudioCreditAllocationReasonCode(
  reasonCode: string,
): reasonCode is StudioCreditAllocationReasonCode {
  return (STUDIO_CREDIT_ALLOCATION_REASON_CODES as readonly string[]).includes(
    reasonCode,
  );
}

export function expectedCreditsForAllocation(input: {
  reasonCode: StudioCreditAllocationReasonCode;
  tier?: string;
}): number {
  switch (input.reasonCode) {
    case StudioCreditReasonCode.MEMBERSHIP_ALLOCATION:
      if (input.tier === 'pro') return MembershipCreditAllowances.basic;
      if (input.tier === 'enterprise') return MembershipCreditAllowances.pro;
      throw new Error(
        `membership_allocation requires paid tier (pro|enterprise); got ${input.tier ?? 'undefined'}`,
      );
    case StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION:
      // Fixed Basic→Pro difference — always 120, independent of current tier.
      return MembershipCreditAllowances.basic;
    case StudioCreditReasonCode.TOP_UP_ALLOCATION:
      return MembershipCreditAllowances.topUp;
    case StudioCreditReasonCode.STUDIO_PASS_ALLOCATION:
      return MembershipCreditAllowances.studioPass;
    default: {
      const _exhaustive: never = input.reasonCode;
      return _exhaustive;
    }
  }
}

export function studioPassExpiresAt(startsAt: Date): Date {
  const expires = new Date(startsAt.getTime());
  expires.setUTCDate(expires.getUTCDate() + STUDIO_PASS_VALIDITY_DAYS);
  return expires;
}

/** Temporary pre-Razorpay period key — not used for post-payment membership lots. */
export function legacyUtcMembershipPeriodKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `legacy-utc:${y}-${m}`;
}

export function legacyUtcMembershipPeriodBounds(now = new Date()): {
  startsAt: Date;
  expiresAt: Date;
  periodKey: string;
} {
  const startsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const expiresAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    startsAt,
    expiresAt,
    periodKey: legacyUtcMembershipPeriodKey(now),
  };
}

export function legacyMembershipSourceReference(
  userId: number,
  periodKey: string,
): string {
  return `legacy-seed:${userId}:${periodKey}`;
}

/**
 * Razorpay-period-ready membership period key.
 * Opaque composition from subscription id + period bounds — no calendar math.
 */
export function razorpayMembershipPeriodKey(input: {
  subscriptionId: string;
  currentStartUnix: number;
  currentEndUnix: number;
}): string {
  return `rzp:${input.subscriptionId}:${input.currentStartUnix}:${input.currentEndUnix}`;
}

/**
 * Period key for Basic → Pro upgrade +120 lot (U1).
 * Tied to the current subscription billing period — not a permanent top-up.
 */
export function razorpayMembershipUpgradePeriodKey(input: {
  subscriptionId: string;
  currentStartUnix: number;
  currentEndUnix: number;
}): string {
  return `rzp_upgrade:${input.subscriptionId}:${input.currentStartUnix}:${input.currentEndUnix}`;
}

export interface CreditAllocationLotLike {
  id: number;
  reasonCode: string;
  remainingAmount: number;
  startsAt: Date;
  expiresAt: Date | null;
  status: string;
  createdAt: Date;
  periodKey?: string | null;
}

export function isAllocationLotSpendable(
  lot: CreditAllocationLotLike,
  now = new Date(),
): boolean {
  if (lot.status !== StudioCreditAllocationStatus.ACTIVE) return false;
  if (lot.remainingAmount <= 0) return false;
  if (lot.startsAt.getTime() > now.getTime()) return false;
  if (lot.expiresAt != null && lot.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

function allocationSpendPriority(reasonCode: string): number {
  switch (reasonCode) {
    case StudioCreditReasonCode.STUDIO_PASS_ALLOCATION:
      return 0;
    case StudioCreditReasonCode.TOP_UP_ALLOCATION:
      return 1;
    case StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION:
      // Spend before base membership remainder within the same period.
      return 2;
    case StudioCreditReasonCode.MEMBERSHIP_ALLOCATION:
      return 3;
    default:
      return 9;
  }
}

/** Pass (soonest expiry) → Top-Up (FIFO) → Membership (FIFO). */
export function compareLotsForConsumption(
  a: CreditAllocationLotLike,
  b: CreditAllocationLotLike,
): number {
  const priority = allocationSpendPriority(a.reasonCode) - allocationSpendPriority(b.reasonCode);
  if (priority !== 0) return priority;

  if (
    a.reasonCode === StudioCreditReasonCode.STUDIO_PASS_ALLOCATION &&
    b.reasonCode === StudioCreditReasonCode.STUDIO_PASS_ALLOCATION
  ) {
    const aExp = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bExp = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aExp !== bExp) return aExp - bExp;
  }

  const created = a.createdAt.getTime() - b.createdAt.getTime();
  if (created !== 0) return created;
  return a.id - b.id;
}

export function sumSpendableAllocationCredits(
  lots: readonly CreditAllocationLotLike[],
  now = new Date(),
): number {
  let total = 0;
  for (const lot of lots) {
    if (isAllocationLotSpendable(lot, now)) {
      total += lot.remainingAmount;
    }
  }
  return total;
}

export interface AllocationConsumptionPlanItem {
  allocationId: number;
  amount: number;
  remainingAfter: number;
}

/**
 * Plan lot decrements for a completed usage charge.
 * Does not mutate inputs.
 */
export function planAllocationConsumption(
  lots: readonly CreditAllocationLotLike[],
  creditsToConsume: number,
  now = new Date(),
): AllocationConsumptionPlanItem[] {
  if (creditsToConsume <= 0) return [];

  const ordered = lots
    .filter((lot) => isAllocationLotSpendable(lot, now))
    .slice()
    .sort(compareLotsForConsumption);

  let remaining = creditsToConsume;
  const plan: AllocationConsumptionPlanItem[] = [];

  for (const lot of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingAmount, remaining);
    if (take <= 0) continue;
    plan.push({
      allocationId: lot.id,
      amount: take,
      remainingAfter: lot.remainingAmount - take,
    });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient allocation lots to consume ${creditsToConsume} Studio Credits (${remaining} short)`,
    );
  }

  return plan;
}

export function computeAvailableStudioCredits(input: {
  spendableFromLots: number;
  pendingHeld: number;
  legacyMembershipBridgeCredits?: number;
}): number {
  const bridge = Math.max(0, input.legacyMembershipBridgeCredits ?? 0);
  return Math.max(
    0,
    input.spendableFromLots + bridge - Math.max(0, input.pendingHeld),
  );
}

export function hasActiveMembershipLotCoveringNow(
  lots: readonly CreditAllocationLotLike[],
  now = new Date(),
): boolean {
  return lots.some(
    (lot) =>
      lot.reasonCode === StudioCreditReasonCode.MEMBERSHIP_ALLOCATION &&
      isAllocationLotSpendable(lot, now),
  );
}

/**
 * Implicit membership pool used only while the legacy bridge is ON and no
 * spendable membership lot covers `now`. Temporary UTC window — not Razorpay.
 */
export function computeLegacyMembershipBridgeCredits(input: {
  bridgeEnabled: boolean;
  hasActiveMembershipLot: boolean;
  membershipAllowance: number;
  completedUsageInLegacyWindow: number;
}): number {
  if (!input.bridgeEnabled) return 0;
  if (input.hasActiveMembershipLot) return 0;
  return Math.max(
    0,
    input.membershipAllowance - Math.max(0, input.completedUsageInLegacyWindow),
  );
}

export function allocationStatusAfterRemaining(
  remainingAmount: number,
  expiresAt: Date | null,
  now = new Date(),
): StudioCreditAllocationStatusValue {
  if (expiresAt != null && expiresAt.getTime() <= now.getTime()) {
    return StudioCreditAllocationStatus.EXPIRED;
  }
  if (remainingAmount <= 0) return StudioCreditAllocationStatus.EXHAUSTED;
  return StudioCreditAllocationStatus.ACTIVE;
}

/**
 * Membership no-carry-forward: after period end, unused membership remaining
 * is unspendable even if a row still shows remaining_amount > 0 until lazy expire.
 */
export function membershipCreditsDoNotCarryForward(): true {
  return true;
}
