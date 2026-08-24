import {
  StudioCreditReasonCode,
  computeBillingCycleLedgerStats,
  type StudioCreditReasonCodeValue,
} from "@workspace/studio-credit-engine";
import {
  accumulateCreditsSummary,
  emptyCreditsSummary,
} from "./credit-heads.js";
import type {
  CreditExpirationEvent,
  CreditGrantEvent,
  CreditUsageEvent,
  CreditsSummary,
  ExpirationSummary,
  UsageSummary,
} from "./types.js";

const GENERATION_REASON_CODES = new Set<string>([
  StudioCreditReasonCode.HERO_GENERATION,
  StudioCreditReasonCode.CAMPAIGN_GENERATION,
  StudioCreditReasonCode.EDITORIAL_GENERATION,
]);

const EDIT_REASON_CODES = new Set<string>([
  StudioCreditReasonCode.REFINE,
  StudioCreditReasonCode.REGENERATE,
]);

function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function summarizeCreditGrants(
  grants: readonly CreditGrantEvent[],
): CreditsSummary {
  const summary = emptyCreditsSummary();
  for (const grant of grants) {
    accumulateCreditsSummary(summary, grant.commercialCreditHead, grant.amount);
  }
  return summary;
}

/**
 * Canonical usage summary — same definitions as the former Admin Generations
 * `deriveLedgerUsageMetrics` (ledger reason codes + studio-credit-engine image counts).
 */
export function summarizeCreditUsage(
  usage: readonly CreditUsageEvent[],
): UsageSummary {
  const fundedByHead = {
    studioBasicCredits: 0,
    studioProCredits: 0,
    topUpCredits: 0,
    studioPassCredits: 0,
    promotionalCredits: 0,
    unknownCredits: 0,
  };

  let creditsConsumed = 0;
  let generationCredits = 0;
  let editCredits = 0;
  let totalGenerations = 0;
  let editsMade = 0;

  for (const event of usage) {
    creditsConsumed += event.amount;
    if (GENERATION_REASON_CODES.has(event.reasonCode)) {
      generationCredits += event.amount;
      totalGenerations += 1;
    } else if (EDIT_REASON_CODES.has(event.reasonCode)) {
      editCredits += event.amount;
      editsMade += 1;
    }

    for (const funded of event.fundedBy) {
      switch (funded.commercialCreditHead) {
        case "studio_basic":
          fundedByHead.studioBasicCredits += funded.amount;
          break;
        case "studio_pro":
          fundedByHead.studioProCredits += funded.amount;
          break;
        case "top_up":
          fundedByHead.topUpCredits += funded.amount;
          break;
        case "studio_pass":
          fundedByHead.studioPassCredits += funded.amount;
          break;
        case "promotional":
          fundedByHead.promotionalCredits += funded.amount;
          break;
        case "unknown":
          fundedByHead.unknownCredits += funded.amount;
          break;
      }
    }
  }

  const ledgerStats = computeBillingCycleLedgerStats({
    studioCreditsUsed: creditsConsumed,
    transactions: usage.map((event) => ({
      reasonCode: event.reasonCode as StudioCreditReasonCodeValue,
    })),
  });

  return {
    creditsConsumed,
    generationCredits,
    editCredits,
    usageEvents: usage.length,
    totalGenerations,
    imagesCreated: ledgerStats.imagesCreated,
    editsMade,
    fundedByHead,
  };
}

export function summarizeCreditExpirations(
  expirations: readonly CreditExpirationEvent[],
): ExpirationSummary {
  const byDate = new Map<
    string,
    { creditsExpiring: number; customerIds: Set<number> }
  >();
  const customers = new Set<number>();
  let totalCreditsExpiring = 0;
  let scheduledCredits = 0;
  let expiredUnusedCredits = 0;

  for (const event of expirations) {
    totalCreditsExpiring += event.creditsUnused;
    customers.add(event.customerId);
    if (event.expirationStatus === "scheduled") {
      scheduledCredits += event.creditsUnused;
    } else {
      expiredUnusedCredits += event.creditsUnused;
    }

    const date = utcDateKey(event.expiresAt);
    const bucket = byDate.get(date) ?? {
      creditsExpiring: 0,
      customerIds: new Set<number>(),
    };
    bucket.creditsExpiring += event.creditsUnused;
    bucket.customerIds.add(event.customerId);
    byDate.set(date, bucket);
  }

  return {
    totalCreditsExpiring,
    customersAffected: customers.size,
    scheduledCredits,
    expiredUnusedCredits,
    byDate: [...byDate.keys()].sort().map((date) => ({
      date,
      creditsExpiring: byDate.get(date)!.creditsExpiring,
      customersAffected: byDate.get(date)!.customerIds.size,
    })),
  };
}
