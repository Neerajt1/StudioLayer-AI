import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCHEDULE_KIND_SCHEDULED_PRO,
  findActiveBasicForScheduledUpgrade,
  findExistingScheduledPro,
  resolveCurrentMembershipEntitlement,
  resolveScheduledProPlanMarket,
  resolveScheduledProStartAtUnix,
  shouldRequestBasicCycleEndCancel,
} from "./razorpay-schedule-pro-logic.js";

describe("resolveScheduledProStartAtUnix", () => {
  it("prefers live Razorpay current_end over local", () => {
    const result = resolveScheduledProStartAtUnix({
      liveCurrentEndUnix: 1_725_000_000,
      localCurrentEnd: new Date("2024-09-01T00:00:00.000Z"),
    });
    assert.deepEqual(result, { ok: true, startAtUnix: 1_725_000_000 });
  });

  it("falls back to local currentEnd when live is missing", () => {
    const local = new Date("2024-08-31T18:30:00.000Z");
    const result = resolveScheduledProStartAtUnix({
      liveCurrentEndUnix: null,
      localCurrentEnd: local,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.startAtUnix, Math.floor(local.getTime() / 1000));
    }
  });

  it("fails closed when neither live nor local end is available", () => {
    const result = resolveScheduledProStartAtUnix({
      liveCurrentEndUnix: undefined,
      localCurrentEnd: null,
    });
    assert.equal(result.ok, false);
  });
});

describe("resolveScheduledProPlanMarket", () => {
  it("selects india and international markets", () => {
    assert.equal(resolveScheduledProPlanMarket({ pricingMarket: "india" }), "india");
    assert.equal(
      resolveScheduledProPlanMarket({ pricingMarket: "international" }),
      "international",
    );
    assert.equal(resolveScheduledProPlanMarket({ pricingMarket: null }), "international");
  });
});

describe("findExistingScheduledPro / findActiveBasicForScheduledUpgrade", () => {
  it("finds an open scheduled Pro and active Basic", () => {
    const start = new Date("2024-08-31T00:00:00.000Z");
    const scheduled = findExistingScheduledPro([
      {
        razorpaySubscriptionId: "sub_pro_future",
        studioPlan: "pro",
        status: "created",
        scheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
        linkedSubscriptionId: "sub_basic",
        razorpayStartAt: start,
      },
    ]);
    assert.equal(scheduled?.razorpaySubscriptionId, "sub_pro_future");

    const basic = findActiveBasicForScheduledUpgrade([
      {
        razorpaySubscriptionId: "sub_basic",
        studioPlan: "basic",
        status: "active",
        currentEnd: start,
        cancelAtCycleEndRequested: false,
        linkedSubscriptionId: null,
      },
    ]);
    assert.equal(basic?.razorpaySubscriptionId, "sub_basic");
  });

  it("duplicate prevention returns the existing scheduled Pro row", () => {
    const rows = [
      {
        razorpaySubscriptionId: "sub_pro_1",
        studioPlan: "pro",
        status: "authenticated",
        scheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
        linkedSubscriptionId: "sub_basic",
        razorpayStartAt: new Date("2024-08-31T00:00:00.000Z"),
      },
      {
        razorpaySubscriptionId: "sub_pro_2",
        studioPlan: "pro",
        status: "created",
        scheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
        linkedSubscriptionId: "sub_basic",
        razorpayStartAt: new Date("2024-08-31T00:00:00.000Z"),
      },
    ];
    assert.equal(findExistingScheduledPro(rows)?.razorpaySubscriptionId, "sub_pro_1");
  });
});

describe("shouldRequestBasicCycleEndCancel", () => {
  it("requests cycle-end cancel after Pro is authorized", () => {
    assert.equal(
      shouldRequestBasicCycleEndCancel({
        proScheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
        proStudioPlan: "pro",
        proStatus: "authenticated",
        basicCancelAlreadyRequested: false,
      }),
      true,
    );
  });

  it("does not request again or before authorization", () => {
    assert.equal(
      shouldRequestBasicCycleEndCancel({
        proScheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
        proStudioPlan: "pro",
        proStatus: "created",
        basicCancelAlreadyRequested: false,
      }),
      false,
    );
    assert.equal(
      shouldRequestBasicCycleEndCancel({
        proScheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
        proStudioPlan: "pro",
        proStatus: "authenticated",
        basicCancelAlreadyRequested: true,
      }),
      false,
    );
  });
});

describe("resolveCurrentMembershipEntitlement", () => {
  const start = new Date("2024-08-31T00:00:00.000Z");

  it("keeps Basic entitlement while scheduled Pro is not yet active", () => {
    const result = resolveCurrentMembershipEntitlement({
      openRows: [
        {
          razorpaySubscriptionId: "sub_basic",
          studioPlan: "basic",
          studioTier: "pro",
          status: "active",
          scheduleKind: null,
          currentEnd: start,
          razorpayStartAt: null,
        },
        {
          razorpaySubscriptionId: "sub_pro",
          studioPlan: "pro",
          studioTier: "enterprise",
          status: "authenticated",
          scheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
          currentEnd: null,
          razorpayStartAt: start,
        },
      ],
    });
    assert.equal(result.studioPlan, "basic");
    assert.equal(result.studioTier, "pro");
    assert.equal(result.scheduledPro?.subscriptionId, "sub_pro");
    assert.equal(result.scheduledPro?.startAt, start.toISOString());
    assert.equal(result.cancelAtCycleEnd, false);
    assert.equal(result.cancelEffectiveAt, null);
  });

  it("activates Pro entitlement when scheduled Pro becomes active", () => {
    const result = resolveCurrentMembershipEntitlement({
      openRows: [
        {
          razorpaySubscriptionId: "sub_pro",
          studioPlan: "pro",
          studioTier: "enterprise",
          status: "active",
          scheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
          currentEnd: new Date("2024-09-30T00:00:00.000Z"),
          razorpayStartAt: start,
        },
      ],
    });
    assert.equal(result.studioPlan, "pro");
    assert.equal(result.studioTier, "enterprise");
    assert.equal(result.scheduledPro, null);
    assert.equal(result.cancelAtCycleEnd, false);
  });

  it("surfaces cancel-at-cycle-end from the active membership row", () => {
    const end = new Date("2024-09-17T00:00:00.000Z");
    const result = resolveCurrentMembershipEntitlement({
      openRows: [
        {
          razorpaySubscriptionId: "sub_basic",
          studioPlan: "basic",
          studioTier: "pro",
          status: "active",
          scheduleKind: null,
          currentEnd: end,
          razorpayStartAt: null,
          cancelAtCycleEndRequested: true,
        },
      ],
    });
    assert.equal(result.cancelAtCycleEnd, true);
    assert.equal(result.cancelEffectiveAt, end.toISOString());
  });
});
