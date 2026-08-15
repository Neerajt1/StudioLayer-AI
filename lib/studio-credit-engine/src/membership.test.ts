import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MembershipCreditAllowances,
  MembershipDisplayPricing,
  MembershipMarketPricing,
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
});
