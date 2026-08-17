import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imageCountToGenerationType } from '@workspace/studio-credit-engine';
import {
  CUSTOM_CAMPAIGN_LABEL,
  CUSTOM_CAMPAIGN_SUBTITLE,
  PRESET_SHOOT_TYPE_LABEL,
  PRESET_SHOOT_TYPE_OPTIONS,
} from './shoot-type-mapping.js';

describe('Workspace shoot-type mapping', () => {
  it('shows Hero / Editorial / Campaign with 1 / 2 / 4 images', () => {
    assert.deepEqual(
      PRESET_SHOOT_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        sub: option.sub,
      })),
      [
        { value: 1, label: 'Hero Shot', sub: '1 Editorial Image' },
        { value: 2, label: 'Editorial Portraits', sub: '2 Editorial Images' },
        { value: 4, label: 'Campaign Collections', sub: '4 Editorial Images' },
      ],
    );
    assert.equal(PRESET_SHOOT_TYPE_LABEL[1], 'Hero Shot');
    assert.equal(PRESET_SHOOT_TYPE_LABEL[2], 'Editorial Portraits');
    assert.equal(PRESET_SHOOT_TYPE_LABEL[4], 'Campaign Collections');
    assert.equal(CUSTOM_CAMPAIGN_LABEL, 'Custom Campaign');
    assert.equal(CUSTOM_CAMPAIGN_SUBTITLE, 'Choose 4–20 images');
  });

  it('maps those imageCounts to Hero / Editorial / Campaign generation types', () => {
    assert.equal(imageCountToGenerationType(1), 'hero');
    assert.equal(imageCountToGenerationType(2), 'editorial');
    assert.equal(imageCountToGenerationType(4), 'campaign');
  });
});
