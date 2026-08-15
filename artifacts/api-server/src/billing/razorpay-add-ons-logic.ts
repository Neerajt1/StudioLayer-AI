/**
 * Pure Studio Pass / Top-Up order decision helpers (no DB / network).
 */
import {
  MembershipAddOnChargeAmounts,
  MembershipCreditAllowances,
  membershipAddOnCharge,
  type MembershipPricingMarket,
  type StudioAddOnProductId,
} from "@workspace/studio-credit-engine";

export const STUDIO_ADD_ON_NOTE_PRODUCT = "studiolayer_product";
export const STUDIO_ADD_ON_NOTE_USER_ID = "studiolayer_user_id";
export const STUDIO_ADD_ON_NOTE_MARKET = "studiolayer_market";

export function isStudioAddOnProductId(
  value: unknown,
): value is StudioAddOnProductId {
  return value === "studioPass" || value === "topUp";
}

export function isPaidStudioMembershipTier(tier: string): boolean {
  return tier === "pro" || tier === "enterprise";
}

/**
 * Pass: Complimentary Studio only (matches grantCreditAllocation).
 * Top-Up: active Basic (pro) / Pro (enterprise) only.
 */
export function resolveAddOnPurchaseEligibility(input: {
  product: StudioAddOnProductId;
  subscriptionTier: string;
}): { allowed: true } | { allowed: false; message: string } {
  const paid = isPaidStudioMembershipTier(input.subscriptionTier);

  if (input.product === "topUp") {
    if (!paid) {
      return {
        allowed: false,
        message: "Studio Top-Up is available only to active Studio Members.",
      };
    }
    return { allowed: true };
  }

  if (paid) {
    return {
      allowed: false,
      message: "Studio Pass is available to Complimentary Studio accounts.",
    };
  }
  return { allowed: true };
}

export function resolveAddOnOrderAmount(input: {
  product: StudioAddOnProductId;
  market: MembershipPricingMarket;
}): { amount: number; currency: "INR" | "USD" } {
  return membershipAddOnCharge(input);
}

export function expectedAddOnCredits(product: StudioAddOnProductId): number {
  return product === "studioPass"
    ? MembershipCreditAllowances.studioPass
    : MembershipCreditAllowances.topUp;
}

export function addOnPaymentSourceReference(paymentId: string): string {
  return `rzp_payment:${paymentId}`;
}

export function parseAddOnProductFromNotes(
  notes: Record<string, string> | null | undefined,
): StudioAddOnProductId | null {
  if (!notes) return null;
  const raw = notes[STUDIO_ADD_ON_NOTE_PRODUCT];
  return isStudioAddOnProductId(raw) ? raw : null;
}

export function parseAddOnUserIdFromNotes(
  notes: Record<string, string> | null | undefined,
): number | null {
  if (!notes) return null;
  const raw = notes[STUDIO_ADD_ON_NOTE_USER_ID];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const id = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function assertAddOnPaymentMatchesOrder(input: {
  product: StudioAddOnProductId;
  market: MembershipPricingMarket;
  paymentAmount: number | null | undefined;
  paymentCurrency: string | null | undefined;
}): boolean {
  const expected = MembershipAddOnChargeAmounts[input.market];
  const currency = input.paymentCurrency?.toUpperCase();
  if (input.paymentAmount == null || !currency) return false;
  if (currency !== expected.currency) return false;
  return input.paymentAmount === expected[input.product];
}

export { MembershipAddOnChargeAmounts };
