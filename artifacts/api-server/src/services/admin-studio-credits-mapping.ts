import type { CreditsSummary } from "./transaction-master/types.js";

export interface AdminStudioCreditsPeriodSummary {
  /** Top-ups, Studio Pass, and membership (incl. unknown membership heads). */
  creditsAdded: number;
  /** Classified Basic + Pro membership only. */
  membershipCreditsGranted: number;
  promotionalCreditsGranted: number;
  creditsConsumed: number;
}

export interface AdminStudioCreditsCreditHeadSummary {
  studioBasicCredits: number;
  studioProCredits: number;
  topUpCredits: number;
  studioPassCredits: number;
  promotionalCredits: number;
  totalCreditsAdded: number;
  /** Reporting-only — never folded into totalCreditsAdded. */
  unknownCredits: number;
}

/**
 * Map Transaction Master credit summary → Admin UI period summary.
 * Credits added = commercial purchased/membership heads + unknown membership,
 * excluding promotional (kept separate), matching prior Admin definition.
 */
export function mapTransactionMasterCreditsToPeriodSummary(
  credits: CreditsSummary,
  creditsConsumed: number,
): AdminStudioCreditsPeriodSummary {
  const membershipCreditsGranted =
    credits.studioBasicCredits + credits.studioProCredits;
  const purchasedCredits = credits.topUpCredits + credits.studioPassCredits;
  return {
    creditsAdded:
      purchasedCredits + membershipCreditsGranted + credits.unknownCredits,
    membershipCreditsGranted,
    promotionalCreditsGranted: credits.promotionalCredits,
    creditsConsumed,
  };
}

export function mapTransactionMasterCreditsToCreditHeads(
  credits: CreditsSummary,
): AdminStudioCreditsCreditHeadSummary {
  return {
    studioBasicCredits: credits.studioBasicCredits,
    studioProCredits: credits.studioProCredits,
    topUpCredits: credits.topUpCredits,
    studioPassCredits: credits.studioPassCredits,
    promotionalCredits: credits.promotionalCredits,
    totalCreditsAdded: credits.totalCreditsAdded,
    unknownCredits: credits.unknownCredits,
  };
}
