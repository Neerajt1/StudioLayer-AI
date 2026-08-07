import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { billingCycleStartUtc } from "./billing-cycle.js";

describe("billingCycleStartUtc", () => {
  it("returns the first day of the UTC month at midnight", () => {
    const now = new Date("2026-08-15T14:30:00.000Z");
    const cycleStart = billingCycleStartUtc(now);

    assert.equal(cycleStart.toISOString(), "2026-08-01T00:00:00.000Z");
  });

  it("uses UTC boundaries regardless of server local timezone", () => {
    const now = new Date("2026-01-31T23:30:00.000Z");
    const cycleStart = billingCycleStartUtc(now);

    assert.equal(cycleStart.getUTCFullYear(), 2026);
    assert.equal(cycleStart.getUTCMonth(), 0);
    assert.equal(cycleStart.getUTCDate(), 1);
  });
});
