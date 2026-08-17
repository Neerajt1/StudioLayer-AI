/**
 * Bounded, transaction-level generation coordination.
 *
 * Session-level pg_advisory_lock + a pooled Drizzle connection is unsafe:
 * the lock can sit on connection A while business queries run on B/C/D,
 * and aborting the HTTP request does not drop a session lock.
 *
 * Generation creation uses pg_advisory_xact_lock inside db.transaction().
 * COMMIT/ROLLBACK releases the lock with the session; nothing is returned
 * to pg.Pool still holding a session advisory lock.
 */

export const GENERATION_LOCK_TIMEOUT = "3s";
export const GENERATION_LOCK_TIMEOUT_MS = 3_000;
export const GENERATION_LOCK_ACQUIRE_FN = "pg_advisory_xact_lock" as const;
export const GENERATION_BUSY_ERROR_CODE = "generation_busy" as const;
export const GENERATION_BUSY_HTTP_STATUS = 409;

/** Postgres SQLSTATE when lock_timeout fires while waiting for a lock. */
export const POSTGRES_LOCK_NOT_AVAILABLE = "55P03";

export class GenerationLockBusyError extends Error {
  readonly code = GENERATION_BUSY_ERROR_CODE;

  constructor(message = "Another generation is being prepared") {
    super(message);
    this.name = "GenerationLockBusyError";
  }
}

export function isGenerationLockBusyError(
  error: unknown,
): error is GenerationLockBusyError {
  return error instanceof GenerationLockBusyError;
}

export function isPostgresLockTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === POSTGRES_LOCK_NOT_AVAILABLE) return true;

  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as { code?: unknown }).code === POSTGRES_LOCK_NOT_AVAILABLE) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("lock timeout") || message.includes("canceling statement due to lock timeout");
}

export function extractPostgresBackendPid(result: unknown): number | undefined {
  const row = firstRow(result);
  if (!row) return undefined;
  const raw = row["pid"] ?? row["pg_backend_pid"];
  const pid = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(result)) {
    const row = result[0];
    return row && typeof row === "object" ? (row as Record<string, unknown>) : undefined;
  }
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown[] }).rows;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return row && typeof row === "object" ? (row as Record<string, unknown>) : undefined;
  }
  return undefined;
}
