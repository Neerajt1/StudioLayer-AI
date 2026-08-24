import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sanitizeProviderErrorMessage,
  toAdminProviderUsageStatusLabel,
} from "./admin-provider-usage-status.js";

describe("sanitizeProviderErrorMessage", () => {
  it("redacts bearer tokens and long secret-like strings", () => {
    const message = sanitizeProviderErrorMessage(
      "Bearer sk-or-v1-abcdef1234567890 failed with ghp_abcdefghijklmnopqrstuvwxyz",
    );
    assert.equal(message.includes("sk-or-v1-abcdef"), false);
    assert.equal(message.includes("ghp_abcdefghijklmnopqrstuvwxyz"), false);
    assert.match(message, /Bearer \[redacted\]/);
  });
});

describe("toAdminProviderUsageStatusLabel", () => {
  it("maps provider usage statuses to admin labels", () => {
    assert.equal(toAdminProviderUsageStatusLabel("healthy"), "Healthy");
    assert.equal(toAdminProviderUsageStatusLabel("attention"), "Attention");
    assert.equal(toAdminProviderUsageStatusLabel("down"), "Down");
    assert.equal(
      toAdminProviderUsageStatusLabel("not_configured"),
      "Not configured",
    );
    assert.equal(
      toAdminProviderUsageStatusLabel("not_available"),
      "Not available",
    );
  });
});
