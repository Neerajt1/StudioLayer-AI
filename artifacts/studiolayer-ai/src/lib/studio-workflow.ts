// ---------------------------------------------------------------------------
// Studio workflow — single source of truth for the creation pipeline
// ---------------------------------------------------------------------------

import {
  CUSTOM_CAMPAIGN_MAX,
  CUSTOM_CAMPAIGN_MIN,
} from '@workspace/studio-credit-engine';

export type GarmentPlacement = 'upper_body' | 'lower_body' | 'full_body' | '';
export type GarmentLengthSelection =
  | 'auto'
  | 'mini'
  | 'above_knee'
  | 'knee'
  | 'midi'
  | 'mid_calf'
  | 'maxi'
  | 'floor';
export type ShootType = 1 | 2 | 4;

export interface StudioWorkflow {
  sourceImageUrl: string;
  garmentPlacement: GarmentPlacement;
  garmentLengthSelection: GarmentLengthSelection;
  talentId: string;
  imageCount: ShootType;
  /** Custom Campaign mode — variable 4–20 image batch at Campaign per-image pricing. */
  customCampaign: boolean;
  customImageCount: number;
  /** Canonical Pose IDs selected in Direct Shoot (required before generation). */
  usedPoses?: string[];
}

export const DEFAULT_GARMENT_LENGTH_SELECTION: Exclude<GarmentLengthSelection, 'auto'> = 'mini';

export const EMPTY_STUDIO_WORKFLOW: StudioWorkflow = {
  sourceImageUrl: '',
  garmentPlacement: '',
  garmentLengthSelection: DEFAULT_GARMENT_LENGTH_SELECTION,
  talentId: '',
  imageCount: 1,
  customCampaign: false,
  customImageCount: CUSTOM_CAMPAIGN_MIN,
};

export const GARMENT_LENGTH_OPTIONS: ReadonlyArray<{
  value: Exclude<GarmentLengthSelection, 'auto'>;
  label: string;
}> = [
  { value: 'mini', label: 'Mini' },
  { value: 'above_knee', label: 'Above Knee' },
  { value: 'knee', label: 'Knee Length' },
  { value: 'midi', label: 'Midi' },
  { value: 'mid_calf', label: 'Mid-Calf' },
  { value: 'maxi', label: 'Maxi' },
  { value: 'floor', label: 'Floor Length' },
];

export type WorkflowMissingField = 'garment' | 'category' | 'talent' | 'poses';

export interface StudioWorkflowValidation {
  hasGarment: boolean;
  hasCategory: boolean;
  hasTalent: boolean;
  hasPoses: boolean;
  requiredPoseCount: number;
  selectedPoseCount: number;
  isComplete: boolean;
  firstMissing: WorkflowMissingField | null;
  message: string | null;
}

export interface StudioGenerateGate {
  limitBlocked: boolean;
  isPending: boolean;
  isProcessing: boolean;
}

export interface StudioIdentityPayload {
  id: string;
  gender?: string;
  ageGroup?: string;
}

const STORAGE_KEY_PREFIX = 'studiolayer:studio-workflow';
const LEGACY_TALENT_KEY_PREFIX = 'studiolayer:selected-talent-id';
const LEGACY_DRAFT_KEY_PREFIX = 'studiolayer:studio-workflow-draft';
/** Pre-isolation global talent key */
const LEGACY_GLOBAL_TALENT_KEY = 'studiolayer:selected-talent-id';

function isShootType(value: unknown): value is ShootType {
  return value === 1 || value === 2 || value === 4;
}

function isGarmentPlacement(value: unknown): value is GarmentPlacement {
  return value === 'upper_body' || value === 'lower_body' || value === 'full_body' || value === '';
}

function isManualGarmentLengthSelection(
  value: unknown,
): value is Exclude<GarmentLengthSelection, 'auto'> {
  return (
    value === 'mini'
    || value === 'above_knee'
    || value === 'knee'
    || value === 'midi'
    || value === 'mid_calf'
    || value === 'maxi'
    || value === 'floor'
  );
}

function isCustomImageCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= CUSTOM_CAMPAIGN_MIN
    && value <= CUSTOM_CAMPAIGN_MAX;
}


function normalizeUsedPoses(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const poses = raw.filter((pose) => typeof pose === 'string' && pose.trim().length > 0);
  return poses.length > 0 ? poses : undefined;
}

/** Trim manual pose selection when shoot type or image count shrinks. */
export function trimUsedPosesToShotCount(
  usedPoses: string[] | undefined,
  shotCount: number,
): string[] | undefined {
  if (!usedPoses?.length || shotCount <= 0) return undefined;
  const trimmed = usedPoses.slice(0, shotCount);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeStudioWorkflow(raw: Partial<StudioWorkflow> | null | undefined): StudioWorkflow {
  const workflow = {
    sourceImageUrl: typeof raw?.sourceImageUrl === 'string' ? raw.sourceImageUrl : '',
    garmentPlacement: isGarmentPlacement(raw?.garmentPlacement) ? raw.garmentPlacement : '',
    garmentLengthSelection: isManualGarmentLengthSelection(raw?.garmentLengthSelection)
      ? raw.garmentLengthSelection
      : DEFAULT_GARMENT_LENGTH_SELECTION,
    talentId: typeof raw?.talentId === 'string' ? raw.talentId : '',
    imageCount: isShootType(raw?.imageCount) ? raw.imageCount : 1,
    customCampaign: raw?.customCampaign === true,
    customImageCount: isCustomImageCount(raw?.customImageCount)
      ? raw.customImageCount
      : CUSTOM_CAMPAIGN_MIN,,
    usedPoses: normalizeUsedPoses(raw?.usedPoses),
  };

  return {
    ...workflow,
    usedPoses: trimUsedPosesToShotCount(
      workflow.usedPoses,
      resolveWorkflowImageCount(workflow),
    ),
  };
}

export function resolveWorkflowImageCount(workflow: StudioWorkflow): number {
  return workflow.customCampaign ? workflow.customImageCount : workflow.imageCount;
}

export function validateStudioWorkflow(workflow: StudioWorkflow): StudioWorkflowValidation {
  const hasGarment = Boolean(workflow.sourceImageUrl);
  const hasCategory = Boolean(workflow.garmentPlacement);
  const hasTalent = Boolean(workflow.talentId);
  const requiredPoseCount = resolveWorkflowImageCount(workflow);
  const selectedPoseCount = workflow.usedPoses?.length ?? 0;
  const hasPoses = selectedPoseCount === requiredPoseCount && requiredPoseCount > 0;
  const isComplete = hasGarment && hasCategory && hasTalent && hasPoses;

  if (!hasGarment) {
    return {
      hasGarment,
      hasCategory,
      hasTalent,
      hasPoses,
      requiredPoseCount,
      selectedPoseCount,
      isComplete,
      firstMissing: 'garment',
      message: 'Upload a garment photo to begin creating.',
    };
  }

  if (!hasTalent) {
    return {
      hasGarment,
      hasCategory,
      hasTalent,
      hasPoses,
      requiredPoseCount,
      selectedPoseCount,
      isComplete,
      firstMissing: 'talent',
      message: 'Select Your Model from the library.',
    };
  }

  if (!hasCategory) {
    return {
      hasGarment,
      hasCategory,
      hasTalent,
      hasPoses,
      requiredPoseCount,
      selectedPoseCount,
      isComplete,
      firstMissing: 'category',
      message: 'Select what type of garment this is.',
    };
  }

  if (!hasPoses) {
    return {
      hasGarment,
      hasCategory,
      hasTalent,
      hasPoses,
      requiredPoseCount,
      selectedPoseCount,
      isComplete,
      firstMissing: 'poses',
      message:
        requiredPoseCount === 1
          ? 'Choose a pose for your shoot.'
          : `Choose ${requiredPoseCount} poses for your shoot.`,
    };
  }

  return {
    hasGarment,
    hasCategory,
    hasTalent,
    hasPoses,
    requiredPoseCount,
    selectedPoseCount,
    isComplete,
    firstMissing: null,
    message: null,
  };
}

export function canGenerateStudioWorkflow(
  workflow: StudioWorkflow,
  gate: StudioGenerateGate,
): boolean {
  return validateStudioWorkflow(workflow).isComplete
    && !gate.limitBlocked
    && !gate.isPending
    && !gate.isProcessing;
}

export function buildGenerationRequest(
  workflow: StudioWorkflow,
  identity: StudioIdentityPayload | undefined,
) {
  return {
    sourceImageUrl: workflow.sourceImageUrl,
    modelPersona: 'confident_commercial' as const,
    locationEnvironment: 'photo_studio' as const,
    garmentPlacement: workflow.garmentPlacement as never,
    ...(workflow.garmentPlacement === 'full_body'
      ? { garmentLengthSelection: workflow.garmentLengthSelection as never }
      : {}),
    modelIdentityId: workflow.talentId || undefined,
    modelGender: identity?.gender as never,
    modelAgeRange: identity?.ageGroup as never,
    smartLighting: true,
    imageDimensions: 'portrait_45' as const,
    imageCount: resolveWorkflowImageCount(workflow),
    ...(workflow.customCampaign ? { customCampaign: true as const } : {}),
    ...(workflow.usedPoses && workflow.usedPoses.length > 0
      ? { usedPoses: workflow.usedPoses }
      : {}),
  };
}

export function buildRefinementRequest(
  workflow: StudioWorkflow,
  identity: StudioIdentityPayload | undefined,
  input: {
    parentRenderId: number;
    refinementType: 'remove_background' | 'enhance_model_face' | 'enhance_garment';
  },
) {
  return {
    ...buildGenerationRequest(workflow, identity),
    parentRenderId: input.parentRenderId,
    refinementType: input.refinementType,
  };
}

function storageKey(userId: number): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function clearLegacyKeysForUser(userId: number): void {
  try {
    sessionStorage.removeItem(`${LEGACY_TALENT_KEY_PREFIX}:${userId}`);
    sessionStorage.removeItem(`${LEGACY_DRAFT_KEY_PREFIX}:${userId}`);
  } catch {
    /* sessionStorage unavailable */
  }
}

export function clearStoredStudioWorkflow(userId: number | null): void {
  if (userId == null) return;

  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    /* sessionStorage unavailable */
  }
}

/** Remove pre-isolation keys so workflow state cannot leak across Studios */
export function clearLegacyStudioWorkflowStorage(): void {
  try {
    sessionStorage.removeItem(LEGACY_GLOBAL_TALENT_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}

/** Destroy persisted draft and legacy keys for a Studio (logout / new photoshoot). */
export function destroyStoredStudioWorkflow(userId: number | null): void {
  clearStoredStudioWorkflow(userId);
  if (userId != null) {
    clearLegacyKeysForUser(userId);
  }
  clearLegacyStudioWorkflowStorage();
}
