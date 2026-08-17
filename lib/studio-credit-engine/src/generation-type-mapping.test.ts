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

  it('charges 1 Studio Credit per image at 2K and 2 at 4K', () => {
    assert.equal(StudioCreditRules.hero, 1);
    assert.equal(StudioCreditRules.editorial, 2);
    assert.equal(StudioCreditRules.campaign, 4);
    assert.equal(campaignCreditCostPerImage(), 1);

    assert.equal(creditCostForGenerationType('hero'), 1);
    assert.equal(creditCostForGenerationType('editorial'), 2);
    assert.equal(creditCostForGenerationType('campaign'), 4);

    assert.equal(resolveGenerationCreditCost({ imageCount: 1, outputResolution: '2K' }), 1);
    assert.equal(resolveGenerationCreditCost({ imageCount: 2, outputResolution: '2K' }), 2);
    assert.equal(resolveGenerationCreditCost({ imageCount: 4, outputResolution: '2K' }), 4);
    assert.equal(resolveGenerationCreditCost({ imageCount: 1, outputResolution: '4K' }), 2);
    assert.equal(resolveGenerationCreditCost({ imageCount: 2, outputResolution: '4K' }), 4);
    assert.equal(resolveGenerationCreditCost({ imageCount: 4, outputResolution: '4K' }), 8);
  });

  it('Custom Campaign 4–20 follows imageCount credits at 2K', () => {
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
      6,
    );
    assert.equal(
      resolveGenerationCreditCost({
        imageCount: 6,
        customCampaign: true,
        outputResolution: '4K',
      }),
      12,
    );
  });

  it('reason codes follow the corrected generation types', () => {
    assert.equal(reasonCodeForImageRequest(1, false), StudioCreditReasonCode.HERO_GENERATION);
    assert.equal(reasonCodeForImageRequest(2, false), StudioCreditReasonCode.EDITORIAL_GENERATION);
    assert.equal(reasonCodeForImageRequest(4, false), StudioCreditReasonCode.CAMPAIGN_GENERATION);
  });
});
