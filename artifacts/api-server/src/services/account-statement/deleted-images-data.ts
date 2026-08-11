import type {
  Render,
  RenderDeletionEvent,
  StudioCreditTransaction,
} from "@workspace/db";
import type { AccountStatementContext } from "./data.js";
import {
  isGenerationReasonCode,
} from "./labels.js";
import {
  rendersForSession,
  resolveSessionIdForTransaction,
} from "./billable-output.js";

export interface DeletedImageRow {
  deletionEventId: number;
  deletedAt: Date;
  renderId: number;
  generationSessionId: string;
  generationType: string;
  originalGenerationDate: Date | null;
  /** Total credits charged for the original generation batch (ledger-backed when available). */
  originalGenerationCredits: number | null;
  /** Billable images in the original generation batch (ledger-backed when available). */
  originalGenerationImageCount: number | null;
  deletedBy: string;
}

function renderByIdMap(renders: readonly Render[]): Map<number, Render> {
  return new Map(renders.map((render) => [render.id, render]));
}

function sessionIdForDeletionEvent(event: RenderDeletionEvent): string {
  return event.generationSessionId ?? `session-render-${event.renderId}`;
}

function findSessionGenerationTransaction(
  ctx: AccountStatementContext,
  sessionId: string,
  renderById: ReadonlyMap<number, Render>,
): StudioCreditTransaction | undefined {
  for (const tx of ctx.transactions) {
    if (!isGenerationReasonCode(tx.reasonCode)) continue;
    if (
      resolveSessionIdForTransaction(tx, renderById, ctx.deletionEvents)
      === sessionId
    ) {
      return tx;
    }
  }
  return undefined;
}

function earliestSessionRenderDate(
  renders: readonly Render[],
  sessionId: string,
): Date | null {
  const sessionRenders = rendersForSession(sessionId, renders);
  if (sessionRenders.length === 0) {
    return null;
  }

  return sessionRenders.reduce((earliest, render) => {
    return render.createdAt < earliest ? render.createdAt : earliest;
  }, sessionRenders[0]!.createdAt);
}

/**
 * Deleted-image rows for the account statement.
 * Presentation only — never mutates credits or the ledger.
 */
export function computeDeletedImageRows(
  ctx: AccountStatementContext,
): DeletedImageRow[] {
  const renderById = renderByIdMap(ctx.renders);

  return ctx.deletionEvents.map((event) => {
    const sessionId = sessionIdForDeletionEvent(event);
    const generationTx = findSessionGenerationTransaction(
      ctx,
      sessionId,
      renderById,
    );

    let originalGenerationCredits: number | null = null;
    let originalGenerationImageCount: number | null = null;
    let originalGenerationDate: Date | null = null;

    if (generationTx) {
      originalGenerationCredits = Math.abs(generationTx.amount);
      // Generation batches bill 1 credit per successfully completed image.
      originalGenerationImageCount = originalGenerationCredits;
      originalGenerationDate = generationTx.createdAt;
    } else {
      originalGenerationDate = earliestSessionRenderDate(ctx.renders, sessionId);
    }

    return {
      deletionEventId: event.id,
      deletedAt: event.deletedAt,
      renderId: event.renderId,
      generationSessionId: sessionId,
      generationType: event.generationType,
      originalGenerationDate,
      originalGenerationCredits,
      originalGenerationImageCount,
      deletedBy: event.deletedBy,
    };
  });
}
