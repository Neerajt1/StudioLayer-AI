import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultShotCountForShootType } from './pose-planner.js';
import { imageCountToShootType } from './pose-selection-engine.js';

describe('pose shoot-type mapping', () => {
  it('maps 1 / 2 / 4+ shots to Hero / Editorial / Campaign', () => {
    assert.equal(imageCountToShootType(1), 'hero');
    assert.equal(imageCountToShootType(2), 'editorial');
    assert.equal(imageCountToShootType(4), 'campaign');
    assert.equal(imageCountToShootType(6), 'campaign');
  });

  it('defaults shot counts to 1 / 2 / 4 for Hero / Editorial / Campaign', () => {
    assert.equal(defaultShotCountForShootType('hero'), 1);
    assert.equal(defaultShotCountForShootType('editorial'), 2);
    assert.equal(defaultShotCountForShootType('campaign'), 4);
  });
});
