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
  matchesExpectedMembershipPaymentAmount,
  membershipPaymentSourceReference,
  shouldReprocessWebhookEvent,
  type RazorpayInvoiceEntity,
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

  const amountOk = matchesExpectedMembershipPaymentAmount({
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
 * Before reusing a local open subscription for Checkout, decide from live Razorpay
 * state whether Checkout is still valid or the subscription is already paid.
 */
export function resolveLiveMembershipForCheckoutReuse(input: {
  liveStatus: string;
  paidCount?: number | null;
}):
  | { action: "reuse_checkout" }
  | { action: "reconcile_paid" }
  | { action: "unavailable"; message: string } {
  const paidCount =
    typeof input.paidCount === "number" && Number.isFinite(input.paidCount)
      ? input.paidCount
      : 0;

  if (paidCount > 0 || input.liveStatus === "active") {
    return { action: "reconcile_paid" };
  }

  if (
    input.liveStatus === "created" ||
    input.liveStatus === "authenticated" ||
    input.liveStatus === "pending"
  ) {
    return { action: "reuse_checkout" };
  }

  return {
    action: "unavailable",
    message: `This membership subscription is ${input.liveStatus} and cannot be used for checkout. Please try again or contact support if this persists.`,
  };
}

/** Prefer the newest paid invoice that carries a payment_id for grant identity. */
export function pickLatestPaidSubscriptionInvoice(
  invoices: readonly RazorpayInvoiceEntity[],
): RazorpayInvoiceEntity | null {
  const paid = invoices.filter(
    (invoice) =>
      invoice.status === "paid" &&
      typeof invoice.payment_id === "string" &&
      invoice.payment_id.length > 0,
  );
  if (paid.length === 0) return null;

  return [...paid].sort((a, b) => {
    const aAt = a.paid_at ?? a.created_at ?? 0;
    const bAt = b.paid_at ?? b.created_at ?? 0;
    return bAt - aAt;
  })[0]!;
}

/**
 * At most one open membership across Basic + Pro.
 * Same StudioLayer plan + matching Razorpay plan_id → reuse.
 * Stale incomplete (`created`) with a different Razorpay plan_id (e.g. old USD
 * checkout while the current market expects INR) → do not reuse; allow create
 * and return those rows for the caller to supersede.
 * Non-created open memberships (active / authenticated / …) keep blocking even
 * when the Razorpay plan_id differs — never replace a paid membership for market.
 * Other StudioLayer plan open → conflict.
 */
export function resolveOpenMembershipForCreate(input: {
  requestedPlan: StudioMembershipPlanId;
  openSubscriptions: readonly OpenMembershipRow[];
  /** Market-resolved Razorpay plan id for this checkout (required for safe reuse). */
  expectedRazorpayPlanId?: string;
}):
  | { action: "create"; supersedeCreated: OpenMembershipRow[] }
  | { action: "reuse"; subscription: OpenMembershipRow }
  | { action: "conflict"; existing: OpenMembershipRow; message: string } {
  const open = input.openSubscriptions.filter((row) =>
    isOpenMembershipSubscriptionStatus(row.status),
  );
  if (open.length === 0) {
    return { action: "create", supersedeCreated: [] };
  }

  const samePlanRows = open.filter(
    (row) => row.studioPlan === input.requestedPlan,
  );
  const otherPlan = open.find((row) => row.studioPlan !== input.requestedPlan);

  if (samePlanRows.length > 0) {
    const expected = input.expectedRazorpayPlanId?.trim() || null;

    if (!expected) {
      // Legacy callers without market plan id — preserve prior reuse behaviour.
      return { action: "reuse", subscription: samePlanRows[0]! };
    }

    const matching = samePlanRows.find(
      (row) => row.razorpayPlanId === expected,
    );
    if (matching) {
      return { action: "reuse", subscription: matching };
    }

    const staleCreated = samePlanRows.filter((row) => row.status === "created");
    const blockingMismatch = samePlanRows.find(
      (row) => row.status !== "created",
    );
    if (blockingMismatch) {
      return {
        action: "conflict",
        existing: blockingMismatch,
        message: `An open ${blockingMismatch.studioPlan} membership already exists (${blockingMismatch.status}). Cancel or complete it before starting ${input.requestedPlan}.`,
      };
    }

    // Only incomplete `created` checkouts with the wrong market plan_id.
    return { action: "create", supersedeCreated: staleCreated };
  }

  if (otherPlan) {
    const requestedTier = studioTierForPlan(input.requestedPlan);
    return {
      action: "conflict",
      existing: otherPlan,
      message: `An open ${otherPlan.studioPlan} membership already exists (${otherPlan.status}). Cancel or complete it before starting ${input.requestedPlan} (${requestedTier}).`,
    };
  }

  return { action: "create", supersedeCreated: [] };
}

/**
 * When Razorpay's live plan_id advances, sync local plan fields.
 * Also clears any leftover pending_* upgrade columns from pre-V1 removal rows.
 * Returns null when no local plan change is required.
 */
export function resolveSubscriptionPlanSync(input: {
  studioPlan: string;
  studioTier: string;
  razorpayPlanId: string;
  pendingUpgradePlan: string | null;
  pendingRazorpayPlanId: string | null;
  razorpayEntityPlanId: string | null | undefined;
  mappedStudioPlan: StudioMembershipPlanId | null;
}): {
  studioPlan: StudioMembershipPlanId;
  studioTier: "pro" | "enterprise";
  razorpayPlanId: string;
  clearPending: boolean;
} | null {
  const entityPlanId = input.razorpayEntityPlanId?.trim() || null;
  if (!entityPlanId) return null;

  const mapped = input.mappedStudioPlan;
  if (!mapped) return null;

  if (
    entityPlanId === input.razorpayPlanId &&
    mapped === input.studioPlan
  ) {
    return null;
  }

  return {
    studioPlan: mapped,
    studioTier: studioTierForPlan(mapped),
    razorpayPlanId: entityPlanId,
    clearPending: Boolean(input.pendingUpgradePlan || input.pendingRazorpayPlanId),
  };
}

/**
 * Razorpay webhook idempotency key.
 * Live deliveries send the unique id in `X-Razorpay-Event-Id` (not body.id).
 * Body `id` remains a fallback for tests / internal callers.
 */
export function resolveRazorpayWebhookEventId(input: {
  headerEventId?: string | null;
  bodyId?: unknown;
}): string | null {
  const fromHeader =
    typeof input.headerEventId === "string" ? input.headerEventId.trim() : "";
  if (fromHeader.length > 0) return fromHeader;

  if (typeof input.bodyId === "string" && input.bodyId.trim().length > 0) {
    return input.bodyId.trim();
  }
  return null;
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
