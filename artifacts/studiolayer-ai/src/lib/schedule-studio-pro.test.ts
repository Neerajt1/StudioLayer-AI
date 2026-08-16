import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMembershipBillingDate,
  scheduledProNeedsCheckout,
} from "./schedule-studio-pro-copy.js";

describe("schedule-studio-pro helpers", () => {
  it("formats Pro start dates for membership copy", () => {
    const label = formatMembershipBillingDate("2024-08-31T18:30:00.000Z");
    assert.ok(label);
    assert.match(label!, /2024/);
  });

  it("treats created/pending scheduled Pro as needing Checkout", () => {
    assert.equal(scheduledProNeedsCheckout("created"), true);
    assert.equal(scheduledProNeedsCheckout("pending"), true);
    assert.equal(scheduledProNeedsCheckout("authenticated"), false);
    assert.equal(scheduledProNeedsCheckout("active"), false);
  });
});
