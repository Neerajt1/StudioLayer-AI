import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { rendersTable } from "./renders";

export const studioCreditTransactionsTable = pgTable(
  "studio_credit_transactions",
  {
    id: serial("id").primaryKey(),
    transactionId: text("transaction_id").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    workspaceId: integer("workspace_id").notNull(),
    amount: integer("amount").notNull(),
    reasonCode: text("reason_code").notNull(),
    status: text("status").notNull().default("pending"),
    renderId: integer("render_id").references(() => rendersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type StudioCreditTransaction =
  typeof studioCreditTransactionsTable.$inferSelect;

export type NewStudioCreditTransaction =
  typeof studioCreditTransactionsTable.$inferInsert;
