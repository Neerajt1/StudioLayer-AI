import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CUSTOM_CAMPAIGN_MAX,
  CUSTOM_CAMPAIGN_MIN,
  StudioCreditRules,
  campaignCreditCostPerImage,
  creditCostForGenerationType,
  imageCountToGenerationType,
  isValidCustomCampaignImageCount,
  reconcileLegacyShootGenerationType,
  reasonCodeForImageRequest,
  resolveGenerationCreditCost,
} from './index.js';
import { StudioCreditReasonCode } from './reason-codes.js';

describe('shoot type ↔ imageCount mapping', () => {
  it('maps Hero / Editorial / Campaign presets to 1 / 2 / 4 images', () => {
    assert.equal(imageCountToGenerationType(1), 'hero');
    assert.equal(imageCountToGenerationType(2), 'editorial');
    assert.equal(imageCountToGenerationType(4), 'campaign');
  });

  it('charges 1.5 Studio Credits per image at 2K and 3 at 4K', () => {
    assert.equal(StudioCreditRules.hero, 1.5);
    assert.equal(StudioCreditRules.editorial, 3);
    assert.equal(StudioCreditRules.campaign, 6);
    assert.equal(campaignCreditCostPerImage(), 1.5);

    assert.equal(creditCostForGenerationType('hero'), 1.5);
    assert.equal(creditCostForGenerationType('editorial'), 3);
    assert.equal(creditCostForGenerationType('campaign'), 6);

    assert.equal(resolveGenerationCreditCost({ imageCount: 1, outputResolution: '2K' }), 1.5);
    assert.equal(resolveGenerationCreditCost({ imageCount: 2, outputResolution: '2K' }), 3);
    assert.equal(resolveGenerationCreditCost({ imageCount: 4, outputResolution: '2K' }), 6);
    assert.equal(resolveGenerationCreditCost({ imageCount: 1, outputResolution: '4K' }), 3);
    assert.equal(resolveGenerationCreditCost({ imageCount: 2, outputResolution: '4K' }), 6);
    assert.equal(resolveGenerationCreditCost({ imageCount: 4, outputResolution: '4K' }), 12);
  });

  it('Custom Campaign 4–20 follows 1.5 x imageCount credits at 2K', () => {
    assert.equal(CUSTOM_CAMPAIGN_MIN, 4);
    assert.equal(CUSTOM_CAMPAIGN_MAX, 20);
    assert.equal(isValidCustomCampaignImageCount(3), false);
    assert.equal(isValidCustomCampaignImageCount(4), true);
    assert.equal(isValidCustomCampaignImageCount(20), true);
    assert.equal(isValidCustomCampaignImageCount(21), false);

    assert.equal(
      resolveGenerationCreditCost({
        imageCount: 6,
        customCampaign: true,
        outputResolution: '2K',
      }),
      9,
    );
    assert.equal(
      resolveGenerationCreditCost({
        imageCount: 6,
        customCampaign: true,
        outputResolution: '4K',
      }),
      18,
    );
  });

  it('reconciles only the inverted 2-image campaign and 4-image editorial pairs', () => {
    assert.equal(reconcileLegacyShootGenerationType('campaign', 2), 'editorial');
    assert.equal(reconcileLegacyShootGenerationType('editorial', 4), 'campaign');

    assert.equal(reconcileLegacyShootGenerationType('editorial', 2), 'editorial');
    assert.equal(reconcileLegacyShootGenerationType('campaign', 4), 'campaign');
    assert.equal(reconcileLegacyShootGenerationType('campaign', 6), 'campaign');
    assert.equal(reconcileLegacyShootGenerationType('campaign', 20), 'campaign');
    assert.equal(reconcileLegacyShootGenerationType('hero', 1), 'hero');
    assert.equal(reconcileLegacyShootGenerationType('hero', 2), 'hero');
    assert.equal(reconcileLegacyShootGenerationType('hero', 4), 'hero');
    assert.equal(reconcileLegacyShootGenerationType('editorial', 3), 'editorial');
    assert.equal(reconcileLegacyShootGenerationType('campaign', 3), 'campaign');
  });

  it('reason codes follow the corrected generation types', () => {
    assert.equal(reasonCodeForImageRequest(1, false), StudioCreditReasonCode.HERO_GENERATION);
    assert.equal(reasonCodeForImageRequest(2, false), StudioCreditReasonCode.EDITORIAL_GENERATION);
    assert.equal(reasonCodeForImageRequest(4, false), StudioCreditReasonCode.CAMPAIGN_GENERATION);
  });
});
