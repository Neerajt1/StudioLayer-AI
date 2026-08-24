import type { PromotionConfigEvent } from "./types.js";

/**
 * Promotion configuration projection.
 * These are NEVER credit transactions — configuration only.
 */
export function projectPromotionConfigEvent(row: {
  id: number;
  name: string;
  message: string;
  startAt: Date;
  endAt: Date;
  badgeLabel: string;
  bonusCredits: number | null;
  bonusCreditsExpiresAt: Date | null;
  enabled: boolean;
  createdAt: Date;
}): PromotionConfigEvent {
  return {
    eventKind: "promotion_config",
    occurredAt: row.createdAt,
    promotionId: row.id,
    name: row.name,
    message: row.message,
    startAt: row.startAt,
    endAt: row.endAt,
    badgeLabel: row.badgeLabel,
    bonusCredits: row.bonusCredits,
    bonusCreditsExpiresAt: row.bonusCreditsExpiresAt,
    enabled: row.enabled,
  };
}
