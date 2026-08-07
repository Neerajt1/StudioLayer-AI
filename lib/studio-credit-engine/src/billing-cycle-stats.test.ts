import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudioCreditReasonCode } from './reason-codes';
import { computeBillingCycleLedgerStats } from './billing-cycle-stats';

describe('computeBillingCycleLedgerStats', () => {
  it('counts images from generation transactions, not surviving Gallery assets', () => {
    const transactions = [
      { reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION },
    ] as const;

    const stats = computeBillingCycleLedgerStats({
      studioCreditsUsed: 16,
      transactions,
    });

    assert.equal(stats.imagesCreated, 4);
  });

  it('remains identical before and after deleting every generated image', () => {
    const transactions = [
      { reasonCode: StudioCreditReasonCode.HERO_GENERATION },
      { reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION },
      { reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION },
      { reasonCode: StudioCreditReasonCode.REFINE },
      { reasonCode: StudioCreditReasonCode.REFINE },
      { reasonCode: StudioCreditReasonCode.REFINE },
    ] as const;

    const ledgerInput = {
      studioCreditsUsed: 29,
      transactions,
    };

    const beforeDeletion = computeBillingCycleLedgerStats(ledgerInput);
    const afterDeletingEveryGalleryAsset = computeBillingCycleLedgerStats(ledgerInput);

    assert.deepEqual(afterDeletingEveryGalleryAsset, beforeDeletion);
    assert.equal(beforeDeletion.imagesCreated, 7);
    assert.equal(beforeDeletion.averageRefinementsPerImage, 0.4);
    assert.equal(beforeDeletion.studioCreditsUsed, 29);
  });

  it('keeps average refinements when refined assets are removed from Gallery', () => {
    const transactions = [
      { reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION },
      { reasonCode: StudioCreditReasonCode.REFINE },
    ] as const;

    const stats = computeBillingCycleLedgerStats({
      studioCreditsUsed: 17,
      transactions,
    });

    assert.equal(stats.imagesCreated, 4);
    assert.equal(stats.averageRefinementsPerImage, 0.3);
  });

  it('ignores transparent download transactions for image and refinement totals', () => {
    const stats = computeBillingCycleLedgerStats({
      studioCreditsUsed: 17,
      transactions: [
        { reasonCode: StudioCreditReasonCode.HERO_GENERATION },
        { reasonCode: StudioCreditReasonCode.TRANSPARENT_DOWNLOAD },
      ],
    });

    assert.equal(stats.imagesCreated, 1);
    assert.equal(stats.averageRefinementsPerImage, 0);
  });
});
