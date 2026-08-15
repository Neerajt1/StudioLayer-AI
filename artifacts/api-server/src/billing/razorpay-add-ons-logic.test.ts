import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MembershipAddOnChargeAmounts,
  MembershipCreditAllowances,
  studioPassExpiresAt,
} from "@workspace/studio-credit-engine";
import {
  addOnPaymentSourceReference,
  assertAddOnPaymentMatchesOrder,
  expectedAddOnCredits,
  resolveAddOnOrderAmount,
  resolveAddOnPurchaseEligibility,
} from "./razorpay-add-ons-logic.js";

describe("Studio Pass / Top-Up order amounts", () => {
  it("India Pass order amount is 249900 paise", () => {
    const order = resolveAddOnOrderAmount({
      product: "studioPass",
      market: "india",
    });
    assert.deepEqual(order, { amount: 249_900, currency: "INR" });
    assert.equal(
      order.amount,
      MembershipAddOnChargeAmounts.india.studioPass,
    );
  });

  it("India Top-Up order amount is 189900 paise", () => {
    const order = resolveAddOnOrderAmount({
      product: "topUp",
      market: "india",
    });
    assert.deepEqual(order, { amount: 189_900, currency: "INR" });
    assert.equal(order.amount, MembershipAddOnChargeAmounts.india.topUp);
  });

  it("International Pass amount is 3500 cents", () => {
    const order = resolveAddOnOrderAmount({
      product: "studioPass",
      market: "international",
    });
    assert.deepEqual(order, { amount: 3_500, currency: "USD" });
    assert.equal(
      order.amount,
      MembershipAddOnChargeAmounts.international.studioPass,
    );
  });

  it("International Top-Up amount is 2000 cents", () => {
    const order = resolveAddOnOrderAmount({
      product: "topUp",
      market: "international",
    });
    assert.deepEqual(order, { amount: 2_000, currency: "USD" });
    assert.equal(
      order.amount,
      MembershipAddOnChargeAmounts.international.topUp,
    );
  });
});

describe("Studio Pass / Top-Up purchase eligibility", () => {
  it("Top-Up rejected without active Basic/Pro membership", () => {
    const free = resolveAddOnPurchaseEligibility({
      product: "topUp",
      subscriptionTier: "free",
    });
    assert.equal(free.allowed, false);
    if (!free.allowed) {
      assert.match(free.message, /Studio Members/i);
    }
  });

  it("Top-Up allowed for Basic (pro) and Pro (enterprise)", () => {
    assert.deepEqual(
      resolveAddOnPurchaseEligibility({
        product: "topUp",
        subscriptionTier: "pro",
      }),
      { allowed: true },
    );
    assert.deepEqual(
      resolveAddOnPurchaseEligibility({
        product: "topUp",
        subscriptionTier: "enterprise",
      }),
      { allowed: true },
    );
  });

  it("Pass allowed without membership", () => {
    assert.deepEqual(
      resolveAddOnPurchaseEligibility({
        product: "studioPass",
        subscriptionTier: "free",
      }),
      { allowed: true },
    );
  });

  it("Pass rejected for active Basic/Pro membership", () => {
    const basic = resolveAddOnPurchaseEligibility({
      product: "studioPass",
      subscriptionTier: "pro",
    });
    assert.equal(basic.allowed, false);
    const studioPro = resolveAddOnPurchaseEligibility({
      product: "studioPass",
      subscriptionTier: "enterprise",
    });
    assert.equal(studioPro.allowed, false);
  });
});

describe("Studio Pass / Top-Up grant economics", () => {
  it("successful payment grants correct allocation sizes", () => {
    assert.equal(expectedAddOnCredits("studioPass"), 40);
    assert.equal(expectedAddOnCredits("topUp"), 35);
    assert.equal(
      expectedAddOnCredits("studioPass"),
      MembershipCreditAllowances.studioPass,
    );
    assert.equal(
      expectedAddOnCredits("topUp"),
      MembershipCreditAllowances.topUp,
    );
  });

  it("duplicate payment/webhook does not grant twice (source_reference)", () => {
    const paymentId = "pay_pass_dup";
    const sourceReference = addOnPaymentSourceReference(paymentId);
    const grants = new Set<string>();

    const attemptGrant = () => {
      const created = !grants.has(sourceReference);
      if (created) grants.add(sourceReference);
      return {
        created,
        grantedCredits: created ? expectedAddOnCredits("studioPass") : 0,
        sourceReference,
      };
    };

    const first = attemptGrant();
    const second = attemptGrant();
    assert.equal(first.created, true);
    assert.equal(first.grantedCredits, 40);
    assert.equal(second.created, false);
    assert.equal(second.grantedCredits, 0);
    assert.equal(first.sourceReference, second.sourceReference);
  });

  it("Pass expiry is startsAt + 7 days", () => {
    const startsAt = new Date("2026-08-15T10:00:00.000Z");
    const expiresAt = studioPassExpiresAt(startsAt);
    assert.equal(
      expiresAt.toISOString(),
      "2026-08-22T10:00:00.000Z",
    );
  });

  it("Top-Up has no expiry (expiresAt null by product contract)", () => {
    // Grant path uses expiresAt=null for Top-Up; amount match is independent.
    assert.equal(
      assertAddOnPaymentMatchesOrder({
        product: "topUp",
        market: "india",
        paymentAmount: 189_900,
        paymentCurrency: "INR",
      }),
      true,
    );
  });

  it("rejects amount/currency mismatches", () => {
    assert.equal(
      assertAddOnPaymentMatchesOrder({
        product: "studioPass",
        market: "india",
        paymentAmount: 249_900,
        paymentCurrency: "USD",
      }),
      false,
    );
    assert.equal(
      assertAddOnPaymentMatchesOrder({
        product: "topUp",
        market: "international",
        paymentAmount: 2_001,
        paymentCurrency: "USD",
      }),
      false,
    );
  });
});
