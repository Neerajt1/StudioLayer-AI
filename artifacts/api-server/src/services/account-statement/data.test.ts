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
  computeStatementCycleRefinements,
  computeStatementLedgerCreditsUsed,
  computeStatementReconciliation,
  computeUnmappedLedgerTransactions,
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

function generationRows(
  rows: ReturnType<typeof computeCreativeActivityRows>,
  sessionId = "session-editorial",
) {
  return rows.filter(
    (row) =>
      row.activityType === "Generation" &&
      row.generationSessionId === sessionId,
  );
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

    const rows = generationRows(computeCreativeActivityRows(ctx));
    const monthly = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    );

    assert.equal(rows.length, 4);
    assert.equal(rows.every((row) => row.sessionStatus === "Failed"), true);
    assert.equal(rows.every((row) => row.creditsUsed === 0), true);
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

    const rows = generationRows(computeCreativeActivityRows(ctx));
    const monthly = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    );

    assert.equal(rows.length, 4);
    assert.equal(rows[0]!.sessionStatus, "Partial");
    assert.equal(
      rows.filter((row) => row.result === "Completed").length,
      2,
    );
    assert.equal(
      rows.reduce((sum, row) => sum + row.creditsUsed, 0),
      2,
    );
    assert.equal(computeStatementCycleImagesGenerated(ctx), 2);
    assert.equal(monthly?.imagesGenerated, 2);
    assert.equal(monthly?.creditsUsed, 2);
  });

  it("C. full hero success: images generated equals completed count and ledger amount", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, generationType: "hero", generationSessionId: "hero-1" }),
      ],
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

    const rows = computeCreativeActivityRows(ctx);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.sessionStatus, "Completed");
    assert.equal(rows[0]!.creditsUsed, 1);
    assert.equal(computeStatementCycleImagesGenerated(ctx), 1);
  });

  it("D. creative activity credits reconcile with ledger usage transactions", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          status: "completed",
          generationSessionId: "campaign-1",
          generationType: "campaign",
        }),
        render({
          id: 2,
          status: "failed",
          generationSessionId: "campaign-1",
          generationType: "campaign",
        }),
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

  it("refinement-only session does not change root generation status fields", () => {
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

    const rows = computeCreativeActivityRows(ctx);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.activityType, "Refinement");
    assert.equal(rows[0]!.sessionStatus, "Completed");
    assert.equal(rows[0]!.creditsUsed, 0);
  });
});

describe("account statement final correction — creative activity status", () => {
  it("4/4 editorial generated remains Completed across image rows", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed" }),
        render({ id: 2, status: "completed" }),
        render({ id: 3, status: "completed" }),
        render({ id: 4, status: "completed" }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -4,
          renderId: 1,
        }),
      ],
    });

    const rows = generationRows(computeCreativeActivityRows(ctx));
    assert.equal(rows.length, 4);
    assert.equal(rows.every((row) => row.sessionStatus === "Completed"), true);
    assert.equal(rows[3]!.outputLabel, "4/4");
  });

  it("2/2 campaign with successful refinements remains Completed", () => {
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
          status: "completed",
          generationSessionId: "campaign-1",
        }),
        render({
          id: 4,
          parentRenderId: 2,
          status: "completed",
          generationSessionId: "campaign-1",
        }),
      ],
      transactions: [
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
          renderId: 1,
        }),
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: 3,
        }),
        usageTx({
          id: 4,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: 4,
        }),
      ],
    });

    const rows = computeCreativeActivityRows(ctx);
    const gen = rows.filter((row) => row.activityType === "Generation");
    const ref = rows.filter((row) => row.activityType === "Refinement");

    assert.equal(gen.every((row) => row.sessionStatus === "Completed"), true);
    assert.equal(ref.length, 2);
    assert.equal(computeStatementCycleRefinements(ctx), 2);
  });

  it("2/2 campaign with failed refinement remains Completed", () => {
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
        render({
          id: 4,
          parentRenderId: 2,
          status: "failed",
          generationSessionId: "campaign-1",
        }),
      ],
      transactions: [
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
          renderId: 1,
        }),
      ],
    });

    const gen = computeCreativeActivityRows(ctx).filter(
      (row) => row.activityType === "Generation",
    );

    assert.equal(gen.every((row) => row.sessionStatus === "Completed"), true);
    assert.equal(gen.length, 2);
    assert.equal(computeStatementCycleRefinements(ctx), 0);
  });

  it("1/6 custom campaign with COMPLETED ledger shows Partial and 1 credit used", () => {
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
          id: 4,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -1,
          renderId: 1,
        }),
      ],
    });

    const rows = generationRows(
      computeCreativeActivityRows(ctx),
      "custom-6",
    );

    assert.equal(rows.length, 6);
    assert.equal(rows[0]!.sessionStatus, "Partial");
    assert.equal(rows.reduce((sum, row) => sum + row.creditsUsed, 0), 1);
  });

  it("1/6 custom campaign without COMPLETED ledger shows image credit mismatch transparently", () => {
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

    const rows = generationRows(
      computeCreativeActivityRows(ctx),
      "custom-6",
    );

    assert.equal(rows[0]!.sessionStatus, "Partial");
    assert.equal(rows.reduce((sum, row) => sum + row.creditsUsed, 0), 1);
  });
});

describe("account statement stage 2 balance reconciliation", () => {
  it("paid monthly summary: opening + added - used = closing for current month", () => {
    const ctx = baseContext({
      renders: [
        render({
          id: 1,
          generationType: "hero",
          generationSessionId: "hero-ledger",
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
        render({
          id: 2,
          generationType: "hero",
          generationSessionId: "hero-ledger-2",
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -2,
          renderId: 1,
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: 0,
          renderId: 2,
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
      renders: [
        render({
          id: 1,
          generationType: "hero",
          generationSessionId: "hero-july",
          createdAt: new Date("2026-07-20T10:00:00.000Z"),
        }),
        render({
          id: 2,
          generationType: "hero",
          generationSessionId: "hero-august",
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -100,
          renderId: 1,
          createdAt: new Date("2026-07-20T10:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -2,
          renderId: 2,
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

    const activityCredits = computeCreativeActivityRows(ctx).reduce(
      (sum, row) => sum + row.creditsUsed,
      0,
    );
    const august = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    )!;

    assert.equal(activityCredits, 2);
    assert.equal(august.imagesGenerated, 2);
    assert.equal(august.creditsUsed, 2);
    assert.equal(august.closingBalance, 118);
  });
});

describe("account summary derives from master creative activity", () => {
  it("14. Account Summary image and refinement counts match master cycle totals", () => {
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

    assert.equal(computeStatementCycleImagesGenerated(ctx), 1);
    assert.equal(computeStatementCycleRefinements(ctx), 1);
  });
});

describe("ledger and activity reconciliation", () => {
  it("11. unmapped completed ledger transaction is not converted into a fake image row", () => {
    const ctx = baseContext({
      renders: [],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 99,
          createdAt: new Date("2026-08-05T12:00:00.000Z"),
        }),
      ],
    });

    const activityRows = computeCreativeActivityRows(ctx);
    const unmapped = computeUnmappedLedgerTransactions(ctx);
    const reconciliation = computeStatementReconciliation(ctx);

    assert.equal(activityRows.length, 0);
    assert.equal(unmapped.length, 1);
    assert.equal(reconciliation.ledgerCreditsUsed, 1);
    assert.equal(reconciliation.activityCreditsUsed, 0);
    assert.equal(reconciliation.reconciliationGap, 1);
    assert.equal(reconciliation.unmappedLedgerCredits, 1);
    assert.equal(reconciliation.creditsReconcile, false);
  });

  it("12. mapped master credits reconcile with ledger for valid activity", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed", generationSessionId: "s1" }),
        render({ id: 2, status: "failed", generationSessionId: "s1" }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -1,
          renderId: 1,
          createdAt: new Date("2026-08-05T12:00:00.000Z"),
        }),
      ],
    });

    const reconciliation = computeStatementReconciliation(ctx);

    assert.equal(reconciliation.ledgerCreditsUsed, 1);
    assert.equal(reconciliation.activityCreditsUsed, 1);
    assert.equal(reconciliation.reconciliationGap, 0);
    assert.equal(reconciliation.creditsReconcile, true);
  });

  it("13. Monthly Summary Credits Used follows ledger authority", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed", generationSessionId: "s1" }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 1,
          createdAt: new Date("2026-08-05T12:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: null,
          createdAt: new Date("2026-08-05T13:00:00.000Z"),
        }),
      ],
    });

    const august = computeMonthlySummaryRows(ctx).find(
      (row) => row.monthKey === "2026-08",
    )!;

    assert.equal(august.creditsUsed, 2);
    assert.equal(august.activityCreditsUsed, 1);
    assert.equal(august.creditsReconciliationGap, 1);
    assert.equal(august.imagesGenerated, 1);
  });

  it("14. Account Summary Studio Credits Used follows ledger authority", () => {
    const ctx = baseContext({
      renders: [
        render({ id: 1, status: "completed", generationSessionId: "s1" }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 1,
          createdAt: new Date("2026-08-05T12:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: null,
          createdAt: new Date("2026-08-05T13:00:00.000Z"),
        }),
      ],
      balance: {
        used: 2,
        limit: 120,
        remaining: 118,
        canRender: true,
      },
    });

    assert.equal(computeStatementLedgerCreditsUsed(ctx), 2);
    assert.equal(computeStatementReconciliation(ctx).activityCreditsUsed, 1);
  });

  it("admin Account Summary Studio Credits Used uses ledger not zero", () => {
    const ctx = baseContext({
      isAdmin: true,
      renders: [
        render({ id: 1, status: "completed", generationSessionId: "s1" }),
      ],
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -3,
          renderId: 1,
          createdAt: new Date("2026-08-05T12:00:00.000Z"),
        }),
      ],
      balance: {
        used: 0,
        limit: null,
        remaining: Infinity,
        canRender: true,
      },
    });

    assert.equal(computeStatementLedgerCreditsUsed(ctx), 3);
  });

  it("historical 6-credit gap preserves ledger authority without synthetic activity rows", () => {
    const ctx = baseContext({
      user: {
        id: 3,
        email: "historical@example.com",
        name: "Historical User",
        subscriptionTier: "free",
        isAdmin: true,
      } as User,
      isAdmin: true,
      renders: [
        render({
          id: 4,
          generationType: "hero",
          generationSessionId: "hero-4",
          status: "completed",
        }),
        render({
          id: 5,
          generationType: "campaign",
          generationSessionId: null,
          status: "completed",
          createdAt: new Date("2026-08-06T06:50:46.036Z"),
        }),
      ],
      transactions: [
        usageTx({
          id: 4,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 4,
          createdAt: new Date("2026-08-05T15:07:44.430Z"),
        }),
        usageTx({
          id: 5,
          transactionId: "4c5893b8-30cd-43c9-b28e-0bc1fc9138d1",
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
          renderId: null,
          createdAt: new Date("2026-08-06T06:50:46.622Z"),
        }),
        usageTx({
          id: 6,
          transactionId: "95782b28-b76a-4d31-9b8f-9c3d90501b0a",
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: null,
          createdAt: new Date("2026-08-06T06:52:14.335Z"),
        }),
        usageTx({
          id: 7,
          transactionId: "3a4bd7e5-7355-4d5f-8b30-2dbb8c370e70",
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: null,
          createdAt: new Date("2026-08-06T07:05:13.054Z"),
        }),
        usageTx({
          id: 8,
          transactionId: "0474da77-50cc-4ecd-8b94-f857634079d9",
          reasonCode: StudioCreditReasonCode.REFINE,
          amount: -1,
          renderId: null,
          createdAt: new Date("2026-08-06T07:08:33.034Z"),
        }),
        usageTx({
          id: 9,
          transactionId: "556cf741-a4af-4417-b989-b26cf2c8f325",
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: null,
          createdAt: new Date("2026-08-06T16:08:50.229Z"),
        }),
      ],
      balance: {
        used: 0,
        limit: null,
        remaining: Infinity,
        canRender: true,
      },
    });

    const activityRows = computeCreativeActivityRows(ctx);
    const reconciliation = computeStatementReconciliation(ctx);

    assert.equal(computeStatementLedgerCreditsUsed(ctx), 7);
    assert.equal(reconciliation.activityCreditsUsed, 2);
    assert.equal(reconciliation.reconciliationGap, 5);
    assert.equal(reconciliation.unmappedTransactions.length, 5);
    assert.equal(reconciliation.unmappedLedgerCredits, 6);
    assert.equal(activityRows.length, 2);
    assert.equal(
      activityRows.reduce((sum, row) => sum + row.creditsUsed, 0),
      2,
    );
    assert.equal(reconciliation.creditsReconcile, false);
  });
});
