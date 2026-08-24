import { isStudioMembershipPlanId } from "./credit-heads.js";
import type { CommercialSubscriptionEvent } from "./types.js";

export interface CommercialSubscriptionProjectionRow {
  createdAt: Date;
  customerId: number;
  customerName: string;
  customerEmail: string;
  razorpaySubscriptionId: string;
  razorpayPlanId: string;
  studioPlan: string;
  studioTier: string;
  status: string;
  currentStart: Date | null;
  currentEnd: Date | null;
  latestPaymentId: string | null;
  latestInvoiceId: string | null;
}

export function projectCommercialSubscriptionEvent(
  row: CommercialSubscriptionProjectionRow,
): CommercialSubscriptionEvent {
  return {
    eventKind: "commercial_subscription",
    occurredAt: row.currentStart ?? row.createdAt,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    razorpaySubscriptionId: row.razorpaySubscriptionId,
    razorpayPlanId: row.razorpayPlanId,
    studioPlan: isStudioMembershipPlanId(row.studioPlan) ? row.studioPlan : null,
    studioTier: row.studioTier,
    status: row.status,
    currentStart: row.currentStart,
    currentEnd: row.currentEnd,
    latestPaymentId: row.latestPaymentId,
    latestInvoiceId: row.latestInvoiceId,
  };
}
