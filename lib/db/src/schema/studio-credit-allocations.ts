import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Spendable credit lots (membership / top-up / pass). */
export const studioCreditAllocationsTable = pgTable(
  "studio_credit_allocations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reasonCode: text("reason_code").notNull(),
    /** Studio Credit MINOR UNITS (100 = 1 credit). */
    originalAmount: integer("original_amount").notNull(),
    /** Studio Credit MINOR UNITS (100 = 1 credit). */
    remainingAmount: integer("remaining_amount").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    periodKey: text("period_key"),
    sourceReference: text("source_reference").notNull(),
    ledgerTransactionId: text("ledger_transaction_id"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("studio_credit_allocations_source_reference_uidx").on(
      table.sourceReference,
    ),
    uniqueIndex("studio_credit_allocations_ledger_transaction_id_uidx").on(
      table.ledgerTransactionId,
    ),
    index("studio_credit_allocations_user_status_expires_idx").on(
      table.userId,
      table.status,
      table.expiresAt,
    ),
    index("studio_credit_allocations_user_reason_period_idx").on(
      table.userId,
      table.reasonCode,
      table.periodKey,
    ),
  ],
);

export type StudioCreditAllocation =
  typeof studioCreditAllocationsTable.$inferSelect;
export type NewStudioCreditAllocation =
  typeof studioCreditAllocationsTable.$inferInsert;
