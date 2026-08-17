import {
  STUDIO_CREDIT_USAGE_REASON_CODES,
  StudioCreditReasonCode,
  type StudioCreditReasonCodeValue,
} from './reason-codes';

export interface BillingCycleLedgerStats {
  studioCreditsUsed: number;
  imagesCreated: number;
  averageRefinementsPerImage: number;
}

export interface BillingCycleTransactionRow {
  reasonCode: string;
}

const GENERATION_REASON_CODES: readonly StudioCreditReasonCodeValue[] = [
  StudioCreditReasonCode.HERO_GENERATION,
  StudioCreditReasonCode.CAMPAIGN_GENERATION,
  StudioCreditReasonCode.EDITORIAL_GENERATION,
];

const REFINEMENT_REASON_CODES: readonly StudioCreditReasonCodeValue[] = [
  StudioCreditReasonCode.REFINE,
  StudioCreditReasonCode.REGENERATE,
];

/** Images produced per completed generation transaction — immutable after Gallery delete. */
export function imagesCreatedForReasonCode(
  reasonCode: StudioCreditReasonCodeValue,
): number {
  switch (reasonCode) {
    case StudioCreditReasonCode.HERO_GENERATION:
      return 1;
    case StudioCreditReasonCode.CAMPAIGN_GENERATION:
      return 4;
    case StudioCreditReasonCode.EDITORIAL_GENERATION:
      return 2;
    default:
      return 0;
  }
}

/**
 * Derive billing-cycle creative analytics from completed Studio Credit transactions.
 * Gallery asset deletion must not affect these totals — only the immutable ledger counts.
 */
export function computeBillingCycleLedgerStats(input: {
  studioCreditsUsed: number;
  transactions: readonly BillingCycleTransactionRow[];
}): BillingCycleLedgerStats {
  let imagesCreated = 0;
  let refinementTotal = 0;

  for (const row of input.transactions) {
    const reasonCode = row.reasonCode as StudioCreditReasonCodeValue;
    if (!STUDIO_CREDIT_USAGE_REASON_CODES.includes(reasonCode)) continue;

    if (GENERATION_REASON_CODES.includes(reasonCode)) {
      imagesCreated += imagesCreatedForReasonCode(reasonCode);
      continue;
    }

    if (REFINEMENT_REASON_CODES.includes(reasonCode)) {
      refinementTotal += 1;
    }
  }

  const averageRefinementsPerImage =
    imagesCreated === 0
      ? 0
      : Math.round((refinementTotal / imagesCreated) * 10) / 10;

  return {
    studioCreditsUsed: input.studioCreditsUsed,
    imagesCreated,
    averageRefinementsPerImage,
  };
}
