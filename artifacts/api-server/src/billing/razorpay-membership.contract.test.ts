import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("payments route auth + webhook session contract", () => {
  const paymentsSource = readFileSync(
    path.join(here, "../routes/payments.ts"),
    "utf8",
  );
  const appSource = readFileSync(path.join(here, "../app.ts"), "utf8");
  const membershipSource = readFileSync(
    path.join(here, "razorpay-membership.ts"),
    "utf8",
  );
  const logicSource = readFileSync(
    path.join(here, "razorpay-membership-logic.ts"),
    "utf8",
  );

  it("subscription creation requires session userId", () => {
    assert.match(paymentsSource, /req\.session\?\.userId/);
    assert.match(paymentsSource, /Not authenticated/);
  });

  it("webhook does not require user session", () => {
    const webhookBlock = paymentsSource.slice(
      paymentsSource.indexOf("/payments/razorpay/webhook"),
    );
    assert.equal(webhookBlock.includes("req.session"), false);
    assert.match(webhookBlock, /X-Razorpay-Signature/);
    assert.match(webhookBlock, /X-Razorpay-Event-Id/);
    assert.match(webhookBlock, /rawBody/);
  });

  it("webhook event id prefers X-Razorpay-Event-Id header over body.id", () => {
    assert.match(paymentsSource, /eventIdHeader:\s*req\.header\("X-Razorpay-Event-Id"\)/);
    assert.match(membershipSource, /resolveRazorpayWebhookEventId/);
    assert.match(logicSource, /headerEventId/);
    assert.match(logicSource, /bodyId/);
  });

  it("app.ts preserves raw body for Razorpay webhook path", () => {
    assert.match(appSource, /\/api\/payments\/razorpay\/webhook/);
    assert.match(appSource, /rawBody/);
    assert.match(appSource, /verify:/);
  });

  it("membership charges use grantCreditAllocation from credit architecture", () => {
    assert.match(membershipSource, /grantCreditAllocation/);
    assert.match(membershipSource, /StudioCreditReasonCode\.MEMBERSHIP_ALLOCATION/);
    assert.match(membershipSource, /subscription\.charged/);
    assert.match(logicSource, /evaluateSubscriptionChargedGrant/);
  });

  it("failed / non-captured renewal paths grant 0 credits", () => {
    assert.match(logicSource, /missing_payment/);
    assert.match(logicSource, /payment_not_captured/);
    assert.match(logicSource, /isCapturedRazorpayPayment/);
    assert.match(membershipSource, /subscription\.halted/);
    assert.match(membershipSource, /subscription\.cancelled/);
    assert.match(membershipSource, /grantedCredits: 0/);
  });

  it("duplicate webhook deliveries are idempotent; failed events reprocess", () => {
    assert.match(membershipSource, /studioRazorpayWebhookEventsTable/);
    assert.match(membershipSource, /duplicate: true/);
    assert.match(membershipSource, /withRazorpayWebhookEventLock/);
    assert.match(membershipSource, /shouldReprocessWebhookEvent|claimWebhookEventForProcessing/);
    assert.match(membershipSource, /PROCESSING/);
    assert.match(membershipSource, /FAILED/);
  });

  it("create subscription serializes under advisory lock and conflicts across plans", () => {
    assert.match(membershipSource, /withMembershipSubscriptionUserLock/);
    assert.match(membershipSource, /SubscriptionConflictError/);
    assert.match(paymentsSource, /status\(409\)/);
  });

  it("orphan persistence failure attempts Razorpay cancel and never returns success", () => {
    assert.match(membershipSource, /cancelRazorpaySubscription/);
    assert.match(membershipSource, /cancelAtCycleEnd: false/);
    assert.match(membershipSource, /SubscriptionPersistenceError/);
    assert.match(paymentsSource, /Unable to persist subscription/);
  });

  it("same payment_id across event IDs serializes grant via payment lock", () => {
    assert.match(membershipSource, /withRazorpayPaymentGrantLock/);
    assert.match(membershipSource, /rzp_payment:/);
  });

  it("tier update happens after grantCreditAllocation", () => {
    const grantIdx = membershipSource.indexOf("grantCreditAllocation");
    const tierIdx = membershipSource.indexOf("subscriptionTier: decision.studioTier");
    assert.ok(grantIdx > 0 && tierIdx > grantIdx);
  });

  it("Basic → Pro upgrade is authenticated and cycle_end only", () => {
    assert.match(paymentsSource, /\/payments\/subscriptions\/upgrade-to-pro/);
    assert.match(paymentsSource, /upgradeMembershipToPro/);
    assert.match(membershipSource, /scheduleChangeAt: "cycle_end"/);
    assert.match(membershipSource, /createRazorpayOrder/);
    assert.match(membershipSource, /fulfillMembershipUpgradeFromCapturedPayment/);
    assert.equal(membershipSource.includes('scheduleChangeAt: "now"'), false);
    assert.match(logicSource, /resolveBasicToProUpgrade/);
    assert.match(logicSource, /already_scheduled/);
  });

  it("Pass / Top-Up use one-time Orders + payment.captured grants", () => {
    const addOnsSource = readFileSync(
      path.join(here, "razorpay-add-ons.ts"),
      "utf8",
    );
    assert.match(paymentsSource, /\/payments\/add-ons\/checkout/);
    assert.match(paymentsSource, /createStudioAddOnCheckout/);
    assert.match(addOnsSource, /createRazorpayOrder/);
    assert.match(addOnsSource, /STUDIO_PASS_ALLOCATION/);
    assert.match(addOnsSource, /TOP_UP_ALLOCATION/);
    assert.match(addOnsSource, /rzp_payment:/);
    assert.match(membershipSource, /payment\.captured/);
    assert.match(membershipSource, /grantStudioAddOnFromCapturedPayment/);
    assert.equal(addOnsSource.includes("createRazorpaySubscription"), false);
  });
});
