/**
 * Pure Razorpay membership decision helpers (no DB / network).
 * Used by webhook + create-subscription flows and unit tests.
 */
import {
  MembershipCreditAllowances,
  expectedCreditsForAllocation,
  razorpayMembershipPeriodKey,
  StudioCreditReasonCode,
} from "@workspace/studio-credit-engine";
import {
  isCapturedRazorpayPayment,
  isOpenMembershipSubscriptionStatus,
  isWebhookEventFullyProcessed,
  matchesExpectedPlanAmountUsdCents,
  membershipPaymentSourceReference,
  shouldReprocessWebhookEvent,
  type RazorpayPaymentEntity,
  type RazorpaySubscriptionEntity,
  type RazorpayWebhookProcessingStatusValue,
  type StudioMembershipPlanId,
  studioTierForPlan,
} from "./razorpay-client.js";

export type SubscriptionChargedGrantDecision =
  | {
      grant: true;
      credits: number;
      sourceReference: string;
      periodKey: string;
      startsAt: Date;
      expiresAt: Date;
      studioTier: "pro" | "enterprise";
    }
  | {
      grant: false;
      reason:
        | "missing_payment"
        | "missing_payment_id"
        | "missing_payment_status"
        | "payment_not_captured"
        | "amount_mismatch"
        | "missing_period_bounds"
        | "unknown_plan_tier";
      credits: number;
    };

function unixToDate(unix: number | null | undefined): Date | null {
  if (unix == null || !Number.isFinite(unix)) return null;
  return new Date(unix * 1000);
}

/**
 * Strict grant gate for subscription.charged.
 * Requires payment.id + status === "captured". Never grants on missing status.
 */
export function evaluateSubscriptionChargedGrant(input: {
  studioPlan: StudioMembershipPlanId;
  studioTier: string;
  subscription: Pick<
    RazorpaySubscriptionEntity,
    "id" | "current_start" | "current_end"
  >;
  payment: RazorpayPaymentEntity | null | undefined;
  invoiceId?: string | null;
}): SubscriptionChargedGrantDecision {
  const payment = input.payment;
  if (!payment) {
    return { grant: false, reason: "missing_payment", credits: 0 };
  }
  if (typeof payment.id !== "string" || payment.id.length === 0) {
    return { grant: false, reason: "missing_payment_id", credits: 0 };
  }
  if (payment.status == null || payment.status === "") {
    return { grant: false, reason: "missing_payment_status", credits: 0 };
  }
  if (!isCapturedRazorpayPayment(payment)) {
    return { grant: false, reason: "payment_not_captured", credits: 0 };
  }

  const amountOk = matchesExpectedPlanAmountUsdCents({
    plan: input.studioPlan,
    payment,
  });
  if (amountOk === false) {
    return { grant: false, reason: "amount_mismatch", credits: 0 };
  }

  const currentStartUnix = input.subscription.current_start;
  const currentEndUnix = input.subscription.current_end;
  if (
    currentStartUnix == null ||
    currentEndUnix == null ||
    !Number.isFinite(currentStartUnix) ||
    !Number.isFinite(currentEndUnix)
  ) {
    return { grant: false, reason: "missing_period_bounds", credits: 0 };
  }

  if (input.studioTier !== "pro" && input.studioTier !== "enterprise") {
    return { grant: false, reason: "unknown_plan_tier", credits: 0 };
  }

  const startsAt = unixToDate(currentStartUnix)!;
  const expiresAt = unixToDate(currentEndUnix)!;
  const credits = expectedCreditsForAllocation({
    reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
    tier: input.studioTier,
  });

  return {
    grant: true,
    credits,
    sourceReference: membershipPaymentSourceReference({
      paymentId: payment.id,
      invoiceId: input.invoiceId ?? payment.invoice_id ?? null,
      subscriptionId: input.subscription.id,
      currentStartUnix,
      currentEndUnix,
    }),
    periodKey: razorpayMembershipPeriodKey({
      subscriptionId: input.subscription.id,
      currentStartUnix,
      currentEndUnix,
    }),
    startsAt,
    expiresAt,
    studioTier: input.studioTier,
  };
}

export type OpenMembershipRow = {
  razorpaySubscriptionId: string;
  studioPlan: string;
  studioTier: string;
  status: string;
  razorpayPlanId: string;
};

/**
 * At most one open membership across Basic + Pro.
 * Same plan open → reuse. Other plan open → conflict.
 */
export function resolveOpenMembershipForCreate(input: {
  requestedPlan: StudioMembershipPlanId;
  openSubscriptions: readonly OpenMembershipRow[];
}):
  | { action: "create" }
  | { action: "reuse"; subscription: OpenMembershipRow }
  | { action: "conflict"; existing: OpenMembershipRow; message: string } {
  const open = input.openSubscriptions.filter((row) =>
    isOpenMembershipSubscriptionStatus(row.status),
  );
  if (open.length === 0) {
    return { action: "create" };
  }

  const samePlan = open.find((row) => row.studioPlan === input.requestedPlan);
  if (samePlan) {
    return { action: "reuse", subscription: samePlan };
  }

  const existing = open[0]!;
  const requestedTier = studioTierForPlan(input.requestedPlan);
  return {
    action: "conflict",
    existing,
    message: `An open ${existing.studioPlan} membership already exists (${existing.status}). Cancel or complete it before starting ${input.requestedPlan} (${requestedTier}).`,
  };
}

/**
 * In-memory claim semantics for webhook event_id uniqueness + retryability.
 * Mirrors DB advisory-locked claim without requiring a database in unit tests.
 */
export type WebhookEventClaim =
  | { outcome: "process"; priorStatus: RazorpayWebhookProcessingStatusValue | null }
  | { outcome: "already_processed" };

export function claimWebhookEventForProcessing(input: {
  existingStatus: string | null | undefined;
}): WebhookEventClaim {
  if (isWebhookEventFullyProcessed(input.existingStatus)) {
    return { outcome: "already_processed" };
  }
  if (
    input.existingStatus == null ||
    shouldReprocessWebhookEvent(input.existingStatus)
  ) {
    return {
      outcome: "process",
      priorStatus: (input.existingStatus as RazorpayWebhookProcessingStatusValue) ?? null,
    };
  }
  // Unknown status — treat as reprocessable to avoid permanent credit loss.
  return { outcome: "process", priorStatus: null };
}

export function expectedMembershipCreditsForPlan(
  plan: StudioMembershipPlanId,
): number {
  return plan === "basic"
    ? MembershipCreditAllowances.basic
    : MembershipCreditAllowances.pro;
}

export { unixToDate };
