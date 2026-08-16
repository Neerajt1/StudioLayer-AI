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

  it('1 credit: 2K hero affordable; 4K and campaign not', () => {
    const usage = { remaining: 1, tier: 'free' as const };
    assert.equal(hasSufficientStudioCreditsForCost(usage, 1), true);
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

  it('2 credits: 4K and campaign ok; editorial not', () => {
    const usage = { remaining: 2, tier: 'pro' as const };
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
