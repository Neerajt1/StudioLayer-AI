import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generationCreditCostForShootType,
  hasSufficientStudioCreditsForCost,
  resolveAvailableStudioCreditsForGate,
} from './studio-credit-availability.js';

describe('studio-credit-availability', () => {
  it('uses remaining from usage when present', () => {
    assert.equal(
      resolveAvailableStudioCreditsForGate({
        remaining: 1,
        tier: 'free',
        used: 0,
        limit: 1,
      }),
      1,
    );
  });

  it('prices every shoot type from the canonical generation economics', () => {
    const cost = (imageCount: number, outputResolution: '2K' | '4K') =>
      generationCreditCostForShootType({ imageCount, outputResolution });

    assert.equal(cost(1, '2K'), 1.5);
    assert.equal(cost(2, '2K'), 3);
    assert.equal(cost(4, '2K'), 6);
    assert.equal(cost(1, '4K'), 3);
    assert.equal(cost(2, '4K'), 6);
    assert.equal(cost(4, '4K'), 12);
  });

  it('gates exactly at the price, not one credit below it', () => {
    const afford = (remaining: number, cost: number) =>
      hasSufficientStudioCreditsForCost({ remaining, tier: 'pro' }, cost);

    // A 2K hero costs 1.5: 1.5 clears, 1.49 does not.
    assert.equal(afford(1.5, 1.5), true);
    assert.equal(afford(1.49, 1.5), false);
    // A 4K hero costs 3: 3 clears, 2.99 does not.
    assert.equal(afford(3, 3), true);
    assert.equal(afford(2.99, 3), false);
  });

  it('1 credit: nothing is affordable once a 2K image costs 1.5', () => {
    const usage = { remaining: 1, tier: 'free' as const };
    assert.equal(
      hasSufficientStudioCreditsForCost(
        usage,
        generationCreditCostForShootType({
          imageCount: 1,
          outputResolution: '2K',
        }),
      ),
      false,
    );
    assert.equal(
      hasSufficientStudioCreditsForCost(
        usage,
        generationCreditCostForShootType({
          imageCount: 1,
          outputResolution: '4K',
        }),
      ),
      false,
    );
    assert.equal(
      hasSufficientStudioCreditsForCost(
        usage,
        generationCreditCostForShootType({
          imageCount: 2,
          outputResolution: '2K',
        }),
      ),
      false,
    );
    assert.equal(
      hasSufficientStudioCreditsForCost(
        usage,
        generationCreditCostForShootType({
          imageCount: 4,
          outputResolution: '2K',
        }),
      ),
      false,
    );
  });

  it('3 credits: 4K hero and Editorial 2K ok; Campaign 2K not', () => {
    const usage = { remaining: 3, tier: 'pro' as const };
    assert.equal(
      hasSufficientStudioCreditsForCost(
        usage,
        generationCreditCostForShootType({
          imageCount: 1,
          outputResolution: '4K',
        }),
      ),
      true,
    );
    assert.equal(
      hasSufficientStudioCreditsForCost(
        usage,
        generationCreditCostForShootType({
          imageCount: 2,
          outputResolution: '2K',
        }),
      ),
      true,
    );
    assert.equal(
      hasSufficientStudioCreditsForCost(
        usage,
        generationCreditCostForShootType({
          imageCount: 4,
          outputResolution: '2K',
        }),
      ),
      false,
    );
  });

  it('admins are unrestricted', () => {
    assert.equal(
      hasSufficientStudioCreditsForCost(
        { remaining: 0, tier: 'free' },
        4,
        { isAdmin: true },
      ),
      true,
    );
  });
});
