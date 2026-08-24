import type { CreativeActivityEvent } from "./types.js";

export interface CreativeActivityProjectionRow {
  renderId: number;
  createdAt: Date;
  customerId: number;
  customerName: string;
  customerEmail: string;
  generationSessionId: string | null;
  generationType: string;
  refinementType: string | null;
  status: string;
  studioCreditsUsed: number;
  refinementCount: number;
  deletedAt: Date | null;
}

export function projectCreativeActivityEvent(
  row: CreativeActivityProjectionRow,
): CreativeActivityEvent {
  return {
    eventKind: "creative_activity",
    occurredAt: row.deletedAt ?? row.createdAt,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    renderId: row.renderId,
    generationSessionId: row.generationSessionId,
    generationType: row.generationType,
    refinementType: row.refinementType,
    status: row.status,
    studioCreditsUsed: row.studioCreditsUsed,
    refinementCount: row.refinementCount,
    deletedAt: row.deletedAt,
  };
}
