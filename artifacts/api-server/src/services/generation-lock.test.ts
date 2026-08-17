import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GENERATION_BUSY_ERROR_CODE,
  GENERATION_BUSY_HTTP_STATUS,
  GENERATION_LOCK_ACQUIRE_FN,
  GENERATION_LOCK_TIMEOUT,
  GENERATION_LOCK_TIMEOUT_MS,
  GenerationLockBusyError,
  POSTGRES_LOCK_NOT_AVAILABLE,
  extractPostgresBackendPid,
  isGenerationLockBusyError,
  isPostgresLockTimeoutError,
} from "./generation-lock.js";

describe("generation lock constants", () => {
  it("uses a transaction-level advisory lock, not a session lock", () => {
    assert.equal(GENERATION_LOCK_ACQUIRE_FN, "pg_advisory_xact_lock");
    assert.notEqual(GENERATION_LOCK_ACQUIRE_FN, "pg_advisory_lock");
  });

  it("bounds waiters to 3 seconds", () => {
    assert.equal(GENERATION_LOCK_TIMEOUT, "3s");
    assert.equal(GENERATION_LOCK_TIMEOUT_MS, 3000);
    assert.ok(GENERATION_LOCK_TIMEOUT_MS < 10_000);
  });

  it("maps lock-unavailable to HTTP 409 with a stable code", () => {
    assert.equal(GENERATION_BUSY_HTTP_STATUS, 409);
    assert.equal(GENERATION_BUSY_ERROR_CODE, "generation_busy");
  });
});

describe("isPostgresLockTimeoutError", () => {
  it("detects SQLSTATE 55P03", () => {
    assert.equal(
      isPostgresLockTimeoutError({ code: POSTGRES_LOCK_NOT_AVAILABLE }),
      true,
    );
  });

  it("detects nested pg errors and lock-timeout messages", () => {
    assert.equal(
      isPostgresLockTimeoutError({ cause: { code: POSTGRES_LOCK_NOT_AVAILABLE } }),
      true,
    );
    assert.equal(
      isPostgresLockTimeoutError(new Error("canceling statement due to lock timeout")),
      true,
    );
    assert.equal(isPostgresLockTimeoutError(new Error("deadlock detected")), false);
    assert.equal(isPostgresLockTimeoutError(null), false);
  });
});

describe("GenerationLockBusyError", () => {
  it("is identifiable without waiting indefinitely", () => {
    const error = new GenerationLockBusyError();
    assert.equal(isGenerationLockBusyError(error), true);
    assert.equal(error.code, GENERATION_BUSY_ERROR_CODE);
    assert.equal(isGenerationLockBusyError(new Error("nope")), false);
  });
});

describe("extractPostgresBackendPid", () => {
  it("reads pid from drizzle row arrays or pg result.rows", () => {
    assert.equal(extractPostgresBackendPid([{ pid: 42 }]), 42);
    assert.equal(extractPostgresBackendPid({ rows: [{ pid: 99 }] }), 99);
    assert.equal(extractPostgresBackendPid({ rows: [] }), undefined);
  });
});

describe("generation coordination source architecture", () => {
  it("holds the lock only inside db.transaction and never uses session unlock", () => {
    const sourcePath = fileURLToPath(new URL("./generation-idempotency.ts", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    assert.equal(source.includes("set_config('lock_timeout'"), true);
    assert.equal(source.includes("pg_advisory_xact_lock"), true);
    assert.equal(source.includes("db.transaction"), true);
    assert.equal(source.includes("pg_advisory_unlock"), false);
    assert.equal(/pg_advisory_lock\s*\(/.test(source), false);
    assert.equal(source.includes("pool.connect()"), false);
  });

  it("does not run historical reconciliation inside the generation lock", () => {
    const rendersPath = fileURLToPath(new URL("../routes/renders.ts", import.meta.url));
    const renders = readFileSync(rendersPath, "utf8");
    const lockStart = renders.indexOf("await withUserGenerationLock");
    const lockEnd = renders.indexOf("reqId:", lockStart);
    assert.ok(lockStart > 0 && lockEnd > lockStart);
    const criticalSection = renders.slice(lockStart, lockEnd);

    assert.equal(criticalSection.includes("failStaleActiveGenerations"), true);
    assert.equal(criticalSection.includes("findActiveGenerationBatch(userId, tx)"), true);
    assert.equal(criticalSection.includes("beginGenerationCreditTransaction"), true);
    assert.equal(criticalSection.includes("executor: tx"), true);
    assert.equal(criticalSection.includes("reconcileStaleCommercialState"), false);
    assert.equal(criticalSection.includes("reconcileFailedSessionOrphanCharges"), false);
    assert.equal(
      /Promise\.all\s*\([\s\S]*tx\s*\.insert/.test(criticalSection),
      false,
      "protected inserts must run sequentially on the transaction connection",
    );

    const beforeLock = renders.slice(0, lockStart);
    const deferredCall = beforeLock.lastIndexOf("scheduleDeferredCommercialReconciliation");
    assert.ok(deferredCall > 0, "full reconcile is scheduled outside the lock");
  });
});
