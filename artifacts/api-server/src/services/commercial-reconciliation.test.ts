import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { numbersEqual } from "./commercial-reconciliation.js";
import { toCreditDenominatedTransactions } from "./credit-normalization.js";

/**
 * Mirrors the ledger check in runCommercialReconciliation: usage transactions
 * are read in minor units, normalised at the boundary, then summed and
 * compared against a credit-denominated usage total.
 */
function scopedCompletedTotal(storedMinorUnits: readonly number[]): number {
  return toCreditDenominatedTransactions(
    storedMinorUnits.map((amount) => ({ amount })) as never,
  ).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

describe("commercial reconciliation — ledger totals are credit-denominated", () => {
  it("reads stored usage holds as Studio Credits, not minor units", () => {
    assert.equal(scopedCompletedTotal([-150]), 1.5);
    assert.equal(scopedCompletedTotal([-300]), 3);
    assert.equal(scopedCompletedTotal([-450]), 4.5);
  });

  it("reconciles 450 stored units against 4.5 credits, not 450", () => {
    const total = scopedCompletedTotal([-150, -300]);
    assert.equal(total, 4.5);
    assert.equal(numbersEqual(total, 4.5), true);
    assert.equal(numbersEqual(total, 450), false);
  });

  it("handles positive grants and negative usage alike", () => {
    // Sign is irrelevant to the unit: a +12000 grant is 120 credits.
    assert.equal(scopedCompletedTotal([12000]), 120);
    assert.equal(scopedCompletedTotal([-12000]), 120);
    assert.equal(scopedCompletedTotal([150, -150]), 3);
  });

  it("still reports a genuine drift after normalisation", () => {
    // The ledger says 3 credits were spent; the usage total says 4.5. That is
    // real drift and must survive the unit fix rather than being masked by it.
    const ledger = scopedCompletedTotal([-150, -150]);
    assert.equal(ledger, 3);
    assert.equal(numbersEqual(ledger, 4.5), false);
  });

  it("treats an exactly reconciling account as equal despite float noise", () => {
    const ledger = scopedCompletedTotal([-150, -150, -150]);
    assert.equal(numbersEqual(ledger, 4.5), true);
  });
});
