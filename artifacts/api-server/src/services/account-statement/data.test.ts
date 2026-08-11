import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import type {
  Render,
  RenderDeletionEvent,
  StudioCreditTransaction,
  User,
} from "@workspace/db";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const {
  computeCreativeActivityRows,
  computeLedgerRunningBalance,
  computeMonthlySummaryRows,
  computeStatementCycleImagesGenerated,
} = await import("./data.js");

type AccountStatementContext = Awaited<
  ReturnType<typeof import("./data.js").loadAccountStatementContext>
> extends infer T
  ? Exclude<T, null>
  : never;

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
  overrides: Partial<AccountStatementContext>,
): AccountStatementContext {
  const generatedAt = new Date("2026-08-10T12:00:00.000Z");
  const cycleStart = new Date(Date.UTC(2026, 7, 1));

  return {
    user: {
      id: 1,
      email: "test@example.com",
      name: "Test User",
      subscriptionTier: "pro",
      isAdmin: false,
    } as User,
    generatedAt,
    allowance: 120,
    isAdmin: false,
    balance: {
      used: 2,
      limit: 120,
      remaining: 118,
      canRender: true,
    },
    cycleStats: {
      studioCreditsUsed: 2,
      imagesCreated: 4,
      averageRefinementsPerImage: 0,
    },
    cycleStart,
    transactions: [],
    renders: [],
    deletionEvents: [] as RenderDeletionEvent[],
    creditsPurchasedInCycle: 0,
    promotionalCreditsInCycle: 0,
    totalCreditsAddedInCycle: 0,
    imagesDeletedInCycle: 0,
    allTimeImagesDeleted: 0,
    ...overrides,
  };
}

describe("account statement stage 1 invariants", () => {
  it("A. all-failed editorial: 0 images generated and 0 credits used", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "failed" }),
        render({ id: 2, status: "failed" }),
        render({ id: 3, status: "failed" }),
        render({ id: 4, status: "failed" }),
      ],
      transactions: [],
    });

    const activity = computeCreativeActivityRows(ctx)[0]!;
    const monthly = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    );

    assert.equal(activity.status, "Failed");
    assert.equal(activity.imagesRequested, 4);
    assert.equal(activity.imagesCompleted, 0);
    assert.equal(activity.imagesFailed, 4);
    assert.equal(activity.imagesGenerated, 0);
    assert.equal(activity.creditsUsed, 0);
    assert.equal(computeStatementCycleImagesGenerated(ctx), 0);
    assert.equal(monthly?.imagesGenerated ?? 0, 0);
    assert.equal(monthly?.creditsUsed ?? 0, 0);
  });

  it("B. partial editorial: billable images match completed renders and ledger", () => {
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
      balance: {
        used: 2,
        limit: 120,
        remaining: 118,
        canRender: true,
      },
    });

    const activity = computeCreativeActivityRows(ctx)[0]!;
    const monthly = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    );

    assert.equal(activity.status, "Partial");
    assert.equal(activity.imagesGenerated, 2);
    assert.equal(activity.creditsUsed, 2);
    assert.equal(computeStatementCycleImagesGenerated(ctx), 2);
    assert.equal(monthly?.imagesGenerated, 2);
    assert.equal(monthly?.creditsUsed, 2);
  });

  it("C. full hero success: images generated equals completed count and ledger amount", () => {
    const ctx = baseContext({
      renders: [render({ id: 1, generationType: "hero", generationSessionId: "hero-1" })],
      transactions: [
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 1,
        }),
      ],
      balance: {
        used: 1,
        limit: 120,
        remaining: 119,
        canRender: true,
      },
    });

    const activity = computeCreativeActivityRows(ctx)[0]!;

    assert.equal(activity.status, "Completed");
    assert.equal(activity.imagesGenerated, 1);
    assert.equal(activity.creditsUsed, 1);
    assert.equal(computeStatementCycleImagesGenerated(ctx), 1);
  });

  it("D. creative activity credits reconcile with ledger usage transactions", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed", generationSessionId: "campaign-1", generationType: "campaign" }),
        render({ id: 2, status: "failed", generationSessionId: "campaign-1", generationType: "campaign" }),
      ],
      transactions: [
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -1,
          renderId: 1,
        }),
      ],
    });

    const ledgerCredits = ctx.transactions
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const activityCredits = computeCreativeActivityRows(ctx).reduce(
      (sum, row) => sum + row.creditsUsed,
      0,
    );

    assert.equal(activityCredits, ledgerCredits);
  });

  it("failed refinement session remains visible with zero billable output", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 10,
          parentRenderId: 1,
          generationSessionId: "refine-session",
          status: "failed",
        }),
      ],
      transactions: [],
    });

    const activity = computeCreativeActivityRows(ctx)[0]!;

    assert.equal(activity.status, "Failed");
    assert.equal(activity.imagesRefined, 0);
    assert.equal(activity.creditsUsed, 0);
  });
});

describe("account statement stage 2 balance reconciliation", () => {
  it("paid monthly summary: opening + added - used = closing for current month", () => {
    const ctx = baseContext({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -2,
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
      ],
      balance: {
        used: 2,
        limit: 120,
        remaining: 118,
        canRender: true,
      },
    });

    const august = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    )!;

    assert.equal(august.openingBalance, 120);
    assert.equal(august.creditsUsed, 2);
    assert.equal(august.closingBalance, 118);
    assert.equal(
      august.openingBalance + august.creditsAdded - august.creditsUsed,
      august.closingBalance,
    );
  });

  it("paid monthly summary: prior month closing does not carry into next month opening", () => {
    const ctx = baseContext({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -100,
          createdAt: new Date("2026-07-20T10:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -2,
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
      ],
      balance: {
        used: 2,
        limit: 120,
        remaining: 118,
        canRender: true,
      },
    });

    const rows = computeMonthlySummaryRows(ctx);
    const july = rows.find((row) => row.monthKey === "2026-07")!;
    const august = rows.find((row) => row.monthKey === "2026-08")!;

    assert.equal(july.closingBalance, 20);
    assert.equal(august.openingBalance, 120);
    assert.notEqual(august.openingBalance, july.closingBalance);
  });

  it("ledger running balance is continuous within a billing cycle", () => {
    const ctx = baseContext({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          createdAt: new Date("2026-08-01T10:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          createdAt: new Date("2026-08-05T10:00:00.000Z"),
        }),
      ],
      balance: {
        used: 2,
        limit: 120,
        remaining: 118,
        canRender: true,
      },
    });

    assert.equal(computeLedgerRunningBalance(ctx, 0), 119);
    assert.equal(computeLedgerRunningBalance(ctx, 1), 118);
  });

  it("ledger running balance resets at UTC month boundary for paid tiers", () => {
    const ctx = baseContext({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -20,
          createdAt: new Date("2026-07-15T10:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -2,
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
      ],
      balance: {
        used: 2,
        limit: 120,
        remaining: 118,
        canRender: true,
      },
    });

    assert.equal(computeLedgerRunningBalance(ctx, 0), 100);
    assert.equal(computeLedgerRunningBalance(ctx, 1), 118);
  });

  it("stage 1 partial generation still reconciles after stage 2 balance changes", () => {
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
          createdAt: new Date("2026-08-05T12:00:00.000Z"),
        }),
      ],
      balance: {
        used: 2,
        limit: 120,
        remaining: 118,
        canRender: true,
      },
    });

    const activity = computeCreativeActivityRows(ctx)[0]!;
    const august = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    )!;

    assert.equal(activity.status, "Partial");
    assert.equal(activity.imagesGenerated, 2);
    assert.equal(august.imagesGenerated, 2);
    assert.equal(august.creditsUsed, 2);
    assert.equal(august.closingBalance, 118);
  });
});
