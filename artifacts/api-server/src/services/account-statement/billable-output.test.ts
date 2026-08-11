import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import type { Render, StudioCreditTransaction } from "@workspace/db";
import {
  billableGenerationImagesForTransaction,
  countRenderOutcomes,
  deriveSessionActivityStatus,
  refinementRendersInSession,
  rootRendersInSession,
} from "./billable-output.js";

function render(partial: Partial<Render> & Pick<Render, "id">): Render {
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

function usageTx(
  partial: Partial<StudioCreditTransaction> &
    Pick<StudioCreditTransaction, "id" | "reasonCode" | "amount">,
): StudioCreditTransaction {
  return {
    transactionId: `tx-${partial.id}`,
    userId: 1,
    workspaceId: 1,
    status: "completed",
    renderId: 1,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    ...partial,
  };
}

describe("billableGenerationImagesForTransaction", () => {
  it("counts completed root renders for partial editorial failure", () => {
    const sessionRenders = [
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "completed" }),
      render({ id: 3, status: "failed" }),
      render({ id: 4, status: "failed" }),
    ];
    const tx = usageTx({
      id: 10,
      reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
      amount: -2,
    });

    assert.equal(
      billableGenerationImagesForTransaction(tx, sessionRenders),
      2,
    );
  });

  it("returns zero billable images for all-failed editorial batch", () => {
    const sessionRenders = [
      render({ id: 1, status: "failed" }),
      render({ id: 2, status: "failed" }),
      render({ id: 3, status: "failed" }),
      render({ id: 4, status: "failed" }),
    ];
    const tx = usageTx({
      id: 11,
      reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
      amount: 0,
    });

    assert.equal(
      billableGenerationImagesForTransaction(tx, sessionRenders),
      0,
    );
  });

  it("falls back to ledger amount when renders were deleted after billing", () => {
    const tx = usageTx({
      id: 12,
      reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
      amount: -2,
    });

    assert.equal(billableGenerationImagesForTransaction(tx, []), 2);
  });

  it("supports custom campaign batches larger than fixed campaign reason-code count", () => {
    const sessionRenders = Array.from({ length: 6 }, (_, index) =>
      render({
        id: index + 1,
        generationType: "campaign",
        status: index < 5 ? "completed" : "failed",
      }),
    );
    const tx = usageTx({
      id: 13,
      reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
      amount: -5,
    });

    assert.equal(
      billableGenerationImagesForTransaction(tx, sessionRenders),
      5,
    );
  });
});

describe("deriveSessionActivityStatus", () => {
  it("marks full success as Completed", () => {
    const roots = countRenderOutcomes([
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "completed" }),
    ]);

    assert.equal(
      deriveSessionActivityStatus(roots, { requested: 0, completed: 0, failed: 0 }),
      "Completed",
    );
  });

  it("marks partial success as Partial", () => {
    const roots = countRenderOutcomes([
      render({ id: 1, status: "completed" }),
      render({ id: 2, status: "failed" }),
    ]);

    assert.equal(
      deriveSessionActivityStatus(roots, { requested: 0, completed: 0, failed: 0 }),
      "Partial",
    );
  });

  it("marks all-failed sessions as Failed", () => {
    const roots = countRenderOutcomes([
      render({ id: 1, status: "failed" }),
      render({ id: 2, status: "failed" }),
    ]);

    assert.equal(
      deriveSessionActivityStatus(roots, { requested: 0, completed: 0, failed: 0 }),
      "Failed",
    );
  });

  it("marks failed refinement sessions as Failed with zero billable refinements", () => {
    const refinements = countRenderOutcomes([
      render({
        id: 5,
        parentRenderId: 1,
        status: "failed",
      }),
    ]);

    assert.equal(
      deriveSessionActivityStatus(
        { requested: 0, completed: 0, failed: 0 },
        refinements,
      ),
      "Failed",
    );
    assert.equal(refinementRendersInSession([render({ id: 5, parentRenderId: 1, status: "failed" })]).length, 1);
    assert.equal(rootRendersInSession([render({ id: 5, parentRenderId: 1, status: "failed" })]).length, 0);
  });
});
