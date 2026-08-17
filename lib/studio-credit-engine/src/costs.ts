import {
  CUSTOM_CAMPAIGN_MAX,
  CUSTOM_CAMPAIGN_MIN,
  StudioCreditRules,
  type GenerationType,
  type ImageCount,
} from './rules';
import {
  DEFAULT_OUTPUT_RESOLUTION,
  resolutionCreditMultiplier,
  type OutputResolution,
} from './resolution';
import {
  StudioCreditReasonCode,
  type StudioCreditReasonCodeValue,
} from './reason-codes';

export function imageCountToGenerationType(imageCount: ImageCount): GenerationType {
  if (imageCount === 2) return 'editorial';
  if (imageCount === 4) return 'campaign';
  return 'hero';
}

export function creditCostForGenerationType(generationType: GenerationType): number {
  return StudioCreditRules[generationType];
}

export function creditCostForImageCount(imageCount: ImageCount): number {
  return creditCostForGenerationType(imageCountToGenerationType(imageCount));
}

/** Per-image Campaign cost — 2K Campaign is 4 images / 4 credits. */
export function campaignCreditCostPerImage(): number {
  return StudioCreditRules.campaign / 4;
}

export function isValidCustomCampaignImageCount(imageCount: number): boolean {
  return (
    Number.isInteger(imageCount)
    && imageCount >= CUSTOM_CAMPAIGN_MIN
    && imageCount <= CUSTOM_CAMPAIGN_MAX
  );
}

/** Total Studio Credits for a Custom Campaign batch. */
export function creditCostForCustomCampaign(imageCount: number): number {
  return campaignCreditCostPerImage() * imageCount;
}

export function resolveGenerationCreditCost(input: {
  imageCount: number;
  customCampaign?: boolean;
  isRefinement?: boolean;
  isRegenerate?: boolean;
  outputResolution?: OutputResolution;
}): number {
  if (input.isRegenerate || input.isRefinement) return creditCostForRefine();
  const base = input.customCampaign
    ? creditCostForCustomCampaign(input.imageCount)
    : creditCostForImageCount(input.imageCount as ImageCount);
  return base * resolutionCreditMultiplier(input.outputResolution ?? DEFAULT_OUTPUT_RESOLUTION);
}

/** Per-image credit cost within a generation batch (partial-success billing). */
export function creditCostPerCompletedImageInBatch(input: {
  imageCount: number;
  customCampaign?: boolean;
  isRefinement?: boolean;
  outputResolution?: OutputResolution;
}): number {
  if (input.isRefinement) return creditCostForRefine();
  const total = resolveGenerationCreditCost({
    imageCount: input.imageCount,
    customCampaign: input.customCampaign,
    isRefinement: false,
    outputResolution: input.outputResolution,
  });
  return total / input.imageCount;
}

export function creditCostForRefine(): number {
  return StudioCreditRules.refine;
}

export function creditCostForRegenerate(): number {
  return StudioCreditRules.regenerate;
}

/** Studio Tools — transparent PNG download is free (Batch 21). */
export function creditCostForTransparentDownload(): number {
  return 0;
}

export function reasonCodeForTransparentDownload(): StudioCreditReasonCodeValue {
  return StudioCreditReasonCode.TRANSPARENT_DOWNLOAD;
}

/** Credits consumed when one image in a batch completes successfully. */
export function creditCostPerCompletedImage(
  imageCount: ImageCount,
  isRefinement: boolean,
): number {
  if (isRefinement) return creditCostForRefine();
  return creditCostForImageCount(imageCount) / imageCount;
}

export function reasonCodeForGenerationType(
  generationType: GenerationType,
): StudioCreditReasonCodeValue {
  if (generationType === 'editorial') {
    return StudioCreditReasonCode.EDITORIAL_GENERATION;
  }
  if (generationType === 'campaign') {
    return StudioCreditReasonCode.CAMPAIGN_GENERATION;
  }
  return StudioCreditReasonCode.HERO_GENERATION;
}

export function reasonCodeForRefine(): StudioCreditReasonCodeValue {
  return StudioCreditReasonCode.REFINE;
}

export function reasonCodeForRegenerate(): StudioCreditReasonCodeValue {
  return StudioCreditReasonCode.REGENERATE;
}

export function reasonCodeForImageRequest(
  imageCount: ImageCount,
  isRefinement: boolean,
  isRegenerate = false,
): StudioCreditReasonCodeValue {
  if (isRegenerate) return reasonCodeForRegenerate();
  if (isRefinement) return reasonCodeForRefine();
  return reasonCodeForGenerationType(imageCountToGenerationType(imageCount));
}
