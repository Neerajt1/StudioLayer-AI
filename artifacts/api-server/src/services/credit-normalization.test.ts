import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  toCreditDenominatedAmount,
  toCreditDenominatedAmountOrNull,
  toCreditDenominatedTransactions,
  toCreditDenominatedRenders,
  toCreditDenominatedDeletionEvents,
  toCreditDenominatedAllocations,
} from "./credit-normalization.js";

describe("credit normalisation boundary", () => {
  it("converts stored minor units to Studio Credits", () => {
    assert.equal(toCreditDenominatedAmount(150), 1.5);
    assert.equal(toCreditDenominatedAmount(300), 3);
    assert.equal(toCreditDenominatedAmount(100), 1);
  });

  it("preserves sign, zero and null", () => {
    assert.equal(toCreditDenominatedAmount(-150), -1.5);
    assert.equal(toCreditDenominatedAmount(0), 0);
    assert.equal(toCreditDenominatedAmountOrNull(null), null);
    assert.equal(toCreditDenominatedAmountOrNull(undefined), null);
    assert.equal(toCreditDenominatedAmountOrNull(150), 1.5);
  });

  it("converts historical whole-credit amounts without repricing them", () => {
    // An old 2K render charged 1 credit was migrated to 100 minor units and
    // must still read as 1 credit, not today's 1.5.
    assert.equal(toCreditDenominatedAmount(100), 1);
    assert.equal(toCreditDenominatedAmount(200), 2);
  });

  it("reads one stored charge identically on every surface", () => {
    // A new 2K generation charged 1.5 credits is stored once as 150 minor
    // units and then read by the ledger, the statement, Gallery, transaction
    // master, admin and the exports. Every one of those surfaces goes through
    // this boundary, so none of them can report 150, 1 or 2 instead of 1.5.
    const stored = 150;
    const surfaces = [
      toCreditDenominatedAmount(stored),
      toCreditDenominatedTransactions([{ amount: -stored }] as never)[0]!
        .amount * -1,
      toCreditDenominatedRenders([{ studioCreditsUsed: stored }] as never)[0]!
        .studioCreditsUsed,
      toCreditDenominatedDeletionEvents([
        { originalCreditsConsumed: stored },
      ] as never)[0]!.originalCreditsConsumed,
    ];

    for (const value of surfaces) {
      assert.equal(value, 1.5);
    }
  });

  it("converts each row shape and leaves non-credit fields untouched", () => {
    const [tx] = toCreditDenominatedTransactions([
      { transactionId: "tx_1", amount: -150, reasonCode: "hero_generation" },
    ] as never);
    assert.equal(tx?.amount, -1.5);
    assert.equal(tx?.transactionId, "tx_1");

    const [render] = toCreditDenominatedRenders([
      { id: "r_1", studioCreditsUsed: 600 },
    ] as never);
    assert.equal(render?.studioCreditsUsed, 6);
    assert.equal(render?.id, "r_1");

    const [deletion] = toCreditDenominatedDeletionEvents([
      { renderId: "r_1", originalCreditsConsumed: 300 },
    ] as never);
    assert.equal(deletion?.originalCreditsConsumed, 3);

    const [allocation] = toCreditDenominatedAllocations([
      { id: "a_1", originalAmount: 12000, remainingAmount: 150 },
    ] as never);
    assert.equal(allocation?.originalAmount, 120);
    assert.equal(allocation?.remainingAmount, 1.5);
  });
});
