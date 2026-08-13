import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { studioCreditAllocationsTable } from "./studio-credit-allocations";

/** Immutable audit: which allocation lots funded a usage transaction. */
export const studioCreditAllocationConsumptionsTable = pgTable(
  "studio_credit_allocation_consumptions",
  {
    id: serial("id").primaryKey(),
    usageTransactionId: text("usage_transaction_id").notNull(),
    allocationId: integer("allocation_id")
      .notNull()
      .references(() => studioCreditAllocationsTable.id, {
        onDelete: "restrict",
      }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("studio_credit_allocation_consumptions_usage_tx_idx").on(
      table.usageTransactionId,
    ),
    index("studio_credit_allocation_consumptions_allocation_idx").on(
      table.allocationId,
    ),
    uniqueIndex("studio_credit_allocation_consumptions_usage_allocation_uidx").on(
      table.usageTransactionId,
      table.allocationId,
    ),
  ],
);

export type StudioCreditAllocationConsumption =
  typeof studioCreditAllocationConsumptionsTable.$inferSelect;
export type NewStudioCreditAllocationConsumption =
  typeof studioCreditAllocationConsumptionsTable.$inferInsert;
