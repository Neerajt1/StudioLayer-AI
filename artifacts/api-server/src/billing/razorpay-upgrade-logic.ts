/**
 * Pure Basic → Pro fixed-difference upgrade helpers (no DB / network).
 */
import {
  MembershipUpgradeChargeAmounts,
  membershipUpgradeCharge,
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

export { MembershipUpgradeChargeAmounts };
