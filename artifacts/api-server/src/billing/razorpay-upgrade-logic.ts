/**
 * Pure Basic → Pro fixed-difference upgrade helpers (no DB / network).
 */
import {
  MembershipUpgradeChargeAmounts,
  MembershipUpgradeCreditGrant,
  STUDIO_UPGRADE_IMMEDIATE_ENTITLEMENT_ENV,
  isStudioUpgradeImmediateEntitlementEnabled,
  membershipUpgradeCharge,
  razorpayMembershipUpgradePeriodKey,
  type MembershipPricingMarket,
} from "@workspace/studio-credit-engine";

/** Order / payment notes product key for Basic → Pro upgrade difference. */
export const STUDIO_UPGRADE_PRODUCT = "basicToProUpgrade";

export const STUDIO_UPGRADE_NOTE_PRODUCT = "studiolayer_product";
export const STUDIO_UPGRADE_NOTE_USER_ID = "studiolayer_user_id";
export const STUDIO_UPGRADE_NOTE_MARKET = "studiolayer_market";
export const STUDIO_UPGRADE_NOTE_SUBSCRIPTION_ID =
  "studiolayer_subscription_id";

export function isStudioUpgradeProduct(value: unknown): boolean {
  return value === STUDIO_UPGRADE_PRODUCT;
}

export function resolveUpgradeOrderAmount(input: {
  market: MembershipPricingMarket;
}): { amount: number; currency: "INR" | "USD" } {
  return membershipUpgradeCharge(input.market);
}

export function assertUpgradePaymentMatchesOrder(input: {
  market: MembershipPricingMarket;
  paymentAmount: number | null | undefined;
  paymentCurrency: string | null | undefined;
}): boolean {
  const expected = MembershipUpgradeChargeAmounts[input.market];
  const currency = input.paymentCurrency?.toUpperCase();
  if (input.paymentAmount == null || !currency) return false;
  if (currency !== expected.currency) return false;
  return input.paymentAmount === expected.amount;
}

export function upgradePaymentSourceReference(paymentId: string): string {
  return `rzp_upgrade_payment:${paymentId}`;
}

/** Local marker while an upgrade Order exists but payment is not yet fulfilled. */
export const UPGRADE_CHECKOUT_ORDER_PREFIX = "order:";

export function upgradeCheckoutOrderMarker(orderId: string): string {
  return `${UPGRADE_CHECKOUT_ORDER_PREFIX}${orderId}`;
}

export function parseUpgradeCheckoutOrderId(
  pendingUpgradePaymentId: string | null | undefined,
): string | null {
  if (!pendingUpgradePaymentId?.startsWith(UPGRADE_CHECKOUT_ORDER_PREFIX)) {
    return null;
  }
  const orderId = pendingUpgradePaymentId.slice(
    UPGRADE_CHECKOUT_ORDER_PREFIX.length,
  );
  return orderId.trim() ? orderId.trim() : null;
}

/** True when a captured upgrade payment id is already stored (pending may lag). */
export function isCapturedUpgradePaymentMarker(
  pendingUpgradePaymentId: string | null | undefined,
): boolean {
  if (!pendingUpgradePaymentId) return false;
  if (pendingUpgradePaymentId.startsWith(UPGRADE_CHECKOUT_ORDER_PREFIX)) {
    return false;
  }
  return pendingUpgradePaymentId.startsWith("pay_");
}

/**
 * Decide whether an unpaid upgrade Order marker can be reused.
 * Uses Razorpay Order status — no local TTL.
 *
 * - created / attempted → reuse (dismissed checkout with valid Order)
 * - paid / amount_paid > 0 → already paid (never create another Order)
 * - expired / missing / unknown → allow a fresh Order
 */
export type UpgradeCheckoutOrderReuseDecision =
  | { action: "reuse"; orderId: string }
  | { action: "already_paid"; orderId: string }
  | {
      action: "create_fresh";
      reason: "expired" | "not_found" | "invalid" | "fetch_failed";
    };

export function resolveUpgradeCheckoutOrderReuse(input: {
  orderId: string;
  order: {
    status?: string | null;
    amount_paid?: number | null;
  } | null;
  fetchFailed?: boolean;
}): UpgradeCheckoutOrderReuseDecision {
  const orderId = input.orderId.trim();
  if (!orderId) {
    return { action: "create_fresh", reason: "invalid" };
  }

  if (input.fetchFailed || !input.order) {
    return { action: "create_fresh", reason: input.fetchFailed ? "fetch_failed" : "not_found" };
  }

  const status = (input.order.status ?? "").trim().toLowerCase();
  const amountPaid =
    typeof input.order.amount_paid === "number" ? input.order.amount_paid : 0;

  if (status === "paid" || amountPaid > 0) {
    return { action: "already_paid", orderId };
  }

  if (status === "created" || status === "attempted") {
    return { action: "reuse", orderId };
  }

  if (status === "expired") {
    return { action: "create_fresh", reason: "expired" };
  }

  return { action: "create_fresh", reason: "invalid" };
}

export function parseUpgradeUserIdFromNotes(
  notes: Record<string, string> | null | undefined,
): number | null {
  if (!notes) return null;
  const raw = notes[STUDIO_UPGRADE_NOTE_USER_ID];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const id = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function parseUpgradeSubscriptionIdFromNotes(
  notes: Record<string, string> | null | undefined,
): string | null {
  if (!notes) return null;
  const raw = notes[STUDIO_UPGRADE_NOTE_SUBSCRIPTION_ID];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function parseUpgradeMarketFromNotes(
  notes: Record<string, string> | null | undefined,
): MembershipPricingMarket | null {
  if (!notes) return null;
  const raw = notes[STUDIO_UPGRADE_NOTE_MARKET];
  return raw === "india" || raw === "international" ? raw : null;
}

/** Read server env for immediate StudioLayer Pro + +120 path (default OFF). */
export function readStudioUpgradeImmediateEntitlementFlag(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isStudioUpgradeImmediateEntitlementEnabled(env);
}

/**
 * U1 period key for upgrade +120 lot. Requires unix seconds for start/end.
 */
export function buildMembershipUpgradePeriodKey(input: {
  subscriptionId: string;
  currentStart: Date;
  currentEnd: Date;
}): string {
  return razorpayMembershipUpgradePeriodKey({
    subscriptionId: input.subscriptionId,
    currentStartUnix: Math.floor(input.currentStart.getTime() / 1000),
    currentEndUnix: Math.floor(input.currentEnd.getTime() / 1000),
  });
}

/**
 * U2 fail-closed: upgrade +120 requires a valid current period end (and start).
 */
export function resolveUpgradeCreditPeriodBounds(input: {
  currentStart: Date | null | undefined;
  currentEnd: Date | null | undefined;
}): { currentStart: Date; currentEnd: Date } | null {
  if (!input.currentStart || !input.currentEnd) return null;
  const startMs = input.currentStart.getTime();
  const endMs = input.currentEnd.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs <= startMs) return null;
  return { currentStart: input.currentStart, currentEnd: input.currentEnd };
}

export {
  MembershipUpgradeChargeAmounts,
  MembershipUpgradeCreditGrant,
  STUDIO_UPGRADE_IMMEDIATE_ENTITLEMENT_ENV,
};
