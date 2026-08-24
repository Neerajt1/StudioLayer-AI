import { loadCreditExpirationEvents } from "./load-expiration.js";
import { loadCreditGrantEvents } from "./load-grants.js";
import { loadCreditUsageEvents } from "./load-usage.js";
import {
  summarizeCreditExpirations,
  summarizeCreditGrants,
  summarizeCreditUsage,
} from "./summarize.js";
import type {
  CreditsSummary,
  ExpirationSummary,
  TransactionMasterListFilters,
  UsageSummary,
} from "./types.js";

export async function summarizeCredits(
  filters: TransactionMasterListFilters = {},
): Promise<CreditsSummary> {
  const grants = await loadCreditGrantEvents(filters);
  return summarizeCreditGrants(grants);
}

export async function summarizeUsage(
  filters: TransactionMasterListFilters = {},
): Promise<UsageSummary> {
  const usage = await loadCreditUsageEvents(filters);
  return summarizeCreditUsage(usage);
}

export async function summarizeExpiration(
  filters: TransactionMasterListFilters = {},
): Promise<ExpirationSummary> {
  const expirations = await loadCreditExpirationEvents(filters);
  return summarizeCreditExpirations(expirations);
}
