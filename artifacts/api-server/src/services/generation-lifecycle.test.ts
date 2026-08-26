import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GENERATION_HEARTBEAT_INTERVAL_MS,
  STALE_GENERATION_TTL_MS,
  canPersistGenerationSuccess,
  describeOpenRouterAttemptFailure,
  isActiveGenerationStatus,
  isInFlightRenderAbandoned,
  isOpenRouterAbortError,
  shouldRetryOpenRouterAttempt,
} from "./generation-lifecycle.js";

describe("generation heartbeat vs stale TTL", () => {
  it("heartbeat interval is well below the stale TTL", () => {
    assert.equal(GENERATION_HEARTBEAT_INTERVAL_MS, 60_000);
    assert.equal(STALE_GENERATION_TTL_MS, 20 * 60 * 1000);
    assert.ok(GENERATION_HEARTBEAT_INTERVAL_MS * 10 < STALE_GENERATION_TTL_MS);
  });

  it("keeps a generation alive beyond 20 minutes when heartbeat is recent", () => {
    const now = Date.parse("2026-08-17T12:25:00.000Z");
    const createdTwentyFiveMinutesAgo = new Date(now - 25 * 60 * 1000);
    const heartbeatThirtySecondsAgo = new Date(now - 30_000);

    assert.equal(
      isInFlightRenderAbandoned(heartbeatThirtySecondsAgo, now, STALE_GENERATION_TTL_MS),
      false,
    );
    assert.equal(
      isInFlightRenderAbandoned(createdTwentyFiveMinutesAgo, now, STALE_GENERATION_TTL_MS),
      true,
    );
  });

  it("marks a generation stale only after the heartbeat itself goes quiet", () => {
    const now = Date.parse("2026-08-17T12:25:00.000Z");
    const lastBeat = new Date(now - STALE_GENERATION_TTL_MS);

    assert.equal(isInFlightRenderAbandoned(lastBeat, now, STALE_GENERATION_TTL_MS), true);
    assert.equal(
      isInFlightRenderAbandoned(new Date(now - STALE_GENERATION_TTL_MS + 1), now, STALE_GENERATION_TTL_MS),
      false,
    );
  });

  it("does not treat a live heartbeat as abandoned during an in-flight OpenRouter wait", () => {
    const now = Date.parse("2026-08-17T12:18:00.000Z");
    const lastHeartbeat = new Date(now - GENERATION_HEARTBEAT_INTERVAL_MS);

    assert.equal(
      isInFlightRenderAbandoned(lastHeartbeat, now, STALE_GENERATION_TTL_MS),
      false,
    );
  });
});

describe("generation status semantics", () => {
  it("treats pending and processing as active", () => {
    assert.equal(isActiveGenerationStatus("pending"), true);
    assert.equal(isActiveGenerationStatus("processing"), true);
    assert.equal(isActiveGenerationStatus("completed"), false);
    assert.equal(isActiveGenerationStatus("failed"), false);
  });

  it("allows success persistence only for active rows", () => {
    assert.equal(canPersistGenerationSuccess("pending"), true);
    assert.equal(canPersistGenerationSuccess("processing"), true);
    assert.equal(canPersistGenerationSuccess("failed"), false);
    assert.equal(canPersistGenerationSuccess("completed"), false);
  });
});

describe("OpenRouter abort retry policy", () => {
  it("does not retry an aborted fetch", () => {
    const abort = new Error("This operation was aborted");
    abort.name = "AbortError";

    assert.equal(isOpenRouterAbortError(abort), true);
    assert.equal(shouldRetryOpenRouterAttempt(abort, 0, 1), false);
    assert.equal(describeOpenRouterAttemptFailure(abort), abort.message);
  });

  it("still retries a non-abort provider error once", () => {
    const httpError = new Error("OpenRouter API error: HTTP 502");
    assert.equal(shouldRetryOpenRouterAttempt(httpError, 0, 1), true);
    assert.equal(shouldRetryOpenRouterAttempt(httpError, 1, 1), false);
    assert.equal(describeOpenRouterAttemptFailure(httpError), httpError.message);
  });
});
