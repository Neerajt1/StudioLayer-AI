/**
 * Pure helpers for scheduled Basic → Pro (future-start Pro subscription).
 * Does not restore the removed ₹3,000 upgrade Order flow.
 */
import type { StudioMembershipPlanId } from "./razorpay-client.js";
import { isOpenMembershipSubscriptionStatus } from "./razorpay-client.js";

export const SCHEDULE_KIND_SCHEDULED_PRO = "scheduled_pro";

export type ScheduledProOpenRow = {
  razorpaySubscriptionId: string;
  studioPlan: string;
  status: string;
  scheduleKind: string | null;
  linkedSubscriptionId: string | null;
  razorpayStartAt: Date | null;
};

export type ActiveBasicRow = {
  razorpaySubscriptionId: string;
  studioPlan: string;
  status: string;
  currentEnd: Date | null;
  cancelAtCycleEndRequested: boolean;
  linkedSubscriptionId: string | null;
};

/**
 * Resolve start_at unix from live Razorpay Basic current_end.
 * Fail closed when missing.
 */
export function resolveScheduledProStartAtUnix(input: {
  liveCurrentEndUnix: number | null | undefined;
  localCurrentEnd: Date | null | undefined;
}): { ok: true; startAtUnix: number } | { ok: false; message: string } {
  const live =
    typeof input.liveCurrentEndUnix === "number" &&
    Number.isFinite(input.liveCurrentEndUnix) &&
    input.liveCurrentEndUnix > 0
      ? Math.trunc(input.liveCurrentEndUnix)
      : null;
  if (live != null) {
    return { ok: true, startAtUnix: live };
  }
  const local = input.localCurrentEnd;
  if (local && !Number.isNaN(local.getTime())) {
    return { ok: true, startAtUnix: Math.floor(local.getTime() / 1000) };
  }
  return {
    ok: false,
    message:
      "Your Studio Basic billing period end could not be confirmed. Please try again shortly.",
  };
}

export function findExistingScheduledPro(
  openRows: readonly ScheduledProOpenRow[],
): ScheduledProOpenRow | null {
  const scheduled = openRows.filter(
    (row) =>
      row.scheduleKind === SCHEDULE_KIND_SCHEDULED_PRO &&
      row.studioPlan === "pro" &&
      isOpenMembershipSubscriptionStatus(row.status),
  );
  return scheduled[0] ?? null;
}

export function findActiveBasicForScheduledUpgrade(
  openRows: readonly ActiveBasicRow[],
): ActiveBasicRow | null {
  const basics = openRows.filter(
    (row) => row.studioPlan === "basic" && row.status === "active",
  );
  return basics[0] ?? null;
}

export function resolveScheduledProPlanMarket(input: {
  pricingMarket?: "india" | "international" | null;
}): "india" | "international" {
  return input.pricingMarket === "india" ? "india" : "international";
}

export function shouldRequestBasicCycleEndCancel(input: {
  proScheduleKind: string | null;
  proStudioPlan: string;
  proStatus: string;
  basicCancelAlreadyRequested: boolean;
}): boolean {
  if (input.basicCancelAlreadyRequested) return false;
  if (input.proScheduleKind !== SCHEDULE_KIND_SCHEDULED_PRO) return false;
  if (input.proStudioPlan !== "pro") return false;
  // After customer authorises future-start Pro (or it is already live).
  return (
    input.proStatus === "authenticated" ||
    input.proStatus === "active" ||
    input.proStatus === "pending" ||
    input.proStatus === "halted"
  );
}

/** Current entitlement prefers active Basic over a not-yet-started scheduled Pro. */
export function resolveCurrentMembershipEntitlement(input: {
  openRows: readonly {
    studioPlan: string;
    studioTier: string;
    status: string;
    scheduleKind: string | null;
    currentEnd: Date | null;
    razorpaySubscriptionId: string;
    razorpayStartAt: Date | null;
    cancelAtCycleEndRequested?: boolean;
  }[];
}): {
  studioPlan: StudioMembershipPlanId | null;
  studioTier: "pro" | "enterprise" | null;
  status: string | null;
  currentEnd: string | null;
  subscriptionId: string | null;
  cancelAtCycleEnd: boolean;
  cancelEffectiveAt: string | null;
  scheduledPro: {
    subscriptionId: string;
    status: string;
    startAt: string | null;
  } | null;
} {
  const open = input.openRows.filter((row) =>
    isOpenMembershipSubscriptionStatus(row.status),
  );

  const scheduledProRow =
    open.find(
      (row) =>
        row.scheduleKind === SCHEDULE_KIND_SCHEDULED_PRO &&
        row.studioPlan === "pro",
    ) ?? null;

  const scheduledPro = scheduledProRow
    ? {
        subscriptionId: scheduledProRow.razorpaySubscriptionId,
        status: scheduledProRow.status,
        startAt:
          scheduledProRow.razorpayStartAt?.toISOString() ??
          scheduledProRow.currentEnd?.toISOString() ??
          null,
      }
    : null;

  const withCancel = (
    row: (typeof open)[number],
  ): {
    studioPlan: StudioMembershipPlanId;
    studioTier: "pro" | "enterprise";
    status: string;
    currentEnd: string | null;
    subscriptionId: string;
    cancelAtCycleEnd: boolean;
    cancelEffectiveAt: string | null;
    scheduledPro: typeof scheduledPro;
  } => {
    const currentEnd = row.currentEnd?.toISOString() ?? null;
    const cancelAtCycleEnd = Boolean(row.cancelAtCycleEndRequested);
    return {
      studioPlan: row.studioPlan as StudioMembershipPlanId,
      studioTier:
        row.studioTier === "pro" || row.studioTier === "enterprise"
          ? row.studioTier
          : row.studioPlan === "pro"
            ? "enterprise"
            : "pro",
      status: row.status,
      currentEnd,
      subscriptionId: row.razorpaySubscriptionId,
      cancelAtCycleEnd,
      cancelEffectiveAt: cancelAtCycleEnd ? currentEnd : null,
      scheduledPro,
    };
  };

  const activeBasic = open.find(
    (row) => row.studioPlan === "basic" && row.status === "active",
  );
  if (activeBasic) {
    return withCancel(activeBasic);
  }

  const activePro = open.find(
    (row) =>
      row.studioPlan === "pro" &&
      row.status === "active" &&
      row.scheduleKind !== SCHEDULE_KIND_SCHEDULED_PRO,
  );
  const livePro =
    activePro ??
    open.find(
      (row) =>
        row.studioPlan === "pro" &&
        row.status === "active" &&
        row.scheduleKind === SCHEDULE_KIND_SCHEDULED_PRO,
    );

  if (livePro) {
    const base = withCancel(livePro);
    return {
      ...base,
      scheduledPro:
        livePro.scheduleKind === SCHEDULE_KIND_SCHEDULED_PRO
          ? null
          : scheduledPro,
    };
  }

  const any = open[0];
  if (!any) {
    return {
      studioPlan: null,
      studioTier: null,
      status: null,
      currentEnd: null,
      subscriptionId: null,
      cancelAtCycleEnd: false,
      cancelEffectiveAt: null,
      scheduledPro,
    };
  }

  return {
    ...withCancel(any),
    studioPlan:
      any.studioPlan === "basic" || any.studioPlan === "pro"
        ? any.studioPlan
        : null,
    studioTier:
      any.studioTier === "pro" || any.studioTier === "enterprise"
        ? any.studioTier
        : null,
  };
}
