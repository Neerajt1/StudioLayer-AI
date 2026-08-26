// ---------------------------------------------------------------------------
// V1 Create product surface — single-image Create only.
//
// Editorial, Campaign, and Custom Campaign remain in code for V3 recovery but
// must not be reachable from V1 user-facing entry points.
// ---------------------------------------------------------------------------

import type { StudioWorkflow } from '@/lib/studio-workflow';

/** V1 Create always submits exactly one image. */
export const V1_CREATE_IMAGE_COUNT = 1 as const;

/** V1 Create always uses seamless white studio — not user-selectable. */
export const V1_CREATE_LOCATION_ENVIRONMENT = 'white_studio' as const;

function trimUsedPosesToShotCount(
  usedPoses: string[] | undefined,
  shotCount: number,
): string[] | undefined {
  if (!usedPoses?.length || shotCount <= 0) return undefined;
  const trimmed = usedPoses.slice(0, shotCount);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** User-facing primary action label — not "Hero". */
export const V1_CREATE_BUTTON_LABEL = 'Create';

/** Labels preserved for V3 recovery tests — must not appear in V1 UI. */
export const V3_DEACTIVATED_ENVIRONMENT_LABELS = [
  'White Studio',
  'Grey Gradient',
  'Studio',
  'Interior',
  'Street',
  'Nature',
  'Environment',
] as const;

/** Labels preserved for V3 recovery tests — must not appear in V1 UI. */
export const V3_DEACTIVATED_SHOOT_TYPE_LABELS = [
  'Hero Shot',
  'Editorial Portraits',
  'Campaign Collections',
  'Custom Campaign',
] as const;

const DEACTIVATED_MODE_VALUES = new Set([
  'editorial',
  'campaign',
  'custom-campaign',
  'custom_campaign',
  'customcampaign',
]);

const DEACTIVATED_SHOOT_TYPE_VALUES = new Set(['2', '4', 'editorial', 'campaign']);

const DEACTIVATED_ROUTE_SEGMENTS = new Set([
  '/editorial',
  '/campaign',
  '/studio/editorial',
  '/studio/campaign',
  '/create/editorial',
  '/create/campaign',
]);

/** True when URL/search attempts to select a deactivated multi-shot mode. */
export function readDeactivatedCreateModeFromSearch(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const mode = params.get('mode')?.trim().toLowerCase();
  if (mode && DEACTIVATED_MODE_VALUES.has(mode)) {
    return true;
  }

  const shootType = params.get('shootType')?.trim().toLowerCase();
  if (shootType && DEACTIVATED_SHOOT_TYPE_VALUES.has(shootType)) {
    return true;
  }

  if (params.get('customCampaign') === 'true' || params.get('customCampaign') === '1') {
    return true;
  }

  const imageCountRaw = params.get('imageCount');
  if (imageCountRaw != null) {
    const imageCount = Number(imageCountRaw);
    if (Number.isFinite(imageCount) && imageCount > V1_CREATE_IMAGE_COUNT) {
      return true;
    }
  }

  return false;
}

export function stripDeactivatedCreateModeFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete('mode');
  params.delete('shootType');
  params.delete('imageCount');
  params.delete('customCampaign');
  params.delete('locationEnvironment');
  params.delete('environment');
  const next = params.toString();
  return next ? `?${next}` : '';
}

/** True when URL/search attempts to override V1 white-background Create. */
export function readV1EnvironmentOverrideFromSearch(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const env = params.get('locationEnvironment') ?? params.get('environment');
  if (!env?.trim()) return false;
  return env.trim().toLowerCase() !== V1_CREATE_LOCATION_ENVIRONMENT;
}

export function isDeactivatedCreateRoutePath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return DEACTIVATED_ROUTE_SEGMENTS.has(normalized);
}

/**
 * Clamp persisted/session workflow state to V1 Create (single image).
 * Does not delete underlying multi-shot types from the codebase.
 */
export function applyV1CreateWorkflowConstraints(
  workflow: StudioWorkflow,
): StudioWorkflow {
  return {
    ...workflow,
    imageCount: V1_CREATE_IMAGE_COUNT,
    customCampaign: false,
    locationEnvironment: V1_CREATE_LOCATION_ENVIRONMENT,
    usedPoses: trimUsedPosesToShotCount(workflow.usedPoses, V1_CREATE_IMAGE_COUNT),
  };
}

export function buildV1StudioPathFromLocation(pathname: string, search: string): string {
  const cleanSearch = stripDeactivatedCreateModeFromSearch(search);
  if (isDeactivatedCreateRoutePath(pathname)) {
    return `/studio${cleanSearch}`;
  }
  if (readDeactivatedCreateModeFromSearch(search)) {
    return `/studio${cleanSearch}`;
  }
  if (readV1EnvironmentOverrideFromSearch(search)) {
    return `/studio${cleanSearch}`;
  }
  return `${pathname}${cleanSearch}`;
}
