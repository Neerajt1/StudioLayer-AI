import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");

describe("migration 013 ↔ schema ↔ membership query contract", () => {
  const migration = readFileSync(
    path.join(
      repoRoot,
      "lib/db/migrations/013_studio_razorpay_subscriptions.sql",
    ),
    "utf8",
  );
  const schema = readFileSync(
    path.join(
      repoRoot,
      "lib/db/src/schema/studio-razorpay-subscriptions.ts",
    ),
    "utf8",
  );
  const membership = readFileSync(
    path.join(here, "razorpay-membership.ts"),
    "utf8",
  );

  it("creates both tables with UNIQUE event_id and UNIQUE razorpay_subscription_id", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS studio_razorpay_subscriptions/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS studio_razorpay_webhook_events/);
    assert.match(
      migration,
      /studio_razorpay_subscriptions_rzp_sub_uidx[\s\S]*razorpay_subscription_id/,
    );
    assert.match(
      migration,
      /studio_razorpay_webhook_events_event_id_uidx[\s\S]*event_id/,
    );
  });

  it("indexes user/status lookup used by open-subscription checks", () => {
    assert.match(
      migration,
      /studio_razorpay_subscriptions_user_status_idx[\s\S]*\(user_id, status\)/,
    );
    assert.match(membership, /studioRazorpaySubscriptionsTable\.userId/);
    assert.match(membership, /OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES/);
  });

  it("schema columns match migration columns used by inserts/updates", () => {
    for (const col of [
      "user_id",
      "razorpay_subscription_id",
      "razorpay_plan_id",
      "studio_plan",
      "studio_tier",
      "status",
      "current_start",
      "current_end",
      "razorpay_customer_id",
      "latest_payment_id",
      "latest_invoice_id",
      "event_id",
      "event_type",
      "razorpay_payment_id",
      "processing_status",
      "error_message",
    ]) {
      assert.match(migration, new RegExp(col));
      assert.match(schema, new RegExp(`"${col}"`));
    }
  });

  it("financial source_reference lives on allocations (012), not migration 013", () => {
    assert.equal(migration.includes("source_reference"), false);
    assert.match(membership, /sourceReference/);
  });

  it("FK user_id → users(id) ON DELETE CASCADE is present", () => {
    assert.match(
      migration,
      /user_id INTEGER NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/,
    );
  });
});
