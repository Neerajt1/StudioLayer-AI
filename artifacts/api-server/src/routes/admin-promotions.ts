import type { Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, studioPromotionsTable } from "@workspace/db";
import { computePromotionLifecycleStatus } from "./admin-promotion-status.js";

function parseDateOnly(input: unknown, label: string): Date {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  const trimmed = input.trim();
  const normalized =
    trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} is not a valid date`);
  }
  return d;
}

/** End of promotion window — inclusive through the selected calendar day (UTC). */
function parsePromotionEndDate(input: unknown, label: string): Date {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  const trimmed = input.trim();
  if (trimmed.length === 10) {
    const start = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new Error(`${label} is not a valid date`);
    }
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} is not a valid date`);
  }
  return d;
}

function parseOptionalBonusCredits(input: unknown): number | null {
  if (input == null || input === "") return null;
  if (typeof input === "number" && Number.isInteger(input) && input > 0) {
    return input;
  }
  if (typeof input === "string") {
    const n = Number(input);
    if (Number.isInteger(n) && n > 0) return n;
  }
  throw new Error("bonusCredits must be a positive integer when provided");
}

function parseOptionalExpiry(input: unknown): Date | null {
  if (input == null || input === "") return null;
  if (typeof input !== "string") {
    throw new Error("bonusCreditsExpiresAt must be ISO date string or null");
  }
  const normalized =
    input.length === 10 ? `${input}T00:00:00.000Z` : input;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error("bonusCreditsExpiresAt is not a valid date");
  }
  return d;
}

function serializePromotion(row: typeof studioPromotionsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    message: row.message,
    startAt: row.startAt,
    endAt: row.endAt,
    badgeLabel: row.badgeLabel,
    bonusCredits: row.bonusCredits,
    bonusCreditsExpiresAt: row.bonusCreditsExpiresAt,
    enabled: row.enabled,
    createdByAdminId: row.createdByAdminId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: computePromotionLifecycleStatus({
      startAt: row.startAt,
      endAt: row.endAt,
    }),
  };
}

function parsePromotionBody(body: unknown): {
  name: string;
  message: string;
  startAt: Date;
  endAt: Date;
  badgeLabel: string;
  bonusCredits: number | null;
  bonusCreditsExpiresAt: Date | null;
  enabled: boolean;
} {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const badgeLabel =
    typeof b.badgeLabel === "string" ? b.badgeLabel.trim() : "";

  if (!name) throw new Error("name is required");
  if (!message) throw new Error("message is required");
  if (!badgeLabel) throw new Error("badgeLabel is required");

  const startAt = parseDateOnly(b.startDate ?? b.startAt, "startDate");
  const endAt = parsePromotionEndDate(b.endDate ?? b.endAt, "endDate");
  if (endAt.getTime() <= startAt.getTime()) {
    throw new Error("endDate must be after startDate");
  }

  const bonusCredits = parseOptionalBonusCredits(b.bonusCredits);
  const bonusCreditsExpiresAt = parseOptionalExpiry(b.bonusCreditsExpiresAt);

  if (bonusCredits == null && bonusCreditsExpiresAt != null) {
    throw new Error("bonusCreditsExpiresAt requires bonusCredits");
  }

  const enabled = b.enabled === undefined ? true : Boolean(b.enabled);

  return {
    name,
    message,
    startAt,
    endAt,
    badgeLabel,
    bonusCredits,
    bonusCreditsExpiresAt,
    enabled,
  };
}

/** GET /api/admin/promotions */
export async function listAdminPromotions(
  _req: Request,
  res: Response,
): Promise<void> {
  const rows = await db
    .select()
    .from(studioPromotionsTable)
    .orderBy(desc(studioPromotionsTable.startAt));

  res.json(rows.map(serializePromotion));
}

/** POST /api/admin/promotions */
export async function createAdminPromotion(
  req: Request,
  res: Response,
): Promise<void> {
  const adminUserId = req.session?.userId;
  if (!adminUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let parsed;
  try {
    parsed = parsePromotionBody(req.body);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const [row] = await db
    .insert(studioPromotionsTable)
    .values({
      name: parsed.name,
      message: parsed.message,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      badgeLabel: parsed.badgeLabel,
      bonusCredits: parsed.bonusCredits,
      bonusCreditsExpiresAt: parsed.bonusCreditsExpiresAt,
      enabled: parsed.enabled,
      createdByAdminId: adminUserId,
    })
    .returning();

  res.status(201).json(serializePromotion(row!));
}

/** PATCH /api/admin/promotions/:promotionId */
export async function updateAdminPromotion(
  req: Request,
  res: Response,
): Promise<void> {
  const promotionId = Number(req.params.promotionId);
  if (!Number.isInteger(promotionId) || promotionId <= 0) {
    res.status(400).json({ error: "Invalid promotionId" });
    return;
  }

  let parsed;
  try {
    parsed = parsePromotionBody(req.body);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const [row] = await db
    .update(studioPromotionsTable)
    .set({
      name: parsed.name,
      message: parsed.message,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      badgeLabel: parsed.badgeLabel,
      bonusCredits: parsed.bonusCredits,
      bonusCreditsExpiresAt: parsed.bonusCreditsExpiresAt,
      enabled: parsed.enabled,
    })
    .where(eq(studioPromotionsTable.id, promotionId))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Promotion not found" });
    return;
  }

  res.json(serializePromotion(row));
}

/** POST /api/admin/promotions/:promotionId/disable */
export async function disableAdminPromotion(
  req: Request,
  res: Response,
): Promise<void> {
  const promotionId = Number(req.params.promotionId);
  if (!Number.isInteger(promotionId) || promotionId <= 0) {
    res.status(400).json({ error: "Invalid promotionId" });
    return;
  }

  const [row] = await db
    .update(studioPromotionsTable)
    .set({ enabled: false })
    .where(eq(studioPromotionsTable.id, promotionId))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Promotion not found" });
    return;
  }

  res.json(serializePromotion(row));
}
