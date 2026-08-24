import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateOverallHealthStatus,
  toAdminHealthLabel,
} from "./admin-system-health-status.js";

describe("aggregateOverallHealthStatus", () => {
  it("returns healthy when all monitored components are healthy", () => {
    assert.equal(
      aggregateOverallHealthStatus(["healthy", "healthy", "not_monitored"]),
      "healthy",
    );
  });

  it("returns down when any monitored component is down", () => {
    assert.equal(
      aggregateOverallHealthStatus(["healthy", "down", "not_monitored"]),
      "down",
    );
  });

  it("returns attention when attention is worst monitored state", () => {
    assert.equal(
      aggregateOverallHealthStatus(["healthy", "attention", "not_monitored"]),
      "attention",
    );
  });

  it("returns not_monitored when nothing is monitored", () => {
    assert.equal(
      aggregateOverallHealthStatus(["not_monitored", "not_monitored"]),
      "not_monitored",
    );
  });
});

describe("toAdminHealthLabel", () => {
  it("maps statuses to admin labels", () => {
    assert.equal(toAdminHealthLabel("healthy"), "Healthy");
    assert.equal(toAdminHealthLabel("attention"), "Attention");
    assert.equal(toAdminHealthLabel("down"), "Down");
    assert.equal(toAdminHealthLabel("not_monitored"), "Not monitored yet");
  });
});
