import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("Admin Studio Credits uses Transaction Master", () => {
  it("overview and export data loaders import transaction-master APIs", () => {
    const dataSource = readFileSync(
      path.join(here, "admin-studio-credits-data.ts"),
      "utf8",
    );
    assert.match(dataSource, /summarizeCredits/);
    assert.match(dataSource, /summarizeUsage/);
    assert.match(dataSource, /summarizeExpiration/);
    assert.match(dataSource, /loadCreditGrantEvents/);
    assert.match(dataSource, /loadCreditUsageEvents/);
    assert.match(dataSource, /loadCreditExpirationEvents/);
    assert.match(dataSource, /getStudioCreditBalance/);
    assert.doesNotMatch(dataSource, /deriveAdminStudioCreditsPeriodSummary/);
    assert.doesNotMatch(dataSource, /classifyAdminStudioCreditHead/);
    assert.doesNotMatch(dataSource, /loadAdminCreditExpirationOverview/);
  });

  it("export consumes the same Admin data loaders (no parallel classification)", () => {
    const exportSource = readFileSync(
      path.join(here, "admin-studio-credits-export.ts"),
      "utf8",
    );
    assert.match(exportSource, /loadAdminStudioCreditsOverview/);
    assert.match(exportSource, /loadAdminStudioCreditsCreditHeadSummary/);
    assert.match(exportSource, /loadAdminStudioCreditsExpirationExportRows/);
    assert.match(exportSource, /loadAdminStudioCreditsTransactionsForExport/);
    assert.doesNotMatch(exportSource, /admin-studio-credits-expiration/);
    assert.doesNotMatch(exportSource, /admin-studio-credits-credit-heads/);
  });
});
