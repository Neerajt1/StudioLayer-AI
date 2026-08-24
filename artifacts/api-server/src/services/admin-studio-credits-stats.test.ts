import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapTransactionMasterCreditsToCreditHeads,
  mapTransactionMasterCreditsToPeriodSummary,
} from "./admin-studio-credits-mapping.js";
import {
  defaultExpirationToDate,
  parseAdminExpirationDateRange,
  utcDateInputValue,
} from "./admin-studio-credits-stats.js";
import type { CreditsSummary } from "./transaction-master/types.js";

describe("Admin Studio Credits ← Transaction Master mapping", () => {
  it("maps five credit heads and keeps unknown out of TOTAL", () => {
    const credits: CreditsSummary = {
      studioBasicCredits: 120,
      studioProCredits: 240,
      topUpCredits: 35,
      studioPassCredits: 40,
      promotionalCredits: 10,
      totalCreditsAdded: 445,
      unknownCredits: 50,
    };

    const heads = mapTransactionMasterCreditsToCreditHeads(credits);
    assert.equal(heads.studioBasicCredits, 120);
    assert.equal(heads.studioProCredits, 240);
    assert.equal(heads.topUpCredits, 35);
    assert.equal(heads.studioPassCredits, 40);
    assert.equal(heads.promotionalCredits, 10);
    assert.equal(heads.totalCreditsAdded, 445);
    assert.equal(heads.unknownCredits, 50);
    assert.equal(
      heads.studioBasicCredits +
        heads.studioProCredits +
        heads.topUpCredits +
        heads.studioPassCredits +
        heads.promotionalCredits,
      heads.totalCreditsAdded,
    );
  });

  it("maps UI creditsAdded as purchased + membership + unknown, promo separate", () => {
    const credits: CreditsSummary = {
      studioBasicCredits: 120,
      studioProCredits: 240,
      topUpCredits: 35,
      studioPassCredits: 40,
      promotionalCredits: 10,
      totalCreditsAdded: 445,
      unknownCredits: 50,
    };

    const summary = mapTransactionMasterCreditsToPeriodSummary(credits, 7);
    assert.equal(summary.creditsAdded, 120 + 240 + 35 + 40 + 50);
    assert.equal(summary.membershipCreditsGranted, 360);
    assert.equal(summary.promotionalCreditsGranted, 10);
    assert.equal(summary.creditsConsumed, 7);
    assert.equal(
      summary.creditsAdded + summary.promotionalCreditsGranted,
      credits.totalCreditsAdded + credits.unknownCredits,
    );
  });

  it("does not fold unknown into promotional or five-head total", () => {
    const credits: CreditsSummary = {
      studioBasicCredits: 0,
      studioProCredits: 0,
      topUpCredits: 0,
      studioPassCredits: 0,
      promotionalCredits: 0,
      totalCreditsAdded: 0,
      unknownCredits: 99,
    };
    const heads = mapTransactionMasterCreditsToCreditHeads(credits);
    const summary = mapTransactionMasterCreditsToPeriodSummary(credits, 0);
    assert.equal(heads.totalCreditsAdded, 0);
    assert.equal(heads.unknownCredits, 99);
    assert.equal(summary.promotionalCreditsGranted, 0);
    assert.equal(summary.creditsAdded, 99);
  });
});

describe("parseAdminExpirationDateRange", () => {
  it("limits future expiration ranges to 30 days", () => {
    const today = utcDateInputValue(new Date("2026-08-19T12:00:00.000Z"));
    assert.throws(() =>
      parseAdminExpirationDateRange(
        {
          expirationFromDate: today,
          expirationToDate: "2026-09-20",
        },
        new Date("2026-08-19T12:00:00.000Z"),
      ),
    );
  });

  it("allows the default future window from today through today + 30 days", () => {
    const today = utcDateInputValue(new Date("2026-08-19T12:00:00.000Z"));
    const parsed = parseAdminExpirationDateRange(
      {
        expirationFromDate: today,
        expirationToDate: defaultExpirationToDate(
          new Date("2026-08-19T12:00:00.000Z"),
        ),
      },
      new Date("2026-08-19T12:00:00.000Z"),
    );
    assert.equal(parsed.expirationFromDate, today);
    assert.equal(parsed.expirationToDate, "2026-09-18");
  });

  it("allows historical expiration ranges beyond 30 days", () => {
    const parsed = parseAdminExpirationDateRange(
      {
        expirationFromDate: "2026-08-01",
        expirationToDate: "2026-08-19",
      },
      new Date("2026-08-19T12:00:00.000Z"),
    );
    assert.equal(parsed.expirationFromDate, "2026-08-01");
    assert.equal(parsed.expirationToDate, "2026-08-19");
  });
});
