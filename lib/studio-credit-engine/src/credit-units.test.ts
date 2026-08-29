import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDIT_MINOR_UNITS_PER_CREDIT,
  formatCreditAmount,
  fromCreditMinorUnits,
  isRepresentableCreditAmount,
  toCreditMinorUnits,
} from './credit-units';
import {
  canGenerateWithStudioCredits,
  creditCostForImageCount,
  creditCostForRefine,
  creditCostForRegenerate,
  creditCostForRemoveBackground,
  creditCostPerCompletedImageInBatch,
  creditCostPerCompletedImageInBatchMinorUnits,
  creditCostPerImageAtResolution,
  minimumGenerationCreditCost,
  resolveGenerationCreditCost,
  resolveGenerationCreditCostMinorUnits,
} from './costs';
import {
  MembershipCreditAllowances,
  estimateImagesAtResolution,
} from './membership';

describe('Studio Credit minor units', () => {
  it('stores one credit as 100 units and round-trips exactly', () => {
    assert.equal(CREDIT_MINOR_UNITS_PER_CREDIT, 100);
    for (const credits of [0, 1, 1.5, 2, 3, 6, 12, 40, 120, 240]) {
      assert.equal(fromCreditMinorUnits(toCreditMinorUnits(credits)), credits);
    }
  });

  it('never coerces 1.5 to 1', () => {
    assert.equal(toCreditMinorUnits(1.5), 150);
    assert.equal(Number.isInteger(toCreditMinorUnits(1.5)), true);
    assert.equal(fromCreditMinorUnits(150), 1.5);
  });

  it('rejects non-finite amounts rather than persisting them', () => {
    assert.throws(() => toCreditMinorUnits(Number.NaN));
    assert.throws(() => toCreditMinorUnits(Number.POSITIVE_INFINITY));
    assert.throws(() => fromCreditMinorUnits(Number.NaN));
  });

  it('reports representability of credit prices', () => {
    assert.equal(isRepresentableCreditAmount(1.5), true);
    assert.equal(isRepresentableCreditAmount(3), true);
    assert.equal(isRepresentableCreditAmount(0.001), false);
  });

  it('formats amounts without trailing zeros', () => {
    assert.equal(formatCreditAmount(1.5), '1.5');
    assert.equal(formatCreditAmount(3), '3');
    assert.equal(formatCreditAmount(1), '1');
  });
});

describe('Canonical generation economics', () => {
  it('2K is 1.5 credits and 4K is 3 credits per image', () => {
    assert.equal(creditCostPerImageAtResolution('2K'), 1.5);
    assert.equal(creditCostPerImageAtResolution('4K'), 3);
    assert.equal(toCreditMinorUnits(creditCostPerImageAtResolution('2K')), 150);
    assert.equal(toCreditMinorUnits(creditCostPerImageAtResolution('4K')), 300);
  });

  it('Remove Background stays 1 credit and is independent of Refine', () => {
    assert.equal(creditCostForRemoveBackground(), 1);
    assert.equal(creditCostForRefine(), 1);
    assert.equal(creditCostForRegenerate(), 1);
  });

  it('batch totals are exact at both resolutions', () => {
    const cases: Array<[number, '2K' | '4K', number]> = [
      [1, '2K', 1.5],
      [2, '2K', 3],
      [4, '2K', 6],
      [1, '4K', 3],
      [2, '4K', 6],
      [4, '4K', 12],
    ];
    for (const [imageCount, resolution, expected] of cases) {
      const total = resolveGenerationCreditCost({
        imageCount,
        outputResolution: resolution,
      });
      assert.equal(total, expected, `${imageCount} x ${resolution}`);
      assert.equal(
        resolveGenerationCreditCostMinorUnits({
          imageCount,
          outputResolution: resolution,
        }),
        toCreditMinorUnits(expected),
      );
    }
  });

  it('per-image charges sum back to the batch total with no residue', () => {
    for (const resolution of ['2K', '4K'] as const) {
      for (const imageCount of [1, 2, 4]) {
        const totalMinor = resolveGenerationCreditCostMinorUnits({
          imageCount,
          outputResolution: resolution,
        });
        const perImageMinor = creditCostPerCompletedImageInBatchMinorUnits({
          imageCount,
          outputResolution: resolution,
        });
        assert.equal(Number.isInteger(perImageMinor), true);
        assert.equal(perImageMinor * imageCount, totalMinor);
      }
    }
  });

  it('a mixed workload of 2 x 2K plus 1 x 4K costs 6 credits', () => {
    const twoAt2K = resolveGenerationCreditCost({
      imageCount: 2,
      outputResolution: '2K',
    });
    const oneAt4K = resolveGenerationCreditCost({
      imageCount: 1,
      outputResolution: '4K',
    });
    assert.equal(twoAt2K + oneAt4K, 6);
  });

  it('refine and regenerate remain flat and resolution-independent', () => {
    for (const resolution of ['2K', '4K'] as const) {
      assert.equal(
        resolveGenerationCreditCost({
          imageCount: 1,
          isRefinement: true,
          outputResolution: resolution,
        }),
        1,
      );
      assert.equal(
        creditCostPerCompletedImageInBatch({
          imageCount: 1,
          isRefinement: true,
          outputResolution: resolution,
        }),
        1,
      );
    }
  });

  it('hero, editorial and campaign batch prices follow the per-image price', () => {
    assert.equal(creditCostForImageCount(1), 1.5);
    assert.equal(creditCostForImageCount(2), 3);
    assert.equal(creditCostForImageCount(4), 6);
  });
});

describe('Membership displayed image quantities', () => {
  it('rounds to the nearest whole image at 2K', () => {
    assert.equal(
      estimateImagesAtResolution(MembershipCreditAllowances.basic),
      80,
    );
    assert.equal(estimateImagesAtResolution(MembershipCreditAllowances.pro), 160);
    assert.equal(
      estimateImagesAtResolution(MembershipCreditAllowances.studioPass),
      27,
    );
    assert.equal(
      estimateImagesAtResolution(MembershipCreditAllowances.topUp),
      23,
    );
  });

  it('halves the quantity at 4K', () => {
    assert.equal(
      estimateImagesAtResolution(MembershipCreditAllowances.basic, '4K'),
      40,
    );
  });

  it('leaves the underlying allocations untouched', () => {
    assert.equal(MembershipCreditAllowances.basic, 120);
    assert.equal(MembershipCreditAllowances.pro, 240);
    assert.equal(MembershipCreditAllowances.studioPass, 40);
    assert.equal(MembershipCreditAllowances.topUp, 35);
  });
});

describe('complimentary allowance', () => {
  it('grants exactly one 2K image, stored as 150 minor units', () => {
    assert.equal(MembershipCreditAllowances.complimentary, 1.5);
    assert.equal(toCreditMinorUnits(MembershipCreditAllowances.complimentary), 150);
    assert.equal(
      MembershipCreditAllowances.complimentary,
      creditCostPerImageAtResolution('2K'),
    );
  });

  it('lets a new complimentary Studio create once, then blocks', () => {
    const granted = MembershipCreditAllowances.complimentary;
    assert.equal(canGenerateWithStudioCredits(granted), true);

    const afterOneImage = granted - creditCostPerImageAtResolution('2K');
    assert.equal(afterOneImage, 0);
    assert.equal(canGenerateWithStudioCredits(afterOneImage), false);
  });

  it('does not buy a second image or any 4K image', () => {
    const granted = MembershipCreditAllowances.complimentary;
    assert.equal(granted < creditCostPerImageAtResolution('4K'), true);
    assert.equal(granted < creditCostPerImageAtResolution('2K') * 2, true);
  });

  it('leaves every paid allocation untouched', () => {
    assert.equal(MembershipCreditAllowances.basic, 120);
    assert.equal(MembershipCreditAllowances.pro, 240);
    assert.equal(MembershipCreditAllowances.studioPass, 40);
    assert.equal(MembershipCreditAllowances.topUp, 35);
  });
});

describe('generation availability floor', () => {
  it('derives the floor from the cheapest purchasable generation', () => {
    // Not written down anywhere: the least expensive shoot is one 2K image.
    assert.equal(minimumGenerationCreditCost(), 1.5);
    assert.equal(
      minimumGenerationCreditCost(),
      creditCostPerImageAtResolution('2K'),
    );
  });

  it('blocks balances below the cheapest 2K image and allows 1.5 upward', () => {
    assert.equal(canGenerateWithStudioCredits(0), false);
    assert.equal(canGenerateWithStudioCredits(0.5), false);
    assert.equal(canGenerateWithStudioCredits(1), false);
    assert.equal(canGenerateWithStudioCredits(1.49), false);
    assert.equal(canGenerateWithStudioCredits(1.5), true);
    assert.equal(canGenerateWithStudioCredits(3), true);
  });

  it('treats the unlimited admin balance as available', () => {
    assert.equal(canGenerateWithStudioCredits(Number.POSITIVE_INFINITY), true);
    assert.equal(canGenerateWithStudioCredits(Number.NaN), false);
  });

  it('leaves Remove Background affordable below the generation floor', () => {
    // A customer holding exactly 1 credit cannot generate, but Remove
    // Background is a flat 1-credit tool and must stay available to them.
    assert.equal(creditCostForRemoveBackground(), 1);
    assert.equal(canGenerateWithStudioCredits(1), false);
    assert.equal(1 >= creditCostForRemoveBackground(), true);
    assert.equal(0.5 >= creditCostForRemoveBackground(), false);
  });
});
