import { and, eq, gte, lte } from "drizzle-orm";
import { db, studioRazorpaySubscriptionsTable, usersTable } from "@workspace/db";
import { projectCommercialSubscriptionEvent } from "./project-subscriptions.js";
import type {
  CommercialSubscriptionEvent,
  TransactionMasterListFilters,
} from "./types.js";

export async function loadCommercialSubscriptionEvents(
  filters: TransactionMasterListFilters = {},
): Promise<CommercialSubscriptionEvent[]> {
  const conditions = [];

  if (filters.customerId != null) {
    conditions.push(eq(studioRazorpaySubscriptionsTable.userId, filters.customerId));
  }
  if (filters.excludeAdmins !== false && filters.customerId == null) {
    conditions.push(eq(usersTable.isAdmin, false));
  }
  if (filters.from) {
    conditions.push(
      gte(studioRazorpaySubscriptionsTable.createdAt, filters.from),
    );
  }
  if (filters.to) {
    conditions.push(lte(studioRazorpaySubscriptionsTable.createdAt, filters.to));
  }

  const rows = await db
    .select({
      createdAt: studioRazorpaySubscriptionsTable.createdAt,
      customerId: usersTable.id,
      customerName: usersTable.name,
      customerEmail: usersTable.email,
      razorpaySubscriptionId:
        studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
      razorpayPlanId: studioRazorpaySubscriptionsTable.razorpayPlanId,
      studioPlan: studioRazorpaySubscriptionsTable.studioPlan,
      studioTier: studioRazorpaySubscriptionsTable.studioTier,
      status: studioRazorpaySubscriptionsTable.status,
      currentStart: studioRazorpaySubscriptionsTable.currentStart,
      currentEnd: studioRazorpaySubscriptionsTable.currentEnd,
      latestPaymentId: studioRazorpaySubscriptionsTable.latestPaymentId,
      latestInvoiceId: studioRazorpaySubscriptionsTable.latestInvoiceId,
    })
    .from(studioRazorpaySubscriptionsTable)
    .innerJoin(
      usersTable,
      eq(studioRazorpaySubscriptionsTable.userId, usersTable.id),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map(projectCommercialSubscriptionEvent);
}
