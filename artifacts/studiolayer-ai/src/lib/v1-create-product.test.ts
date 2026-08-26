import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  DEFAULT_OUTPUT_RESOLUTION,
  resolveGenerationCreditCost,
} from '@workspace/studio-credit-engine';
import {
  V1_CREATE_BUTTON_LABEL,
  V1_CREATE_IMAGE_COUNT,
  V1_CREATE_LOCATION_ENVIRONMENT,
  V3_DEACTIVATED_ENVIRONMENT_LABELS,
  V3_DEACTIVATED_SHOOT_TYPE_LABELS,
  applyV1CreateWorkflowConstraints,
  buildV1StudioPathFromLocation,
  isDeactivatedCreateRoutePath,
  readDeactivatedCreateModeFromSearch,
  readV1EnvironmentOverrideFromSearch,
  stripDeactivatedCreateModeFromSearch,
} from './v1-create-product.js';
import { V1_CREATE_SHOOT_TYPE_OPTION } from './shoot-type-mapping.js';
import {
  buildGenerationRequest,
  normalizeStudioWorkflow,
  EMPTY_STUDIO_WORKFLOW,
} from './studio-workflow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const studioPageSource = readFileSync(join(__dirname, '../pages/studio.tsx'), 'utf8');
const appSource = readFileSync(join(__dirname, '../App.tsx'), 'utf8');

const identity = { id: 'F-CA-01' };
const generationBase = {
  sourceImageUrl: 'data:image/jpeg;base64,abc',
  garmentPlacement: 'upper_body' as const,
  talentId: 'F-CA-01',
};

describe('V1 Create product surface', () => {
  it('1. Create remains available', () => {
    assert.equal(V1_CREATE_BUTTON_LABEL, 'Create');
    assert.equal(V1_CREATE_SHOOT_TYPE_OPTION.label, 'Create');
    assert.equal(V1_CREATE_SHOOT_TYPE_OPTION.value, 1);
    assert.match(studioPageSource, /data-testid="button-render"/);
    assert.match(studioPageSource, /V1_CREATE_BUTTON_LABEL/);
  });

  it('2. Create is the only user-facing generation option label', () => {
    assert.equal(V1_CREATE_IMAGE_COUNT, 1);
    for (const label of V3_DEACTIVATED_SHOOT_TYPE_LABELS) {
      assert.equal(
        studioPageSource.includes(`'${label}'`),
        false,
        `studio.tsx must not expose "${label}"`,
      );
    }
  });

  it('3. Editorial is not exposed on desktop workspace UI', () => {
    assert.equal(studioPageSource.includes('ShootTypeSelector'), false);
    assert.equal(studioPageSource.includes('CustomCampaignStepper'), false);
    assert.equal(studioPageSource.includes('Editorial Portraits'), false);
    assert.equal(studioPageSource.includes('Campaign Collections'), false);
    assert.equal(studioPageSource.includes('Create Hero Shot'), false);
    assert.equal(studioPageSource.includes('Continue with Hero Shot'), false);
  });

  it('4. Campaign is not exposed on desktop workspace UI', () => {
    assert.equal(studioPageSource.includes("'Custom Campaign'"), false);
    assert.equal(studioPageSource.includes('Campaign Collections'), false);
    assert.match(studioPageSource, /applyV1CreateWorkflowConstraints/);
  });

  it('5. Editorial is not exposed on mobile workspace UI', () => {
    assert.equal(studioPageSource.includes('sl-shoot-type-grid'), false);
    assert.equal(studioPageSource.includes('shoot-type-2'), false);
    assert.equal(studioPageSource.includes('shoot-type-4'), false);
  });

  it('6. Campaign is not exposed on mobile workspace UI', () => {
    assert.equal(studioPageSource.includes('sl-custom-campaign'), false);
    assert.equal(studioPageSource.includes('CUSTOM_CAMPAIGN_LABEL'), false);
  });

  it('7. old Editorial/Campaign direct routes redirect to Studio Create', () => {
    for (const path of [
      '/editorial',
      '/campaign',
      '/studio/editorial',
      '/studio/campaign',
      '/create/editorial',
      '/create/campaign',
    ]) {
      assert.equal(isDeactivatedCreateRoutePath(path), true);
      assert.equal(buildV1StudioPathFromLocation(path, ''), '/studio');
    }

    assert.match(appSource, /RedirectToStudioPage/);
    assert.match(appSource, /path="\/editorial"/);
    assert.match(appSource, /path="\/campaign"/);
  });

  it('8. normal Create submits exactly one shot/image', () => {
    const workflow = normalizeStudioWorkflow({
      ...generationBase,
      imageCount: 4,
      customCampaign: true,
      customImageCount: 8,
      usedPoses: ['Pose1', 'Pose2', 'Pose3', 'Pose4'],
    });
    const request = buildGenerationRequest(workflow, identity);
    assert.equal(request.imageCount, 1);
    assert.equal('customCampaign' in request, false);
    assert.equal(request.usedPoses?.length, 1);
    assert.deepEqual(request.usedPoses, ['Pose1']);
  });

  it('9. persisted workflow state is clamped to single-image Create', () => {
    const clamped = applyV1CreateWorkflowConstraints(
      normalizeStudioWorkflow({
        ...generationBase,
        imageCount: 2,
        customCampaign: true,
        usedPoses: ['Pose7', 'Pose68'],
      }),
    );
    assert.equal(clamped.imageCount, 1);
    assert.equal(clamped.customCampaign, false);
    assert.deepEqual(clamped.usedPoses, ['Pose7']);
  });

  it('10. 2K billing remains 1 Studio Credit for Create', () => {
    assert.equal(
      resolveGenerationCreditCost({
        imageCount: V1_CREATE_IMAGE_COUNT,
        outputResolution: '2K',
      }),
      1,
    );
    assert.equal(EMPTY_STUDIO_WORKFLOW.outputResolution, DEFAULT_OUTPUT_RESOLUTION);
  });

  it('11. 4K billing remains 2 Studio Credits for Create', () => {
    assert.equal(
      resolveGenerationCreditCost({
        imageCount: V1_CREATE_IMAGE_COUNT,
        outputResolution: '4K',
      }),
      2,
    );
    const request = buildGenerationRequest(
      normalizeStudioWorkflow({ ...generationBase, outputResolution: '4K' }),
      identity,
    );
    assert.equal(request.outputResolution, '4K');
  });

  it('12. V1 Create always uses white_studio in generation request', () => {
    const request = buildGenerationRequest(
      normalizeStudioWorkflow({
        ...generationBase,
        locationEnvironment: 'urban_street',
      }),
      identity,
    );
    assert.equal(request.locationEnvironment, V1_CREATE_LOCATION_ENVIRONMENT);
  });

  it('13. Environment selector is not exposed in V1 Create UI', () => {
    assert.equal(studioPageSource.includes('EnvironmentSelector'), false);
    for (const label of V3_DEACTIVATED_ENVIRONMENT_LABELS) {
      assert.equal(
        studioPageSource.includes(`'${label}'`),
        false,
        `studio.tsx must not expose "${label}"`,
      );
    }
  });

  it('14. stale Environment workflow state is clamped to white_studio', () => {
    const clamped = applyV1CreateWorkflowConstraints(
      normalizeStudioWorkflow({
        ...generationBase,
        locationEnvironment: 'nature',
      }),
    );
    assert.equal(clamped.locationEnvironment, V1_CREATE_LOCATION_ENVIRONMENT);
  });
});

describe('V1 Create URL and query safety', () => {
  it('strips deactivated mode and environment query params', () => {
    assert.equal(readDeactivatedCreateModeFromSearch('?mode=editorial'), true);
    assert.equal(readDeactivatedCreateModeFromSearch('?shootType=4'), true);
    assert.equal(readDeactivatedCreateModeFromSearch('?customCampaign=true'), true);
    assert.equal(readDeactivatedCreateModeFromSearch('?imageCount=2'), true);
    assert.equal(readV1EnvironmentOverrideFromSearch('?locationEnvironment=urban_street'), true);
    assert.equal(readV1EnvironmentOverrideFromSearch('?environment=nature'), true);
    assert.equal(readV1EnvironmentOverrideFromSearch('?locationEnvironment=white_studio'), false);
    assert.equal(
      stripDeactivatedCreateModeFromSearch('?mode=editorial&locationEnvironment=street&foo=bar'),
      '?foo=bar',
    );
    assert.equal(
      buildV1StudioPathFromLocation('/studio', '?locationEnvironment=nature&foo=bar'),
      '/studio?foo=bar',
    );
  });

  it('setImageCount via normalize always resolves to one image', () => {
    const workflow = normalizeStudioWorkflow({ imageCount: 4 });
    assert.equal(workflow.imageCount, 1);
  });
});
