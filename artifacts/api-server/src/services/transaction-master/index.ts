/**
 * StudioLayer Transaction Master — canonical read layer.
 *
 * Existing DB tables remain the source of truth.
 * Reports should eventually consume this module instead of re-classifying
 * reason codes independently.
 *
 * Public API (DB-backed):
 *   listEvents, summarizeCredits, summarizeUsage, summarizeExpiration,
 *   getCustomerStatement
 *
 * Pure projection helpers are also exported for unit testing and future adapters.
 */

export type {
  CommercialCreditHead,
  CommercialSubscriptionEvent,
  CreativeActivityEvent,
  CreditExpirationEvent,
  CreditGrantEvent,
  CreditUsageEvent,
  CreditUsageFundedBy,
  CreditsSummary,
  CustomerStatementProjection,
  ExpirationProjectionStatus,
  ExpirationSummary,
  PromotionConfigEvent,
  StudioMembershipPlan,
  TransactionMasterCustomerRef,
  TransactionMasterDateRangeFilter,
  TransactionMasterEvent,
  TransactionMasterEventKind,
  TransactionMasterListFilters,
  UsageSummary,
} from "./types.js";

export { COMMERCIAL_CREDIT_HEADS } from "./types.js";

export {
  classifyCommercialCreditHead,
  isStudioMembershipPlanId,
  studioMembershipPlanFromTier,
} from "./credit-heads.js";

export { listEvents } from "./list-events.js";
export {
  summarizeCredits,
  summarizeExpiration,
  summarizeUsage,
} from "./summarize-api.js";
export { getCustomerStatement } from "./project-customer-statement.js";

export { loadCreditGrantEvents } from "./load-grants.js";
export { loadCreditUsageEvents } from "./load-usage.js";
export { loadCreditExpirationEvents } from "./load-expiration.js";

export { projectCreditGrantEvent } from "./project-grants.js";
export {
  projectCreditUsageEvent,
  projectFundedByEntry,
} from "./project-usage.js";
export {
  classifyExpirationProjectionStatus,
  projectCreditExpirationEvent,
} from "./project-expiration.js";
export { projectCommercialSubscriptionEvent } from "./project-subscriptions.js";
export { projectCreativeActivityEvent } from "./project-creative.js";
export { projectPromotionConfigEvent } from "./project-promotions.js";
export {
  summarizeCreditExpirations,
  summarizeCreditGrants,
  summarizeCreditUsage,
} from "./summarize.js";
