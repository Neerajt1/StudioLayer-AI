import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isImmediateUpgradeFulfilled,
  upgradeAlreadyActiveToastCopy,
  upgradeCardCopy,
  upgradeSuccessToastCopy,
} from './membership-upgrade-copy.js';

describe('Basic → Pro upgrade copy', () => {
  it('immediate card copy never promises 240 credits', () => {
    const copy = upgradeCardCopy({
      immediate: true,
      pending: false,
      upgradePrice: '₹3,000',
      renewalPrice: '₹6,999',
      nextBillingLabel: '1 September 2026',
    });
    assert.match(copy, /Pay ₹3,000 today/);
    assert.match(copy, /Studio Pro begins immediately/);
    assert.match(copy, /120 more are added/);
    assert.match(copy, /₹6,999 on 1 September 2026/);
    assert.equal(copy.includes('240'), false);
    assert.equal(copy.includes('Basic remains'), false);
  });

  it('immediate pending card does not say Basic remains active', () => {
    const copy = upgradeCardCopy({
      immediate: true,
      pending: true,
      upgradePrice: '₹3,000',
      renewalPrice: '₹6,999',
      nextBillingLabel: '1 September 2026',
    });
    assert.match(copy, /Studio Pro is active/);
    assert.equal(copy.includes('Basic remains'), false);
    assert.equal(copy.includes('240'), false);
  });

  it('flag-off card retains next-cycle messaging', () => {
    const copy = upgradeCardCopy({
      immediate: false,
      pending: false,
      upgradePrice: '₹3,000',
      renewalPrice: '₹6,999',
      nextBillingLabel: '1 September 2026',
    });
    assert.match(copy, /next billing date/);
    assert.match(copy, /Studio Basic membership remains active/);
  });

  it('Checkout success before webhook uses confirming copy (not active claim)', () => {
    const copy = upgradeSuccessToastCopy({
      immediate: true,
      phase: 'confirming',
      nextBillingLabel: '1 September 2026',
    });
    assert.equal(copy.title, 'Payment received');
    assert.match(copy.description, /upgrade is being confirmed/);
    assert.match(copy.description, /additional 120 Studio Credits/);
    assert.equal(copy.description.includes('is now active'), false);
    assert.equal(copy.description.includes('have been added'), false);
  });

  it('fulfilled Pro +120 state uses final active copy', () => {
    const copy = upgradeSuccessToastCopy({
      immediate: true,
      phase: 'fulfilled',
      nextBillingLabel: '1 September 2026',
    });
    assert.equal(copy.title, 'Payment received');
    assert.match(copy.description, /Studio Pro is now active/);
    assert.match(copy.description, /120 Studio Credits have been added/);
    assert.match(copy.description, /next renewal stays on 1 September 2026/);
    assert.equal(copy.description.includes('240'), false);
  });

  it('default immediate phase is confirming (safe before webhook)', () => {
    const copy = upgradeSuccessToastCopy({
      immediate: true,
      nextBillingLabel: '1 September 2026',
    });
    assert.match(copy.description, /upgrade is being confirmed/);
  });

  it('flag-off membership success copy remains next-cycle (unchanged)', () => {
    const copy = upgradeSuccessToastCopy({
      immediate: false,
      nextBillingLabel: '1 September 2026',
    });
    assert.equal(copy.title, 'Payment received');
    assert.match(copy.description, /next billing date once payment is confirmed/);
    assert.match(copy.description, /No Studio Credits are added today/);
  });

  it('isImmediateUpgradeFulfilled requires StudioLayer Pro + enterprise', () => {
    assert.equal(
      isImmediateUpgradeFulfilled({
        studioPlan: 'basic',
        studioTier: 'pro',
        pendingUpgradePlan: null,
      }),
      false,
    );
    assert.equal(
      isImmediateUpgradeFulfilled({
        studioPlan: 'pro',
        studioTier: 'enterprise',
        pendingUpgradePlan: 'pro',
      }),
      true,
    );
    assert.equal(
      isImmediateUpgradeFulfilled({
        studioPlan: 'pro',
        studioTier: 'enterprise',
        pendingUpgradePlan: null,
      }),
      true,
    );
  });

  it('immediate already-active toast', () => {
    const copy = upgradeAlreadyActiveToastCopy({
      immediate: true,
      renewalPrice: '₹6,999',
      nextBillingLabel: '1 September 2026',
    });
    assert.equal(copy.title, 'Studio Pro is already active');
    assert.match(copy.description, /₹6,999 on 1 September 2026/);
  });
});
