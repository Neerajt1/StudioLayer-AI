import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_OUTPUT_RESOLUTION } from "@workspace/studio-credit-engine";
import {
  normalizeStudioWorkflow,
  buildGenerationRequest,
  EMPTY_STUDIO_WORKFLOW,
} from "./studio-workflow.js";

describe("studio workflow output resolution", () => {
  it("defaults to 2K", () => {
    assert.equal(EMPTY_STUDIO_WORKFLOW.outputResolution, "2K");
    assert.equal(normalizeStudioWorkflow({}).outputResolution, DEFAULT_OUTPUT_RESOLUTION);
  });

  it("preserves 4K selection in generation request", () => {
    const workflow = normalizeStudioWorkflow({
      sourceImageUrl: "data:image/jpeg;base64,abc",
      garmentPlacement: "upper_body",
      talentId: "F-CA-01",
      imageCount: 1,
      outputResolution: "4K",
    });
    const request = buildGenerationRequest(workflow, { id: "F-CA-01" });
    assert.equal(request.outputResolution, "4K");
    assert.equal(request.imageCount, 1);
  });

  it("includes 2K by default in generation request", () => {
    const workflow = normalizeStudioWorkflow({
      sourceImageUrl: "data:image/jpeg;base64,abc",
      garmentPlacement: "upper_body",
      talentId: "F-CA-01",
      imageCount: 2,
    });
    const request = buildGenerationRequest(workflow, { id: "F-CA-01" });
    assert.equal(request.outputResolution, "2K");
  });
});
