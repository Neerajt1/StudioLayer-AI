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

const { computeDeletedImageRows } = await import("./deleted-images-data.js");

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
    studioCreditsUsed: 4,
    refinementCount: 0,
    generationSessionId: "session-editorial",
    selectedPoseName: null,
    selectedPoseFamily: null,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
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
    createdAt: new Date("2026-08-01T10:05:00.000Z"),
    ...partial,
  };
}

function deletionEvent(
  partial: Partial<RenderDeletionEvent> & Pick<RenderDeletionEvent, "id" | "renderId">,
): RenderDeletionEvent {
  return {
    userId: 1,
    generationSessionId: "session-editorial",
    generationType: "editorial",
    originalCreditsConsumed: 4,
    deletedBy: "user",
    deletedAt: new Date("2026-08-08T12:00:00.000Z"),
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
      used: 4,
      limit: 120,
      remaining: 116,
      canRender: true,
    },
    cycleStats: {
      studioCreditsUsed: 4,
      imagesCreated: 4,
      averageRefinementsPerImage: 0,
    },
    cycleStart,
    transactions: [],
    renders: [],
    deletionEvents: [],
    creditsPurchasedInCycle: 0,
    promotionalCreditsInCycle: 0,
    totalCreditsAddedInCycle: 0,
    imagesDeletedInCycle: 0,
    allTimeImagesDeleted: 0,
    ...overrides,
  };
}

describe("computeDeletedImageRows", () => {
  it("shows batch-level generation credits, not per-deleted-image charge, for 4-image editorial", () => {
    const ctx = baseContext({
      renders: [
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
      deletionEvents: [
        deletionEvent({ id: 10, renderId: 1 }),
      ],
    });

    const row = computeDeletedImageRows(ctx)[0]!;

    assert.equal(row.originalGenerationCredits, 4);
    assert.equal(row.originalGenerationImageCount, 4);
    assert.notEqual(row.originalGenerationCredits, 1);
  });

  it("uses actual partial-success batch charge from the ledger", () => {
    const ctx = baseContext({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -2,
          renderId: 1,
        }),
      ],
      deletionEvents: [
        deletionEvent({
          id: 11,
          renderId: 1,
          originalCreditsConsumed: 2,
        }),
      ],
    });

    const row = computeDeletedImageRows(ctx)[0]!;

    assert.equal(row.originalGenerationCredits, 2);
    assert.equal(row.originalGenerationImageCount, 2);
  });

  it("shows hero batch as 1 credit and 1 billable image", () => {
    const ctx = baseContext({
      renders: [],
      transactions: [
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          renderId: 5,
        }),
      ],
      deletionEvents: [
        deletionEvent({
          id: 12,
          renderId: 5,
          generationSessionId: "hero-session",
          generationType: "hero",
          originalCreditsConsumed: 1,
        }),
      ],
    });

    const row = computeDeletedImageRows(ctx)[0]!;

    assert.equal(row.originalGenerationCredits, 1);
    assert.equal(row.originalGenerationImageCount, 1);
  });

  it("does not invent per-image credits when no generation ledger transaction exists", () => {
    const ctx = baseContext({
      deletionEvents: [
        deletionEvent({
          id: 13,
          renderId: 99,
          generationSessionId: "orphan-session",
          originalCreditsConsumed: 4,
        }),
      ],
    });

    const row = computeDeletedImageRows(ctx)[0]!;

    assert.equal(row.originalGenerationCredits, null);
    assert.equal(row.originalGenerationImageCount, null);
  });

  it("derives original generation date from the ledger transaction", () => {
    const generationDate = new Date("2026-08-01T10:05:00.000Z");
    const ctx = baseContext({
      transactions: [
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
          amount: -2,
          renderId: 7,
          createdAt: generationDate,
        }),
      ],
      deletionEvents: [
        deletionEvent({
          id: 14,
          renderId: 7,
          generationSessionId: "campaign-session",
          generationType: "campaign",
          originalCreditsConsumed: 2,
        }),
      ],
    });

    const row = computeDeletedImageRows(ctx)[0]!;

    assert.equal(row.originalGenerationDate?.getTime(), generationDate.getTime());
    assert.equal(row.originalGenerationCredits, 2);
  });

  it("never creates or implies a credit transaction from deletion", () => {
    const ctx = baseContext({
      transactions: [
        usageTx({
          id: 4,
          reasonCode: StudioCreditReasonCode.EDITORIAL_GENERATION,
          amount: -4,
          renderId: 1,
        }),
      ],
      deletionEvents: [deletionEvent({ id: 15, renderId: 1 })],
    });

    const txCountBefore = ctx.transactions.length;
    computeDeletedImageRows(ctx);

    assert.equal(ctx.transactions.length, txCountBefore);
    assert.equal(
      ctx.transactions.some((tx) => tx.reasonCode.includes("refund")),
      false,
    );
  });
});
