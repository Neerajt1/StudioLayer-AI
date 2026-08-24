/**
 * Transaction Master — public contracts.
 * Reports consume these types; they must not depend on DB row shapes.
 */

export type CommercialCreditHead =
  | "studio_basic"
  | "studio_pro"
  | "top_up"
  | "studio_pass"
  | "promotional"
  | "unknown";

/** Real commercial heads only — excludes reporting-only `unknown`. */
export const COMMERCIAL_CREDIT_HEADS = [
  "studio_basic",
  "studio_pro",
  "top_up",
  "studio_pass",
  "promotional",
] as const satisfies readonly Exclude<CommercialCreditHead, "unknown">[];

export type TransactionMasterEventKind =
  | "credit_grant"
  | "credit_usage"
  | "credit_expiration"
  | "creative_activity"
  | "commercial_subscription"
  | "promotion_config";

export type StudioMembershipPlan = "basic" | "pro";

export type ExpirationProjectionStatus = "scheduled" | "expired_unused";

export interface TransactionMasterCustomerRef {
  customerId: number;
  customerName: string;
  customerEmail: string;
}

export interface TransactionMasterDateRangeFilter {
  from?: Date;
  to?: Date;
}

export interface TransactionMasterListFilters extends TransactionMasterDateRangeFilter {
  customerId?: number;
  eventKinds?: readonly TransactionMasterEventKind[];
  /** When true (default), exclude admin users from platform-wide reads. */
  excludeAdmins?: boolean;
}

export interface CreditGrantEvent {
  eventKind: "credit_grant";
  occurredAt: Date;
  transactionId: string;
  status: string;
  amount: number;
  reasonCode: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  allocationId: number | null;
  sourceReference: string | null;
  originalAmount: number | null;
  remainingAmount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  allocationStatus: string | null;
  commercialCreditHead: CommercialCreditHead;
  studioPlan: StudioMembershipPlan | null;
}

export interface CreditUsageFundedBy {
  allocationId: number;
  amount: number;
  commercialCreditHead: CommercialCreditHead;
  reasonCode: string;
  expiresAt: Date | null;
}

export interface CreditUsageEvent {
  eventKind: "credit_usage";
  occurredAt: Date;
  transactionId: string;
  status: string;
  amount: number;
  reasonCode: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  renderId: number | null;
  generationSessionId: string | null;
  generationType: string | null;
  refinementType: string | null;
  /** Render row status when renderId resolves; null if no linked render. */
  renderStatus: string | null;
  fundedBy: CreditUsageFundedBy[];
}

export interface CreditExpirationEvent {
  eventKind: "credit_expiration";
  occurredAt: Date;
  expiresAt: Date;
  creditsUnused: number;
  allocationId: number;
  customerId: number;
  customerName: string;
  customerEmail: string;
  commercialCreditHead: CommercialCreditHead;
  allocationStatus: string;
  expirationStatus: ExpirationProjectionStatus;
  reasonCode: string;
  sourceReference: string;
  studioPlan: StudioMembershipPlan | null;
}

export interface CreativeActivityEvent {
  eventKind: "creative_activity";
  occurredAt: Date;
  customerId: number;
  customerName: string;
  customerEmail: string;
  renderId: number;
  generationSessionId: string | null;
  generationType: string;
  refinementType: string | null;
  status: string;
  studioCreditsUsed: number;
  refinementCount: number;
  deletedAt: Date | null;
}

export interface CommercialSubscriptionEvent {
  eventKind: "commercial_subscription";
  occurredAt: Date;
  customerId: number;
  customerName: string;
  customerEmail: string;
  razorpaySubscriptionId: string;
  razorpayPlanId: string;
  studioPlan: StudioMembershipPlan | null;
  studioTier: string;
  status: string;
  currentStart: Date | null;
  currentEnd: Date | null;
  latestPaymentId: string | null;
  latestInvoiceId: string | null;
}

export interface PromotionConfigEvent {
  eventKind: "promotion_config";
  occurredAt: Date;
  promotionId: number;
  name: string;
  message: string;
  startAt: Date;
  endAt: Date;
  badgeLabel: string;
  bonusCredits: number | null;
  bonusCreditsExpiresAt: Date | null;
  enabled: boolean;
}

export type TransactionMasterEvent =
  | CreditGrantEvent
  | CreditUsageEvent
  | CreditExpirationEvent
  | CreativeActivityEvent
  | CommercialSubscriptionEvent
  | PromotionConfigEvent;

export interface CreditsSummary {
  studioBasicCredits: number;
  studioProCredits: number;
  topUpCredits: number;
  studioPassCredits: number;
  promotionalCredits: number;
  /** Sum of the five real commercial heads only. */
  totalCreditsAdded: number;
  /** Positive grants that could not be classified — never folded into totals. */
  unknownCredits: number;
}

export interface UsageSummary {
  /** Absolute Studio Credits from completed usage transactions. */
  creditsConsumed: number;
  /** Credit amount from generation reason codes only. */
  generationCredits: number;
  /** Credit amount from refine/regenerate reason codes only. */
  editCredits: number;
  usageEvents: number;
  /**
   * Count of completed hero/campaign/editorial generation transactions.
   * Matches Admin Generations / billing-cycle ledger definitions.
   */
  totalGenerations: number;
  /**
   * Images implied by generation reason codes via studio-credit-engine
   * (`imagesCreatedForReasonCode`).
   */
  imagesCreated: number;
  /** Count of completed refine + regenerate transactions. */
  editsMade: number;
  fundedByHead: {
    studioBasicCredits: number;
    studioProCredits: number;
    topUpCredits: number;
    studioPassCredits: number;
    promotionalCredits: number;
    unknownCredits: number;
  };
}

export interface ExpirationSummary {
  totalCreditsExpiring: number;
  customersAffected: number;
  scheduledCredits: number;
  expiredUnusedCredits: number;
  byDate: Array<{
    date: string;
    creditsExpiring: number;
    customersAffected: number;
  }>;
}

export interface CustomerStatementProjection {
  customer: TransactionMasterCustomerRef & {
    subscriptionTier: string;
    isAdmin: boolean;
  };
  generatedAt: Date;
  grants: CreditGrantEvent[];
  usage: CreditUsageEvent[];
  expirations: CreditExpirationEvent[];
  creativeActivity: CreativeActivityEvent[];
  subscriptions: CommercialSubscriptionEvent[];
  creditsSummary: CreditsSummary;
  usageSummary: UsageSummary;
  expirationSummary: ExpirationSummary;
}
