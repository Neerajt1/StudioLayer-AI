import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");

describe("migration 014 pending upgrade contract", () => {
  const migration = readFileSync(
    path.join(
      repoRoot,
      "lib/db/migrations/014_studio_razorpay_pending_upgrade.sql",
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
  const payments = readFileSync(path.join(here, "../routes/payments.ts"), "utf8");

  it("adds pending upgrade columns", () => {
    for (const col of [
      "pending_upgrade_plan",
      "pending_razorpay_plan_id",
      "pending_upgrade_scheduled_at",
      "pending_upgrade_payment_id",
    ]) {
      assert.match(migration, new RegExp(col));
      assert.match(schema, new RegExp(`"${col}"`));
    }
  });

  it("upgrade path uses cycle_end after fixed-difference Order — never now", () => {
    assert.match(membership, /updateRazorpaySubscriptionPlan/);
    assert.match(membership, /scheduleChangeAt: "cycle_end"/);
    assert.match(membership, /createRazorpayOrder/);
    assert.match(membership, /fulfillMembershipUpgradeFromCapturedPayment/);
    assert.equal(membership.includes('scheduleChangeAt: "now"'), false);
    assert.match(membership, /upgradeMembershipToPro/);
    assert.match(membership, /resolveBasicToProUpgrade/);
    assert.match(payments, /\/payments\/subscriptions\/upgrade-to-pro/);
    assert.match(payments, /upgradeMembershipToPro/);
  });

  it("webhook sync clears pending and grants from effective plan", () => {
    assert.match(membership, /resolveSubscriptionPlanSync/);
    assert.match(membership, /effectiveStudioPlan/);
    assert.match(membership, /pendingUpgradePlan: null/);
  });
});
