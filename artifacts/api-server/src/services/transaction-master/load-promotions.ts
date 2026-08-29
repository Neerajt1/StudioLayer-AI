// Studio Credit amounts are stored in minor units. They are converted at this
// loader boundary so every downstream projection, summary, admin view and
// export speaks Studio Credits. Do not convert again downstream.
import {
  toCreditDenominatedAmountOrNull,
} from "../credit-normalization.js";
import { and, gte, lte } from "drizzle-orm";
import { db, studioPromotionsTable } from "@workspace/db";
import { projectPromotionConfigEvent } from "./project-promotions.js";
import type {
  PromotionConfigEvent,
  TransactionMasterListFilters,
} from "./types.js";

export async function loadPromotionConfigEvents(
  filters: TransactionMasterListFilters = {},
): Promise<PromotionConfigEvent[]> {
  // Customer-scoped filters do not apply — promotions are platform configuration.
  if (filters.customerId != null) return [];

  const conditions = [];
  if (filters.from) {
    conditions.push(gte(studioPromotionsTable.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(studioPromotionsTable.createdAt, filters.to));
  }

  const rows = await db
    .select({
      id: studioPromotionsTable.id,
      name: studioPromotionsTable.name,
      message: studioPromotionsTable.message,
      startAt: studioPromotionsTable.startAt,
      endAt: studioPromotionsTable.endAt,
      badgeLabel: studioPromotionsTable.badgeLabel,
      bonusCredits: studioPromotionsTable.bonusCredits,
      bonusCreditsExpiresAt: studioPromotionsTable.bonusCreditsExpiresAt,
      enabled: studioPromotionsTable.enabled,
      createdAt: studioPromotionsTable.createdAt,
    })
    .from(studioPromotionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return rows.map((row) =>
    projectPromotionConfigEvent({
      ...row,
      bonusCredits: toCreditDenominatedAmountOrNull(row.bonusCredits),
    }),
  );
}
