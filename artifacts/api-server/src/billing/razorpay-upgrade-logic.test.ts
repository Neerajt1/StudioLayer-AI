import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MembershipCreditAllowances,
  MembershipUpgradeChargeAmounts,
  membershipUpgradeCharge,
  membershipUpgradeDisplayPrice,
} from "@workspace/studio-credit-engine";
import {
  assertUpgradePaymentMatchesOrder,
  resolveUpgradeOrderAmount,
  STUDIO_UPGRADE_PRODUCT,
  upgradePaymentSourceReference,
} from "./razorpay-upgrade-logic.js";
import {
  resolveBasicToProUpgrade,
  resolveOpenMembershipForCreate,
} from "./razorpay-membership-logic.js";
import {
  resolveAddOnPurchaseEligibility,
} from "./razorpay-add-ons-logic.js";

describe("Basic → Pro fixed upgrade difference", () => {
  it("India upgrade amount is ₹3,000 (300000 paise)", () => {
    assert.deepEqual(membershipUpgradeCharge("india"), {
      amount: 300_000,
      currency: "INR",
    });
    assert.equal(membershipUpgradeDisplayPrice("india"), "₹3,000");
    assert.equal(MembershipUpgradeChargeAmounts.india.amount, 300_000);
    assert.deepEqual(resolveUpgradeOrderAmount({ market: "india" }), {
      amount: 300_000,
      currency: "INR",
    });
  });

  it("International upgrade amount is $30 (3000 cents)", () => {
    assert.deepEqual(membershipUpgradeCharge("international"), {
      amount: 3_000,
      currency: "USD",
    });
    assert.equal(membershipUpgradeDisplayPrice("international"), "$30");
  });

  it("rejects mismatched upgrade payment amounts", () => {
    assert.equal(
      assertUpgradePaymentMatchesOrder({
        market: "india",
        paymentAmount: 300_000,
        paymentCurrency: "INR",
      }),
      true,
    );
    assert.equal(
      assertUpgradePaymentMatchesOrder({
        market: "india",
        paymentAmount: 299_999,
        paymentCurrency: "INR",
      }),
      false,
    );
  });

  it("upgrade payment source reference is stable (idempotency key)", () => {
    assert.equal(
      upgradePaymentSourceReference("pay_upg_1"),
      "rzp_upgrade_payment:pay_upg_1",
    );
  });

  it("upgrade product id is not a credit allocation product", () => {
    assert.equal(STUDIO_UPGRADE_PRODUCT, "basicToProUpgrade");
    assert.notEqual(STUDIO_UPGRADE_PRODUCT, "studioPass");
    assert.notEqual(STUDIO_UPGRADE_PRODUCT, "topUp");
  });

  it("Basic member can request upgrade anytime when active", () => {
    const decision = resolveBasicToProUpgrade({
      openSubscriptions: [
        {
          studioPlan: "basic",
          status: "active",
          pendingUpgradePlan: null,
          pendingRazorpayPlanId: null,
        },
      ],
    });
    assert.equal(decision.action, "schedule");
  });

  it("repeated upgrade request is already_scheduled (no second change)", () => {
    const decision = resolveBasicToProUpgrade({
      openSubscriptions: [
        {
          studioPlan: "basic",
          status: "active",
          pendingUpgradePlan: "pro",
          pendingRazorpayPlanId: "plan_pro",
        },
      ],
    });
    assert.equal(decision.action, "already_scheduled");
  });

  it("Basic cannot create a second Pro subscription", () => {
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

  it("Pro cycle credits remain 240; upgrade payment grants none", () => {
    assert.equal(MembershipCreditAllowances.basic, 120);
    assert.equal(MembershipCreditAllowances.pro, 240);
    // Upgrade payment path grants 0 — covered by fulfillMembershipUpgradeFromCapturedPayment contract
  });

  it("billing anniversary preserved by cycle_end (not now)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const membership = readFileSync(
      path.join(here, "razorpay-membership.ts"),
      "utf8",
    );
    assert.match(membership, /scheduleChangeAt: "cycle_end"/);
    assert.equal(membership.includes('scheduleChangeAt: "now"'), false);
    assert.match(membership, /grantedCredits: 0/);
    assert.match(membership, /createRazorpayOrder/);
    assert.match(
      membership,
      /Upgrade difference paid — Studio Pro scheduled for next billing cycle \(no credits granted\)/,
    );
  });
});

describe("Pass / Top-Up eligibility with membership", () => {
  it("Active Basic can Top-Up", () => {
    assert.deepEqual(
      resolveAddOnPurchaseEligibility({
        product: "topUp",
        subscriptionTier: "pro",
      }),
      { allowed: true },
    );
  });

  it("Active Pro can Top-Up", () => {
    assert.deepEqual(
      resolveAddOnPurchaseEligibility({
        product: "topUp",
        subscriptionTier: "enterprise",
      }),
      { allowed: true },
    );
  });

  it("Remaining membership credits do not appear in eligibility input (tier-only gate)", () => {
    // Eligibility is tier-based only — no remaining-credit argument.
    assert.deepEqual(
      resolveAddOnPurchaseEligibility({
        product: "topUp",
        subscriptionTier: "pro",
      }),
      { allowed: true },
    );
  });

  it("Active Basic/Pro cannot purchase Studio Pass", () => {
    assert.equal(
      resolveAddOnPurchaseEligibility({
        product: "studioPass",
        subscriptionTier: "pro",
      }).allowed,
      false,
    );
    assert.equal(
      resolveAddOnPurchaseEligibility({
        product: "studioPass",
        subscriptionTier: "enterprise",
      }).allowed,
      false,
    );
  });

  it("Non-member can purchase Studio Pass", () => {
    assert.deepEqual(
      resolveAddOnPurchaseEligibility({
        product: "studioPass",
        subscriptionTier: "free",
      }),
      { allowed: true },
    );
  });
});
