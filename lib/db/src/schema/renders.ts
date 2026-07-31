import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const rendersTable = pgTable("renders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  sourceImageUrl: text("source_image_url"),
  outputImageUrl: text("output_image_url"),
  modelPersona: text("model_persona").notNull(),
  locationEnvironment: text("location_environment").notNull(),
  status: text("status").notNull().default("pending"),
  /**
   * Links a refinement render to the render it was derived from (version history).
   * onDelete: cascade — deleting a parent automatically removes all refinements in
   * the tree, preventing FK violations in the gallery delete flow.
   */
  parentRenderId: integer("parent_render_id").references(
    (): AnyPgColumn => rendersTable.id,
    { onDelete: "cascade" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRenderSchema = createInsertSchema(rendersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRender = z.infer<typeof insertRenderSchema>;
export type Render = typeof rendersTable.$inferSelect;
