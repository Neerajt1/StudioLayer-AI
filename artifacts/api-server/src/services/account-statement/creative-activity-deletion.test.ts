import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import type {
  Render,
  RenderDeletionEvent,
  StudioCreditTransaction,
  User,
} from "@workspace/db";
import {
  aggregateMasterByMonth,
  buildMasterCreativeActivity,
  countMasterImagesGenerated,
  deriveBillingCycleActivityStats,
  filterMasterRowsForCycle,
  reconcileMasterWithLedger,
  sumMasterCreditsUsed,
  type CreativeActivityContext,
} from "./creative-activity-master.js";

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
    outputResolution: "2K",
    studioCreditsUsed: 1,
    refinementCount: 0,
    generationSessionId: "editorial-4",
    selectedPoseName: null,
    selectedPoseFamily: null,
    createdAt: new Date("2026-08-05T12:00:00.000Z"),
    updatedAt: new Date("2026-08-05T12:00:00.000Z"),
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
    createdAt: new Date("2026-08-05T12:00:00.000Z"),
    ...partial,
  };
}

function deletionEvent(
  partial: Partial<RenderDeletionEvent> &
    Pick<RenderDeletionEvent, "id" | "renderId">,
): RenderDeletionEvent {
  return {
    userId: 1,
    generationSessionId: "editorial-4",
    generationType: "editorial",
    originalCreditsConsumed: 4,
    deletedBy: "user",
    deletedAt: new Date("2026-08-08T12:00:00.000Z"),
    ...partial,
  };
}

function baseContext(
  overrides: Partial<CreativeActivityContext>,
): CreativeActivityContext {
  const cycleStart = new Date(Date.UTC(2026, 7, 1));

  return {
    user: { subscriptionTier: "pro" } as User,
    cycleStart,
    transactions: [],
    renders: [],
    deletionEvents: [] as RenderDeletionEvent[],
    ...overrides,
  };
}

function editorialFourImageContext(
  survivingRenderIds: readonly number[],
  deletedRenderIds: readonly number[],
): CreativeActivityContext {
  const allIds = [...survivingRenderIds, ...deletedRenderIds].sort(
    (left, right) => left - right,
  );

  return baseContext({
    renders: survivingRenderIds.map((id) => render({ id })),
    deletionEvents: deletedRenderIds.map((renderId, index) =>
      deletionEvent({ id: 100 + index, renderId }),
    ),
    transactions: [
      usageTx({
        id: 1,
        reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
        amount: -4,
        renderId: allIds[0] ?? 1,
      }),
    ],
  });
}

function cycleStats(ctx: CreativeActivityContext) {
  const master = buildMasterCreativeActivity(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);
  return {
    master,
    stats: deriveBillingCycleActivityStats(cycleRows),
    cycleRows,
  };
}

function editorialPartialTwoOfFourContext(
  surviving: Array<Partial<Render> & Pick<Render, "id">>,
  deleted: Array<{
    renderId: number;
    originalCreditsConsumed: number;
  }>,
): CreativeActivityContext {
  return baseContext({
    renders: surviving.map((partial) =>
      render({
        studioCreditsUsed: 2,
        ...partial,
      }),
    ),
    deletionEvents: deleted.map((entry, index) =>
      deletionEvent({
        id: 100 + index,
        renderId: entry.renderId,
        originalCreditsConsumed: entry.originalCreditsConsumed,
      }),
    ),
    transactions: [
      usageTx({
        id: 1,
        reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
        amount: -2,
        renderId: 1,
      }),
    ],
  });
}

describe("Creative Activity Master — deleted render historical preservation", () => {
  it("1. Generate 4 images → delete 1 → master still contains 4 generation rows", () => {
    const ctx = editorialFourImageContext([2, 3, 4], [1]);
    const master = buildMasterCreativeActivity(ctx);
    const generationRows = master.rows.filter(
      (row) => row.activityType === "Generation",
    );

    assert.equal(generationRows.length, 4);
    assert.equal(generationRows.some((row) => row.renderId === 1), true);
    assert.equal(
      generationRows.find((row) => row.renderId === 1)!.imageDeleted,
      true,
    );
  });

  it("2. Generate 4 images → delete 1 → Images Created remains 4", () => {
    const ctx = editorialFourImageContext([2, 3, 4], [1]);
    const { stats } = cycleStats(ctx);

    assert.equal(countMasterImagesGenerated(buildMasterCreativeActivity(ctx).rows), 4);
    assert.equal(stats.imagesCreated, 4);
  });

  it("3. Generate 4 images → delete 1 → Credits Used remains 4", () => {
    const ctx = editorialFourImageContext([2, 3, 4], [1]);
    const { stats } = cycleStats(ctx);

    assert.equal(sumMasterCreditsUsed(buildMasterCreativeActivity(ctx).rows), 4);
    assert.equal(stats.studioCreditsUsed, 4);
  });

  it("4. Generate 4 images → delete all 4 → Images Created and Credits Used remain 4", () => {
    const ctx = editorialFourImageContext([], [1, 2, 3, 4]);
    const { stats } = cycleStats(ctx);
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(
      master.rows.filter((row) => row.activityType === "Generation").length,
      4,
    );
    assert.equal(stats.imagesCreated, 4);
    assert.equal(stats.studioCreditsUsed, 4);
    assert.equal(
      master.rows.every(
        (row) => row.activityType !== "Generation" || row.imageDeleted === true,
      ),
      true,
    );
  });

  it("5. Partial generation 2/4 → delete one successful image → Images Created and Credits Used remain 2", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 2, status: "completed" }),
        render({ id: 3, status: "failed" }),
        render({ id: 4, status: "failed" }),
      ],
      deletionEvents: [deletionEvent({ id: 10, renderId: 1 })],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -2,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const { stats } = cycleStats(ctx);

    assert.equal(
      master.rows.filter((row) => row.activityType === "Generation").length,
      4,
    );
    assert.equal(countMasterImagesGenerated(master.rows), 2);
    assert.equal(sumMasterCreditsUsed(master.rows), 2);
    assert.equal(stats.imagesCreated, 2);
    assert.equal(stats.studioCreditsUsed, 2);
  });

  it("6. Failed image deletion remains 0 credits even when deletion event carries batch charge", () => {
    const ctx = editorialPartialTwoOfFourContext(
      [
        { id: 1, status: "completed" },
        { id: 2, status: "completed" },
        { id: 4, status: "failed" },
      ],
      [{ renderId: 3, originalCreditsConsumed: 2 }],
    );

    const master = buildMasterCreativeActivity(ctx);
    const failedDeleted = master.rows.find((row) => row.renderId === 3)!;

    assert.equal(failedDeleted.result, "Failed");
    assert.equal(failedDeleted.billableImage, false);
    assert.equal(failedDeleted.creditsUsed, 0);
    assert.equal(failedDeleted.imageDeleted, true);
    assert.equal(countMasterImagesGenerated(master.rows), 2);
    assert.equal(sumMasterCreditsUsed(master.rows), 2);
  });

  it("7. Existing render + deletion event produces exactly one master row", () => {
    const ctx = baseContext({
      renders: [render({ id: 1 })],
      deletionEvents: [deletionEvent({ id: 10, renderId: 1 })],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -1,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rowsForRender = master.rows.filter((row) => row.renderId === 1);

    assert.equal(rowsForRender.length, 1);
    assert.equal(rowsForRender[0]!.imageDeleted, undefined);
  });

  it("8. Deleted render + deletion event preserves exactly one historical master row", () => {
    const ctx = editorialFourImageContext([2, 3, 4], [1]);
    const master = buildMasterCreativeActivity(ctx);
    const rowsForRender = master.rows.filter((row) => row.renderId === 1);

    assert.equal(rowsForRender.length, 1);
    assert.equal(rowsForRender[0]!.activityType, "Generation");
    assert.equal(rowsForRender[0]!.imageDeleted, true);
    assert.equal(rowsForRender[0]!.billableImage, true);
    assert.equal(rowsForRender[0]!.creditsUsed, 1);
  });

  it("9. Deleted image does not create a credit deduction or refund", () => {
    const before = editorialFourImageContext([1, 2, 3, 4], []);
    const after = editorialFourImageContext([2, 3, 4], [1]);

    const beforeReconciliation = reconcileMasterWithLedger(
      before,
      buildMasterCreativeActivity(before),
    );
    const afterReconciliation = reconcileMasterWithLedger(
      after,
      buildMasterCreativeActivity(after),
    );

    assert.equal(before.transactions.length, after.transactions.length);
    assert.equal(beforeReconciliation.ledgerCreditsUsed, 4);
    assert.equal(afterReconciliation.ledgerCreditsUsed, 4);
    assert.equal(afterReconciliation.masterCreditsUsed, 4);
    assert.equal(afterReconciliation.creditsReconcile, true);
    assert.equal(
      after.transactions.some(
        (tx) => tx.amount > 0 || tx.reasonCode.includes("refund"),
      ),
      false,
    );
  });

  it("10. Gallery cycle statistics before and after deletion are identical", () => {
    const beforeCtx = editorialFourImageContext([1, 2, 3, 4], []);
    const afterCtx = editorialFourImageContext([2, 3, 4], [1]);

    const before = cycleStats(beforeCtx);
    const after = cycleStats(afterCtx);

    assert.deepEqual(after.stats, before.stats);
    assert.equal(before.stats.imagesCreated, 4);
    assert.equal(before.stats.studioCreditsUsed, 4);
    assert.equal(after.stats.imagesCreated, 4);
    assert.equal(after.stats.studioCreditsUsed, 4);

    const beforeMonth = aggregateMasterByMonth(before.master.rows).get("2026-08")!;
    const afterMonth = aggregateMasterByMonth(after.master.rows).get("2026-08")!;

    assert.deepEqual(afterMonth, beforeMonth);
  });

  it("11. Partial 2/4 delete successful render — retains billable credit via ledger/session evidence", () => {
    const ctx = editorialPartialTwoOfFourContext(
      [
        { id: 2, status: "completed" },
        { id: 3, status: "failed" },
        { id: 4, status: "failed" },
      ],
      [{ renderId: 1, originalCreditsConsumed: 2 }],
    );

    const master = buildMasterCreativeActivity(ctx);
    const deletedSuccessful = master.rows.find((row) => row.renderId === 1)!;

    assert.equal(
      master.rows.filter((row) => row.activityType === "Generation").length,
      4,
    );
    assert.equal(countMasterImagesGenerated(master.rows), 2);
    assert.equal(sumMasterCreditsUsed(master.rows), 2);
    assert.equal(deletedSuccessful.result, "Completed");
    assert.equal(deletedSuccessful.creditsUsed, 1);
    assert.equal(deletedSuccessful.billableImage, true);
    assert.equal(deletedSuccessful.outcomeUnresolved, undefined);
  });

  it("12. Partial 2/4 delete failed render — batch originalCreditsConsumed cannot upgrade it to billable", () => {
    const ctx = editorialPartialTwoOfFourContext(
      [
        { id: 1, status: "completed" },
        { id: 2, status: "completed" },
        { id: 4, status: "failed" },
      ],
      [{ renderId: 3, originalCreditsConsumed: 2 }],
    );

    const master = buildMasterCreativeActivity(ctx);
    const deletedFailed = master.rows.find((row) => row.renderId === 3)!;

    assert.equal(countMasterImagesGenerated(master.rows), 2);
    assert.equal(sumMasterCreditsUsed(master.rows), 2);
    assert.equal(deletedFailed.result, "Failed");
    assert.equal(deletedFailed.creditsUsed, 0);
    assert.equal(deletedFailed.billableImage, false);
    assert.equal(deletedFailed.outcomeUnresolved, undefined);
  });

  it("13. Deleted successful refinement retains 1 credit from per-render ledger tx", () => {
    const ctx = baseContext({
      renders: [render({ id: 1, generationSessionId: "session-1" })],
      deletionEvents: [
        deletionEvent({
          id: 10,
          renderId: 2,
          generationSessionId: "session-1",
          originalCreditsConsumed: 2,
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -1,
          renderId: 1,
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: 2,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const deletedRefinement = master.rows.find((row) => row.renderId === 2)!;

    assert.equal(deletedRefinement.activityType, "Refinement");
    assert.equal(deletedRefinement.result, "Completed");
    assert.equal(deletedRefinement.creditsUsed, 1);
    assert.equal(deletedRefinement.parentRenderId, null);
    assert.equal(deletedRefinement.imageDeleted, true);
  });

  it("14. Deleted failed refinement remains 0 credits despite batch originalCreditsConsumed", () => {
    const ctx = baseContext({
      renders: [render({ id: 1, generationSessionId: "session-1" })],
      deletionEvents: [
        deletionEvent({
          id: 10,
          renderId: 2,
          generationSessionId: "session-1",
          originalCreditsConsumed: 2,
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -1,
          renderId: 1,
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: 0,
          renderId: 2,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const deletedRefinement = master.rows.find((row) => row.renderId === 2)!;

    assert.equal(deletedRefinement.result, "Failed");
    assert.equal(deletedRefinement.creditsUsed, 0);
    assert.equal(deletedRefinement.billableImage, false);
  });
});
