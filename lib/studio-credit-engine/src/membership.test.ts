import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MembershipCreditAllowances,
  MembershipDisplayPricing,
  MembershipMarketPricing,
  MembershipAddOnChargeAmounts,
  membershipAddOnCharge,
  membershipAddOnDisplayPrice,
  membershipPlanDisplayPrice,
} from './membership.js';

describe('frozen membership market pricing', () => {
  it('India displays ₹3,999 / ₹6,999 for 120 / 240 credits', () => {
    assert.equal(MembershipMarketPricing.india.basicMonthly, '₹3,999');
    assert.equal(MembershipMarketPricing.india.proMonthly, '₹6,999');
    assert.equal(membershipPlanDisplayPrice('basic', 'india'), '₹3,999');
    assert.equal(membershipPlanDisplayPrice('pro', 'india'), '₹6,999');
    assert.equal(MembershipCreditAllowances.basic, 120);
    assert.equal(MembershipCreditAllowances.pro, 240);
  });

  it('outside India displays $49 / $79 for 120 / 240 credits', () => {
    assert.equal(MembershipMarketPricing.international.basicMonthly, '$49');
    assert.equal(MembershipMarketPricing.international.proMonthly, '$79');
    assert.equal(membershipPlanDisplayPrice('basic', 'international'), '$49');
    assert.equal(membershipPlanDisplayPrice('pro', 'international'), '$79');
    assert.equal(MembershipDisplayPricing.basicMonthly, '$49');
    assert.equal(MembershipDisplayPricing.proMonthly, '$79');
    assert.equal(MembershipCreditAllowances.basic, 120);
    assert.equal(MembershipCreditAllowances.pro, 240);
  });

  it('Pass and Top-Up display INR in India and USD internationally', () => {
    assert.equal(membershipAddOnDisplayPrice('studioPass', 'india'), '₹2,499');
    assert.equal(membershipAddOnDisplayPrice('topUp', 'india'), '₹1,899');
    assert.equal(membershipAddOnDisplayPrice('studioPass', 'international'), '$35');
    assert.equal(membershipAddOnDisplayPrice('topUp', 'international'), '$20');
    assert.equal(MembershipCreditAllowances.studioPass, 40);
    assert.equal(MembershipCreditAllowances.topUp, 35);
  });

  it('Pass and Top-Up charge amounts are frozen GST-inclusive (no extra tax)', () => {
    assert.deepEqual(MembershipAddOnChargeAmounts.india, {
      currency: 'INR',
      studioPass: 249_900,
      topUp: 189_900,
    });
    assert.deepEqual(MembershipAddOnChargeAmounts.international, {
      currency: 'USD',
      studioPass: 3_500,
      topUp: 2_000,
    });
    assert.deepEqual(membershipAddOnCharge({ product: 'studioPass', market: 'india' }), {
      amount: 249_900,
      currency: 'INR',
    });
    assert.deepEqual(membershipAddOnCharge({ product: 'topUp', market: 'international' }), {
      amount: 2_000,
      currency: 'USD',
    });
  });
});
