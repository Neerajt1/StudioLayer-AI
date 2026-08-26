import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  seedDirectShootSelection,
  toggleDirectShootSelection,
  usedPosesFromDirectShootSelection,
} from './direct-shoot-selection.js';
import {
  buildGenerationRequest,
  normalizeStudioWorkflow,
} from './studio-workflow.js';

describe('Direct Shoot pose selection persistence (V1 single-shot)', () => {
  it('1. seeds picker from workflow usedPoses on open', () => {
    assert.deepEqual(seedDirectShootSelection(['Pose37'], 1), ['Pose37']);
    assert.deepEqual(seedDirectShootSelection(undefined, 1), []);
  });

  it('2. browse/close preserves workflow when picker re-seeds from canonical state', () => {
    const workflow = normalizeStudioWorkflow({
      sourceImageUrl: 'data:image/jpeg;base64,abc',
      garmentPlacement: 'upper_body',
      talentId: 'F-CA-01',
      usedPoses: ['Pose37'],
    });
    assert.deepEqual(seedDirectShootSelection(workflow.usedPoses, 1), ['Pose37']);
    assert.deepEqual(
      usedPosesFromDirectShootSelection(seedDirectShootSelection(workflow.usedPoses, 1)),
      ['Pose37'],
    );
  });

  it('3. selecting Pose B replaces Pose A as the only active pose', () => {
    let selected = seedDirectShootSelection(['Pose37'], 1);
    selected = toggleDirectShootSelection(selected, 'Pose52', 1);
    assert.deepEqual(selected, ['Pose52']);
    assert.deepEqual(usedPosesFromDirectShootSelection(selected), ['Pose52']);
  });

  it('4. clicking the active pose again clears selection', () => {
    let selected = seedDirectShootSelection(['Pose37'], 1);
    selected = toggleDirectShootSelection(selected, 'Pose37', 1);
    assert.deepEqual(selected, []);
    assert.equal(usedPosesFromDirectShootSelection(selected), undefined);
  });

  it('5. reopen after unselect seeds empty selection', () => {
    assert.deepEqual(seedDirectShootSelection(undefined, 1), []);
  });

  it('6. remount/open cycle re-seeds from workflow without stale local state', () => {
    const firstOpen = seedDirectShootSelection(['Pose37'], 1);
    const afterCloseLocal: string[] = [];
    const secondOpen = seedDirectShootSelection(
      usedPosesFromDirectShootSelection(firstOpen),
      1,
    );
    assert.deepEqual(afterCloseLocal, []);
    assert.deepEqual(secondOpen, ['Pose37']);
  });

  it('7. V1 remains single-pose / single-image', () => {
    const selected = toggleDirectShootSelection([], 'Pose37', 1);
    assert.equal(selected.length, 1);
    const workflow = normalizeStudioWorkflow({
      sourceImageUrl: 'data:image/jpeg;base64,abc',
      garmentPlacement: 'upper_body',
      talentId: 'F-CA-01',
      usedPoses: usedPosesFromDirectShootSelection(selected),
    });
    const request = buildGenerationRequest(workflow, { id: 'F-CA-01' });
    assert.equal(request.imageCount, 1);
    assert.deepEqual(request.usedPoses, ['Pose37']);
  });

  it('8. Create request uses the currently selected workflow pose', () => {
    const workflow = normalizeStudioWorkflow({
      sourceImageUrl: 'data:image/jpeg;base64,abc',
      garmentPlacement: 'upper_body',
      talentId: 'F-CA-01',
      usedPoses: ['Pose52'],
    });
    const request = buildGenerationRequest(workflow, { id: 'F-CA-01' });
    assert.deepEqual(request.usedPoses, ['Pose52']);
  });

  it('9. Welcome Screen files remain untouched by pose picker persistence', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const welcomeSource = readFileSync(
      join(__dirname, '../components/welcome/welcome-screen.tsx'),
      'utf8',
    );
    assert.equal(welcomeSource.includes('DirectShootDialog'), false);
    assert.equal(welcomeSource.includes('usedPoses'), false);
  });
});
