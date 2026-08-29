/**
 * Studio Credit Engine — single source of truth for all Studio Credit costs.
 * Do not duplicate these values elsewhere in the application.
 *
 * Image generation is priced per image at the base 2K resolution; 4K applies
 * the resolution multiplier in resolution.ts. Hero is one image, Editorial two,
 * Campaign four, so the batch costs below are simply the per-image price times
 * the image count.
 *
 * Refine, Regenerate and Remove Background are flat per-operation prices and
 * are deliberately independent of resolution.
 */
export const IMAGE_GENERATION_CREDITS_PER_IMAGE = 1.5;

export const StudioCreditRules = {
  hero: IMAGE_GENERATION_CREDITS_PER_IMAGE,
  editorial: IMAGE_GENERATION_CREDITS_PER_IMAGE * 2,
  campaign: IMAGE_GENERATION_CREDITS_PER_IMAGE * 4,
  refine: 1,
  regenerate: 1,
  removeBackground: 1,
} as const;

export type GenerationType = 'hero' | 'campaign' | 'editorial';

export type CreditAction = keyof typeof StudioCreditRules;

export type ImageCount = 1 | 2 | 4;

/** Custom Campaign — variable batch size (Phase 3). */
export const CUSTOM_CAMPAIGN_MIN = 4;
export const CUSTOM_CAMPAIGN_MAX = 20;
