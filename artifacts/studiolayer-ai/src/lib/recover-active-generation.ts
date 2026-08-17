/**
 * Recover an in-flight Workspace generation from the render list.
 * Used when POST /renders is lost after the server already started the job,
 * and when the Workspace reloads while a generation is still processing.
 */

export const ACTIVE_GENERATION_STATUSES = ["pending", "processing"] as const;

export function isActiveGenerationStatus(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

export const GENERATION_BUSY_ERROR_CODE = "generation_busy";

export function isGenerationCoordinationBusyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    status?: number;
    data?: { code?: string } | null;
  };
  if (record.data?.code === GENERATION_BUSY_ERROR_CODE) return true;
  return record.status === 409 || record.status === 423;
}

export type RecoverableRender = {
  id: number;
  status?: string | null;
  parentRenderId?: number | null;
  generationSessionId?: string | null;
  createdAt?: string | Date | null;
};

function parseTime(value: string | Date | null | undefined): number {
  if (value == null) return 0;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isRootRender(render: RecoverableRender): boolean {
  return render.parentRenderId == null;
}

/**
 * Latest in-flight root generation batch for this user.
 * Matches server findActiveGenerationBatch grouping by generationSessionId.
 */
export function selectActiveRootGenerationBatch<T extends RecoverableRender>(
  renders: readonly T[],
): T[] {
  const activeRoots = renders.filter(
    (render) => isRootRender(render) && isActiveGenerationStatus(render.status),
  );
  if (activeRoots.length === 0) return [];

  const sorted = [...activeRoots].sort(
    (a, b) => parseTime(b.createdAt) - parseTime(a.createdAt) || b.id - a.id,
  );
  const anchor = sorted[0]!;
  const sessionId = anchor.generationSessionId;
  const batch = sessionId
    ? activeRoots.filter((render) => render.generationSessionId === sessionId)
    : [anchor];

  return [...batch].sort((a, b) => a.id - b.id);
}

export function activeGenerationRenderIds<T extends RecoverableRender>(
  renders: readonly T[],
): number[] {
  return selectActiveRootGenerationBatch(renders).map((render) => render.id);
}
