/**
 * Studio Credit Engine — single source of truth for all Studio Credit costs.
 * Do not duplicate these values elsewhere in the application.
 */
export const StudioCreditRules = {
  hero: 1,
  campaign: 2,
  editorial: 4,
  refine: 1,
  regenerate: 1,
} as const;

export type GenerationType = 'hero' | 'campaign' | 'editorial';

export type CreditAction = keyof typeof StudioCreditRules;

export type ImageCount = 1 | 2 | 4;
