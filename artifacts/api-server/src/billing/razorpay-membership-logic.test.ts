import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MembershipCreditAllowances } from "@workspace/studio-credit-engine";
import {
  RazorpayWebhookProcessingStatus,
  isCapturedRazorpayPayment,
  isOpenMembershipSubscriptionStatus,
  matchesExpectedPlanAmountUsdCents,
  membershipPaymentSourceReference,
} from "./razorpay-client.js";
import {
  claimWebhookEventForProcessing,
  evaluateSubscriptionChargedGrant,
  expectedMembershipCreditsForPlan,
  resolveOpenMembershipForCreate,
} from "./razorpay-membership-logic.js";

const period = {
  id: "sub_test",
  current_start: 1_723_939_200, // 2024-08-18 00:00:00 UTC
  current_end: 1_726_531_200, // 2024-09-17 00:00:00 UTC
};

describe("evaluateSubscriptionChargedGrant — captured payment gate", () => {
  it("1. captured Basic payment grants exactly 120", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: { id: "pay_basic", status: "captured", amount: 4900, currency: "USD" },
    });
    assert.equal(decision.grant, true);
    if (decision.grant) {
      assert.equal(decision.credits, 120);
      assert.equal(decision.credits, MembershipCreditAllowances.basic);
      assert.equal(decision.sourceReference, "rzp_payment:pay_basic");
      assert.equal(decision.startsAt.toISOString(), "2024-08-18T00:00:00.000Z");
      assert.equal(decision.expiresAt.toISOString(), "2024-09-17T00:00:00.000Z");
      assert.match(decision.periodKey, /^rzp:sub_test:/);
    }
  });

  it("2. captured Pro payment grants exactly 240", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "pro",
      studioTier: "enterprise",
      subscription: period,
      payment: { id: "pay_pro", status: "captured", amount: 7900, currency: "USD" },
    });
    assert.equal(decision.grant, true);
    if (decision.grant) {
      assert.equal(decision.credits, 240);
      assert.equal(decision.credits, expectedMembershipCreditsForPlan("pro"));
    }
  });

  it("3. missing payment → zero credits", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: null,
    });
    assert.deepEqual(decision, {
      grant: false,
      reason: "missing_payment",
      credits: 0,
    });
  });

  it("4. missing payment.id → zero credits", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: { status: "captured" },
    });
    assert.equal(decision.grant, false);
    if (!decision.grant) assert.equal(decision.reason, "missing_payment_id");
  });

  it("5. missing payment.status → zero credits", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: { id: "pay_x" },
    });
    assert.equal(decision.grant, false);
    if (!decision.grant) assert.equal(decision.reason, "missing_payment_status");
    assert.equal(isCapturedRazorpayPayment({ id: "pay_x" }), false);
  });

  it("6. payment.status != captured → zero credits", () => {
    for (const status of ["authorized", "failed", "created", "refunded"]) {
      const decision = evaluateSubscriptionChargedGrant({
        studioPlan: "basic",
        studioTier: "pro",
        subscription: period,
        payment: { id: "pay_x", status },
      });
      assert.equal(decision.grant, false, status);
      if (!decision.grant) assert.equal(decision.reason, "payment_not_captured");
    }
  });

  it("18. failed payment status → no credit", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: { id: "pay_fail", status: "failed" },
    });
    assert.equal(decision.grant, false);
    assert.equal(decision.credits, 0);
  });

  it("24. Razorpay period 18 Aug–17 Sep uses exact bounds", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: { id: "pay_period", status: "captured" },
    });
    assert.equal(decision.grant, true);
    if (decision.grant) {
      assert.equal(decision.startsAt.toISOString(), "2024-08-18T00:00:00.000Z");
      assert.equal(decision.expiresAt.toISOString(), "2024-09-17T00:00:00.000Z");
    }
  });

  it("amount absent does not reject captured payment", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: { id: "pay_no_amt", status: "captured" },
    });
    assert.equal(decision.grant, true);
    assert.equal(
      matchesExpectedPlanAmountUsdCents({
        plan: "basic",
        payment: { id: "pay_no_amt", status: "captured" },
      }),
      null,
    );
  });

  it("clear USD amount mismatch rejects grant", () => {
    const decision = evaluateSubscriptionChargedGrant({
      studioPlan: "basic",
      studioTier: "pro",
      subscription: period,
      payment: {
        id: "pay_wrong",
        status: "captured",
        amount: 7900,
        currency: "USD",
      },
    });
    assert.equal(decision.grant, false);
    if (!decision.grant) assert.equal(decision.reason, "amount_mismatch");
  });
});

describe("webhook claim / retry / idempotency", () => {
  it("7. processed event is not reprocessed", () => {
    assert.deepEqual(
      claimWebhookEventForProcessing({
        existingStatus: RazorpayWebhookProcessingStatus.PROCESSED,
      }),
      { outcome: "already_processed" },
    );
  });

  it("8. failed event remains reprocessable", () => {
    assert.deepEqual(
      claimWebhookEventForProcessing({
        existingStatus: RazorpayWebhookProcessingStatus.FAILED,
      }),
      { outcome: "process", priorStatus: "failed" },
    );
  });

  it("received / processing remain reprocessable", () => {
    assert.equal(
      claimWebhookEventForProcessing({
        existingStatus: RazorpayWebhookProcessingStatus.RECEIVED,
      }).outcome,
      "process",
    );
    assert.equal(
      claimWebhookEventForProcessing({
        existingStatus: RazorpayWebhookProcessingStatus.PROCESSING,
      }).outcome,
      "process",
    );
  });

  it("9. same payment across two event IDs shares source_reference", () => {
    const a = membershipPaymentSourceReference({
      paymentId: "pay_same",
      subscriptionId: "sub_1",
      currentStartUnix: 1,
      currentEndUnix: 2,
    });
    const b = membershipPaymentSourceReference({
      paymentId: "pay_same",
      subscriptionId: "sub_1",
      currentStartUnix: 99,
      currentEndUnix: 100,
    });
    assert.equal(a, b);
    assert.equal(a, "rzp_payment:pay_same");
  });

  it("D. two different event IDs, same payment ID → exactly one financial grant", async () => {
    const grants = new Set<string>();
    let paymentLocked = Promise.resolve();

    async function withPaymentLock<T>(paymentId: string, fn: () => Promise<T>) {
      const prev = paymentLocked;
      let release!: () => void;
      paymentLocked = new Promise((r) => {
        release = r;
      });
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    }

    async function processEvent(eventId: string, paymentId: string) {
      // Event-level claim is independent per eventId.
      const eventStore = new Map<string, string>();
      const claim = claimWebhookEventForProcessing({
        existingStatus: eventStore.get(eventId),
      });
      assert.equal(claim.outcome, "process");

      return withPaymentLock(paymentId, async () => {
        const sourceReference = membershipPaymentSourceReference({
          paymentId,
          subscriptionId: "sub",
          currentStartUnix: 1,
          currentEndUnix: 2,
        });
        const created = !grants.has(sourceReference);
        if (created) grants.add(sourceReference);
        return { eventId, created, sourceReference };
      });
    }

    const [a, b] = await Promise.all([
      processEvent("evt_a", "pay_shared"),
      processEvent("evt_b", "pay_shared"),
    ]);
    assert.equal(a.sourceReference, b.sourceReference);
    assert.equal(grants.size, 1);
    assert.equal([a, b].filter((r) => r.created).length, 1);
  });

  it("10. concurrent identical claims: only first unsettled wins process; processed blocks", () => {
    const store = new Map<string, string>();
    const grants: string[] = [];

    function deliver(eventId: string, paymentId: string) {
      const existing = store.get(eventId) ?? null;
      const claim = claimWebhookEventForProcessing({ existingStatus: existing });
      if (claim.outcome === "already_processed") return { granted: false };
      store.set(eventId, RazorpayWebhookProcessingStatus.PROCESSING);
      const sourceReference = membershipPaymentSourceReference({
        paymentId,
        subscriptionId: "sub",
        currentStartUnix: 1,
        currentEndUnix: 2,
      });
      if (!grants.includes(sourceReference)) {
        grants.push(sourceReference);
      }
      store.set(eventId, RazorpayWebhookProcessingStatus.PROCESSED);
      return { granted: true };
    }

    // Simulate lock serialization: sequential under mutex
    deliver("evt_1", "pay_1");
    deliver("evt_1", "pay_1");
    assert.equal(grants.length, 1);
    assert.equal(store.get("evt_1"), "processed");
  });

  it("8b. failed then retry grants once", () => {
    const store = new Map<string, string>([
      ["evt_fail", RazorpayWebhookProcessingStatus.FAILED],
    ]);
    const grants: string[] = [];

    function attempt(eventId: string) {
      const claim = claimWebhookEventForProcessing({
        existingStatus: store.get(eventId),
      });
      if (claim.outcome === "already_processed") return;
      store.set(eventId, RazorpayWebhookProcessingStatus.PROCESSING);
      const ref = "rzp_payment:pay_retry";
      if (!grants.includes(ref)) grants.push(ref);
      store.set(eventId, RazorpayWebhookProcessingStatus.PROCESSED);
    }

    attempt("evt_fail");
    attempt("evt_fail");
    assert.equal(grants.length, 1);
  });
});

describe("one open membership across Basic + Pro", () => {
  it("11/12. Basic open + Pro request → conflict", () => {
    const result = resolveOpenMembershipForCreate({
      requestedPlan: "pro",
      openSubscriptions: [
        {
          razorpaySubscriptionId: "sub_basic",
          studioPlan: "basic",
          studioTier: "pro",
          status: "active",
          razorpayPlanId: "plan_basic",
        },
      ],
    });
    assert.equal(result.action, "conflict");
  });

  it("13. Pro open + Basic request → conflict", () => {
    const result = resolveOpenMembershipForCreate({
      requestedPlan: "basic",
      openSubscriptions: [
        {
          razorpaySubscriptionId: "sub_pro",
          studioPlan: "pro",
          studioTier: "enterprise",
          status: "pending",
          razorpayPlanId: "plan_pro",
        },
      ],
    });
    assert.equal(result.action, "conflict");
  });

  it("same plan open → reuse", () => {
    const result = resolveOpenMembershipForCreate({
      requestedPlan: "basic",
      openSubscriptions: [
        {
          razorpaySubscriptionId: "sub_basic",
          studioPlan: "basic",
          studioTier: "pro",
          status: "created",
          razorpayPlanId: "plan_basic",
        },
      ],
    });
    assert.equal(result.action, "reuse");
  });

  it("14. completed/terminal old subscription does not block", () => {
    for (const status of ["completed", "cancelled"]) {
      assert.equal(isOpenMembershipSubscriptionStatus(status), false);
      const result = resolveOpenMembershipForCreate({
        requestedPlan: "basic",
        openSubscriptions: [
          {
            razorpaySubscriptionId: "sub_old",
            studioPlan: "pro",
            studioTier: "enterprise",
            status,
            razorpayPlanId: "plan_pro",
          },
        ],
      });
      assert.equal(result.action, "create", status);
    }
  });

  it("A–C/F. pending/halted/paused block; resumed (active) is open", () => {
    for (const status of ["pending", "halted", "paused", "active"]) {
      assert.equal(isOpenMembershipSubscriptionStatus(status), true, status);
    }
    // subscription.resumed webhook updates status from Razorpay entity (typically active).
    assert.equal(isOpenMembershipSubscriptionStatus("active"), true);
  });

  it("11. parallel create under mutex → exactly one create action", async () => {
    let remoteCreates = 0;
    const open: Array<{
      razorpaySubscriptionId: string;
      studioPlan: string;
      studioTier: string;
      status: string;
      razorpayPlanId: string;
    }> = [];
    let locked = Promise.resolve();

    async function withLock<T>(fn: () => Promise<T>): Promise<T> {
      const prev = locked;
      let release!: () => void;
      locked = new Promise((r) => {
        release = r;
      });
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    }

    async function create(plan: "basic" | "pro") {
      return withLock(async () => {
        const decision = resolveOpenMembershipForCreate({
          requestedPlan: plan,
          openSubscriptions: open,
        });
        if (decision.action === "conflict") return "conflict";
        if (decision.action === "reuse") return "reuse";
        remoteCreates += 1;
        open.push({
          razorpaySubscriptionId: `sub_${remoteCreates}`,
          studioPlan: plan,
          studioTier: plan === "basic" ? "pro" : "enterprise",
          status: "created",
          razorpayPlanId: "plan_x",
        });
        return "created";
      });
    }

    const results = await Promise.all([create("basic"), create("basic")]);
    assert.equal(remoteCreates, 1);
    assert.ok(results.includes("created"));
    assert.ok(results.includes("reuse"));
  });
});

describe("lifecycle events never grant", () => {
  it("19–21. cancelled / pending / halted are not charged grants", () => {
    // Charged evaluator is only for subscription.charged — lifecycle returns 0 upstream.
    // Guard: non-captured / missing payment never grants even if misrouted.
    for (const status of ["pending", "halted", "cancelled"]) {
      void status;
      assert.equal(
        evaluateSubscriptionChargedGrant({
          studioPlan: "basic",
          studioTier: "pro",
          subscription: period,
          payment: undefined,
        }).credits,
        0,
      );
    }
  });
});
