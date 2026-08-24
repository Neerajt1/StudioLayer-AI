import { and, eq, gte, gt, lte } from "drizzle-orm";
import { StudioCreditTransactionStatus } from "@workspace/studio-credit-engine";
import {
  db,
  studioCreditAllocationsTable,
  studioCreditTransactionsTable,
  usersTable,
} from "@workspace/db";
import { projectCreditGrantEvent } from "./project-grants.js";
import { loadStudioPlansBySourceReference } from "./razorpay-plan-lookup.js";
import type {
  CreditGrantEvent,
  TransactionMasterListFilters,
} from "./types.js";

export async function loadCreditGrantEvents(
  filters: TransactionMasterListFilters = {},
): Promise<CreditGrantEvent[]> {
  const conditions = [
    eq(
      studioCreditTransactionsTable.status,
      StudioCreditTransactionStatus.COMPLETED,
    ),
    gt(studioCreditTransactionsTable.amount, 0),
  ];

  if (filters.from) {
    conditions.push(gte(studioCreditTransactionsTable.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(studioCreditTransactionsTable.createdAt, filters.to));
  }
  if (filters.customerId != null) {
    conditions.push(eq(studioCreditTransactionsTable.userId, filters.customerId));
  }
  if (filters.excludeAdmins !== false && filters.customerId == null) {
    conditions.push(eq(usersTable.isAdmin, false));
  }

  const rows = await db
    .select({
      transactionId: studioCreditTransactionsTable.transactionId,
      status: studioCreditTransactionsTable.status,
      amount: studioCreditTransactionsTable.amount,
      reasonCode: studioCreditTransactionsTable.reasonCode,
      createdAt: studioCreditTransactionsTable.createdAt,
      customerId: usersTable.id,
      customerName: usersTable.name,
      customerEmail: usersTable.email,
      subscriptionTier: usersTable.subscriptionTier,
      allocationId: studioCreditAllocationsTable.id,
      sourceReference: studioCreditAllocationsTable.sourceReference,
      originalAmount: studioCreditAllocationsTable.originalAmount,
      remainingAmount: studioCreditAllocationsTable.remainingAmount,
      startsAt: studioCreditAllocationsTable.startsAt,
      expiresAt: studioCreditAllocationsTable.expiresAt,
      allocationStatus: studioCreditAllocationsTable.status,
    })
    .from(studioCreditTransactionsTable)
    .innerJoin(usersTable, eq(studioCreditTransactionsTable.userId, usersTable.id))
    .leftJoin(
      studioCreditAllocationsTable,
      eq(
        studioCreditAllocationsTable.ledgerTransactionId,
        studioCreditTransactionsTable.transactionId,
      ),
    )
    .where(and(...conditions));

  const sourceReferences = rows
    .map((row) => row.sourceReference)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const planBySource = await loadStudioPlansBySourceReference(sourceReferences);

  return rows.map((row) =>
    projectCreditGrantEvent({
      ...row,
      studioPlan:
        row.sourceReference != null
          ? (planBySource.get(row.sourceReference) ?? null)
          : null,
    }),
  );
}
