/**
 * Generation lifecycle semantics — active vs terminal, heartbeat vs stale.
 *
 * pending     → accepted, pipeline not yet running
 * processing  → pipeline actively running (heartbeat keeps updatedAt fresh)
 * completed   → pipeline persisted a successful image
 * failed      → pipeline actually terminated unsuccessfully
 */

export const ACTIVE_GENERATION_STATUSES = ["pending", "processing"] as const;

export type ActiveGenerationStatus = (typeof ACTIVE_GENERATION_STATUSES)[number];

/**
 * Lightweight DB heartbeat while runAIPipeline is in flight.
 * Must stay well below STALE_GENERATION_TTL_MS (20 min) so live OpenRouter
 * waits are never classified as abandoned. 60s is 1/20 of that TTL and far
 * less frequent than the 2s Workspace poll.
 */
export const GENERATION_HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Abandoned in-flight generations — measured from last heartbeat (`updatedAt`),
 * not from original createdAt. A live OpenRouter wait keeps updatedAt fresh.
 */
export const STALE_GENERATION_TTL_MS = 20 * 60 * 1000;

export function isActiveGenerationStatus(
  status: string | null | undefined,
): status is ActiveGenerationStatus {
  return status === "pending" || status === "processing";
}

/** True when a pending/processing row has had no heartbeat within the stale TTL. */
export function isInFlightRenderAbandoned(
  updatedAt: Date | string,
  nowMs: number,
  ttlMs: number,
): boolean {
  const updatedMs = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return false;
  return nowMs - updatedMs >= ttlMs;
}

/**
 * Success persistence is allowed only while the row is still an active
 * generation. A genuine `failed` terminal row must not be resurrected by a
 * late callback.
 */
export function canPersistGenerationSuccess(status: string | null | undefined): boolean {
  return isActiveGenerationStatus(status);
}

export function isOpenRouterAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    const message = error.message.toLowerCase();
    if (message.includes("aborted") || message.includes("abort")) return true;
    if (message.includes("timeout") && message.includes("operation")) return true;
  }
  return false;
}

export function describeOpenRouterAttemptFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Do not retry aborted fetches — aborting our wait can still leave the
 * upstream request running, and a retry would start a second paid call.
 */
export function shouldRetryOpenRouterAttempt(
  error: unknown,
  attempt: number,
  retryCount: number,
): boolean {
  if (attempt >= retryCount) return false;
  if (isOpenRouterAbortError(error)) return false;
  return true;
}
