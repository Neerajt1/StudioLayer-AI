import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  StudioCreditReasonCode,
  computeAvailableStudioCredits,
  expectedCreditsForAllocation,
  legacyMembershipSourceReference,
  legacyUtcMembershipPeriodBounds,
  planAllocationConsumption,
  razorpayMembershipPeriodKey,
  studioPassExpiresAt,
  StudioCreditAllocationStatus,
} from "@workspace/studio-credit-engine";

/**
 * Service-adjacent contracts for grant / consume / pending without DB.
 * DB integration is covered by migration seed + runtime ensure paths.
 */
describe("grantCreditAllocation contracts", () => {
  it("16. source references are unique identity keys for grants", () => {
    const a = legacyMembershipSourceReference(42, "legacy-utc:2026-08");
    const b = legacyMembershipSourceReference(42, "legacy-utc:2026-08");
    const c = legacyMembershipSourceReference(43, "legacy-utc:2026-08");
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it("8/10. grant amounts are locked to commercial constants", () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
      }),
      35,
    );
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
      }),
      40,
    );
  });

  it("22. Razorpay period keys do not use calendar-month reset", () => {
    const key = razorpayMembershipPeriodKey({
      subscriptionId: "sub_abc",
      currentStartUnix: 1_720_000_000,
      currentEndUnix: 1_722_592_000,
    });
    assert.match(key, /^rzp:sub_abc:\d+:\d+$/);
    assert.equal(key.includes("legacy-utc"), false);
  });

  it("legacy seed period bounds are UTC month (temporary bridge only)", () => {
    const bounds = legacyUtcMembershipPeriodBounds(
      new Date("2026-08-15T12:00:00.000Z"),
    );
    assert.equal(bounds.startsAt.toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(bounds.expiresAt.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(bounds.periodKey, "legacy-utc:2026-08");
  });
});

describe("pending + finalize contracts", () => {
  it("14. pending holds reduce available before lot consume", () => {
    assert.equal(
      computeAvailableStudioCredits({
        spendableFromLots: 120,
        pendingHeld: 4,
      }),
      116,
    );
  });

  it("17. consumption plan is stable for the same lots and charge", () => {
    const lots = [
      {
        id: 1,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        remainingAmount: 120,
        startsAt: new Date("2026-08-01T00:00:00.000Z"),
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        status: StudioCreditAllocationStatus.ACTIVE,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ];
    const now = new Date("2026-08-10T00:00:00.000Z");
    assert.deepEqual(
      planAllocationConsumption(lots, 2, now),
      planAllocationConsumption(lots, 2, now),
    );
  });

  it("11. pass expiry helper is startsAt + 7d", () => {
    const starts = new Date("2026-08-01T00:00:00.000Z");
    assert.equal(
      studioPassExpiresAt(starts).toISOString(),
      "2026-08-08T00:00:00.000Z",
    );
  });
});
