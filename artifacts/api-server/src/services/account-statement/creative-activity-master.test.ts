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
  countMasterImagesFailed,
  countMasterImagesGenerated,
  countMasterRefinements,
  reconcileMasterWithLedger,
  sumMasterCreditsUsed,
  type CreativeActivityContext,
  type CreativeActivityRow,
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
    generationSessionId: "session-editorial",
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

function baseContext(
  overrides: Partial<CreativeActivityContext>,
): CreativeActivityContext {
  const cycleStart = new Date(Date.UTC(2026, 7, 1));

  return {
    user: {
      subscriptionTier: "pro",
    } as User,
    cycleStart,
    transactions: [],
    renders: [],
    deletionEvents: [] as RenderDeletionEvent[],
    ...overrides,
  };
}

function generationRows(rows: readonly CreativeActivityRow[]) {
  return rows.filter((row) => row.activityType === "Generation");
}

function refinementRows(rows: readonly CreativeActivityRow[]) {
  return rows.filter(
    (row) =>
      row.activityType === "Refinement" || row.activityType === "Remove Background",
  );
}

function sessionRows(rows: readonly CreativeActivityRow[], sessionId: string) {
  return rows.filter((row) => row.generationSessionId === sessionId);
}

describe("master creative activity architecture", () => {
  it("1. Hero → 1 output row → 1 credit", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, generationType: "hero", generationSessionId: "hero-1" }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.outputLabel, "1/1");
    assert.equal(rows[0]!.creditsUsed, 1);
    assert.equal(rows[0]!.sessionStatus, "Completed");
  });

  it("1b. Hero 4K → 1 output row → 2 credits (not 2 rows)", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          generationType: "hero",
          generationSessionId: "hero-4k",
          outputResolution: "4K",
          studioCreditsUsed: 2,
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -2,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.creditsUsed, 2);
    assert.equal(rows[0]!.billableImage, true);
    assert.equal(sumMasterCreditsUsed(master.rows), 2);
  });

  it("2. Campaign → 2 output rows → 2 credits", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          generationType: "campaign",
          generationSessionId: "campaign-1",
        }),
        render({
          id: 2,
          generationType: "campaign",
          generationSessionId: "campaign-1",
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.outputLabel, "1/2");
    assert.equal(rows[1]!.outputLabel, "2/2");
    assert.equal(sumMasterCreditsUsed(master.rows), 2);
  });

  it("3. Editorial → 4 output rows → 4 credits", () => {
    const ctx = baseContext({
      renders: Array.from({ length: 4 }, (_, index) =>
        render({ id: index + 1, generationSessionId: "editorial-4" }),
      ),
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -4,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 4);
    assert.equal(rows[3]!.outputLabel, "4/4");
    assert.equal(sumMasterCreditsUsed(master.rows), 4);
  });

  it("4. Editorial 4 requested / 2 completed → 4 rows, 2 credits, Partial", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed" }),
        render({ id: 2, status: "completed" }),
        render({ id: 3, status: "failed" }),
        render({ id: 4, status: "failed" }),
      ],
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
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 4);
    assert.equal(countMasterImagesGenerated(master.rows), 2);
    assert.equal(countMasterImagesFailed(master.rows), 2);
    assert.equal(sumMasterCreditsUsed(master.rows), 2);
    assert.equal(rows[0]!.sessionStatus, "Partial");
  });

  it("5b. Campaign 2 requested / 1 completed → 2 rows, 1 credit, Partial", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          status: "completed",
          generationType: "campaign",
          generationSessionId: "campaign-partial",
        }),
        render({
          id: 2,
          status: "failed",
          generationType: "campaign",
          generationSessionId: "campaign-partial",
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -1,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 2);
    assert.equal(sumMasterCreditsUsed(master.rows), 1);
    assert.equal(rows[0]!.sessionStatus, "Partial");
  });

  it("5. Campaign 6 requested / 1 completed → 6 rows, 1 credit, Partial", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          status: "completed",
          generationType: "campaign",
          generationSessionId: "custom-6",
        }),
        ...Array.from({ length: 5 }, (_, index) =>
          render({
            id: index + 2,
            status: "failed",
            generationType: "campaign",
            generationSessionId: "custom-6",
          }),
        ),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -1,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 6);
    assert.equal(rows[0]!.outputLabel, "1/6");
    assert.equal(rows[5]!.outputLabel, "6/6");
    assert.equal(sumMasterCreditsUsed(master.rows), 1);
    assert.equal(rows[0]!.sessionStatus, "Partial");
  });

  it("6. All failed → rows exist, 0 credits, Failed session", () => {
    const ctx = baseContext({
      renders: Array.from({ length: 4 }, (_, index) =>
        render({ id: index + 1, status: "failed" }),
      ),
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = generationRows(master.rows);

    assert.equal(rows.length, 4);
    assert.equal(sumMasterCreditsUsed(master.rows), 0);
    assert.equal(rows[0]!.sessionStatus, "Failed");
    assert.equal(rows.every((row) => row.creditsUsed === 0), true);
  });

  it("7. Successful refinement → 1 row, 1 credit", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, generationSessionId: "session-1" }),
        render({
          id: 2,
          parentRenderId: 1,
          generationSessionId: "session-1",
          status: "completed",
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
    const rows = refinementRows(master.rows);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.creditsUsed, 1);
    assert.equal(rows[0]!.activityType, "Refinement");
  });

  it("7b. Remove Background refinement → labelled explicitly", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, generationSessionId: "session-1" }),
        render({
          id: 2,
          parentRenderId: 1,
          generationSessionId: "session-1",
          status: "completed",
          refinementType: "remove_background",
          assetType: "background_removed",
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
    const rows = refinementRows(master.rows);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.activityType, "Remove Background");
    assert.equal(rows[0]!.batchAction, "Remove Background");
    assert.equal(rows[0]!.creditsUsed, 1);
  });

  it("8. Failed refinement → 1 row, 0 credits", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, generationSessionId: "session-1" }),
        render({
          id: 2,
          parentRenderId: 1,
          generationSessionId: "session-1",
          status: "failed",
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: 0,
          renderId: 2,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const rows = refinementRows(master.rows);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.creditsUsed, 0);
    assert.equal(rows[0]!.result, "Failed");
  });

  it("9. Failed refinement does not alter generation session status", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          status: "completed",
          generationType: "campaign",
          generationSessionId: "campaign-1",
        }),
        render({
          id: 2,
          status: "completed",
          generationType: "campaign",
          generationSessionId: "campaign-1",
        }),
        render({
          id: 3,
          parentRenderId: 1,
          status: "failed",
          generationSessionId: "campaign-1",
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const gen = generationRows(master.rows);
    const ref = refinementRows(master.rows);

    assert.equal(gen.every((row) => row.sessionStatus === "Completed"), true);
    assert.equal(ref[0]!.sessionStatus, "Completed");
  });

  it("10. Master credits reconcile with completed ledger deductions", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed", generationSessionId: "s1" }),
        render({ id: 2, status: "failed", generationSessionId: "s1" }),
        render({
          id: 3,
          parentRenderId: 1,
          status: "completed",
          generationSessionId: "s1",
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -1,
          renderId: 1,
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: 3,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const reconciliation = reconcileMasterWithLedger(ctx, master);

    assert.equal(reconciliation.creditsReconcile, true);
    assert.equal(reconciliation.masterCreditsUsed, 2);
    assert.equal(reconciliation.ledgerCreditsUsed, 2);
  });

  it("11. Master generated images equal completed generation rows", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed" }),
        render({ id: 2, status: "completed" }),
        render({ id: 3, status: "failed" }),
        render({ id: 4, status: "failed" }),
      ],
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
    const reconciliation = reconcileMasterWithLedger(ctx, master);

    assert.equal(
      countMasterImagesGenerated(master.rows),
      reconciliation.ledgerGenerationCredits,
    );
  });

  it("12. Master refinements equal completed refinement rows", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, generationSessionId: "s1" }),
        render({
          id: 2,
          parentRenderId: 1,
          status: "completed",
          generationSessionId: "s1",
        }),
        render({
          id: 3,
          parentRenderId: 1,
          status: "completed",
          generationSessionId: "s1",
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
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.REGENERATE,
          amount: -1,
          renderId: 3,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const reconciliation = reconcileMasterWithLedger(ctx, master);

    assert.equal(countMasterRefinements(master.rows), 2);
    assert.equal(reconciliation.refinementsReconcile, true);
  });

  it("13. Monthly Summary derives correctly from master", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed" }),
        render({ id: 2, status: "completed" }),
        render({ id: 3, status: "failed" }),
        render({ id: 4, status: "failed" }),
      ],
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
    const august = aggregateMasterByMonth(master.rows).get("2026-08")!;

    assert.equal(august.imagesGenerated, 2);
    assert.equal(august.creditsUsed, 2);
    assert.equal(august.refinements, 0);
  });

  it("15. No duplicate activity rows", () => {
    const ctx = baseContext({
      renders: Array.from({ length: 4 }, (_, index) =>
        render({ id: index + 1 }),
      ),
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -4,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const activityIds = master.rows.map((row) => row.activityId);
    assert.equal(new Set(activityIds).size, activityIds.length);
  });

  it("16. No transaction-only rows masquerading as image activity", () => {
    const ctx = baseContext({
      renders: [],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 99,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);

    assert.equal(master.rows.length, 0);
    assert.equal(master.unmappedTransactions.length, 1);
    assert.match(
      master.unmappedTransactions[0]!.reason,
      /No surviving terminal renders/,
    );
  });

  it("17. No Editorial row with 1 image generated / 4 credits", () => {
    const ctx = baseContext({
      renders: Array.from({ length: 4 }, (_, index) =>
        render({ id: index + 1, status: "completed" }),
      ),
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -4,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const editorialRows = generationRows(master.rows);

    assert.equal(editorialRows.length, 4);
    assert.equal(
      editorialRows.some(
        (row) => row.creditsUsed === 4 || row.outputsRequested === 1,
      ),
      false,
    );
    assert.equal(
      editorialRows.every((row) => row.creditsUsed === 1),
      true,
    );
  });

  it("18. No Campaign row with 1 image generated / 2 credits", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          generationType: "campaign",
          generationSessionId: "campaign-1",
        }),
        render({
          id: 2,
          generationType: "campaign",
          generationSessionId: "campaign-1",
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
          renderId: 1,
        }),
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const campaignRows = sessionRows(master.rows, "campaign-1").filter(
      (row) => row.activityType === "Generation",
    );

    assert.equal(campaignRows.length, 2);
    assert.equal(
      campaignRows.some((row) => row.creditsUsed === 2),
      false,
    );
  });

  it("completed render without ledger tx surfaces reconciliation mismatch", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          status: "completed",
          generationType: "campaign",
          generationSessionId: "custom-6",
        }),
        ...Array.from({ length: 5 }, (_, index) =>
          render({
            id: index + 2,
            status: "failed",
            generationType: "campaign",
            generationSessionId: "custom-6",
          }),
        ),
      ],
      transactions: [],
    });

    const master = buildMasterCreativeActivity(ctx);
    const reconciliation = reconcileMasterWithLedger(ctx, master);

    assert.equal(sumMasterCreditsUsed(master.rows), 1);
    assert.equal(reconciliation.ledgerCreditsUsed, 0);
    assert.equal(reconciliation.creditsReconcile, false);
  });
});
