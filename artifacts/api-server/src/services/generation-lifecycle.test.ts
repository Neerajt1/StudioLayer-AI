import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPENROUTER_RENDERING_CONFIG } from "./rendering/rendering.config.js";
import {
  DEFAULT_OPENROUTER_WAIT_BUDGET_MS,
  GENERATION_HEARTBEAT_INTERVAL_MS,
  OPENROUTER_WAIT_BUDGET_EXPIRED_MESSAGE,
  STALE_GENERATION_TTL_MS,
  canPersistGenerationSuccess,
  describeOpenRouterAttemptFailure,
  isActiveGenerationStatus,
  isInFlightRenderAbandoned,
  isOpenRouterAbortError,
  isOpenRouterWaitBudgetBelowStaleTtl,
  resolveOpenRouterWaitBudgetMs,
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

describe("OpenRouter wait budget", () => {
  it("defaults to 18 minutes and is read from OR_RENDER_TIMEOUT_MS", () => {
    assert.equal(DEFAULT_OPENROUTER_WAIT_BUDGET_MS, 18 * 60 * 1000);
    assert.equal(DEFAULT_OPENROUTER_WAIT_BUDGET_MS, 1_080_000);
    assert.equal(resolveOpenRouterWaitBudgetMs(undefined), DEFAULT_OPENROUTER_WAIT_BUDGET_MS);
    assert.equal(resolveOpenRouterWaitBudgetMs(""), DEFAULT_OPENROUTER_WAIT_BUDGET_MS);
    assert.equal(resolveOpenRouterWaitBudgetMs("not-a-number"), DEFAULT_OPENROUTER_WAIT_BUDGET_MS);
    assert.equal(resolveOpenRouterWaitBudgetMs("120000"), 120_000);
    assert.equal(OPENROUTER_RENDERING_CONFIG.timeoutMs, resolveOpenRouterWaitBudgetMs());
  });

  it("keeps the wait budget strictly below the 20-minute stale TTL", () => {
    assert.equal(STALE_GENERATION_TTL_MS, 20 * 60 * 1000);
    assert.equal(
      isOpenRouterWaitBudgetBelowStaleTtl(DEFAULT_OPENROUTER_WAIT_BUDGET_MS),
      true,
    );
    assert.equal(
      isOpenRouterWaitBudgetBelowStaleTtl(OPENROUTER_RENDERING_CONFIG.timeoutMs),
      true,
    );
    assert.equal(
      isOpenRouterWaitBudgetBelowStaleTtl(STALE_GENERATION_TTL_MS, STALE_GENERATION_TTL_MS),
      false,
    );
    assert.ok(DEFAULT_OPENROUTER_WAIT_BUDGET_MS < STALE_GENERATION_TTL_MS);
    assert.ok(
      DEFAULT_OPENROUTER_WAIT_BUDGET_MS + GENERATION_HEARTBEAT_INTERVAL_MS <
        STALE_GENERATION_TTL_MS,
    );
    assert.throws(
      () => resolveOpenRouterWaitBudgetMs(String(STALE_GENERATION_TTL_MS)),
      /strictly below STALE_GENERATION_TTL_MS/,
    );
    assert.throws(
      () => resolveOpenRouterWaitBudgetMs(String(STALE_GENERATION_TTL_MS + 1)),
      /strictly below STALE_GENERATION_TTL_MS/,
    );
    assert.equal(
      resolveOpenRouterWaitBudgetMs(String(STALE_GENERATION_TTL_MS - 1)),
      STALE_GENERATION_TTL_MS - 1,
    );
  });

  it("does not treat an in-budget OpenRouter wait as abandoned while heartbeat is alive", () => {
    const now = Date.parse("2026-08-17T12:18:00.000Z");
    const lastHeartbeat = new Date(now - GENERATION_HEARTBEAT_INTERVAL_MS);

    assert.equal(
      isInFlightRenderAbandoned(lastHeartbeat, now, STALE_GENERATION_TTL_MS),
      false,
    );
  });

  it("treats wait-budget expiry as terminal only after that budget, with no retry", () => {
    const abort = new Error("This operation was aborted");
    abort.name = "AbortError";

    assert.equal(isOpenRouterAbortError(abort), true);
    assert.equal(shouldRetryOpenRouterAttempt(abort, 0, 1), false);
    assert.equal(
      describeOpenRouterAttemptFailure(abort),
      OPENROUTER_WAIT_BUDGET_EXPIRED_MESSAGE,
    );
    assert.equal(OPENROUTER_WAIT_BUDGET_EXPIRED_MESSAGE.includes("cancel"), false);
    assert.equal(/gemini/i.test(OPENROUTER_WAIT_BUDGET_EXPIRED_MESSAGE), false);
  });

  it("still retries a non-abort provider error once", () => {
    const httpError = new Error("OpenRouter API error: HTTP 502");
    assert.equal(shouldRetryOpenRouterAttempt(httpError, 0, 1), true);
    assert.equal(shouldRetryOpenRouterAttempt(httpError, 1, 1), false);
    assert.equal(describeOpenRouterAttemptFailure(httpError), httpError.message);
  });
});
