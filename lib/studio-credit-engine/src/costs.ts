import {
  StudioCreditRules,
  type GenerationType,
  type ImageCount,
} from './rules';
import {
  StudioCreditReasonCode,
  type StudioCreditReasonCodeValue,
} from './reason-codes';

export function imageCountToGenerationType(imageCount: ImageCount): GenerationType {
  if (imageCount === 4) return 'editorial';
  if (imageCount === 2) return 'campaign';
  return 'hero';
}

export function creditCostForGenerationType(generationType: GenerationType): number {
  return StudioCreditRules[generationType];
}

export function creditCostForImageCount(imageCount: ImageCount): number {
  return creditCostForGenerationType(imageCountToGenerationType(imageCount));
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
