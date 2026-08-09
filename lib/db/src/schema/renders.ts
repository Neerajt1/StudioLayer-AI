import { pgTable, text, serial, integer, timestamp, uuid } from "drizzle-orm/pg-core";
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
  /** Cached transparent-background PNG for premium download (Batch 6.1). */
  transparentOutputImageUrl: text("transparent_output_image_url"),
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
  /**
   * Immutable Master Asset this render belongs to (Batch 23A).
   * Master assets point to themselves; refinements inherit the root master ID.
   */
  masterRenderId: integer("master_render_id").references(
    (): AnyPgColumn => rendersTable.id,
    { onDelete: "cascade" },
  ),
  /** Immutable version in the asset lineage. Master = 1; each derivative = parent + 1. */
  assetVersion: integer("asset_version").notNull().default(1),
  /** Explicit asset type — master, crop, face_enhanced, etc. Never inferred from URLs. */
  assetType: text("asset_type").notNull().default("master"),
  /** AI refinement that created this asset, when applicable. */
  refinementType: text("refinement_type"),
  /** Version number of the parent asset this was derived from. */
  sourceAssetVersion: integer("source_asset_version"),
  /** Crop preset for crop variants (Original, Portrait, Full Body, Square, etc.). */
  cropPreset: text("crop_preset"),
  /** Hero | Campaign | Editorial — set automatically from workspace generation type. */
  generationType: text("generation_type").notNull().default("hero"),
  /** Studio Credits consumed along the lineage to produce this render. */
  studioCreditsUsed: integer("studio_credits_used").notNull().default(1),
  /** Refinement steps in the lineage (excludes the original generation). */
  refinementCount: integer("refinement_count").notNull().default(0),
  /**
   * Canonical generation session — all renders from one Studio generation share this UUID.
   * Refinements inherit the parent session; Gallery groups Shoots by this field.
   */
  generationSessionId: uuid("generation_session_id"),
  /** Pose Intelligence — canonical pose selected for this render (Phase 2). */
  selectedPoseName: text("selected_pose_name"),
  selectedPoseFamily: text("selected_pose_family"),
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
