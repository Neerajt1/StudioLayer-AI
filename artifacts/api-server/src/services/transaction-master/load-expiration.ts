import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { StudioCreditAllocationStatus } from "@workspace/studio-credit-engine";
import {
  db,
  studioCreditAllocationsTable,
  usersTable,
} from "@workspace/db";
import { projectCreditExpirationEvent } from "./project-expiration.js";
import { loadStudioPlansBySourceReference } from "./razorpay-plan-lookup.js";
import type {
  CreditExpirationEvent,
  TransactionMasterListFilters,
} from "./types.js";

export async function loadCreditExpirationEvents(
  filters: TransactionMasterListFilters = {},
): Promise<CreditExpirationEvent[]> {
  const conditions = [
    isNotNull(studioCreditAllocationsTable.expiresAt),
    gte(studioCreditAllocationsTable.remainingAmount, 1),
    inArray(studioCreditAllocationsTable.status, [
      StudioCreditAllocationStatus.ACTIVE,
      StudioCreditAllocationStatus.EXPIRED,
    ]),
  ];

  if (filters.from) {
    conditions.push(gte(studioCreditAllocationsTable.expiresAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(studioCreditAllocationsTable.expiresAt, filters.to));
  }
  if (filters.customerId != null) {
    conditions.push(eq(studioCreditAllocationsTable.userId, filters.customerId));
  }
  if (filters.excludeAdmins !== false && filters.customerId == null) {
    conditions.push(eq(usersTable.isAdmin, false));
  }

  const rows = await db
    .select({
      allocationId: studioCreditAllocationsTable.id,
      expiresAt: studioCreditAllocationsTable.expiresAt,
      remainingAmount: studioCreditAllocationsTable.remainingAmount,
      status: studioCreditAllocationsTable.status,
      reasonCode: studioCreditAllocationsTable.reasonCode,
      sourceReference: studioCreditAllocationsTable.sourceReference,
      customerId: usersTable.id,
      customerName: usersTable.name,
      customerEmail: usersTable.email,
      subscriptionTier: usersTable.subscriptionTier,
    })
    .from(studioCreditAllocationsTable)
    .innerJoin(usersTable, eq(studioCreditAllocationsTable.userId, usersTable.id))
    .where(and(...conditions));

  const sourceReferences = rows.map((row) => row.sourceReference);
  const planBySource = await loadStudioPlansBySourceReference(sourceReferences);

  const events: CreditExpirationEvent[] = [];
  for (const row of rows) {
    if (!row.expiresAt) continue;
    const projected = projectCreditExpirationEvent({
      ...row,
      expiresAt: row.expiresAt,
      studioPlan: planBySource.get(row.sourceReference) ?? null,
    });
    if (projected) events.push(projected);
  }
  return events;
}
