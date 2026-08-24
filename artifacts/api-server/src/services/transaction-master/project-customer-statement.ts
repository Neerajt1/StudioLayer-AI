import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { loadCreativeActivityEvents } from "./load-creative.js";
import { loadCreditExpirationEvents } from "./load-expiration.js";
import { loadCreditGrantEvents } from "./load-grants.js";
import { loadCommercialSubscriptionEvents } from "./load-subscriptions.js";
import { loadCreditUsageEvents } from "./load-usage.js";
import {
  summarizeCreditExpirations,
  summarizeCreditGrants,
  summarizeCreditUsage,
} from "./summarize.js";
import type {
  CustomerStatementProjection,
  TransactionMasterDateRangeFilter,
} from "./types.js";

/**
 * Shared customer statement projection contract.
 * Does NOT replace the existing Account Statement Excel implementation.
 */
export async function getCustomerStatement(
  userId: number,
  filters: TransactionMasterDateRangeFilter = {},
): Promise<CustomerStatementProjection> {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      subscriptionTier: usersTable.subscriptionTier,
      isAdmin: usersTable.isAdmin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    throw new Error(`Customer ${userId} not found`);
  }

  const scoped = {
    customerId: userId,
    from: filters.from,
    to: filters.to,
    excludeAdmins: false,
  };

  const [grants, usage, expirations, creativeActivity, subscriptions] =
    await Promise.all([
      loadCreditGrantEvents(scoped),
      loadCreditUsageEvents(scoped),
      loadCreditExpirationEvents(scoped),
      loadCreativeActivityEvents(scoped),
      loadCommercialSubscriptionEvents(scoped),
    ]);

  return {
    customer: {
      customerId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      subscriptionTier: user.subscriptionTier,
      isAdmin: user.isAdmin,
    },
    generatedAt: new Date(),
    grants,
    usage,
    expirations,
    creativeActivity,
    subscriptions,
    creditsSummary: summarizeCreditGrants(grants),
    usageSummary: summarizeCreditUsage(usage),
    expirationSummary: summarizeCreditExpirations(expirations),
  };
}
