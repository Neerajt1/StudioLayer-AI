import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  creditCostPerCompletedImageInBatch,
  DEFAULT_OUTPUT_RESOLUTION,
  normalizeOutputResolution,
  resolutionCreditMultiplier,
  resolveGenerationCreditCost,
} from "./index.js";

describe("output resolution credit rules", () => {
  it("defaults to 2K", () => {
    assert.equal(DEFAULT_OUTPUT_RESOLUTION, "2K");
    assert.equal(normalizeOutputResolution(undefined), "2K");
    assert.equal(normalizeOutputResolution("4K"), "4K");
    assert.equal(resolutionCreditMultiplier("2K"), 1);
    assert.equal(resolutionCreditMultiplier("4K"), 2);
  });

  it("Hero / Campaign / Editorial credit costs scale with resolution", () => {
    assert.equal(resolveGenerationCreditCost({ imageCount: 1 }), 1);
    assert.equal(resolveGenerationCreditCost({ imageCount: 1, outputResolution: "2K" }), 1);
    assert.equal(resolveGenerationCreditCost({ imageCount: 1, outputResolution: "4K" }), 2);

    assert.equal(resolveGenerationCreditCost({ imageCount: 2, outputResolution: "2K" }), 2);
    assert.equal(resolveGenerationCreditCost({ imageCount: 2, outputResolution: "4K" }), 4);

    assert.equal(resolveGenerationCreditCost({ imageCount: 4, outputResolution: "2K" }), 4);
    assert.equal(resolveGenerationCreditCost({ imageCount: 4, outputResolution: "4K" }), 8);
  });

  it("Custom Campaign N-shot follows N / 2N rule", () => {
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 6, customCampaign: true, outputResolution: "2K" }),
      6,
    );
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 6, customCampaign: true, outputResolution: "4K" }),
      12,
    );
  });

  it("per-completed-image cost is 1 for 2K and 2 for 4K", () => {
    assert.equal(
      creditCostPerCompletedImageInBatch({ imageCount: 4, outputResolution: "2K" }),
      1,
    );
    assert.equal(
      creditCostPerCompletedImageInBatch({ imageCount: 4, outputResolution: "4K" }),
      2,
    );
    assert.equal(
      creditCostPerCompletedImageInBatch({ imageCount: 2, customCampaign: false, outputResolution: "4K" }),
      2,
    );
  });

  it("refinements ignore resolution multiplier", () => {
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, isRefinement: true, outputResolution: "4K" }),
      1,
    );
    assert.equal(
      creditCostPerCompletedImageInBatch({ imageCount: 1, isRefinement: true, outputResolution: "4K" }),
      1,
    );
  });
});
