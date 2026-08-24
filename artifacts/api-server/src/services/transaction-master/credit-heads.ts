import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import {
  isMembershipAllocationReasonCode,
  isPromotionalReasonCode,
} from "../account-statement/labels.js";
import type {
  CommercialCreditHead,
  CreditsSummary,
  StudioMembershipPlan,
} from "./types.js";

const LEGACY_SEED_SOURCE_PREFIX = "legacy-seed:";
const RAZORPAY_PAYMENT_SOURCE_PREFIX = "rzp_payment:";
const RAZORPAY_INVOICE_SOURCE_PREFIX = "rzp_invoice:";
const RAZORPAY_SUB_PERIOD_SOURCE_PREFIX = "rzp_sub_period:";

export function isAdminGrantReasonCode(reasonCode: string): boolean {
  return reasonCode === StudioCreditReasonCode.ADMIN_GRANT_ALLOCATION;
}

/**
 * Inverse of `studioTierForPlan`:
 * users.subscription_tier `pro` → Studio Basic, `enterprise` → Studio Pro.
 */
export function studioMembershipPlanFromTier(
  tier: string | null | undefined,
): StudioMembershipPlan | null {
  if (tier === "pro") return "basic";
  if (tier === "enterprise") return "pro";
  return null;
}

export function isStudioMembershipPlanId(
  value: unknown,
): value is StudioMembershipPlan {
  return value === "basic" || value === "pro";
}

export interface CommercialCreditHeadInput {
  reasonCode: string;
  /** Authoritative Razorpay membership plan when resolvable. */
  studioPlan?: StudioMembershipPlan | null;
  allocationSourceReference?: string | null;
  /**
   * Current customer tier — used only for `legacy-seed:` membership lots.
   * Never used to guess Razorpay-backed membership grants.
   */
  subscriptionTier?: string | null;
}

/**
 * Canonical commercial credit-head classifier.
 * Returns `unknown` when membership Basic/Pro cannot be determined reliably.
 * Does not invent classifications from amount, price, or dates.
 */
export function classifyCommercialCreditHead(
  input: CommercialCreditHeadInput,
): CommercialCreditHead {
  if (isPromotionalReasonCode(input.reasonCode) || isAdminGrantReasonCode(input.reasonCode)) {
    return "promotional";
  }

  if (input.reasonCode === StudioCreditReasonCode.TOP_UP_ALLOCATION) {
    return "top_up";
  }

  if (input.reasonCode === StudioCreditReasonCode.STUDIO_PASS_ALLOCATION) {
    return "studio_pass";
  }

  if (isMembershipAllocationReasonCode(input.reasonCode)) {
    if (input.reasonCode === StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION) {
      return "studio_pro";
    }

    if (isStudioMembershipPlanId(input.studioPlan)) {
      return input.studioPlan === "basic" ? "studio_basic" : "studio_pro";
    }

    const ref = input.allocationSourceReference?.trim() ?? "";
    if (ref.startsWith(LEGACY_SEED_SOURCE_PREFIX)) {
      const plan = studioMembershipPlanFromTier(input.subscriptionTier);
      if (plan === "basic") return "studio_basic";
      if (plan === "pro") return "studio_pro";
      return "unknown";
    }

    return "unknown";
  }

  return "unknown";
}

export function emptyCreditsSummary(): CreditsSummary {
  return {
    studioBasicCredits: 0,
    studioProCredits: 0,
    topUpCredits: 0,
    studioPassCredits: 0,
    promotionalCredits: 0,
    totalCreditsAdded: 0,
    unknownCredits: 0,
  };
}

export function accumulateCreditsSummary(
  summary: CreditsSummary,
  head: CommercialCreditHead,
  amount: number,
): void {
  if (amount <= 0) return;

  switch (head) {
    case "studio_basic":
      summary.studioBasicCredits += amount;
      break;
    case "studio_pro":
      summary.studioProCredits += amount;
      break;
    case "top_up":
      summary.topUpCredits += amount;
      break;
    case "studio_pass":
      summary.studioPassCredits += amount;
      break;
    case "promotional":
      summary.promotionalCredits += amount;
      break;
    case "unknown":
      summary.unknownCredits += amount;
      return;
  }

  summary.totalCreditsAdded =
    summary.studioBasicCredits +
    summary.studioProCredits +
    summary.topUpCredits +
    summary.studioPassCredits +
    summary.promotionalCredits;
}

export function razorpayPaymentIdFromSourceReference(
  sourceReference: string | null | undefined,
): string | null {
  const ref = sourceReference?.trim() ?? "";
  if (!ref.startsWith(RAZORPAY_PAYMENT_SOURCE_PREFIX)) return null;
  const paymentId = ref.slice(RAZORPAY_PAYMENT_SOURCE_PREFIX.length);
  return paymentId.length > 0 ? paymentId : null;
}

export function razorpayInvoiceIdFromSourceReference(
  sourceReference: string | null | undefined,
): string | null {
  const ref = sourceReference?.trim() ?? "";
  if (!ref.startsWith(RAZORPAY_INVOICE_SOURCE_PREFIX)) return null;
  const invoiceId = ref.slice(RAZORPAY_INVOICE_SOURCE_PREFIX.length);
  return invoiceId.length > 0 ? invoiceId : null;
}

export function razorpaySubscriptionIdFromSubPeriodSourceReference(
  sourceReference: string | null | undefined,
): string | null {
  const ref = sourceReference?.trim() ?? "";
  if (!ref.startsWith(RAZORPAY_SUB_PERIOD_SOURCE_PREFIX)) return null;
  const payload = ref.slice(RAZORPAY_SUB_PERIOD_SOURCE_PREFIX.length);
  const subscriptionId = payload.split(":")[0]?.trim();
  return subscriptionId && subscriptionId.length > 0 ? subscriptionId : null;
}
