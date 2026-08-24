import { classifyCommercialCreditHead } from "./credit-heads.js";
import type {
  CreditGrantEvent,
  StudioMembershipPlan,
} from "./types.js";

export interface CreditGrantProjectionRow {
  transactionId: string;
  status: string;
  amount: number;
  reasonCode: string;
  createdAt: Date;
  customerId: number;
  customerName: string;
  customerEmail: string;
  subscriptionTier: string;
  allocationId: number | null;
  sourceReference: string | null;
  originalAmount: number | null;
  remainingAmount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  allocationStatus: string | null;
  studioPlan: StudioMembershipPlan | null;
}

export function projectCreditGrantEvent(
  row: CreditGrantProjectionRow,
): CreditGrantEvent {
  const commercialCreditHead = classifyCommercialCreditHead({
    reasonCode: row.reasonCode,
    studioPlan: row.studioPlan,
    allocationSourceReference: row.sourceReference,
    subscriptionTier: row.subscriptionTier,
  });

  return {
    eventKind: "credit_grant",
    occurredAt: row.createdAt,
    transactionId: row.transactionId,
    status: row.status,
    amount: row.amount,
    reasonCode: row.reasonCode,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    allocationId: row.allocationId,
    sourceReference: row.sourceReference,
    originalAmount: row.originalAmount,
    remainingAmount: row.remainingAmount,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    allocationStatus: row.allocationStatus,
    commercialCreditHead,
    studioPlan: row.studioPlan,
  };
}
