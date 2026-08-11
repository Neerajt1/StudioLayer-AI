import type {
  Render,
  RenderDeletionEvent,
  StudioCreditTransaction,
} from "@workspace/db";
import { isGenerationReasonCode } from "./labels.js";

export interface RenderOutcomeCounts {
  requested: number;
  completed: number;
  failed: number;
}

export type SessionActivityStatus = "Completed" | "Partial" | "Failed";

export function isRootGenerationRender(render: Render): boolean {
  return render.parentRenderId == null;
}

export function isRefinementRender(render: Render): boolean {
  return render.parentRenderId != null;
}

export function rootRendersInSession(renders: readonly Render[]): Render[] {
  return renders.filter(isRootGenerationRender);
}

export function refinementRendersInSession(renders: readonly Render[]): Render[] {
  return renders.filter(isRefinementRender);
}

/** Terminal render outcomes for statement activity (excludes pending/processing). */
export function countRenderOutcomes(renders: readonly Render[]): RenderOutcomeCounts {
  let completed = 0;
  let failed = 0;

  for (const render of renders) {
    if (render.status === "completed") {
      completed += 1;
    } else if (render.status === "failed") {
      failed += 1;
    }
  }

  return {
    requested: renders.length,
    completed,
    failed,
  };
}

/**
 * Billable generation images for a completed ledger transaction.
 * Prefers surviving completed root renders; falls back to charged amount when
 * renders were deleted after billing (1 credit per successfully billed image).
 */
export function billableGenerationImagesForTransaction(
  tx: StudioCreditTransaction,
  sessionRenders: readonly Render[],
): number {
  if (!isGenerationReasonCode(tx.reasonCode)) {
    return 0;
  }

  const completedRootCount = rootRendersInSession(sessionRenders).filter(
    (render) => render.status === "completed",
  ).length;

  if (completedRootCount > 0) {
    return completedRootCount;
  }

  return Math.abs(tx.amount);
}

export function deriveSessionActivityStatus(
  rootOutcomes: RenderOutcomeCounts,
  refinementOutcomes: RenderOutcomeCounts,
): SessionActivityStatus {
  const requested = rootOutcomes.requested + refinementOutcomes.requested;
  const completed = rootOutcomes.completed + refinementOutcomes.completed;
  const failed = rootOutcomes.failed + refinementOutcomes.failed;

  if (requested === 0) {
    return "Completed";
  }

  if (completed === requested) {
    return "Completed";
  }

  if (completed === 0 && failed > 0) {
    return "Failed";
  }

  if (completed > 0 && failed > 0) {
    return "Partial";
  }

  if (completed > 0) {
    return "Completed";
  }

  return "Failed";
}

export function resolveSessionIdForRender(render: Render): string {
  return render.generationSessionId ?? `session-render-${render.id}`;
}

export function resolveSessionIdForTransaction(
  tx: StudioCreditTransaction,
  renderById: ReadonlyMap<number, Render>,
  deletionEvents: readonly RenderDeletionEvent[],
): string {
  const render = tx.renderId != null ? renderById.get(tx.renderId) : undefined;

  return (
    render?.generationSessionId ??
    deletionEvents.find((event) => event.renderId === tx.renderId)
      ?.generationSessionId ??
    (tx.renderId != null ? `session-render-${tx.renderId}` : `session-tx-${tx.id}`)
  );
}

export function rendersForSession(
  sessionId: string,
  renders: readonly Render[],
): Render[] {
  return renders.filter(
    (render) => resolveSessionIdForRender(render) === sessionId,
  );
}
