import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resetScheduleRenderPreviewState,
  scheduleRenderPreviewGeneration,
} from "./schedule-render-preview.js";

describe("scheduleRenderPreviewGeneration", () => {
  it("H. failed preview generation does not throw to caller", () => {
    resetScheduleRenderPreviewState();

    assert.doesNotThrow(() => {
      scheduleRenderPreviewGeneration({
        renderId: 12345,
        sourceImageUrl: "https://invalid.example.test/does-not-exist.png",
        preserveAlpha: false,
      });
    });
  });

  it("skips non-http source URLs without throwing", () => {
    resetScheduleRenderPreviewState();

    assert.doesNotThrow(() => {
      scheduleRenderPreviewGeneration({
        renderId: 1,
        sourceImageUrl: "data:image/png;base64,abc",
      });
    });
  });
});
