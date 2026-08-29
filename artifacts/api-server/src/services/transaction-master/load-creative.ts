// Studio Credit amounts are stored in minor units. They are converted at this
// loader boundary so every downstream projection, summary, admin view and
// export speaks Studio Credits. Do not convert again downstream.
import {
  toCreditDenominatedAmount,
} from "../credit-normalization.js";
import { and, eq, gte, lte } from "drizzle-orm";
import {
  db,
  renderDeletionEventsTable,
  rendersTable,
  usersTable,
} from "@workspace/db";
import { projectCreativeActivityEvent } from "./project-creative.js";
import type {
  CreativeActivityEvent,
  TransactionMasterListFilters,
} from "./types.js";

export async function loadCreativeActivityEvents(
  filters: TransactionMasterListFilters = {},
): Promise<CreativeActivityEvent[]> {
  const conditions = [];

  if (filters.customerId != null) {
    conditions.push(eq(rendersTable.userId, filters.customerId));
  }
  if (filters.excludeAdmins !== false && filters.customerId == null) {
    conditions.push(eq(usersTable.isAdmin, false));
  }
  if (filters.from) {
    conditions.push(gte(rendersTable.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(rendersTable.createdAt, filters.to));
  }

  const rows = await db
    .select({
      renderId: rendersTable.id,
      createdAt: rendersTable.createdAt,
      customerId: usersTable.id,
      customerName: usersTable.name,
      customerEmail: usersTable.email,
      generationSessionId: rendersTable.generationSessionId,
      generationType: rendersTable.generationType,
      refinementType: rendersTable.refinementType,
      status: rendersTable.status,
      studioCreditsUsed: rendersTable.studioCreditsUsed,
      refinementCount: rendersTable.refinementCount,
      deletedAt: renderDeletionEventsTable.deletedAt,
    })
    .from(rendersTable)
    .innerJoin(usersTable, eq(rendersTable.userId, usersTable.id))
    .leftJoin(
      renderDeletionEventsTable,
      eq(renderDeletionEventsTable.renderId, rendersTable.id),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map((row) =>
    projectCreativeActivityEvent({
      ...row,
      studioCreditsUsed: toCreditDenominatedAmount(row.studioCreditsUsed),
    }),
  );
}
