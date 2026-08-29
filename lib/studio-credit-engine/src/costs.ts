import {
  CUSTOM_CAMPAIGN_MAX,
  CUSTOM_CAMPAIGN_MIN,
  StudioCreditRules,
  type GenerationType,
  type ImageCount,
} from './rules';
import {
  DEFAULT_OUTPUT_RESOLUTION,
  OUTPUT_RESOLUTIONS,
  resolutionCreditMultiplier,
  type OutputResolution,
} from './resolution';
import {
  StudioCreditReasonCode,
  type StudioCreditReasonCodeValue,
} from './reason-codes';
import { toCreditMinorUnits } from './credit-units';

export function imageCountToGenerationType(imageCount: ImageCount): GenerationType {
  if (imageCount === 2) return 'editorial';
  if (imageCount === 4) return 'campaign';
  return 'hero';
}

/**
 * Corrects the pre-15aacc7 inverted mapping on historical Gallery shoots.
 *
 * Only the contradictory pairs are rewritten:
 * - 2 roots stored as campaign → editorial
 * - 4 roots stored as editorial → campaign
 *
 * Hero, already-consistent pairs, and Custom Campaign counts (campaign + 4–20)
 * are left unchanged. Does not inspect credit amounts.
 */
export function reconcileLegacyShootGenerationType(
  generationType: GenerationType,
  rootImageCount: number,
): GenerationType {
  if (generationType === 'hero') return generationType;
  if (generationType === 'campaign' && rootImageCount === 2) return 'editorial';
  if (generationType === 'editorial' && rootImageCount === 4) return 'campaign';
  return generationType;
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

/** Studio Tools — Remove Background is a flat per-operation charge. */
export function creditCostForRemoveBackground(): number {
  return StudioCreditRules.removeBackground;
}

/** Per-image generation price at a resolution — 2K = 1.5, 4K = 3. */
export function creditCostPerImageAtResolution(
  resolution: OutputResolution = DEFAULT_OUTPUT_RESOLUTION,
): number {
  return (
    StudioCreditRules.hero * resolutionCreditMultiplier(resolution)
  );
}

/**
 * Cheapest generation a customer can currently buy — one image at the least
 * expensive resolution.
 *
 * This is the entitlement floor for "can this account generate at all". It is
 * derived from the price table rather than written down, so it follows the
 * canonical economics automatically and cannot drift into a second threshold.
 * Refine, Regenerate and Remove Background are act-on-existing-image tools, not
 * generation, and are deliberately excluded — they are gated by their own cost.
 */
export function minimumGenerationCreditCost(): number {
  return Math.min(
    ...OUTPUT_RESOLUTIONS.map((resolution) =>
      creditCostPerImageAtResolution(resolution),
    ),
  );
}

/**
 * Whether a balance can fund any generation at all.
 *
 * The per-request check in the credit service remains authoritative for a
 * specific shoot; this answers the global availability question the Workspace,
 * Gallery and Account surfaces ask before a shoot is chosen.
 */
export function canGenerateWithStudioCredits(remainingCredits: number): boolean {
  if (!Number.isFinite(remainingCredits)) {
    return remainingCredits === Number.POSITIVE_INFINITY;
  }
  return remainingCredits >= minimumGenerationCreditCost();
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

// ---------------------------------------------------------------------------
// Minor-unit accounting API
//
// Every value that will be persisted or compared against a stored balance must
// go through these. Credit-denominated functions above are for display and for
// callers that immediately convert at the database boundary.
// ---------------------------------------------------------------------------

/** Total request cost in stored minor units. */
export function resolveGenerationCreditCostMinorUnits(input: {
  imageCount: number;
  customCampaign?: boolean;
  isRefinement?: boolean;
  isRegenerate?: boolean;
  outputResolution?: OutputResolution;
}): number {
  return toCreditMinorUnits(resolveGenerationCreditCost(input));
}

/**
 * Per-completed-image charge in stored minor units.
 *
 * Derived from the batch total so that the sum of per-image charges can never
 * exceed the amount held: 1.5 credits is 150 units, and four of them are
 * exactly 600, with no rounding residue.
 */
export function creditCostPerCompletedImageInBatchMinorUnits(input: {
  imageCount: number;
  customCampaign?: boolean;
  isRefinement?: boolean;
  outputResolution?: OutputResolution;
}): number {
  return toCreditMinorUnits(creditCostPerCompletedImageInBatch(input));
}

export function creditCostForRemoveBackgroundMinorUnits(): number {
  return toCreditMinorUnits(creditCostForRemoveBackground());
}
