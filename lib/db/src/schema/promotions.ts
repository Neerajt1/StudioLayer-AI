import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Admin-managed promotional schemes (pricing-page wiring comes later). */
export const studioPromotionsTable = pgTable("studio_promotions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  badgeLabel: text("badge_label").notNull(),
  bonusCredits: integer("bonus_credits"),
  bonusCreditsExpiresAt: timestamp("bonus_credits_expires_at", {
    withTimezone: true,
  }),
  enabled: boolean("enabled").notNull().default(true),
  createdByAdminId: integer("created_by_admin_id").references(
    () => usersTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StudioPromotion = typeof studioPromotionsTable.$inferSelect;
export type NewStudioPromotion = typeof studioPromotionsTable.$inferInsert;
