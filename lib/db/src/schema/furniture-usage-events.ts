import { pgTable, text, serial, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { rendersTable } from "./renders";

/**
 * Successful furniture-bearing generation events per user.
 * Used for the 100-generation exact-furniture cooldown (user-specific).
 */
export const furnitureUsageEventsTable = pgTable("furniture_usage_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  furnitureAssetId: text("furniture_asset_id").notNull(),
  furnitureFamily: text("furniture_family").notNull(),
  renderId: integer("render_id").references(() => rendersTable.id, {
    onDelete: "set null",
  }),
  generationSessionId: uuid("generation_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFurnitureUsageEventSchema = createInsertSchema(
  furnitureUsageEventsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertFurnitureUsageEvent = z.infer<
  typeof insertFurnitureUsageEventSchema
>;
export type FurnitureUsageEvent = typeof furnitureUsageEventsTable.$inferSelect;
