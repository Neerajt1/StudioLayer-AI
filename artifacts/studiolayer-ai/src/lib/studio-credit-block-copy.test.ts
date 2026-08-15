import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { zeroStudioCreditBlockToast } from './studio-credit-block-copy.js';

describe('zeroStudioCreditBlockToast', () => {
  it('states no credits remaining, action not started, and Membership next step', () => {
    const toast = zeroStudioCreditBlockToast();
    assert.equal(toast.title, 'No Studio Credits remaining.');
    assert.equal(
      toast.description,
      "This action wasn't started. View Membership to continue.",
    );
  });

  it('does not imply a credit was consumed, refunded, or a payment failed', () => {
    const text = `${zeroStudioCreditBlockToast().title} ${zeroStudioCreditBlockToast().description}`;
    assert.equal(/Studio Credit used/i.test(text), false);
    assert.equal(/refund/i.test(text), false);
    assert.equal(/Payment [Ff]ailed/i.test(text), false);
    assert.equal(/deduct/i.test(text), false);
    assert.equal(/partial/i.test(text), false);
  });
});
