import { StudioCreditAllocationStatus } from "@workspace/studio-credit-engine";
import { classifyCommercialCreditHead } from "./credit-heads.js";
import type {
  CreditExpirationEvent,
  ExpirationProjectionStatus,
  StudioMembershipPlan,
} from "./types.js";

export interface CreditExpirationProjectionRow {
  allocationId: number;
  expiresAt: Date;
  remainingAmount: number;
  status: string;
  reasonCode: string;
  sourceReference: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  subscriptionTier: string;
  studioPlan: StudioMembershipPlan | null;
}

export function classifyExpirationProjectionStatus(
  status: string,
): ExpirationProjectionStatus | null {
  if (status === StudioCreditAllocationStatus.ACTIVE) return "scheduled";
  if (status === StudioCreditAllocationStatus.EXPIRED) return "expired_unused";
  return null;
}

export function projectCreditExpirationEvent(
  row: CreditExpirationProjectionRow,
): CreditExpirationEvent | null {
  // Any positive remainder is unused credit worth reporting. This was `< 1`
  // when balances were whole credits; under fractional credits that silently
  // dropped lots with, say, 0.5 left.
  if (row.remainingAmount <= 0 || !row.expiresAt) return null;
  const expirationStatus = classifyExpirationProjectionStatus(row.status);
  if (!expirationStatus) return null;

  return {
    eventKind: "credit_expiration",
    occurredAt: row.expiresAt,
    expiresAt: row.expiresAt,
    creditsUnused: row.remainingAmount,
    allocationId: row.allocationId,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    commercialCreditHead: classifyCommercialCreditHead({
      reasonCode: row.reasonCode,
      studioPlan: row.studioPlan,
      allocationSourceReference: row.sourceReference,
      subscriptionTier: row.subscriptionTier,
    }),
    allocationStatus: row.status,
    expirationStatus,
    reasonCode: row.reasonCode,
    sourceReference: row.sourceReference,
    studioPlan: row.studioPlan,
  };
}
