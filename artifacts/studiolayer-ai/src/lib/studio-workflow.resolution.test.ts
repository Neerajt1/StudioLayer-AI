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

  it("V1 Create always sends imageCount 1 regardless of stored multi-shot state", () => {
    const identity = { id: "F-CA-01" };
    const base = {
      sourceImageUrl: "data:image/jpeg;base64,abc",
      garmentPlacement: "upper_body" as const,
      talentId: "F-CA-01",
    };

    assert.equal(
      buildGenerationRequest(normalizeStudioWorkflow({ ...base, imageCount: 1 }), identity)
        .imageCount,
      1,
    );
    assert.equal(
      buildGenerationRequest(normalizeStudioWorkflow({ ...base, imageCount: 2 }), identity)
        .imageCount,
      1,
    );
    assert.equal(
      buildGenerationRequest(normalizeStudioWorkflow({ ...base, imageCount: 4 }), identity)
        .imageCount,
      1,
    );

    const custom = buildGenerationRequest(
      normalizeStudioWorkflow({
        ...base,
        customCampaign: true,
        customImageCount: 6,
      }),
      identity,
    );
    assert.equal(custom.imageCount, 1);
    assert.equal("customCampaign" in custom, false);
  });
});

describe("studio workflow garment reference payload", () => {
  const identity = { id: "F-CA-01" };
  const front = "data:image/jpeg;base64,front";
  const back = "data:image/jpeg;base64,back";
  const detail = "data:image/jpeg;base64,detail";
  const base = {
    sourceImageUrl: front,
    garmentPlacement: "full_body" as const,
    talentId: "F-CA-01",
    imageCount: 1 as const,
  };

  it("A — Front only omits backImageUrl and detailImageUrl", () => {
    const request = buildGenerationRequest(normalizeStudioWorkflow(base), identity);
    assert.equal(request.sourceImageUrl, front);
    assert.equal("backImageUrl" in request, false);
    assert.equal("detailImageUrl" in request, false);
  });

  it("B — Front + Back includes backImageUrl only", () => {
    const request = buildGenerationRequest(
      normalizeStudioWorkflow({ ...base, backImageUrl: back }),
      identity,
    );
    assert.equal(request.sourceImageUrl, front);
    assert.equal(request.backImageUrl, back);
    assert.equal("detailImageUrl" in request, false);
  });

  it("C — Front + Detail includes detailImageUrl only", () => {
    const request = buildGenerationRequest(
      normalizeStudioWorkflow({ ...base, detailImageUrl: detail }),
      identity,
    );
    assert.equal(request.sourceImageUrl, front);
    assert.equal(request.detailImageUrl, detail);
    assert.equal("backImageUrl" in request, false);
  });

  it("D — Front + Back + Detail includes all three", () => {
    const request = buildGenerationRequest(
      normalizeStudioWorkflow({
        ...base,
        backImageUrl: back,
        detailImageUrl: detail,
      }),
      identity,
    );
    assert.equal(request.sourceImageUrl, front);
    assert.equal(request.backImageUrl, back);
    assert.equal(request.detailImageUrl, detail);
  });

  it("normalizes missing optional refs to empty strings", () => {
    const workflow = normalizeStudioWorkflow({ sourceImageUrl: front });
    assert.equal(workflow.backImageUrl, "");
    assert.equal(workflow.detailImageUrl, "");
    assert.equal(EMPTY_STUDIO_WORKFLOW.backImageUrl, "");
    assert.equal(EMPTY_STUDIO_WORKFLOW.detailImageUrl, "");
  });
});
