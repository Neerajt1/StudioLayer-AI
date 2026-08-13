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

  it("resets membership at each UTC month boundary for paid tiers (no carry-forward)", () => {
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

  it("carries Top-Up across membership period boundaries", () => {
    const ctx = balanceCtx({
      transactions: [
        usageTx({
          id: 1,
          reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
          amount: 35,
          createdAt: new Date("2026-07-20T10:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -10,
          createdAt: new Date("2026-07-21T10:00:00.000Z"),
        }),
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -5,
          createdAt: new Date("2026-08-02T10:00:00.000Z"),
        }),
      ],
      liveRemaining: 150,
    });
    // Jul: 120+35=155; -10 hits Top-Up first → 145 (top-up 25 left)
    // Aug: membership→120 + carried top-up 25 - 5 = 140
    assert.deepEqual(computeLedgerRunningBalances(ctx), [155, 145, 140]);
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
  it("uses membership allowance as each paid month opening (membership no carry-forward)", () => {
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

  it("carries Top-Up remainder into the next paid month opening", () => {
    const ctx = balanceCtx({ liveRemaining: 145 });
    const rows = applyMonthlyBalanceFields(ctx, [
      { monthKey: "2026-07", creditsAdded: 35, creditsUsed: 10 },
      { monthKey: "2026-08", creditsAdded: 0, creditsUsed: 0 },
    ]);

    assert.equal(rows[0]!.openingBalance, 120);
    assert.equal(rows[0]!.closingBalance, 145);
    // Top-Up survives after Pass→Top-Up→Membership spend order (25 left).
    assert.equal(rows[1]!.openingBalance, 145);
    assert.equal(rows[1]!.closingBalance, 145);
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

describe("Razorpay allocation-period statement balances", () => {
  it("25. statement agrees with allocation-based live balance for Razorpay period", () => {
    const startsAt = new Date("2026-08-18T00:00:00.000Z");
    const expiresAt = new Date("2026-09-17T00:00:00.000Z");
    const ctx = balanceCtx({
      liveRemaining: 30,
      membershipPeriodHints: [
        {
          ledgerTransactionId: "tx-grant",
          startsAt,
          expiresAt,
          periodKey: "rzp:sub:1:2",
          originalAmount: 120,
        },
      ],
      transactions: [
        usageTx({
          id: 1,
          transactionId: "tx-grant",
          reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
          amount: 120,
          createdAt: startsAt,
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -90,
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
        }),
      ],
    });

    assert.deepEqual(computeLedgerRunningBalances(ctx), [120, 30]);
    assert.equal(finalLedgerRunningBalance(ctx), 30);
    assert.equal(finalLedgerRunningBalance(ctx), ctx.liveRemaining);
  });

  it("23. membership remainder expires; next period is fresh 120 not 150", () => {
    const ctx = balanceCtx({
      liveRemaining: 120,
      membershipPeriodHints: [
        {
          ledgerTransactionId: "tx-p1",
          startsAt: new Date("2026-08-18T00:00:00.000Z"),
          expiresAt: new Date("2026-09-17T00:00:00.000Z"),
          periodKey: "rzp:sub:p1",
          originalAmount: 120,
        },
        {
          ledgerTransactionId: "tx-p2",
          startsAt: new Date("2026-09-17T00:00:00.000Z"),
          expiresAt: new Date("2026-10-17T00:00:00.000Z"),
          periodKey: "rzp:sub:p2",
          originalAmount: 120,
        },
      ],
      transactions: [
        usageTx({
          id: 1,
          transactionId: "tx-p1",
          reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
          amount: 120,
          createdAt: new Date("2026-08-18T00:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -90,
          createdAt: new Date("2026-08-20T00:00:00.000Z"),
        }),
        usageTx({
          id: 3,
          transactionId: "tx-p2",
          reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
          amount: 120,
          createdAt: new Date("2026-09-17T00:00:00.000Z"),
        }),
      ],
    });

    assert.deepEqual(computeLedgerRunningBalances(ctx), [120, 30, 120]);
  });

  it("26. Top-Up survives Razorpay membership boundary", () => {
    const ctx = balanceCtx({
      liveRemaining: 145,
      membershipPeriodHints: [
        {
          ledgerTransactionId: "tx-m1",
          startsAt: new Date("2026-08-18T00:00:00.000Z"),
          expiresAt: new Date("2026-09-17T00:00:00.000Z"),
          originalAmount: 120,
        },
        {
          ledgerTransactionId: "tx-m2",
          startsAt: new Date("2026-09-17T00:00:00.000Z"),
          expiresAt: new Date("2026-10-17T00:00:00.000Z"),
          originalAmount: 120,
        },
      ],
      transactions: [
        usageTx({
          id: 1,
          transactionId: "tx-m1",
          reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
          amount: 120,
          createdAt: new Date("2026-08-18T00:00:00.000Z"),
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
          amount: 35,
          createdAt: new Date("2026-08-19T00:00:00.000Z"),
        }),
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -10,
          createdAt: new Date("2026-08-20T00:00:00.000Z"),
        }),
        usageTx({
          id: 4,
          transactionId: "tx-m2",
          reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
          amount: 120,
          createdAt: new Date("2026-09-17T00:00:00.000Z"),
        }),
      ],
    });

    // 120; +35=155; -10 from top-up → 145; period end zeroes membership → 25 then +120 membership = 145
    assert.deepEqual(computeLedgerRunningBalances(ctx), [120, 155, 145, 145]);
  });

  it("27. Pass expires after 7 days in statement running balance", () => {
    const passAt = new Date("2026-08-18T00:00:00.000Z");
    const ctx = balanceCtx({
      liveRemaining: 120,
      membershipPeriodHints: [
        {
          ledgerTransactionId: "tx-m",
          startsAt: passAt,
          expiresAt: new Date("2026-09-17T00:00:00.000Z"),
          originalAmount: 120,
        },
      ],
      transactions: [
        usageTx({
          id: 1,
          transactionId: "tx-m",
          reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
          amount: 120,
          createdAt: passAt,
        }),
        usageTx({
          id: 2,
          reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
          amount: 50,
          createdAt: passAt,
        }),
        usageTx({
          id: 3,
          reasonCode: StudioCreditReasonCode.HERO_GENERATION,
          amount: -1,
          createdAt: new Date("2026-08-26T00:00:00.000Z"),
        }),
      ],
    });

    // Day 0: 120; +50 pass = 170; day 8: pass expired → 120, then -1 → 119
    assert.deepEqual(computeLedgerRunningBalances(ctx), [120, 170, 119]);
  });
});
