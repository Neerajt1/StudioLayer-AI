/**
 * Studio Credit Engine — single source of truth for all Studio Credit costs.
 * Do not duplicate these values elsewhere in the application.
 */
export const StudioCreditRules = {
  hero: 1,
  editorial: 2,
  campaign: 4,
  refine: 1,
  regenerate: 1,
} as const;

export type GenerationType = 'hero' | 'campaign' | 'editorial';

export type CreditAction = keyof typeof StudioCreditRules;

export type ImageCount = 1 | 2 | 4;

/** Custom Campaign — variable batch size (Phase 3). */
export const CUSTOM_CAMPAIGN_MIN = 4;
export const CUSTOM_CAMPAIGN_MAX = 20;
