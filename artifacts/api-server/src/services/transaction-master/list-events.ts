import { loadCreativeActivityEvents } from "./load-creative.js";
import { loadCreditExpirationEvents } from "./load-expiration.js";
import { loadCreditGrantEvents } from "./load-grants.js";
import { loadPromotionConfigEvents } from "./load-promotions.js";
import { loadCommercialSubscriptionEvents } from "./load-subscriptions.js";
import { loadCreditUsageEvents } from "./load-usage.js";
import type {
  TransactionMasterEvent,
  TransactionMasterEventKind,
  TransactionMasterListFilters,
} from "./types.js";

const ALL_KINDS: readonly TransactionMasterEventKind[] = [
  "credit_grant",
  "credit_usage",
  "credit_expiration",
  "creative_activity",
  "commercial_subscription",
  "promotion_config",
];

function wants(
  kinds: readonly TransactionMasterEventKind[] | undefined,
  kind: TransactionMasterEventKind,
): boolean {
  const selected = kinds ?? ALL_KINDS;
  return selected.includes(kind);
}

/**
 * Unified chronological event stream from existing authoritative tables.
 * Does not invent ledger rows for expiry or promotions.
 */
export async function listEvents(
  filters: TransactionMasterListFilters = {},
): Promise<TransactionMasterEvent[]> {
  const kinds = filters.eventKinds;
  const loaders: Array<Promise<TransactionMasterEvent[]>> = [];

  if (wants(kinds, "credit_grant")) {
    loaders.push(loadCreditGrantEvents(filters));
  }
  if (wants(kinds, "credit_usage")) {
    loaders.push(loadCreditUsageEvents(filters));
  }
  if (wants(kinds, "credit_expiration")) {
    loaders.push(loadCreditExpirationEvents(filters));
  }
  if (wants(kinds, "creative_activity")) {
    loaders.push(loadCreativeActivityEvents(filters));
  }
  if (wants(kinds, "commercial_subscription")) {
    loaders.push(loadCommercialSubscriptionEvents(filters));
  }
  if (wants(kinds, "promotion_config")) {
    loaders.push(loadPromotionConfigEvents(filters));
  }

  const batches = await Promise.all(loaders);
  return batches.flat().sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
