import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePromotionLifecycleStatus } from "./admin-promotion-status.js";

describe("computePromotionLifecycleStatus", () => {
  const start = new Date("2026-08-01T00:00:00.000Z");
  const end = new Date("2026-08-31T23:59:59.999Z");

  it("returns scheduled before start", () => {
    assert.equal(
      computePromotionLifecycleStatus({
        startAt: start,
        endAt: end,
        now: new Date("2026-07-15T00:00:00.000Z"),
      }),
      "scheduled",
    );
  });

  it("returns active within window", () => {
    assert.equal(
      computePromotionLifecycleStatus({
        startAt: start,
        endAt: end,
        now: new Date("2026-08-15T12:00:00.000Z"),
      }),
      "active",
    );
  });

  it("returns expired after end", () => {
    assert.equal(
      computePromotionLifecycleStatus({
        startAt: start,
        endAt: end,
        now: new Date("2026-09-01T00:00:00.000Z"),
      }),
      "expired",
    );
  });
});
