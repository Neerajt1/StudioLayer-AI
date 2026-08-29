// Studio Credit amounts are stored in minor units. They are converted at this
// loader boundary so every downstream projection, summary, admin view and
// export speaks Studio Credits. Do not convert again downstream.
import {
  toCreditDenominatedAmount,
} from "../credit-normalization.js";
import { and, eq, gte, inArray, lt, lte } from "drizzle-orm";
import {
  STUDIO_CREDIT_USAGE_REASON_CODES,
  StudioCreditTransactionStatus,
} from "@workspace/studio-credit-engine";
import {
  db,
  rendersTable,
  studioCreditAllocationConsumptionsTable,
  studioCreditAllocationsTable,
  studioCreditTransactionsTable,
  usersTable,
} from "@workspace/db";
import {
  projectCreditUsageEvent,
  projectFundedByEntry,
} from "./project-usage.js";
import { loadStudioPlansBySourceReference } from "./razorpay-plan-lookup.js";
import type {
  CreditUsageEvent,
  CreditUsageFundedBy,
  TransactionMasterListFilters,
} from "./types.js";

export async function loadCreditUsageEvents(
  filters: TransactionMasterListFilters = {},
): Promise<CreditUsageEvent[]> {
  const conditions = [
    eq(
      studioCreditTransactionsTable.status,
      StudioCreditTransactionStatus.COMPLETED,
    ),
    lt(studioCreditTransactionsTable.amount, 0),
    inArray(
      studioCreditTransactionsTable.reasonCode,
      [...STUDIO_CREDIT_USAGE_REASON_CODES],
    ),
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
      renderId: studioCreditTransactionsTable.renderId,
      generationSessionId: rendersTable.generationSessionId,
      generationType: rendersTable.generationType,
      refinementType: rendersTable.refinementType,
      renderStatus: rendersTable.status,
    })
    .from(studioCreditTransactionsTable)
    .innerJoin(usersTable, eq(studioCreditTransactionsTable.userId, usersTable.id))
    .leftJoin(
      rendersTable,
      eq(rendersTable.id, studioCreditTransactionsTable.renderId),
    )
    .where(and(...conditions));

  if (rows.length === 0) return [];

  const transactionIds = rows.map((row) => row.transactionId);
  const consumptionRows = await db
    .select({
      usageTransactionId: studioCreditAllocationConsumptionsTable.usageTransactionId,
      allocationId: studioCreditAllocationConsumptionsTable.allocationId,
      amount: studioCreditAllocationConsumptionsTable.amount,
      reasonCode: studioCreditAllocationsTable.reasonCode,
      expiresAt: studioCreditAllocationsTable.expiresAt,
      sourceReference: studioCreditAllocationsTable.sourceReference,
      allocationUserId: studioCreditAllocationsTable.userId,
    })
    .from(studioCreditAllocationConsumptionsTable)
    .innerJoin(
      studioCreditAllocationsTable,
      eq(
        studioCreditAllocationsTable.id,
        studioCreditAllocationConsumptionsTable.allocationId,
      ),
    )
    .where(
      inArray(
        studioCreditAllocationConsumptionsTable.usageTransactionId,
        transactionIds,
      ),
    );

  const sourceReferences = consumptionRows.map((row) => row.sourceReference);
  const planBySource = await loadStudioPlansBySourceReference(sourceReferences);
  const tierByCustomerId = new Map(
    rows.map((row) => [row.customerId, row.subscriptionTier] as const),
  );

  const fundedByByTx = new Map<string, CreditUsageFundedBy[]>();
  for (const row of consumptionRows) {
    const entry = projectFundedByEntry({
      allocationId: row.allocationId,
      amount: toCreditDenominatedAmount(row.amount),
      reasonCode: row.reasonCode,
      expiresAt: row.expiresAt,
      sourceReference: row.sourceReference,
      studioPlan: planBySource.get(row.sourceReference) ?? null,
      subscriptionTier: tierByCustomerId.get(row.allocationUserId) ?? null,
    });
    const list = fundedByByTx.get(row.usageTransactionId) ?? [];
    list.push(entry);
    fundedByByTx.set(row.usageTransactionId, list);
  }

  return rows.map((row) =>
    projectCreditUsageEvent({
      transactionId: row.transactionId,
      status: row.status,
      amount: toCreditDenominatedAmount(row.amount),
      reasonCode: row.reasonCode,
      createdAt: row.createdAt,
      customerId: row.customerId,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      renderId: row.renderId,
      generationSessionId: row.generationSessionId,
      generationType: row.generationType,
      refinementType: row.refinementType,
      renderStatus: row.renderStatus,
      fundedBy: fundedByByTx.get(row.transactionId) ?? [],
    }),
  );
}
