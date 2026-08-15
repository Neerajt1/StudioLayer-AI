/** Audit reason codes for every Studio Credit transaction. */
export const StudioCreditReasonCode = {
  HERO_GENERATION: 'hero_generation',
  CAMPAIGN_GENERATION: 'campaign_generation',
  EDITORIAL_GENERATION: 'editorial_generation',
  REFINE: 'refine',
  REGENERATE: 'regenerate',
  TRANSPARENT_DOWNLOAD: 'transparent_download',
  MEMBERSHIP_ALLOCATION: 'membership_allocation',
  /** Historical Basic → Pro upgrade lot (+120). Not granted in V1. */
  MEMBERSHIP_UPGRADE_ALLOCATION: 'membership_upgrade_allocation',
  TOP_UP_ALLOCATION: 'top_up_allocation',
  STUDIO_PASS_ALLOCATION: 'studio_pass_allocation',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
} as const;

export type StudioCreditReasonCodeValue =
  (typeof StudioCreditReasonCode)[keyof typeof StudioCreditReasonCode];

/** Reason codes that represent Studio Credit consumption (deductions). */
export const STUDIO_CREDIT_USAGE_REASON_CODES: readonly StudioCreditReasonCodeValue[] = [
  StudioCreditReasonCode.HERO_GENERATION,
  StudioCreditReasonCode.CAMPAIGN_GENERATION,
  StudioCreditReasonCode.EDITORIAL_GENERATION,
  StudioCreditReasonCode.REFINE,
  StudioCreditReasonCode.REGENERATE,
  StudioCreditReasonCode.TRANSPARENT_DOWNLOAD,
] as const;
