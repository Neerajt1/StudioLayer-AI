import { inArray } from "drizzle-orm";
import { db, studioRazorpaySubscriptionsTable } from "@workspace/db";
import {
  isStudioMembershipPlanId,
  razorpayInvoiceIdFromSourceReference,
  razorpayPaymentIdFromSourceReference,
  razorpaySubscriptionIdFromSubPeriodSourceReference,
} from "./credit-heads.js";
import type { StudioMembershipPlan } from "./types.js";

/**
 * Resolve Razorpay `studio_plan` for allocation source references.
 * Uses existing subscription rows only — never invents a plan.
 */
export async function loadStudioPlansBySourceReference(
  sourceReferences: readonly string[],
): Promise<Map<string, StudioMembershipPlan>> {
  const paymentIds = new Set<string>();
  const invoiceIds = new Set<string>();
  const subscriptionIds = new Set<string>();

  for (const sourceReference of sourceReferences) {
    const paymentId = razorpayPaymentIdFromSourceReference(sourceReference);
    if (paymentId) paymentIds.add(paymentId);
    const invoiceId = razorpayInvoiceIdFromSourceReference(sourceReference);
    if (invoiceId) invoiceIds.add(invoiceId);
    const subscriptionId =
      razorpaySubscriptionIdFromSubPeriodSourceReference(sourceReference);
    if (subscriptionId) subscriptionIds.add(subscriptionId);
  }

  const planBySourceReference = new Map<string, StudioMembershipPlan>();
  const planBySubscriptionId = new Map<string, StudioMembershipPlan>();
  if (paymentIds.size === 0 && invoiceIds.size === 0 && subscriptionIds.size === 0) {
    return planBySourceReference;
  }

  type SubRow = {
    studioPlan: string;
    latestPaymentId: string | null;
    latestInvoiceId: string | null;
    razorpaySubscriptionId: string;
  };
  const subscriptionRows: SubRow[] = [];

  if (paymentIds.size > 0) {
    subscriptionRows.push(
      ...(await db
        .select({
          studioPlan: studioRazorpaySubscriptionsTable.studioPlan,
          latestPaymentId: studioRazorpaySubscriptionsTable.latestPaymentId,
          latestInvoiceId: studioRazorpaySubscriptionsTable.latestInvoiceId,
          razorpaySubscriptionId:
            studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
        })
        .from(studioRazorpaySubscriptionsTable)
        .where(
          inArray(studioRazorpaySubscriptionsTable.latestPaymentId, [
            ...paymentIds,
          ]),
        )),
    );
  }

  if (invoiceIds.size > 0) {
    subscriptionRows.push(
      ...(await db
        .select({
          studioPlan: studioRazorpaySubscriptionsTable.studioPlan,
          latestPaymentId: studioRazorpaySubscriptionsTable.latestPaymentId,
          latestInvoiceId: studioRazorpaySubscriptionsTable.latestInvoiceId,
          razorpaySubscriptionId:
            studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
        })
        .from(studioRazorpaySubscriptionsTable)
        .where(
          inArray(studioRazorpaySubscriptionsTable.latestInvoiceId, [
            ...invoiceIds,
          ]),
        )),
    );
  }

  if (subscriptionIds.size > 0) {
    subscriptionRows.push(
      ...(await db
        .select({
          studioPlan: studioRazorpaySubscriptionsTable.studioPlan,
          latestPaymentId: studioRazorpaySubscriptionsTable.latestPaymentId,
          latestInvoiceId: studioRazorpaySubscriptionsTable.latestInvoiceId,
          razorpaySubscriptionId:
            studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
        })
        .from(studioRazorpaySubscriptionsTable)
        .where(
          inArray(studioRazorpaySubscriptionsTable.razorpaySubscriptionId, [
            ...subscriptionIds,
          ]),
        )),
    );
  }

  for (const row of subscriptionRows) {
    if (!isStudioMembershipPlanId(row.studioPlan)) continue;
    if (row.latestPaymentId) {
      planBySourceReference.set(`rzp_payment:${row.latestPaymentId}`, row.studioPlan);
    }
    if (row.latestInvoiceId) {
      planBySourceReference.set(`rzp_invoice:${row.latestInvoiceId}`, row.studioPlan);
    }
    planBySubscriptionId.set(row.razorpaySubscriptionId, row.studioPlan);
  }

  for (const sourceReference of sourceReferences) {
    const subscriptionId =
      razorpaySubscriptionIdFromSubPeriodSourceReference(sourceReference);
    if (!subscriptionId) continue;
    const plan = planBySubscriptionId.get(subscriptionId);
    if (plan) planBySourceReference.set(sourceReference, plan);
  }

  return planBySourceReference;
}
