import { classifyCommercialCreditHead } from "./credit-heads.js";
import type {
  CreditUsageEvent,
  CreditUsageFundedBy,
  StudioMembershipPlan,
} from "./types.js";

export interface CreditUsageProjectionRow {
  transactionId: string;
  status: string;
  amount: number;
  reasonCode: string;
  createdAt: Date;
  customerId: number;
  customerName: string;
  customerEmail: string;
  renderId: number | null;
  generationSessionId: string | null;
  generationType: string | null;
  refinementType: string | null;
  renderStatus: string | null;
  fundedBy: CreditUsageFundedBy[];
}

export interface FundedByProjectionInput {
  allocationId: number;
  amount: number;
  reasonCode: string;
  expiresAt: Date | null;
  sourceReference: string | null;
  studioPlan: StudioMembershipPlan | null;
  subscriptionTier: string | null;
}

export function projectFundedByEntry(
  input: FundedByProjectionInput,
): CreditUsageFundedBy {
  return {
    allocationId: input.allocationId,
    amount: input.amount,
    commercialCreditHead: classifyCommercialCreditHead({
      reasonCode: input.reasonCode,
      studioPlan: input.studioPlan,
      allocationSourceReference: input.sourceReference,
      subscriptionTier: input.subscriptionTier,
    }),
    reasonCode: input.reasonCode,
    expiresAt: input.expiresAt,
  };
}

export function projectCreditUsageEvent(
  row: CreditUsageProjectionRow,
): CreditUsageEvent {
  return {
    eventKind: "credit_usage",
    occurredAt: row.createdAt,
    transactionId: row.transactionId,
    status: row.status,
    amount: Math.abs(row.amount),
    reasonCode: row.reasonCode,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    renderId: row.renderId,
    generationSessionId: row.generationSessionId,
    generationType: row.generationType,
    refinementType: row.refinementType,
    renderStatus: row.renderStatus,
    fundedBy: row.fundedBy,
  };
}
