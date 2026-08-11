import type { Render } from "@workspace/db";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import { rootRendersInSession } from "./account-statement/billable-output.js";

/** Ledger reason codes for root image generation batches. */
export const GENERATION_CREDIT_REASON_CODES = [
  StudioCreditReasonCode.HERO_GENERATION,
  StudioCreditReasonCode.CAMPAIGN_GENERATION,
  StudioCreditReasonCode.EDITORIAL_GENERATION,
] as const;

/** Single-shot refinement transactions eligible for short orphan cleanup. */
export const REFINEMENT_ORPHAN_REASON_CODES = [
  StudioCreditReasonCode.REFINE,
  StudioCreditReasonCode.REGENERATE,
] as const;

const ACTIVE_RENDER_STATUSES = new Set(["pending", "processing"]);

export function isGenerationCreditReasonCode(reasonCode: string): boolean {
  return (GENERATION_CREDIT_REASON_CODES as readonly string[]).includes(
    reasonCode,
  );
}

export function isRefinementOrphanReasonCode(reasonCode: string): boolean {
  return (REFINEMENT_ORPHAN_REASON_CODES as readonly string[]).includes(
    reasonCode,
  );
}

/** True when every root generation render in the session has reached a terminal status. */
export function isRootGenerationBatchTerminal(
  renders: readonly Render[],
): boolean {
  const roots = rootRendersInSession(renders);
  if (roots.length === 0) {
    return false;
  }

  return !roots.some((render) => ACTIVE_RENDER_STATUSES.has(render.status));
}

/** True when every render in the session has reached a terminal status. */
export function isGenerationSessionTerminal(
  renders: readonly Pick<Render, "status">[],
): boolean {
  return !renders.some((render) => ACTIVE_RENDER_STATUSES.has(render.status));
}

export interface PendingGenerationFinalization {
  completedCount: number;
  creditPerCompletedImage: number;
}

/**
 * Derives partial-generation finalization inputs from a pending hold and
 * terminal session renders. Uses root generation renders only.
 */
export function resolvePendingGenerationFinalization(input: {
  holdAmount: number;
  sessionRenders: readonly Render[];
}): PendingGenerationFinalization | null {
  const roots = rootRendersInSession(input.sessionRenders);
  if (roots.length === 0) {
    return null;
  }

  if (!isRootGenerationBatchTerminal(input.sessionRenders)) {
    return null;
  }

  const completedCount = roots.filter(
    (render) => render.status === "completed",
  ).length;
  const creditPerCompletedImage = Math.abs(input.holdAmount) / roots.length;

  return { completedCount, creditPerCompletedImage };
}
