import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const renderDeletionEventsTable = pgTable("render_deletion_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  renderId: integer("render_id").notNull(),
  generationSessionId: uuid("generation_session_id"),
  generationType: text("generation_type").notNull(),
  /** Studio Credit MINOR UNITS (100 = 1 credit). */
  originalCreditsConsumed: integer("original_credits_consumed").notNull(),
  deletedBy: text("deleted_by").notNull().default("user"),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RenderDeletionEvent =
  typeof renderDeletionEventsTable.$inferSelect;

export type NewRenderDeletionEvent =
  typeof renderDeletionEventsTable.$inferInsert;
