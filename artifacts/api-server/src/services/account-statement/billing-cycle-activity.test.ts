import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import type {
  Render,
  RenderDeletionEvent,
  StudioCreditTransaction,
} from "@workspace/db";
import {
  buildMasterCreativeActivity,
  countMasterImagesGenerated,
  countMasterRefinements,
  deriveBillingCycleActivityStats,
  filterMasterRowsForCycle,
  sumMasterCreditsUsed,
  type CreativeActivityContext,
} from "./creative-activity-master.js";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const { computeStatementCycleImagesGenerated, computeStatementCycleRefinements } =
  await import("./data.js");

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
    user: { subscriptionTier: "pro" },
    cycleStart,
    transactions: [],
    renders: [],
    deletionEvents: [] as RenderDeletionEvent[],
    ...overrides,
  };
}

function cycleStatsForContext(ctx: CreativeActivityContext) {
  const master = buildMasterCreativeActivity(ctx);
  const cycleRows = filterMasterRowsForCycle(ctx, master.rows);
  return { stats: deriveBillingCycleActivityStats(cycleRows), cycleRows, master };
}

describe("Gallery billing-cycle activity from Creative Activity Master", () => {
  it("1. Hero 1/1 → Images Created = 1, Credits Used = 1", () => {
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

    const { stats } = cycleStatsForContext(ctx);
    assert.equal(stats.imagesCreated, 1);
    assert.equal(stats.studioCreditsUsed, 1);
  });

  it("2. Campaign 2/2 → Images Created = 2, Credits Used = 2", () => {
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

    const { stats } = cycleStatsForContext(ctx);
    assert.equal(stats.imagesCreated, 2);
    assert.equal(stats.studioCreditsUsed, 2);
  });

  it("3. Editorial 4/4 → Images Created = 4, Credits Used = 4", () => {
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

    const { stats } = cycleStatsForContext(ctx);
    assert.equal(stats.imagesCreated, 4);
    assert.equal(stats.studioCreditsUsed, 4);
  });

  it("4. Editorial 4 requested / 2 completed / 2 failed → Images Created = 2, Credits Used = 2", () => {
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

    const { stats } = cycleStatsForContext(ctx);
    assert.equal(stats.imagesCreated, 2);
    assert.equal(stats.studioCreditsUsed, 2);
  });

  it("5. Custom 6 requested / 1 completed / 5 failed → Images Created = 1, Credits Used = 1", () => {
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

    const { stats } = cycleStatsForContext(ctx);
    assert.equal(stats.imagesCreated, 1);
    assert.equal(stats.studioCreditsUsed, 1);
  });

  it("6. Generation 2/2 + 2 successful refinements → Images Created = 2, Refinements = 2, Credits Used = 4, Avg = 1.0", () => {
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
        render({
          id: 3,
          parentRenderId: 1,
          generationSessionId: "campaign-1",
        }),
        render({
          id: 4,
          parentRenderId: 2,
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
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: 3,
        }),
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.REGENERATE,
          amount: -1,
          renderId: 4,
        }),
      ],
    });

    const { stats } = cycleStatsForContext(ctx);
    assert.equal(stats.imagesCreated, 2);
    assert.equal(stats.studioCreditsUsed, 4);
    assert.equal(stats.averageRefinementsPerImage, 1);
  });

  it("7. Generation 2/2 + failed refinement → Images Created = 2, Credits Used = 2, failed refinement excluded", () => {
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

    const { stats, master } = cycleStatsForContext(ctx);
    assert.equal(stats.imagesCreated, 2);
    assert.equal(stats.studioCreditsUsed, 2);
    assert.equal(stats.averageRefinementsPerImage, 0);
    assert.equal(
      master.rows.filter((row) => row.activityType === "Generation").every(
        (row) => row.sessionStatus === "Completed",
      ),
      true,
    );
  });

  it("8. partial editorial no longer counts as 1 image / 4 credits via reason-code multipliers", () => {
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

    const { stats, cycleRows } = cycleStatsForContext(ctx);
    assert.equal(cycleRows.filter((row) => row.activityType === "Generation").length, 4);
    assert.equal(stats.imagesCreated, 2);
    assert.equal(stats.studioCreditsUsed, 2);
    assert.equal(
      cycleRows.some(
        (row) =>
          row.activityType === "Generation" &&
          row.creditsUsed === 4,
      ),
      false,
    );
  });

  it("9. Editorial regression: never 1 image / 4 credits — four rows each 1/1 credit", () => {
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

    const { stats, cycleRows } = cycleStatsForContext(ctx);
    const generationRows = cycleRows.filter(
      (row) => row.activityType === "Generation",
    );

    assert.equal(generationRows.length, 4);
    assert.equal(stats.imagesCreated, 4);
    assert.equal(stats.studioCreditsUsed, 4);
    assert.equal(
      generationRows.every((row) => row.creditsUsed === 1),
      true,
    );
  });

  it("10. Campaign regression: never 1 image / 2 credits — two rows each 1/1 credit", () => {
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

    const { stats, cycleRows } = cycleStatsForContext(ctx);
    const generationRows = cycleRows.filter(
      (row) => row.activityType === "Generation",
    );

    assert.equal(generationRows.length, 2);
    assert.equal(stats.imagesCreated, 2);
    assert.equal(stats.studioCreditsUsed, 2);
    assert.equal(
      generationRows.some((row) => row.creditsUsed === 2),
      false,
    );
  });
});

describe("Gallery ↔ Account Summary cross-sheet invariants", () => {
  it("Gallery cycle stats match Account Summary master-derived counts", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed", generationSessionId: "s1" }),
        render({
          id: 2,
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
      ],
    });

    const master = buildMasterCreativeActivity(ctx);
    const cycleRows = filterMasterRowsForCycle(ctx, master.rows);
    const galleryStats = deriveBillingCycleActivityStats(cycleRows);

    const statementCtx = {
      user: { subscriptionTier: "pro" },
      cycleStart: ctx.cycleStart,
      transactions: ctx.transactions,
      renders: ctx.renders,
      deletionEvents: ctx.deletionEvents,
    } as Parameters<typeof computeStatementCycleImagesGenerated>[0];

    assert.equal(
      galleryStats.imagesCreated,
      computeStatementCycleImagesGenerated(statementCtx),
    );
    assert.equal(
      galleryStats.averageRefinementsPerImage > 0
        ? countMasterRefinements(cycleRows)
        : 0,
      computeStatementCycleRefinements(statementCtx),
    );
    assert.equal(galleryStats.studioCreditsUsed, sumMasterCreditsUsed(cycleRows));
    assert.equal(
      galleryStats.averageRefinementsPerImage,
      galleryStats.imagesCreated === 0
        ? 0
        : Math.round(
            (countMasterRefinements(cycleRows) / galleryStats.imagesCreated) *
              10,
          ) / 10,
    );
    assert.equal(
      countMasterImagesGenerated(cycleRows),
      galleryStats.imagesCreated,
    );
    assert.equal(countMasterRefinements(cycleRows), 1);
  });
});
