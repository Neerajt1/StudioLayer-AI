import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("scheduled Basic → Pro + account deletion billing safety", () => {
  const paymentsSource = readFileSync(
    path.join(here, "../routes/payments.ts"),
    "utf8",
  );
  const membershipSource = readFileSync(
    path.join(here, "razorpay-membership.ts"),
    "utf8",
  );
  const clientSource = readFileSync(path.join(here, "razorpay-client.ts"), "utf8");
  const deleteSource = readFileSync(
    path.join(here, "../services/delete-studio.ts"),
    "utf8",
  );
  const scheduleLogicSource = readFileSync(
    path.join(here, "razorpay-schedule-pro-logic.ts"),
    "utf8",
  );

  it("exposes schedule-pro endpoint (not the removed mid-cycle upgrade path)", () => {
    assert.match(paymentsSource, /\/payments\/subscriptions\/schedule-pro/);
    assert.match(paymentsSource, /scheduleMembershipUpgradeToPro/);
    assert.equal(paymentsSource.includes("/payments/subscriptions/upgrade-to-pro"), false);
    assert.equal(membershipSource.includes("upgradeMembershipToPro"), false);
    assert.equal(membershipSource.includes("createRazorpayOrder"), false);
    assert.equal(membershipSource.includes("membership_upgrade_allocation"), false);
    assert.equal(membershipSource.includes("updateRazorpaySubscriptionPlan"), false);
  });

  it("future-start Pro uses start_at and market-specific Pro plan resolution", () => {
    assert.match(membershipSource, /startAt:\s*startAtDecision\.startAtUnix/);
    assert.match(membershipSource, /resolveScheduledProStartAtUnix/);
    assert.match(membershipSource, /resolveScheduledProPlanMarket/);
    assert.match(membershipSource, /resolveRazorpayPlanId\("pro", market\)/);
    assert.match(clientSource, /RAZORPAY_PRO_PLAN_ID_INR/);
    assert.match(clientSource, /RAZORPAY_PRO_PLAN_ID_USD/);
    assert.match(clientSource, /body\.start_at = input\.startAt/);
  });

  it("Basic cycle-end cancel is requested after Pro auth; failure rolls back Pro", () => {
    assert.match(membershipSource, /ensureBasicCycleEndCancelForScheduledPro/);
    assert.match(membershipSource, /cancelAtCycleEnd:\s*true/);
    assert.match(membershipSource, /Failed to roll back scheduled Pro/);
    assert.match(scheduleLogicSource, /shouldRequestBasicCycleEndCancel/);
    assert.match(membershipSource, /isRazorpayCancelAtCycleEndConfirmed/);
    assert.match(
      membershipSource,
      /Razorpay did not confirm cancel_at_cycle_end/,
    );
    assert.match(clientSource, /isRazorpayCancelAtCycleEndConfirmed/);
  });

  it("customer self-serve cancel-at-cycle-end is wired", () => {
    assert.match(paymentsSource, /\/payments\/subscriptions\/cancel/);
    assert.match(paymentsSource, /cancelMembershipAtCycleEnd/);
    assert.match(membershipSource, /export async function cancelMembershipAtCycleEnd/);
    assert.match(scheduleLogicSource, /cancelAtCycleEndRequested/);
  });

  it("duplicate Upgrade returns existing scheduled Pro", () => {
    assert.match(membershipSource, /findExistingScheduledPro/);
    assert.match(membershipSource, /alreadyScheduled:\s*true/);
  });

  it("entitlement stays Basic until Pro charged; charged uses normal membership allocation", () => {
    assert.match(scheduleLogicSource, /resolveCurrentMembershipEntitlement/);
    assert.match(membershipSource, /StudioCreditReasonCode\.MEMBERSHIP_ALLOCATION/);
    assert.equal(membershipSource.includes("MEMBERSHIP_UPGRADE_ALLOCATION"), false);
    assert.equal(membershipSource.includes("immediateUpgradeEntitlement"), false);
  });

  it("account deletion cancels all open Razorpay memberships fail-closed", () => {
    assert.match(deleteSource, /cancelAllOpenRazorpayMembershipsForUser/);
    assert.match(deleteSource, /razorpay_cancellation/);
    assert.match(membershipSource, /cancelAllOpenRazorpayMembershipsForUser/);
    assert.match(membershipSource, /cancelAtCycleEnd:\s*false/);
    assert.match(
      membershipSource,
      /Unable to cancel .* Razorpay membership subscription\(s\) before account deletion/,
    );
    const cancelIdx = deleteSource.indexOf("cancelAllOpenRazorpayMembershipsForUser");
    const dbDeleteIdx = deleteSource.indexOf(".delete(usersTable)");
    assert.ok(cancelIdx > 0 && dbDeleteIdx > cancelIdx);
  });
});
