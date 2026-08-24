import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("Admin Generations uses Transaction Master", () => {
  it("summary loader calls summarizeUsage", () => {
    const statsSource = readFileSync(
      path.join(here, "admin-generations-stats.ts"),
      "utf8",
    );
    assert.match(statsSource, /summarizeUsage/);
    assert.match(statsSource, /mapTransactionMasterUsageToAdminGenerationsSummary/);
    assert.doesNotMatch(statsSource, /deriveLedgerUsageMetrics/);
    assert.doesNotMatch(statsSource, /studio_credit_transactions/);
  });

  it("export consumes Transaction Master usage events", () => {
    const exportSource = readFileSync(
      path.join(here, "admin-generations-export.ts"),
      "utf8",
    );
    assert.match(exportSource, /loadCreditUsageEvents/);
    assert.match(exportSource, /loadAdminGenerationsSummary/);
    assert.doesNotMatch(exportSource, /deriveLedgerUsageMetrics/);
    assert.doesNotMatch(exportSource, /loadAdminGenerationsSummaryTransactions/);
  });

  it("route uses loadAdminGenerationsSummary (not local aggregation)", () => {
    const routeSource = readFileSync(
      path.join(here, "../routes/admin-generations.ts"),
      "utf8",
    );
    assert.match(routeSource, /loadAdminGenerationsSummary/);
    assert.doesNotMatch(routeSource, /deriveLedgerUsageMetrics/);
  });
});
