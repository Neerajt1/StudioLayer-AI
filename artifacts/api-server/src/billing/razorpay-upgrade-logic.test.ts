import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MembershipCreditAllowances,
  MembershipUpgradeChargeAmounts,
  MembershipUpgradeCreditGrant,
  StudioCreditReasonCode,
  isStudioUpgradeImmediateEntitlementEnabled,
  membershipUpgradeCharge,
  membershipUpgradeDisplayPrice,
  razorpayMembershipUpgradePeriodKey,
} from "@workspace/studio-credit-engine";
import {
  assertUpgradePaymentMatchesOrder,
  buildMembershipUpgradePeriodKey,
  isCapturedUpgradePaymentMarker,
  parseUpgradeCheckoutOrderId,
  readStudioUpgradeImmediateEntitlementFlag,
  resolveUpgradeCheckoutOrderReuse,
  resolveUpgradeCreditPeriodBounds,
  resolveUpgradeOrderAmount,
  STUDIO_UPGRADE_PRODUCT,
  upgradeCheckoutOrderMarker,
  upgradePaymentSourceReference,
} from "./razorpay-upgrade-logic.js";
import {
  resolveBasicToProUpgrade,
  resolveOpenMembershipForCreate,
} from "./razorpay-membership-logic.js";
import { resolveAddOnPurchaseEligibility } from "./razorpay-add-ons-logic.js";

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

  it("upgrade grant is exactly +120; Pro cycle remains 240", () => {
    assert.equal(MembershipUpgradeCreditGrant, 120);
    assert.equal(MembershipCreditAllowances.basic, 120);
    assert.equal(MembershipCreditAllowances.pro, 240);
    assert.equal(
      StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION,
      "membership_upgrade_allocation",
    );
  });

  it("U1 upgrade periodKey format is rzp_upgrade:{sub}:{start}:{end}", () => {
    assert.equal(
      razorpayMembershipUpgradePeriodKey({
        subscriptionId: "sub_1",
        currentStartUnix: 100,
        currentEndUnix: 200,
      }),
      "rzp_upgrade:sub_1:100:200",
    );
    const start = new Date(100_000);
    const end = new Date(200_000);
    assert.equal(
      buildMembershipUpgradePeriodKey({
        subscriptionId: "sub_1",
        currentStart: start,
        currentEnd: end,
      }),
      `rzp_upgrade:sub_1:${Math.floor(start.getTime() / 1000)}:${Math.floor(end.getTime() / 1000)}`,
    );
  });

  it("U2 missing currentEnd fails closed", () => {
    assert.equal(
      resolveUpgradeCreditPeriodBounds({
        currentStart: new Date(),
        currentEnd: null,
      }),
      null,
    );
    assert.equal(
      resolveUpgradeCreditPeriodBounds({
        currentStart: null,
        currentEnd: new Date(),
      }),
      null,
    );
  });

  it("U3 order / captured payment markers distinguish checkout vs paid", () => {
    assert.equal(upgradeCheckoutOrderMarker("order_abc"), "order:order_abc");
    assert.equal(parseUpgradeCheckoutOrderId("order:order_abc"), "order_abc");
    assert.equal(isCapturedUpgradePaymentMarker("order:order_abc"), false);
    assert.equal(isCapturedUpgradePaymentMarker("pay_abc"), true);
  });

  it("active unpaid Order is reused; expired/invalid allows fresh Order", () => {
    assert.deepEqual(
      resolveUpgradeCheckoutOrderReuse({
        orderId: "order_live",
        order: { status: "created", amount_paid: 0 },
      }),
      { action: "reuse", orderId: "order_live" },
    );
    assert.deepEqual(
      resolveUpgradeCheckoutOrderReuse({
        orderId: "order_live",
        order: { status: "attempted", amount_paid: 0 },
      }),
      { action: "reuse", orderId: "order_live" },
    );
    assert.deepEqual(
      resolveUpgradeCheckoutOrderReuse({
        orderId: "order_paid",
        order: { status: "paid", amount_paid: 300_000 },
      }),
      { action: "already_paid", orderId: "order_paid" },
    );
    assert.deepEqual(
      resolveUpgradeCheckoutOrderReuse({
        orderId: "order_old",
        order: { status: "expired", amount_paid: 0 },
      }),
      { action: "create_fresh", reason: "expired" },
    );
    assert.deepEqual(
      resolveUpgradeCheckoutOrderReuse({
        orderId: "order_missing",
        order: null,
        fetchFailed: true,
      }),
      { action: "create_fresh", reason: "fetch_failed" },
    );
  });

  it("feature flag defaults OFF", () => {
    assert.equal(isStudioUpgradeImmediateEntitlementEnabled({}), false);
    assert.equal(
      isStudioUpgradeImmediateEntitlementEnabled({
        STUDIO_UPGRADE_IMMEDIATE_ENTITLEMENT: "true",
      }),
      true,
    );
    assert.equal(
      readStudioUpgradeImmediateEntitlementFlag({
        STUDIO_UPGRADE_IMMEDIATE_ENTITLEMENT: "",
      }),
      false,
    );
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
    const client = readFileSync(path.join(here, "razorpay-client.ts"), "utf8");
    assert.match(membership, /scheduleChangeAt: "cycle_end"/);
    assert.equal(membership.includes('scheduleChangeAt: "now"'), false);
    assert.equal(client.includes('scheduleChangeAt: "now"'), false);
    assert.match(membership, /MEMBERSHIP_UPGRADE_ALLOCATION/);
    assert.match(membership, /MembershipUpgradeCreditGrant/);
    assert.match(membership, /createRazorpayOrder/);
    assert.match(
      membership,
      /Upgrade difference paid — Studio Pro scheduled for next billing cycle \(no credits granted\)/,
    );
    assert.match(
      membership,
      /Studio Pro active immediately; \+120 upgrade credits granted/,
    );
    assert.match(membership, /upgradeCheckoutOrderMarker/);
    assert.match(membership, /resolveUpgradeCheckoutOrderReuse/);
    assert.match(membership, /readStudioUpgradeImmediateEntitlementFlag/);
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
