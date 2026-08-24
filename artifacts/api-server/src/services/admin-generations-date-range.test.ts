import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseAdminFromDate,
  parseAdminGenerationsDateRange,
  parseAdminToDate,
  adminGenerationsExportFilename,
} from "./admin-generations-date-range.js";

describe("admin generations date range", () => {
  it("includes the full To calendar day through UTC end-of-day", () => {
    const from = parseAdminFromDate("2026-08-01");
    const to = parseAdminToDate("2026-08-19");
    assert.equal(from.toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-08-19T23:59:59.999Z");
  });

  it("parseAdminGenerationsDateRange rejects inverted ranges", () => {
    assert.throws(() =>
      parseAdminGenerationsDateRange({
        fromDate: "2026-08-20",
        toDate: "2026-08-01",
      }),
    );
  });

  it("adminGenerationsExportFilename includes the selected date range", () => {
    assert.equal(
      adminGenerationsExportFilename("2026-08-01", "2026-08-19"),
      "StudioLayer Admin Generations - 2026-08-01 to 2026-08-19.xlsx",
    );
  });
});
