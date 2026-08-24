import type { UsageSummary } from "./transaction-master/types.js";

/** Matches prior Admin Generations response shape. */
export interface AdminGenerationsSummary {
  totalGenerations: number;
  imagesCreated: number;
  editsMade: number;
  studioCreditsUsed: number;
}

export function mapTransactionMasterUsageToAdminGenerationsSummary(
  usage: UsageSummary,
): AdminGenerationsSummary {
  return {
    totalGenerations: usage.totalGenerations,
    imagesCreated: usage.imagesCreated,
    editsMade: usage.editsMade,
    studioCreditsUsed: usage.creditsConsumed,
  };
}
