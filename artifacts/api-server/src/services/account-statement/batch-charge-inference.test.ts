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
  buildMasterCreativeActivity,
  countMasterImagesGenerated,
  reconcileMasterWithLedger,
  sumMasterCreditsUsed,
  type CreativeActivityContext,
} from "./creative-activity-master.js";

/**
 * Batch-charge inference regressions.
 *
 * These cover the accounting contract established in Phase 1.1:
 *
 *  - `renders.studio_credits_used` holds the BATCH total repeated on every row
 *    in the batch. It is never a per-image price, and the statement must never
 *    read it as one.
 *  - The ledger charge is the only authority for what was paid. The per-image
 *    price is recovered from it by dividing by the images the charge covered.
 *  - Recovered prices are constrained to prices actually charged at the
 *    recorded resolution, so ambiguous batches resolve deterministically rather
 *    than by preferring the cheapest reading.
 *  - Historical rows keep their original economics; only the ledger decides.
 */

const SESSION = "batch-session";

function render(partial: Partial<Render> & Pick<Render, "id">): Render {
  return {
    userId: 1,
    sourceImageUrl: null,
    outputImageUrl: "https://example.test/out.png",
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
    generationType: "campaign",
    outputResolution: "2K",
    studioCreditsUsed: 0,
    refinementCount: 0,
    generationSessionId: SESSION,
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

function deletionEvent(renderId: number): RenderDeletionEvent {
  return {
    id: 900 + renderId,
    userId: 1,
    renderId,
    generationSessionId: SESSION,
    generationType: "campaign",
    // Batch-level in production — deliberately inconsistent with any per-image
    // price so that any code reading it as one would fail these tests.
    originalCreditsConsumed: 6,
    deletedBy: "user",
    deletedAt: new Date("2026-08-06T12:00:00.000Z"),
  } as RenderDeletionEvent;
}

function context(
  overrides: Partial<CreativeActivityContext>,
): CreativeActivityContext {
  return {
    user: { subscriptionTier: "pro" } as User,
    cycleStart: new Date(Date.UTC(2026, 7, 1)),
    transactions: [],
    renders: [],
    deletionEvents: [] as RenderDeletionEvent[],
    ...overrides,
  };
}

/** Batch of `total` roots where the first `completed` succeeded. */
function batch(input: {
  total: number;
  completed: number;
  deleted?: number;
  resolution?: "2K" | "4K";
  chargedCredits: number;
  batchTotalOnRow?: number;
}): CreativeActivityContext {
  const deleted = input.deleted ?? 0;
  const renders: Render[] = [];

  for (let index = 0; index < input.total - deleted; index += 1) {
    renders.push(
      render({
        id: index + 1,
        status: index < input.completed ? "completed" : "failed",
        outputImageUrl:
          index < input.completed ? "https://example.test/out.png" : null,
        outputResolution: input.resolution ?? "2K",
        // Every surviving row carries the BATCH total, as production writes it.
        studioCreditsUsed: input.batchTotalOnRow ?? input.chargedCredits,
      }),
    );
  }

  const deletionEvents = Array.from({ length: deleted }, (_, index) =>
    deletionEvent(input.total - index),
  );

  return context({
    renders,
    deletionEvents,
    transactions:
      input.chargedCredits > 0
        ? [
            usageTx({
              id: 1,
              reasonCode: StudioCreditReasonCode.CAMPAIGN_GENERATION,
              amount: -input.chargedCredits,
              renderId: 1,
            }),
          ]
        : [],
  });
}

describe("batch charge inference — ledger is the source of truth", () => {
  it("1. single-image batch charges the full ledger amount to that image", () => {
    const ctx = batch({ total: 1, completed: 1, chargedCredits: 1.5 });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(countMasterImagesGenerated(master.rows), 1);
    assert.equal(sumMasterCreditsUsed(master.rows), 1.5);
  });

  it("2. four-image batch splits the ledger charge evenly", () => {
    const ctx = batch({ total: 4, completed: 4, chargedCredits: 4 });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(countMasterImagesGenerated(master.rows), 4);
    assert.equal(sumMasterCreditsUsed(master.rows), 4);
  });

  it("3. four 2K images at 1.5 each reconcile to the 6-credit charge", () => {
    const ctx = batch({
      total: 4,
      completed: 4,
      resolution: "2K",
      chargedCredits: 6,
    });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(countMasterImagesGenerated(master.rows), 4);
    assert.equal(sumMasterCreditsUsed(master.rows), 6);
    for (const row of master.rows) {
      assert.equal(row.creditsUsed, 1.5);
    }
  });

  it("4. four 4K images at 3 each reconcile to the 12-credit charge", () => {
    const ctx = batch({
      total: 4,
      completed: 4,
      resolution: "4K",
      chargedCredits: 12,
    });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(sumMasterCreditsUsed(master.rows), 12);
    for (const row of master.rows) {
      assert.equal(row.creditsUsed, 3);
    }
  });

  it("5. a deleted completed image keeps its share of the batch charge", () => {
    // 4 roots at 1.5, one since deleted: the charge still covered it.
    const ctx = batch({
      total: 4,
      completed: 3,
      deleted: 1,
      resolution: "2K",
      chargedCredits: 6,
    });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(sumMasterCreditsUsed(master.rows), 6);
    assert.equal(countMasterImagesGenerated(master.rows), 4);
  });

  it("6. historical rows keep their original per-image economics", () => {
    // Charged 1 credit per 2K image under the old pricing.
    const ctx = batch({
      total: 4,
      completed: 4,
      resolution: "2K",
      chargedCredits: 4,
    });
    const master = buildMasterCreativeActivity(ctx);

    for (const row of master.rows) {
      assert.equal(row.creditsUsed, 1, "historical render must not be repriced");
    }
    assert.equal(sumMasterCreditsUsed(master.rows), 4);
  });

  it("7. batch total on the render row is never read as a per-image price", () => {
    // Every row carries 6 (the batch total). If that were read per-image the
    // session would report 24 credits instead of 6.
    const ctx = batch({
      total: 4,
      completed: 4,
      resolution: "2K",
      chargedCredits: 6,
      batchTotalOnRow: 6,
    });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(sumMasterCreditsUsed(master.rows), 6);
    assert.notEqual(sumMasterCreditsUsed(master.rows), 24);
  });

  it("8. session credits reconcile exactly with the ledger charge", () => {
    for (const [chargedCredits, resolution] of [
      [1.5, "2K"],
      [6, "2K"],
      [4, "2K"],
      [12, "4K"],
    ] as const) {
      const total = chargedCredits === 1.5 ? 1 : 4;
      const ctx = batch({
        total,
        completed: total,
        resolution,
        chargedCredits,
      });
      const master = buildMasterCreativeActivity(ctx);
      const reconciliation = reconcileMasterWithLedger(ctx, master);

      assert.equal(
        sumMasterCreditsUsed(master.rows),
        chargedCredits,
        `${total} x ${resolution} @ ${chargedCredits}`,
      );
      assert.equal(reconciliation.creditsReconcile, true);
    }
  });

  it("9. resolution disambiguates an otherwise ambiguous charge", () => {
    // 2 credits over 2 slots could read as two 1-credit images or one 2-credit
    // image. At 4K, 1 has never been a valid price, so it must resolve to a
    // single 2-credit image rather than the cheaper two-image reading.
    const ctx = batch({
      total: 2,
      completed: 1,
      resolution: "4K",
      chargedCredits: 2,
    });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(sumMasterCreditsUsed(master.rows), 2);
    assert.equal(countMasterImagesGenerated(master.rows), 1);
  });

  it("10. an unreconciled render is not presented at today's price", () => {
    // No ledger charge at all. Reporting 1.5 here would reprice a historical
    // render; the row must use the legacy schedule and fail reconciliation.
    const ctx = batch({
      total: 1,
      completed: 1,
      resolution: "2K",
      chargedCredits: 0,
    });
    const master = buildMasterCreativeActivity(ctx);
    const reconciliation = reconcileMasterWithLedger(ctx, master);

    assert.equal(sumMasterCreditsUsed(master.rows), 1);
    assert.equal(reconciliation.ledgerCreditsUsed, 0);
    assert.equal(reconciliation.creditsReconcile, false);
  });

  it("11. failed images in a partial batch are not charged", () => {
    const ctx = batch({
      total: 4,
      completed: 2,
      resolution: "2K",
      chargedCredits: 3,
    });
    const master = buildMasterCreativeActivity(ctx);

    assert.equal(countMasterImagesGenerated(master.rows), 2);
    assert.equal(sumMasterCreditsUsed(master.rows), 3);
  });
});
