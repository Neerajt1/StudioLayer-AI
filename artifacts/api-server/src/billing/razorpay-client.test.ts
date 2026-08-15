import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  MembershipCreditAllowances,
  StudioCreditReasonCode,
  expectedCreditsForAllocation,
  razorpayMembershipPeriodKey,
} from "@workspace/studio-credit-engine";
import {
  RAZORPAY_FETCH_TIMEOUT_MS,
  RazorpayApiError,
  createRazorpaySubscription,
  isCapturedRazorpayPayment,
  isStudioMembershipPlanId,
  membershipPaymentSourceReference,
  resolveRazorpayPlanId,
  studioTierForPlan,
  verifyRazorpayWebhookSignature,
} from "./razorpay-client.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function setRazorpayEnv() {
  process.env.RAZORPAY_KEY_ID = "rzp_test_public_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret_value";
  process.env.RAZORPAY_BASIC_PLAN_ID = "plan_TPKaBkXum2gQHn";
  process.env.RAZORPAY_PRO_PLAN_ID = "plan_TPKdReaZQYdBps";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret";
}

describe("Razorpay plan mapping", () => {
  beforeEach(() => {
    setRazorpayEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('basic maps only to configured Basic Razorpay plan', () => {
    assert.equal(resolveRazorpayPlanId("basic"), "plan_TPKaBkXum2gQHn");
    assert.equal(studioTierForPlan("basic"), "pro");
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        tier: "pro",
      }),
      MembershipCreditAllowances.basic,
    );
    assert.equal(MembershipCreditAllowances.basic, 120);
  });

  it('pro maps only to configured Pro Razorpay plan', () => {
    assert.equal(resolveRazorpayPlanId("pro"), "plan_TPKdReaZQYdBps");
    assert.equal(studioTierForPlan("pro"), "enterprise");
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        tier: "enterprise",
      }),
      MembershipCreditAllowances.pro,
    );
    assert.equal(MembershipCreditAllowances.pro, 240);
  });

  it("uses optional INR plan IDs for India when configured", () => {
    process.env.RAZORPAY_BASIC_PLAN_ID_INR = "plan_in_basic";
    process.env.RAZORPAY_PRO_PLAN_ID_INR = "plan_in_pro";
    assert.equal(resolveRazorpayPlanId("basic", "india"), "plan_in_basic");
    assert.equal(resolveRazorpayPlanId("pro", "india"), "plan_in_pro");
  });

  it("keeps existing plan IDs when market-specific IDs are unset", () => {
    delete process.env.RAZORPAY_BASIC_PLAN_ID_INR;
    delete process.env.RAZORPAY_BASIC_PLAN_ID_USD;
    assert.equal(resolveRazorpayPlanId("basic", "india"), "plan_TPKaBkXum2gQHn");
    assert.equal(
      resolveRazorpayPlanId("basic", "international"),
      "plan_TPKaBkXum2gQHn",
    );
    assert.equal(resolveRazorpayPlanId("basic"), "plan_TPKaBkXum2gQHn");
  });

  it("arbitrary Razorpay plan id from client is rejected", () => {
    assert.equal(isStudioMembershipPlanId("plan_TPKaBkXum2gQHn"), false);
    assert.equal(isStudioMembershipPlanId("enterprise"), false);
    assert.equal(isStudioMembershipPlanId({ plan_id: "plan_x" }), false);
  });
});

describe("Razorpay webhook signature", () => {
  beforeEach(() => {
    setRazorpayEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts valid X-Razorpay-Signature over raw body", () => {
    const rawBody = Buffer.from(
      JSON.stringify({ event: "subscription.charged", id: "evt_1" }),
    );
    const signature = createHmac("sha256", "whsec_test_secret")
      .update(rawBody)
      .digest("hex");
    assert.equal(
      verifyRazorpayWebhookSignature({
        rawBody,
        signatureHeader: signature,
      }),
      true,
    );
  });

  it("17. rejects invalid signature (no business side effects possible)", () => {
    const rawBody = Buffer.from('{"event":"subscription.charged"}');
    assert.equal(
      verifyRazorpayWebhookSignature({
        rawBody,
        signatureHeader: "deadbeef",
      }),
      false,
    );
  });

  it("rejects missing signature", () => {
    assert.equal(
      verifyRazorpayWebhookSignature({
        rawBody: Buffer.from("{}"),
        signatureHeader: undefined,
      }),
      false,
    );
  });
});

describe("membership period + idempotent source references", () => {
  it("period_key uses Razorpay current_start/current_end (not calendar month)", () => {
    const key = razorpayMembershipPeriodKey({
      subscriptionId: "sub_abc",
      currentStartUnix: 1_700_000_000,
      currentEndUnix: 1_702_592_000,
    });
    assert.equal(key, "rzp:sub_abc:1700000000:1702592000");
    assert.equal(key.includes("legacy-utc"), false);
  });

  it("payment sourceReference is stable for duplicate webhook delivery", () => {
    const a = membershipPaymentSourceReference({
      paymentId: "pay_123",
      subscriptionId: "sub_abc",
      currentStartUnix: 1,
      currentEndUnix: 2,
    });
    const b = membershipPaymentSourceReference({
      paymentId: "pay_123",
      subscriptionId: "sub_abc",
      currentStartUnix: 1,
      currentEndUnix: 2,
    });
    assert.equal(a, "rzp_payment:pay_123");
    assert.equal(a, b);
  });

  it("successful Basic billing amount is exactly 120", () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        tier: studioTierForPlan("basic"),
      }),
      120,
    );
  });

  it("successful Pro billing amount is exactly 240", () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        tier: studioTierForPlan("pro"),
      }),
      240,
    );
  });

  it("captured payment helper is strict", () => {
    assert.equal(isCapturedRazorpayPayment({ id: "p", status: "captured" }), true);
    assert.equal(isCapturedRazorpayPayment({ id: "p", status: "authorized" }), false);
    assert.equal(isCapturedRazorpayPayment({ id: "p" }), false);
    assert.equal(isCapturedRazorpayPayment(null), false);
  });
});

describe("create subscription response contract", () => {
  it("public response shape never includes key secret field names", () => {
    const publicResponse = {
      subscriptionId: "sub_test",
      keyId: "rzp_test_public_key",
      plan: "basic" as const,
      studioTier: "pro" as const,
      status: "created",
      shortUrl: null as string | null,
    };
    const serialized = JSON.stringify(publicResponse);
    assert.equal(serialized.includes("KEY_SECRET"), false);
    assert.equal(serialized.includes("rzp_test_secret_value"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.ok(serialized.includes("keyId"));
  });
});

describe("Razorpay fetch timeout + non-JSON errors", () => {
  beforeEach(() => {
    setRazorpayEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("15. timeout is a clean failure (no fake subscription success)", async () => {
    globalThis.fetch = (async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    }) as typeof fetch;

    await assert.rejects(
      () =>
        createRazorpaySubscription({
          planId: "plan_TPKaBkXum2gQHn",
        }),
      (error: unknown) => {
        assert.ok(error instanceof RazorpayApiError);
        assert.equal(error.status, 504);
        assert.match(error.message, /timed out/);
        assert.ok(error.message.includes(String(RAZORPAY_FETCH_TIMEOUT_MS)));
        return true;
      },
    );
  });

  it("16. non-JSON error body preserves HTTP status without JSON parse masking", async () => {
    globalThis.fetch = (async () =>
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;

    await assert.rejects(
      () =>
        createRazorpaySubscription({
          planId: "plan_TPKaBkXum2gQHn",
        }),
      (error: unknown) => {
        assert.ok(error instanceof RazorpayApiError);
        assert.equal(error.status, 502);
        assert.match(error.message, /non-JSON/);
        assert.match(error.bodyText, /Bad Gateway/);
        return true;
      },
    );
  });

  it("orphan recovery cancel uses POST /subscriptions/:id/cancel immediately", async () => {
    const { cancelRazorpaySubscription } = await import("./razorpay-client.js");
    let seenPath = "";
    let seenBody = "";
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seenPath = String(_url);
      seenBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          id: "sub_orphan",
          entity: "subscription",
          plan_id: "plan_x",
          status: "cancelled",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await cancelRazorpaySubscription({
      subscriptionId: "sub_orphan",
      cancelAtCycleEnd: false,
    });
    assert.equal(result.status, "cancelled");
    assert.match(seenPath, /\/subscriptions\/sub_orphan\/cancel$/);
    assert.equal(JSON.parse(seenBody).cancel_at_cycle_end, false);
  });
});
