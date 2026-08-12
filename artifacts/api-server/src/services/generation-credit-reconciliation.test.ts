import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import type { Render } from "@workspace/db";
import {
  isGenerationCreditReasonCode,
  isRefinementOrphanReasonCode,
  isRootGenerationBatchTerminal,
  resolvePendingGenerationFinalization,
} from "./generation-credit-reconciliation.js";

function render(
  partial: Partial<Render> & Pick<Render, "id">,
): Render {
  return {
    userId: 1,
    sourceImageUrl: null,
    outputImageUrl: null,
    transparentOutputImageUrl: null,
    modelPersona: "test",
    locationEnvironment: "test",
    status: "completed",
    parentRenderId: null,
    masterRenderId: partial.id,
    assetVersion: 1,
    assetType: "master",
    refinementType: null,
    sourceAssetVersion: null,
    cropPreset: null,
    generationType: "editorial",
    outputResolution: "2K",
    studioCreditsUsed: 1,
    refinementCount: 0,
    generationSessionId: "session-1",
    selectedPoseName: null,
    selectedPoseFamily: null,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    ...partial,
  };
}

describe("generation vs refinement orphan reason codes", () => {
  it("12. generation reason codes are not refinement orphan candidates", () => {
    assert.equal(
      isRefinementOrphanReasonCode(StudioCreditReasonCode.EDITORIAL_GENERATION),
      false,
    );
    assert.equal(
      isRefinementOrphanReasonCode(StudioCreditReasonCode.CAMPAIGN_GENERATION),
      false,
    );
    assert.equal(
      isRefinementOrphanReasonCode(StudioCreditReasonCode.HERO_GENERATION),
      false,
    );
    assert.equal(
      isGenerationCreditReasonCode(StudioCreditReasonCode.EDITORIAL_GENERATION),
      true,
    );
  });

  it("13. refinement reason codes remain orphan candidates", () => {
    assert.equal(isRefinementOrphanReasonCode(StudioCreditReasonCode.REFINE), true);
    assert.equal(
      isRefinementOrphanReasonCode(StudioCreditReasonCode.REGENERATE),
      true,
    );
    assert.equal(isGenerationCreditReasonCode(StudioCreditReasonCode.REFINE), false);
  });
});

describe("resolvePendingGenerationFinalization", () => {
  it("8. 6 requested / 1 completed / 5 failed finalizes as -1", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed", generationType: "campaign" }),
      ...Array.from({ length: 5 }, (_, index) =>
        render({ id: index + 2, status: "failed", generationType: "campaign" }),
      ),
    ];

    const result = resolvePendingGenerationFinalization({
      holdAmount: -6,
      sessionRenders,
    });

    assert.deepEqual(result, {
      completedCount: 1,
      creditPerCompletedImage: 1,
    });
    assert.equal(result!.completedCount * result!.creditPerCompletedImage, 1);
  });

  it("9. 4 requested / 2 completed / 2 failed finalizes as -2", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "completed" }),
      render({ id: 3, status: "failed" }),
      render({ id: 4, status: "failed" }),
    ];

    const result = resolvePendingGenerationFinalization({
      holdAmount: -4,
      sessionRenders,
    });

    assert.deepEqual(result, {
      completedCount: 2,
      creditPerCompletedImage: 1,
    });
  });

  it("10. 4 requested / 4 completed finalizes as -4", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "completed" }),
      render({ id: 3, status: "completed" }),
      render({ id: 4, status: "completed" }),
    ];

    const result = resolvePendingGenerationFinalization({
      holdAmount: -4,
      sessionRenders,
    });

    assert.deepEqual(result, {
      completedCount: 4,
      creditPerCompletedImage: 1,
    });
  });

  it("11. 4 requested / 0 completed / 4 failed produces zero charge inputs", () => {
    const sessionRenders = [
      render({ id: 1, status: "failed" }),
      render({ id: 2, status: "failed" }),
      render({ id: 3, status: "failed" }),
      render({ id: 4, status: "failed" }),
    ];

    const result = resolvePendingGenerationFinalization({
      holdAmount: -4,
      sessionRenders,
    });

    assert.deepEqual(result, {
      completedCount: 0,
      creditPerCompletedImage: 1,
    });
  });

  it("14. stale partial generation with terminal root batch returns finalization inputs", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "failed" }),
      render({ id: 3, status: "failed" }),
      render({ id: 4, status: "failed" }),
      render({ id: 5, status: "failed" }),
      render({ id: 6, status: "failed" }),
    ];

    assert.equal(isRootGenerationBatchTerminal(sessionRenders), true);
    assert.deepEqual(
      resolvePendingGenerationFinalization({
        holdAmount: -6,
        sessionRenders,
      }),
      { completedCount: 1, creditPerCompletedImage: 1 },
    );
  });

  it("does not finalize while root generation renders are still in-flight", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "processing" }),
      render({ id: 3, status: "failed" }),
      render({ id: 4, status: "failed" }),
    ];

    assert.equal(isRootGenerationBatchTerminal(sessionRenders), false);
    assert.equal(
      resolvePendingGenerationFinalization({
        holdAmount: -4,
        sessionRenders,
      }),
      null,
    );
  });

  it("does not count refinement renders toward generation finalization", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "completed" }),
      render({
        id: 3,
        parentRenderId: 1,
        status: "processing",
      }),
    ];

    assert.equal(isRootGenerationBatchTerminal(sessionRenders), true);
    assert.deepEqual(
      resolvePendingGenerationFinalization({
        holdAmount: -2,
        sessionRenders,
      }),
      { completedCount: 2, creditPerCompletedImage: 1 },
    );
  });
});

describe("finalizeGenerationCreditTransaction idempotency contract", () => {
  it("15-17. repeated finalization inputs are stable for the same terminal session", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "failed" }),
    ];

    const first = resolvePendingGenerationFinalization({
      holdAmount: -2,
      sessionRenders,
    });
    const second = resolvePendingGenerationFinalization({
      holdAmount: -2,
      sessionRenders,
    });

    assert.deepEqual(first, second);
    assert.deepEqual(first, {
      completedCount: 1,
      creditPerCompletedImage: 1,
    });
  });
});
