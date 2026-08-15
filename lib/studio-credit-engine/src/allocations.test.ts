import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StudioCreditReasonCode } from './reason-codes';
import { MembershipCreditAllowances } from './membership';
import {
  allocationStatusAfterRemaining,
  compareLotsForConsumption,
  computeAvailableStudioCredits,
  computeLegacyMembershipBridgeCredits,
  expectedCreditsForAllocation,
  hasActiveMembershipLotCoveringNow,
  isAllocationLotSpendable,
  isLegacyMembershipBridgeEnabled,
  legacyUtcMembershipPeriodBounds,
  legacyUtcMembershipPeriodKey,
  membershipCreditsDoNotCarryForward,
  planAllocationConsumption,
  razorpayMembershipPeriodKey,
  studioPassExpiresAt,
  sumSpendableAllocationCredits,
  StudioCreditAllocationStatus,
  STUDIO_PASS_VALIDITY_DAYS,
  type CreditAllocationLotLike,
} from './allocations';

function lot(
  partial: Partial<CreditAllocationLotLike> &
    Pick<CreditAllocationLotLike, 'id' | 'reasonCode' | 'remainingAmount'>,
): CreditAllocationLotLike {
  return {
    startsAt: new Date('2026-08-01T00:00:00.000Z'),
    expiresAt: null,
    status: StudioCreditAllocationStatus.ACTIVE,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...partial,
  };
}

describe('expectedCreditsForAllocation', () => {
  it('2. Basic membership is 120', () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        tier: 'pro',
      }),
      MembershipCreditAllowances.basic,
    );
    assert.equal(MembershipCreditAllowances.basic, 120);
  });

  it('3. Pro membership is 240', () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        tier: 'enterprise',
      }),
      MembershipCreditAllowances.pro,
    );
    assert.equal(MembershipCreditAllowances.pro, 240);
  });

  it('8. Top-Up is 35', () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
      }),
      35,
    );
  });

  it('10. Studio Pass is 40', () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
      }),
      40,
    );
  });

  it('Basic → Pro upgrade allocation is exactly 120', () => {
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION,
        tier: 'enterprise',
      }),
      120,
    );
    assert.equal(
      expectedCreditsForAllocation({
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION,
        tier: 'pro',
      }),
      120,
    );
  });

});

describe('expiry helpers', () => {
  it('11. Studio Pass expires after 7 days', () => {
    const starts = new Date('2026-08-01T12:00:00.000Z');
    const expires = studioPassExpiresAt(starts);
    assert.equal(STUDIO_PASS_VALIDITY_DAYS, 7);
    assert.equal(expires.toISOString(), '2026-08-08T12:00:00.000Z');
  });

  it('4/12. expired lots are not spendable; status flips to expired', () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const membership = lot({
      id: 1,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      remainingAmount: 30,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    assert.equal(isAllocationLotSpendable(membership, now), false);
    assert.equal(
      allocationStatusAfterRemaining(30, membership.expiresAt, now),
      StudioCreditAllocationStatus.EXPIRED,
    );

    const pass = lot({
      id: 2,
      reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
      remainingAmount: 40,
      expiresAt: new Date('2026-08-08T12:00:00.000Z'),
    });
    assert.equal(isAllocationLotSpendable(pass, now), false);
  });

  it('5. membership credits do not carry forward', () => {
    assert.equal(membershipCreditsDoNotCarryForward(), true);
    const now = new Date('2026-09-01T00:00:00.000Z');
    const prior = lot({
      id: 1,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      remainingAmount: 30,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const next = lot({
      id: 2,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      remainingAmount: 120,
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    assert.equal(isAllocationLotSpendable(prior, now), false);
    assert.equal(sumSpendableAllocationCredits([prior, next], now), 120);
  });

  it('9. Top-Up survives membership-cycle boundary', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const topUp = lot({
      id: 1,
      reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
      remainingAmount: 35,
      expiresAt: null,
      createdAt: new Date('2026-08-15T00:00:00.000Z'),
    });
    const expiredMembership = lot({
      id: 2,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      remainingAmount: 30,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    assert.equal(isAllocationLotSpendable(topUp, now), true);
    assert.equal(
      sumSpendableAllocationCredits([topUp, expiredMembership], now),
      35,
    );
  });

  it('22. new membership period keys are Razorpay-shaped, not calendar months', () => {
    const key = razorpayMembershipPeriodKey({
      subscriptionId: 'sub_123',
      currentStartUnix: 1_700_000_000,
      currentEndUnix: 1_702_592_000,
    });
    assert.equal(key, 'rzp:sub_123:1700000000:1702592000');
    assert.equal(key.includes('legacy-utc'), false);
    assert.match(legacyUtcMembershipPeriodKey(new Date('2026-08-12T00:00:00Z')), /^legacy-utc:2026-08$/);
    const bounds = legacyUtcMembershipPeriodBounds(
      new Date('2026-08-12T00:00:00Z'),
    );
    assert.equal(bounds.periodKey, 'legacy-utc:2026-08');
  });
});

describe('consumption order', () => {
  it('consumes Pass → Top-Up → Membership', () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const lots = [
      lot({
        id: 3,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        remainingAmount: 100,
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      lot({
        id: 2,
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
        remainingAmount: 35,
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      }),
      lot({
        id: 1,
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
        remainingAmount: 40,
        expiresAt: new Date('2026-08-08T00:00:00.000Z'),
        createdAt: new Date('2026-08-03T00:00:00.000Z'),
      }),
    ];

    const ordered = lots.slice().sort(compareLotsForConsumption);
    assert.deepEqual(
      ordered.map((l) => l.id),
      [1, 2, 3],
    );

    const plan = planAllocationConsumption(lots, 50, now);
    assert.deepEqual(plan, [
      { allocationId: 1, amount: 40, remainingAfter: 0 },
      { allocationId: 2, amount: 10, remainingAfter: 25 },
    ]);
  });

  it('spend upgrade lots before base membership lots', () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const lots = [
      lot({
        id: 20,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
        remainingAmount: 80,
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      lot({
        id: 21,
        reasonCode: StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION,
        remainingAmount: 120,
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
      }),
    ];
    const ordered = lots.slice().sort(compareLotsForConsumption);
    assert.deepEqual(
      ordered.map((l) => l.id),
      [21, 20],
    );
  });

  it('prefer soonest-expiring Pass lots first', () => {
    const now = new Date('2026-08-05T00:00:00.000Z');
    const lots = [
      lot({
        id: 10,
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
        remainingAmount: 20,
        expiresAt: new Date('2026-08-20T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      lot({
        id: 11,
        reasonCode: StudioCreditReasonCode.STUDIO_PASS_ALLOCATION,
        remainingAmount: 20,
        expiresAt: new Date('2026-08-10T00:00:00.000Z'),
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
      }),
    ];
    const plan = planAllocationConsumption(lots, 25, now);
    assert.equal(plan[0]!.allocationId, 11);
    assert.equal(plan[0]!.amount, 20);
    assert.equal(plan[1]!.allocationId, 10);
    assert.equal(plan[1]!.amount, 5);
  });
});

describe('pending holds and bridge', () => {
  it('14. pending holds reduce available balance', () => {
    assert.equal(
      computeAvailableStudioCredits({
        spendableFromLots: 120,
        pendingHeld: 4,
      }),
      116,
    );
  });

  it('bridge supplies membership only when no active membership lot', () => {
    const lots = [
      lot({
        id: 1,
        reasonCode: StudioCreditReasonCode.TOP_UP_ALLOCATION,
        remainingAmount: 35,
      }),
    ];
    assert.equal(hasActiveMembershipLotCoveringNow(lots), false);
    assert.equal(
      computeLegacyMembershipBridgeCredits({
        bridgeEnabled: true,
        hasActiveMembershipLot: false,
        membershipAllowance: 120,
        completedUsageInLegacyWindow: 10,
      }),
      110,
    );
    assert.equal(
      computeLegacyMembershipBridgeCredits({
        bridgeEnabled: true,
        hasActiveMembershipLot: true,
        membershipAllowance: 120,
        completedUsageInLegacyWindow: 10,
      }),
      0,
    );
    assert.equal(isLegacyMembershipBridgeEnabled({}), true);
    assert.equal(
      isLegacyMembershipBridgeEnabled({
        STUDIO_CREDIT_LEGACY_MEMBERSHIP_BRIDGE: 'false',
      }),
      false,
    );
  });

  it('28. legacy bridge does not double-grant when Razorpay membership lot exists', () => {
    const now = new Date('2026-08-20T00:00:00.000Z');
    const razorpayLot = lot({
      id: 9,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      remainingAmount: 120,
      startsAt: new Date('2026-08-18T00:00:00.000Z'),
      expiresAt: new Date('2026-09-17T00:00:00.000Z'),
      periodKey: 'rzp:sub_x:1:2',
    });
    assert.equal(hasActiveMembershipLotCoveringNow([razorpayLot], now), true);
    assert.equal(
      computeLegacyMembershipBridgeCredits({
        bridgeEnabled: true,
        hasActiveMembershipLot: true,
        membershipAllowance: 120,
        completedUsageInLegacyWindow: 0,
      }),
      0,
    );
    assert.equal(
      sumSpendableAllocationCredits([razorpayLot], now) +
        computeLegacyMembershipBridgeCredits({
          bridgeEnabled: true,
          hasActiveMembershipLot: hasActiveMembershipLotCoveringNow(
            [razorpayLot],
            now,
          ),
          membershipAllowance: 120,
          completedUsageInLegacyWindow: 0,
        }),
      120,
    );
  });

  it('6. next cycle fresh allocation is independent of prior remainder', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const priorRemainder = lot({
      id: 1,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      remainingAmount: 30,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const fresh = lot({
      id: 2,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      remainingAmount: 120,
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-01T01:00:00.000Z'),
    });
    assert.equal(
      sumSpendableAllocationCredits([priorRemainder, fresh], now),
      120,
    );
  });

  it('7. failed renewal creates no allocation (no lot ⇒ bridge or zero when off)', () => {
    assert.equal(
      computeLegacyMembershipBridgeCredits({
        bridgeEnabled: false,
        hasActiveMembershipLot: false,
        membershipAllowance: 120,
        completedUsageInLegacyWindow: 0,
      }),
      0,
    );
  });
});
