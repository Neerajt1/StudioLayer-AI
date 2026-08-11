import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StudioCreditReasonCode } from "@workspace/studio-credit-engine";
import type { StudioCreditTransaction } from "@workspace/db";
import {
  applyMonthlyBalanceFields,
  computeBillingCycleBalanceSummary,
  computeLedgerRunningBalances,
  finalLedgerRunningBalance,
  membershipResetsEachBillingCycle,
} from "./balance-history.js";

function usageTx(
  partial: Partial<StudioCreditTransaction> &
    Pick<StudioCreditTransaction, "id" | "reasonCode" | "amount" | "createdAt">,
): StudioCreditTransaction {
  return {
    transactionId: `tx-${partial.id}`,
    userId: 1,
    workspaceId: 1,
    status: "completed",
    renderId: 1,
    ...partial,
  };
}

function balanceCtx(
  overrides: Partial<Parameters<typeof computeLedgerRunningBalances>[0]> = {},
) {
  return {
    allowance: 120,
    tier: "pro",
    isAdmin: false,
    generatedAt: new Date("2026-08-10T12:00:00.000Z"),
    transactions: [] as StudioCreditTransaction[],
    liveRemaining: 118,
    ...overrides,
  };
}

describe("membershipResetsEachBillingCycle", () => {
  it("resets for paid tiers only", () => {
    assert.equal(membershipResetsEachBillingCycle("pro"), true);
    assert.equal(membershipResetsEachBillingCycle("enterprise"), true);
    assert.equal(membershipResetsEachBillingCycle("free"), false);
  });
});

describe("computeLedgerRunningBalances", () => {
  it("continues running balance within a paid billing cycle", () => {
    const ctx = balanceCtx({
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
      liveRemaining: 118,
    });

    assert.deepEqual(computeLedgerRunningBalances(ctx), [119, 118]);
  });

  it("resets to membership allowance at each UTC month boundary for paid tiers", () => {
    const ctx = balanceCtx({
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
          createdAt: new Date("2026-08-03T10:00:00.000Z"),
        }),
      ],
      liveRemaining: 118,
    });

    assert.deepEqual(computeLedgerRunningBalances(ctx), [100, 118]);
  });

  it("includes positive ledger additions in running balance", () => {
    const ctx = balanceCtx({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
          amount: 35,
          createdAt: new Date("2026-08-02T10:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -10,
          createdAt: new Date("2026-08-03T10:00:00.000Z"),
        }),
      ],
      liveRemaining: 145,
    });

    assert.deepEqual(computeLedgerRunningBalances(ctx), [155, 145]);
  });

  it("chains complimentary lifetime balance across months", () => {
    const ctx = balanceCtx({
      allowance: 1,
      tier: "free",
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          createdAt: new Date("2026-07-15T10:00:00.000Z"),
        }),
      ],
      liveRemaining: 0,
    });

    assert.deepEqual(computeLedgerRunningBalances(ctx), [0]);
  });

  it("final running balance matches live remaining for current paid cycle", () => {
    const ctx = balanceCtx({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -2,
          createdAt: new Date("2026-08-04T10:00:00.000Z"),
        }),
      ],
      liveRemaining: 118,
    });

    assert.equal(finalLedgerRunningBalance(ctx), 118);
  });
});

describe("applyMonthlyBalanceFields", () => {
  it("uses membership allowance as each paid month opening (no carry-forward)", () => {
    const ctx = balanceCtx({ liveRemaining: 118 });
    const rows = applyMonthlyBalanceFields(ctx, [
      { monthKey: "2026-07", creditsAdded: 0, creditsUsed: 100 },
      { monthKey: "2026-08", creditsAdded: 0, creditsUsed: 2 },
    ]);

    assert.equal(rows[0]!.openingBalance, 120);
    assert.equal(rows[0]!.closingBalance, 20);
    assert.equal(rows[1]!.openingBalance, 120);
    assert.equal(rows[1]!.closingBalance, 118);
    assert.equal(rows[1]!.openingBalance + 0 - 2, rows[1]!.closingBalance);
  });

  it("chains complimentary opening balances across months", () => {
    const ctx = balanceCtx({
      allowance: 1,
      tier: "free",
      generatedAt: new Date("2026-08-10T12:00:00.000Z"),
      liveRemaining: 0,
    });
    const rows = applyMonthlyBalanceFields(ctx, [
      { monthKey: "2026-07", creditsAdded: 0, creditsUsed: 1 },
      { monthKey: "2026-08", creditsAdded: 0, creditsUsed: 0 },
    ]);

    assert.equal(rows[0]!.openingBalance, 1);
    assert.equal(rows[0]!.closingBalance, 0);
    assert.equal(rows[1]!.openingBalance, 0);
    assert.equal(rows[1]!.closingBalance, 0);
  });

  it("satisfies opening + added - used = closing for computed months", () => {
    const ctx = balanceCtx({
      liveRemaining: 105,
    });
    const rows = applyMonthlyBalanceFields(ctx, [
      { monthKey: "2026-08", creditsAdded: 35, creditsUsed: 50 },
    ]);

    assert.equal(rows[0]!.openingBalance + 35 - 50, rows[0]!.closingBalance);
    assert.equal(rows[0]!.closingBalance, 105);
  });
});

describe("computeBillingCycleBalanceSummary", () => {
  it("matches live remaining when no extra ledger additions exist", () => {
    const summary = computeBillingCycleBalanceSummary({
      allowance: 120,
      creditsAddedInCycle: 0,
      creditsUsedInCycle: 2,
      liveRemaining: 118,
    });

    assert.equal(summary.computedClosing, 118);
    assert.equal(summary.matchesLiveRemaining, true);
  });
});
