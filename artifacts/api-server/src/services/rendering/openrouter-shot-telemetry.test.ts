import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpenRouterShotTimingFields,
  emptyOpenRouterResponseTelemetry,
  extractOpenRouterBodyTelemetry,
  extractOpenRouterHeaderTelemetry,
  mergeOpenRouterResponseTelemetry,
  tryParseOpenRouterJson,
} from "./openrouter-shot-telemetry.js";
import { OPENROUTER_SHOT_STAGGER_MS } from "./providers/OpenRouterProvider.js";
import { OPENROUTER_RENDERING_CONFIG, resolveOpenRouterModelForResolution } from "./rendering.config.js";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("OpenRouter shot telemetry extraction", () => {
  it("captures request id, provider, finish reason, and usage when present", () => {
    const body = {
      id: "gen-abc123",
      provider: "Google AI Studio",
      choices: [{ finish_reason: "stop" }],
      usage: {
        prompt_tokens: 10240,
        completion_tokens: 1800,
        total_tokens: 12040,
      },
    };

    const telemetry = mergeOpenRouterResponseTelemetry(
      headers({ "x-request-id": "req-header-1" }),
      body,
    );

    assert.equal(telemetry.openrouterRequestId, "gen-abc123");
    assert.equal(telemetry.headerRequestId, "req-header-1");
    assert.equal(telemetry.provider, "Google AI Studio");
    assert.equal(telemetry.finishReason, "stop");
    assert.equal(telemetry.usage.promptTokens, 10240);
    assert.equal(telemetry.usage.completionTokens, 1800);
    assert.equal(telemetry.usage.totalTokens, 12040);
  });

  it("uses header provider only when body provider is absent", () => {
    const fromHeader = extractOpenRouterHeaderTelemetry(
      headers({ "x-openrouter-provider": "Google Vertex" }),
    );
    const fromBody = extractOpenRouterBodyTelemetry({ id: "gen-1" });

    assert.equal(fromHeader.provider, "Google Vertex");
    assert.equal(fromBody.provider, null);

    const merged = mergeOpenRouterResponseTelemetry(
      headers({ "x-openrouter-provider": "Google Vertex" }),
      { id: "gen-1" },
    );
    assert.equal(merged.provider, "Google Vertex");
    assert.equal(merged.openrouterRequestId, "gen-1");
  });

  it("records nulls when optional metadata is missing", () => {
    const telemetry = extractOpenRouterBodyTelemetry({});
    assert.equal(telemetry.openrouterRequestId, null);
    assert.equal(telemetry.provider, null);
    assert.equal(telemetry.finishReason, null);
    assert.equal(telemetry.usage.promptTokens, null);
    assert.equal(telemetry.usage.completionTokens, null);
    assert.equal(telemetry.usage.totalTokens, null);

    const empty = emptyOpenRouterResponseTelemetry();
    assert.equal(empty.openrouterRequestId, null);
    assert.equal(empty.headerRequestId, null);
  });

  it("does not invent usage from non-numeric fields", () => {
    const telemetry = extractOpenRouterBodyTelemetry({
      usage: { prompt_tokens: "10240", completion_tokens: undefined },
    });
    assert.equal(telemetry.usage.promptTokens, null);
    assert.equal(telemetry.usage.completionTokens, null);
  });
});

describe("OpenRouter shot timing log fields", () => {
  it("records split timing for a successful response", () => {
    const fetchStartMs = Date.parse("2026-08-17T12:00:00.000Z");
    const fields = buildOpenRouterShotTimingFields({
      generationSessionId: "session-1",
      renderId: 42,
      shotIndex: 2,
      attempt: 0,
      model: "google/gemini-3.1-flash-image",
      imageSize: "2K",
      httpStatus: 200,
      success: true,
      failurePhase: null,
      errorMessage: null,
      openrouterRequestId: "gen-abc123",
      headerRequestId: "req-header-1",
      provider: "Google AI Studio",
      finishReason: "stop",
      promptTokens: 10000,
      completionTokens: 2000,
      totalTokens: 12000,
      fetchStartMs,
      headersAtMs: fetchStartMs + 900_000,
      bodyCompleteAtMs: fetchStartMs + 901_000,
      parseCompleteAtMs: fetchStartMs + 901_050,
      shotCompleteMs: fetchStartMs + 901_080,
    });

    assert.equal(fields.event, "openrouter:shot_timing");
    assert.equal(fields.generationSessionId, "session-1");
    assert.equal(fields.renderId, 42);
    assert.equal(fields.shotIndex, 2);
    assert.equal(fields.imageSize, "2K");
    assert.equal(fields.openrouterRequestId, "gen-abc123");
    assert.equal(fields.provider, "Google AI Studio");
    assert.equal(fields.promptTokens, 10000);
    assert.equal(fields.headersWaitMs, 900_000);
    assert.equal(fields.bodyReadMs, 1_000);
    assert.equal(fields.parseMs, 50);
    assert.equal(fields.totalShotMs, 901_080);
    assert.equal(fields.success, true);
    assert.equal(fields.failurePhase, null);
  });

  it("records fetch-phase failure without claiming headers arrived", () => {
    const fetchStartMs = Date.parse("2026-08-17T12:00:00.000Z");
    const abort = new Error("This operation was aborted");
    abort.name = "AbortError";
    const fields = buildOpenRouterShotTimingFields({
      generationSessionId: "session-1",
      renderId: 7,
      shotIndex: 0,
      attempt: 0,
      model: "google/gemini-3.1-flash-image",
      imageSize: "2K",
      httpStatus: null,
      success: false,
      failurePhase: "fetch",
      errorMessage: "This operation was aborted",
      openrouterRequestId: null,
      headerRequestId: null,
      provider: null,
      finishReason: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      fetchStartMs,
      headersAtMs: null,
      bodyCompleteAtMs: null,
      parseCompleteAtMs: null,
      shotCompleteMs: fetchStartMs + 90_000,
    });

    assert.equal(fields.failurePhase, "fetch");
    assert.equal(fields.success, false);
    assert.equal(fields.headersAt, null);
    assert.equal(fields.bodyReadMs, null);
    assert.equal(fields.parseMs, null);
    assert.equal(fields.headersWaitMs, null);
    assert.equal(fields.totalShotMs, 90_000);
    assert.equal(fields.errorMessage, "This operation was aborted");
  });

  it("records http failure phase for non-OK status", () => {
    const fetchStartMs = Date.parse("2026-08-17T12:00:00.000Z");
    const fields = buildOpenRouterShotTimingFields({
      generationSessionId: null,
      renderId: 1,
      shotIndex: 1,
      attempt: 0,
      model: "google/gemini-3.1-flash-image",
      imageSize: "4K",
      httpStatus: 502,
      success: false,
      failurePhase: "http",
      errorMessage: "OpenRouter API error: HTTP 502",
      openrouterRequestId: null,
      headerRequestId: "req-2",
      provider: null,
      finishReason: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      fetchStartMs,
      headersAtMs: fetchStartMs + 200,
      bodyCompleteAtMs: fetchStartMs + 250,
      parseCompleteAtMs: fetchStartMs + 251,
      shotCompleteMs: fetchStartMs + 251,
    });

    assert.equal(fields.failurePhase, "http");
    assert.equal(fields.status, 502);
    assert.equal(fields.imageSize, "4K");
    assert.equal(fields.headerRequestId, "req-2");
  });

  it("does not include prompts, images, or authorization in the log payload", () => {
    const fields = buildOpenRouterShotTimingFields({
      generationSessionId: "session-1",
      renderId: 9,
      shotIndex: 0,
      attempt: 0,
      model: "google/gemini-3.1-flash-image",
      imageSize: "2K",
      httpStatus: 200,
      success: true,
      failurePhase: null,
      errorMessage: null,
      openrouterRequestId: "gen-1",
      headerRequestId: null,
      provider: null,
      finishReason: "stop",
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      fetchStartMs: 1,
      headersAtMs: 2,
      bodyCompleteAtMs: 3,
      parseCompleteAtMs: 4,
      shotCompleteMs: 5,
    });

    const serialized = JSON.stringify(fields);
    assert.equal("prompt" in fields, false);
    assert.equal("authorization" in fields, false);
    assert.equal("messages" in fields, false);
    assert.equal("images" in fields, false);
    assert.equal("body" in fields, false);
    assert.equal(/data:image/i.test(serialized), false);
    assert.equal(/Bearer /i.test(serialized), false);
    assert.equal(/sk-or-/i.test(serialized), false);
  });
});

describe("OpenRouter JSON parse helper", () => {
  it("returns null for invalid JSON rather than throwing", () => {
    assert.equal(tryParseOpenRouterJson("{not json"), null);
    assert.deepEqual(tryParseOpenRouterJson("{\"id\":\"gen-1\"}"), { id: "gen-1" });
  });
});

describe("OpenRouter Campaign fan-out is unchanged", () => {
  it("keeps the 150ms stagger and 2K/4K model selection", () => {
    const prev = process.env["OR_RENDER_ENGINE"];
    process.env["OR_RENDER_ENGINE"] = "flash";
    try {
      assert.equal(OPENROUTER_SHOT_STAGGER_MS, 150);
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        OPENROUTER_RENDERING_CONFIG.defaultModel,
      );
      assert.equal(
        resolveOpenRouterModelForResolution("4K"),
        OPENROUTER_RENDERING_CONFIG.flashPreviewModel,
      );
      assert.equal(OPENROUTER_RENDERING_CONFIG.outputAspectRatio, "4:5");
    } finally {
      if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
      else process.env["OR_RENDER_ENGINE"] = prev;
    }
  });
});
