import { and, eq, inArray } from "drizzle-orm";
import {
  MembershipCreditAllowances,
  StudioCreditReasonCode,
} from "@workspace/studio-credit-engine";
import {
  db,
  pool,
  studioRazorpaySubscriptionsTable,
  studioRazorpayWebhookEventsTable,
  usersTable,
} from "@workspace/db";
import { grantCreditAllocation } from "../services/studio-credit-service.js";
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpayInvoicesForSubscription,
  fetchRazorpayPayment,
  fetchRazorpaySubscription,
  getRazorpayKeyId,
  isOpenMembershipSubscriptionStatus,
  isRazorpayCancelAtCycleEndConfirmed,
  isStudioMembershipPlanId,
  OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
  RAZORPAY_EXPECTED_PLAN_AMOUNT_CENTS,
  RAZORPAY_EXPECTED_PLAN_AMOUNT_PAISE,
  RazorpayWebhookProcessingStatus,
  type RazorpayPaymentEntity,
  type RazorpaySubscriptionEntity,
  type StudioMembershipPlanId,
  studioTierForPlan,
  resolveRazorpayPlanId,
  studioPlanForRazorpayPlanId,
} from "./razorpay-client.js";
import {
  claimWebhookEventForProcessing,
  evaluateSubscriptionChargedGrant,
  pickLatestPaidSubscriptionInvoice,
  resolveLiveMembershipForCheckoutReuse,
  resolveOpenMembershipForCreate,
  resolveRazorpayWebhookEventId,
  resolveSubscriptionPlanSync,
  unixToDate,
} from "./razorpay-membership-logic.js";
import {
  SCHEDULE_KIND_SCHEDULED_PRO,
  findActiveBasicForScheduledUpgrade,
  findExistingScheduledPro,
  resolveCurrentMembershipEntitlement,
  resolveScheduledProPlanMarket,
  resolveScheduledProStartAtUnix,
  shouldRequestBasicCycleEndCancel,
} from "./razorpay-schedule-pro-logic.js";
import { logger } from "../lib/logger.js";
import type { PricingMarket } from "./pricing-market.js";
import { grantStudioAddOnFromCapturedPayment } from "./razorpay-add-ons.js";

export type CreateMembershipSubscriptionResult = {
  subscriptionId: string;
  keyId: string;
  plan: StudioMembershipPlanId;
  studioTier: "pro" | "enterprise";
  razorpayPlanId: string;
  status: string;
  shortUrl: string | null;
};

export type ScheduleMembershipUpgradeToProResult = {
  subscriptionId: string;
  keyId: string;
  plan: "pro";
  studioTier: "enterprise";
  razorpayPlanId: string;
  status: string;
  shortUrl: string | null;
  startAt: string;
  basicSubscriptionId: string;
  alreadyScheduled: boolean;
  market: PricingMarket;
};


/**
 * Serialize check → Razorpay create → local persist for one user.
 * Advisory lock is session-scoped on a dedicated pool connection while
 * business queries use the shared drizzle pool (lock still serializes waiters).
 */
export async function withMembershipSubscriptionUserLock<T>(
  userId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(872014, $1)", [userId]);
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(872014, $1)", [userId]);
    } finally {
      client.release();
    }
  }
}

/** Serialize webhook processing for one Razorpay event.id (retry + concurrency safe). */
export async function withRazorpayWebhookEventLock<T>(
  eventId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      `rzp_wh:${eventId}`,
    ]);
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        `rzp_wh:${eventId}`,
      ]);
    } finally {
      client.release();
    }
  }
}

/**
 * Serialize membership credit grants for one Razorpay payment.id.
 * Protects concurrent different event IDs that share the same payment identity.
 * Nested under the event lock (always acquire event lock first to avoid deadlocks).
 */
export async function withRazorpayPaymentGrantLock<T>(
  paymentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      `rzp_payment:${paymentId}`,
    ]);
    return await fn();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        `rzp_payment:${paymentId}`,
      ]);
    } finally {
      client.release();
    }
  }
}

export async function createMembershipSubscription(input: {
  userId: number;
  plan: unknown;
  pricingMarket?: PricingMarket;
}): Promise<CreateMembershipSubscriptionResult> {
  if (!isStudioMembershipPlanId(input.plan)) {
    throw new SubscriptionValidationError(
      'plan must be "basic" or "pro"',
    );
  }

  const plan = input.plan;
  const razorpayPlanId = resolveRazorpayPlanId(plan, input.pricingMarket);
  const studioTier = studioTierForPlan(plan);

  return withMembershipSubscriptionUserLock(input.userId, async () => {
    const openRows = await db
      .select()
      .from(studioRazorpaySubscriptionsTable)
      .where(
        and(
          eq(studioRazorpaySubscriptionsTable.userId, input.userId),
          inArray(studioRazorpaySubscriptionsTable.status, [
            ...OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
          ]),
        ),
      );

    const decision = resolveOpenMembershipForCreate({
      requestedPlan: plan,
      expectedRazorpayPlanId: razorpayPlanId,
      openSubscriptions: openRows.map((row) => ({
        razorpaySubscriptionId: row.razorpaySubscriptionId,
        studioPlan: row.studioPlan,
        studioTier: row.studioTier,
        status: row.status,
        razorpayPlanId: row.razorpayPlanId,
      })),
    });

    if (decision.action === "reuse") {
      const existing = decision.subscription;
      let live: RazorpaySubscriptionEntity;
      try {
        live = await fetchRazorpaySubscription(existing.razorpaySubscriptionId);
      } catch (error) {
        logger.warn(
          {
            err: error,
            subscriptionId: existing.razorpaySubscriptionId,
            userId: input.userId,
          },
          "Unable to verify live Razorpay subscription before Checkout reuse",
        );
        throw new SubscriptionValidationError(
          "Unable to verify your membership checkout. Please try again shortly.",
        );
      }

      const liveDecision = resolveLiveMembershipForCheckoutReuse({
        liveStatus: live.status,
        paidCount: live.paid_count,
      });

      if (liveDecision.action === "reconcile_paid") {
        await reconcilePaidMembershipSubscription({
          razorpaySubscriptionId: existing.razorpaySubscriptionId,
          live,
        });
        return {
          subscriptionId: existing.razorpaySubscriptionId,
          keyId: getRazorpayKeyId(),
          plan,
          studioTier: existing.studioTier as "pro" | "enterprise",
          razorpayPlanId: existing.razorpayPlanId,
          status: live.status || "active",
          shortUrl: null,
        };
      }

      if (liveDecision.action === "unavailable") {
        throw new SubscriptionConflictError(liveDecision.message);
      }

      return {
        subscriptionId: existing.razorpaySubscriptionId,
        keyId: getRazorpayKeyId(),
        plan,
        studioTier: existing.studioTier as "pro" | "enterprise",
        razorpayPlanId: existing.razorpayPlanId,
        status: live.status || existing.status,
        shortUrl: live.short_url ?? null,
      };
    }

    if (decision.action === "conflict") {
      throw new SubscriptionConflictError(decision.message);
    }

    // Stale incomplete checkouts on a different market plan must not remain open
    // beside the new market-correct subscription.
    for (const stale of decision.supersedeCreated) {
      await db
        .update(studioRazorpaySubscriptionsTable)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
              stale.razorpaySubscriptionId,
            ),
            eq(studioRazorpaySubscriptionsTable.status, "created"),
          ),
        );

      try {
        await cancelRazorpaySubscription({
          subscriptionId: stale.razorpaySubscriptionId,
          cancelAtCycleEnd: false,
        });
      } catch (cancelError) {
        logger.warn(
          {
            err: cancelError,
            subscriptionId: stale.razorpaySubscriptionId,
            userId: input.userId,
          },
          "Failed to cancel stale market-mismatched Razorpay subscription — local row already closed",
        );
      }
    }

    const created = await createRazorpaySubscription({
      planId: razorpayPlanId,
      notes: {
        studiolayer_user_id: String(input.userId),
        studiolayer_plan: plan,
        studiolayer_tier: studioTier,
      },
    });

    try {
      await db.insert(studioRazorpaySubscriptionsTable).values({
        userId: input.userId,
        razorpaySubscriptionId: created.id,
        razorpayPlanId: created.plan_id,
        studioPlan: plan,
        studioTier,
        status: created.status || "created",
        currentStart: unixToDate(created.current_start),
        currentEnd: unixToDate(created.current_end),
        razorpayCustomerId: created.customer_id ?? null,
      });
    } catch (error) {
      // Unique on razorpay_subscription_id: another writer persisted the same id.
      const [race] = await db
        .select()
        .from(studioRazorpaySubscriptionsTable)
        .where(
          eq(
            studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
            created.id,
          ),
        )
        .limit(1);
      if (race) {
        return {
          subscriptionId: race.razorpaySubscriptionId,
          keyId: getRazorpayKeyId(),
          plan,
          studioTier: race.studioTier as "pro" | "enterprise",
          razorpayPlanId: race.razorpayPlanId,
          status: race.status,
          shortUrl: created.short_url ?? null,
        };
      }

      // Compensating cancel: Razorpay create succeeded but local row did not.
      // Never report the original request as successfully created.
      let cancelSucceeded = false;
      let cancelErrorMessage: string | null = null;
      try {
        await cancelRazorpaySubscription({
          subscriptionId: created.id,
          cancelAtCycleEnd: false,
        });
        cancelSucceeded = true;
      } catch (cancelError) {
        cancelErrorMessage =
          cancelError instanceof Error
            ? cancelError.message
            : String(cancelError);
        logger.error(
          {
            err: cancelError,
            userId: input.userId,
            razorpaySubscriptionId: created.id,
            plan,
          },
          "Failed to cancel orphaned Razorpay subscription after local persistence failure — manual recovery required",
        );
      }

      logger.error(
        {
          err: error,
          userId: input.userId,
          razorpaySubscriptionId: created.id,
          plan,
          cancelSucceeded,
          cancelErrorMessage,
        },
        "Razorpay subscription created but local persistence failed",
      );
      throw new SubscriptionPersistenceError(
        cancelSucceeded
          ? `Subscription ${created.id} created at Razorpay but could not be saved locally; remote subscription was cancelled`
          : `Subscription ${created.id} created at Razorpay but could not be saved locally; remote cancel also failed — manual recovery required`,
      );
    }

    return {
      subscriptionId: created.id,
      keyId: getRazorpayKeyId(),
      plan,
      studioTier,
      razorpayPlanId: created.plan_id,
      status: created.status || "created",
      shortUrl: created.short_url ?? null,
    };
  });
}

/**
 * Schedule Studio Pro for the next Basic billing instant via a new future-start
 * Pro subscription (start_at = Basic.current_end). Does not charge today and
 * does not change Basic plan mid-cycle.
 */
export async function scheduleMembershipUpgradeToPro(input: {
  userId: number;
  pricingMarket?: PricingMarket;
}): Promise<ScheduleMembershipUpgradeToProResult> {
  const market = resolveScheduledProPlanMarket({
    pricingMarket: input.pricingMarket,
  });
  const proPlanId = resolveRazorpayPlanId("pro", market);
  const studioTier = "enterprise" as const;

  return withMembershipSubscriptionUserLock(input.userId, async () => {
    const openRows = await db
      .select()
      .from(studioRazorpaySubscriptionsTable)
      .where(
        and(
          eq(studioRazorpaySubscriptionsTable.userId, input.userId),
          inArray(studioRazorpaySubscriptionsTable.status, [
            ...OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
          ]),
        ),
      );

    const existingPro = findExistingScheduledPro(
      openRows.map((row) => ({
        razorpaySubscriptionId: row.razorpaySubscriptionId,
        studioPlan: row.studioPlan,
        status: row.status,
        scheduleKind: row.scheduleKind,
        linkedSubscriptionId: row.linkedSubscriptionId,
        razorpayStartAt: row.razorpayStartAt,
      })),
    );

    const basic = findActiveBasicForScheduledUpgrade(
      openRows.map((row) => ({
        razorpaySubscriptionId: row.razorpaySubscriptionId,
        studioPlan: row.studioPlan,
        status: row.status,
        currentEnd: row.currentEnd,
        cancelAtCycleEndRequested: row.cancelAtCycleEndRequested,
        linkedSubscriptionId: row.linkedSubscriptionId,
      })),
    );

    if (!basic) {
      throw new SubscriptionValidationError(
        "An active Studio Basic membership is required to schedule Studio Pro.",
      );
    }

    if (existingPro) {
      const startAt =
        existingPro.razorpayStartAt?.toISOString() ??
        basic.currentEnd?.toISOString();
      if (!startAt) {
        throw new SubscriptionValidationError(
          "Your Studio Basic billing period end could not be confirmed. Please try again shortly.",
        );
      }
      await ensureBasicCycleEndCancelForScheduledPro({
        userId: input.userId,
        proSubscriptionId: existingPro.razorpaySubscriptionId,
        proStatus: existingPro.status,
        proScheduleKind: existingPro.scheduleKind,
        linkedBasicSubscriptionId:
          existingPro.linkedSubscriptionId ?? basic.razorpaySubscriptionId,
      });
      return {
        subscriptionId: existingPro.razorpaySubscriptionId,
        keyId: getRazorpayKeyId(),
        plan: "pro",
        studioTier,
        razorpayPlanId: proPlanId,
        status: existingPro.status,
        shortUrl: null,
        startAt,
        basicSubscriptionId: basic.razorpaySubscriptionId,
        alreadyScheduled: true,
        market,
      };
    }

    let liveCurrentEndUnix: number | null = null;
    try {
      const live = await fetchRazorpaySubscription(basic.razorpaySubscriptionId);
      liveCurrentEndUnix =
        typeof live.current_end === "number" ? live.current_end : null;
    } catch (error) {
      logger.warn(
        {
          err: error,
          subscriptionId: basic.razorpaySubscriptionId,
          userId: input.userId,
        },
        "Unable to fetch live Basic subscription for scheduled Pro start_at — using local currentEnd if present",
      );
    }

    const startAtDecision = resolveScheduledProStartAtUnix({
      liveCurrentEndUnix,
      localCurrentEnd: basic.currentEnd,
    });
    if (!startAtDecision.ok) {
      throw new SubscriptionValidationError(startAtDecision.message);
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    if (startAtDecision.startAtUnix <= nowUnix) {
      throw new SubscriptionValidationError(
        "Your Studio Basic period ends too soon to schedule Studio Pro. Please try again after your next renewal.",
      );
    }

    const created = await createRazorpaySubscription({
      planId: proPlanId,
      startAt: startAtDecision.startAtUnix,
      notes: {
        studiolayer_user_id: String(input.userId),
        studiolayer_plan: "pro",
        studiolayer_tier: studioTier,
        studiolayer_schedule: SCHEDULE_KIND_SCHEDULED_PRO,
        studiolayer_basic_subscription_id: basic.razorpaySubscriptionId,
      },
    });

    const startAtDate =
      unixToDate(created.start_at) ??
      unixToDate(startAtDecision.startAtUnix) ??
      new Date(startAtDecision.startAtUnix * 1000);

    try {
      await db.insert(studioRazorpaySubscriptionsTable).values({
        userId: input.userId,
        razorpaySubscriptionId: created.id,
        razorpayPlanId: created.plan_id,
        studioPlan: "pro",
        studioTier,
        status: created.status || "created",
        currentStart: unixToDate(created.current_start),
        currentEnd: unixToDate(created.current_end),
        razorpayCustomerId: created.customer_id ?? null,
        scheduleKind: SCHEDULE_KIND_SCHEDULED_PRO,
        linkedSubscriptionId: basic.razorpaySubscriptionId,
        razorpayStartAt: startAtDate,
      });
    } catch (error) {
      try {
        await cancelRazorpaySubscription({
          subscriptionId: created.id,
          cancelAtCycleEnd: false,
        });
      } catch (cancelError) {
        logger.error(
          {
            err: cancelError,
            subscriptionId: created.id,
            userId: input.userId,
          },
          "Failed to cancel orphaned scheduled Pro after local persistence failure",
        );
      }
      throw new SubscriptionPersistenceError(
        `Scheduled Pro subscription ${created.id} could not be saved locally`,
        { cause: error },
      );
    }

    return {
      subscriptionId: created.id,
      keyId: getRazorpayKeyId(),
      plan: "pro",
      studioTier,
      razorpayPlanId: created.plan_id,
      status: created.status || "created",
      shortUrl: created.short_url ?? null,
      startAt: startAtDate.toISOString(),
      basicSubscriptionId: basic.razorpaySubscriptionId,
      alreadyScheduled: false,
      market,
    };
  });
}

/**
 * Immediately cancel every open Razorpay membership for account deletion.
 * Fail closed — callers must not delete the account if this throws.
 */
export async function cancelAllOpenRazorpayMembershipsForUser(input: {
  userId: number;
}): Promise<void> {
  const openRows = await db
    .select()
    .from(studioRazorpaySubscriptionsTable)
    .where(
      and(
        eq(studioRazorpaySubscriptionsTable.userId, input.userId),
        inArray(studioRazorpaySubscriptionsTable.status, [
          ...OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
        ]),
      ),
    );

  const failures: { subscriptionId: string; message: string }[] = [];

  for (const row of openRows) {
    try {
      await cancelRazorpaySubscription({
        subscriptionId: row.razorpaySubscriptionId,
        cancelAtCycleEnd: false,
      });
      await db
        .update(studioRazorpaySubscriptionsTable)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(studioRazorpaySubscriptionsTable.id, row.id));
    } catch (error) {
      failures.push({
        subscriptionId: row.razorpaySubscriptionId,
        message: error instanceof Error ? error.message : String(error),
      });
      logger.error(
        {
          err: error,
          userId: input.userId,
          subscriptionId: row.razorpaySubscriptionId,
        },
        "Failed to cancel Razorpay membership during account deletion",
      );
    }
  }

  if (failures.length > 0) {
    throw new SubscriptionPersistenceError(
      `Unable to cancel ${failures.length} Razorpay membership subscription(s) before account deletion`,
    );
  }
}

async function ensureBasicCycleEndCancelForScheduledPro(input: {
  userId: number;
  proSubscriptionId: string;
  proStatus: string;
  proScheduleKind: string | null;
  linkedBasicSubscriptionId: string | null;
}): Promise<void> {
  if (
    !shouldRequestBasicCycleEndCancel({
      proScheduleKind: input.proScheduleKind,
      proStudioPlan: "pro",
      proStatus: input.proStatus,
      basicCancelAlreadyRequested: false,
    })
  ) {
    return;
  }

  const basicId = input.linkedBasicSubscriptionId;
  if (!basicId) return;

  const [basic] = await db
    .select()
    .from(studioRazorpaySubscriptionsTable)
    .where(
      and(
        eq(studioRazorpaySubscriptionsTable.userId, input.userId),
        eq(studioRazorpaySubscriptionsTable.razorpaySubscriptionId, basicId),
      ),
    )
    .limit(1);

  if (!basic) return;
  if (basic.cancelAtCycleEndRequested) return;
  if (basic.status === "cancelled" || basic.status === "completed") return;

  try {
    const cancelled = await cancelRazorpaySubscription({
      subscriptionId: basic.razorpaySubscriptionId,
      cancelAtCycleEnd: true,
    });

    let confirmed = isRazorpayCancelAtCycleEndConfirmed(cancelled);
    if (!confirmed) {
      const live = await fetchRazorpaySubscription(
        basic.razorpaySubscriptionId,
      );
      confirmed = isRazorpayCancelAtCycleEndConfirmed(live);
    }

    if (!confirmed) {
      throw new Error(
        `Razorpay did not confirm cancel_at_cycle_end for ${basic.razorpaySubscriptionId}`,
      );
    }
  } catch (error) {
    // Fail closed: cancel the future Pro so both do not bill.
    try {
      await cancelRazorpaySubscription({
        subscriptionId: input.proSubscriptionId,
        cancelAtCycleEnd: false,
      });
      await db
        .update(studioRazorpaySubscriptionsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          eq(
            studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
            input.proSubscriptionId,
          ),
        );
    } catch (proCancelError) {
      logger.error(
        {
          err: proCancelError,
          proSubscriptionId: input.proSubscriptionId,
          basicSubscriptionId: basicId,
        },
        "Failed to roll back scheduled Pro after Basic cycle-end cancel failure",
      );
    }
    throw error;
  }

  await db
    .update(studioRazorpaySubscriptionsTable)
    .set({
      cancelAtCycleEndRequested: true,
      linkedSubscriptionId: input.proSubscriptionId,
      updatedAt: new Date(),
    })
    .where(eq(studioRazorpaySubscriptionsTable.id, basic.id));
}

export async function getMembershipSubscriptionStatus(input: {
  userId: number;
}): Promise<{
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
}> {
  const openRows = await db
    .select()
    .from(studioRazorpaySubscriptionsTable)
    .where(
      and(
        eq(studioRazorpaySubscriptionsTable.userId, input.userId),
        inArray(studioRazorpaySubscriptionsTable.status, [
          ...OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
        ]),
      ),
    );

  return resolveCurrentMembershipEntitlement({
    openRows: openRows.map((row) => ({
      studioPlan: row.studioPlan,
      studioTier: row.studioTier,
      status: row.status,
      scheduleKind: row.scheduleKind,
      currentEnd: row.currentEnd,
      razorpaySubscriptionId: row.razorpaySubscriptionId,
      razorpayStartAt: row.razorpayStartAt,
      cancelAtCycleEndRequested: row.cancelAtCycleEndRequested,
    })),
  });
}

/**
 * Customer self-serve: keep membership active until current_end, then stop renewal.
 * Does not delete the account or Creative Ledger history.
 */
export async function cancelMembershipAtCycleEnd(input: {
  userId: number;
}): Promise<{
  subscriptionId: string;
  studioPlan: StudioMembershipPlanId;
  status: string;
  cancelAtCycleEnd: true;
  cancelEffectiveAt: string;
}> {
  return withMembershipSubscriptionUserLock(input.userId, async () => {
    const openRows = await db
      .select()
      .from(studioRazorpaySubscriptionsTable)
      .where(
        and(
          eq(studioRazorpaySubscriptionsTable.userId, input.userId),
          inArray(studioRazorpaySubscriptionsTable.status, [
            ...OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
          ]),
        ),
      );

    const entitlement = resolveCurrentMembershipEntitlement({
      openRows: openRows.map((row) => ({
        studioPlan: row.studioPlan,
        studioTier: row.studioTier,
        status: row.status,
        scheduleKind: row.scheduleKind,
        currentEnd: row.currentEnd,
        razorpaySubscriptionId: row.razorpaySubscriptionId,
        razorpayStartAt: row.razorpayStartAt,
        cancelAtCycleEndRequested: row.cancelAtCycleEndRequested,
      })),
    });

    if (
      !entitlement.subscriptionId ||
      (entitlement.studioPlan !== "basic" && entitlement.studioPlan !== "pro") ||
      entitlement.status !== "active"
    ) {
      throw new SubscriptionValidationError(
        "An active paid membership is required to cancel renewal.",
      );
    }

    if (entitlement.cancelAtCycleEnd) {
      throw new SubscriptionConflictError(
        "This membership is already set to end at the close of the current billing period.",
      );
    }

    const [row] = openRows.filter(
      (r) => r.razorpaySubscriptionId === entitlement.subscriptionId,
    );
    if (!row) {
      throw new SubscriptionValidationError(
        "An active paid membership is required to cancel renewal.",
      );
    }

    // Scheduled Pro must not bill after the customer cancels Basic renewal.
    const scheduledPro = openRows.find(
      (r) =>
        r.scheduleKind === SCHEDULE_KIND_SCHEDULED_PRO &&
        r.studioPlan === "pro" &&
        isOpenMembershipSubscriptionStatus(r.status),
    );

    try {
      const cancelled = await cancelRazorpaySubscription({
        subscriptionId: row.razorpaySubscriptionId,
        cancelAtCycleEnd: true,
      });

      let confirmed = isRazorpayCancelAtCycleEndConfirmed(cancelled);
      if (!confirmed) {
        const live = await fetchRazorpaySubscription(row.razorpaySubscriptionId);
        confirmed = isRazorpayCancelAtCycleEndConfirmed(live);
      }
      if (!confirmed) {
        throw new Error(
          `Razorpay did not confirm cancel_at_cycle_end for ${row.razorpaySubscriptionId}`,
        );
      }
    } catch (error) {
      logger.error(
        {
          err: error,
          userId: input.userId,
          subscriptionId: row.razorpaySubscriptionId,
        },
        "Customer membership cycle-end cancel failed or was not confirmed by Razorpay",
      );
      throw new SubscriptionPersistenceError(
        "Unable to cancel membership renewal right now. Your membership is unchanged.",
        { cause: error },
      );
    }

    const cancelEffectiveAt =
      entitlement.currentEnd ??
      row.currentEnd?.toISOString() ??
      null;
    if (!cancelEffectiveAt) {
      throw new SubscriptionValidationError(
        "Your billing period end could not be confirmed. Please try again shortly.",
      );
    }

    await db
      .update(studioRazorpaySubscriptionsTable)
      .set({
        cancelAtCycleEndRequested: true,
        updatedAt: new Date(),
      })
      .where(eq(studioRazorpaySubscriptionsTable.id, row.id));

    if (scheduledPro) {
      try {
        await cancelRazorpaySubscription({
          subscriptionId: scheduledPro.razorpaySubscriptionId,
          cancelAtCycleEnd: false,
        });
        await db
          .update(studioRazorpaySubscriptionsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(studioRazorpaySubscriptionsTable.id, scheduledPro.id));
      } catch (error) {
        logger.error(
          {
            err: error,
            userId: input.userId,
            proSubscriptionId: scheduledPro.razorpaySubscriptionId,
          },
          "Failed to cancel scheduled Pro after customer cancelled Basic renewal — manual recovery may be required",
        );
      }
    }

    return {
      subscriptionId: row.razorpaySubscriptionId,
      studioPlan: entitlement.studioPlan,
      status: row.status,
      cancelAtCycleEnd: true as const,
      cancelEffectiveAt,
    };
  });
}

export class SubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionValidationError";
  }
}

export class SubscriptionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionConflictError";
  }
}

export class SubscriptionPersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SubscriptionPersistenceError";
  }
}

type RazorpayWebhookPayload = {
  event?: string;
  id?: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscriptionEntity };
    payment?: { entity?: RazorpayPaymentEntity };
    invoice?: { entity?: { id?: string } };
  };
};

/**
 * Process a verified Razorpay webhook payload.
 * Credits are granted on:
 * - subscription.charged (membership) with a captured payment
 * - payment.captured (Pass / Top-Up one-time orders)
 *
 * Retry model (UNIQUE event_id preserved):
 * - processed → idempotent duplicate (no re-grant)
 * - failed / received / processing → reprocess under event advisory lock
 * - concurrent identical deliveries → one grant (lock + allocation source_reference)
 */
export async function processRazorpayWebhookPayload(
  payload: RazorpayWebhookPayload,
  options?: { eventIdHeader?: string | null },
): Promise<{ handled: boolean; grantedCredits: number; duplicate: boolean }> {
  const eventType = payload.event ?? "";
  const eventId = resolveRazorpayWebhookEventId({
    headerEventId: options?.eventIdHeader,
    bodyId: payload.id,
  });

  if (!eventId) {
    throw new Error("Razorpay webhook payload missing event id");
  }

  return withRazorpayWebhookEventLock(eventId, async () => {
    const [existing] = await db
      .select()
      .from(studioRazorpayWebhookEventsTable)
      .where(eq(studioRazorpayWebhookEventsTable.eventId, eventId))
      .limit(1);

    const claim = claimWebhookEventForProcessing({
      existingStatus: existing?.processingStatus,
    });

    if (claim.outcome === "already_processed") {
      return { handled: true, grantedCredits: 0, duplicate: true };
    }

    if (!existing) {
      await db.insert(studioRazorpayWebhookEventsTable).values({
        eventId,
        eventType,
        razorpaySubscriptionId:
          payload.payload?.subscription?.entity?.id ?? null,
        razorpayPaymentId: payload.payload?.payment?.entity?.id ?? null,
        processingStatus: RazorpayWebhookProcessingStatus.PROCESSING,
      });
    } else {
      await db
        .update(studioRazorpayWebhookEventsTable)
        .set({
          processingStatus: RazorpayWebhookProcessingStatus.PROCESSING,
          errorMessage: null,
          eventType,
          razorpaySubscriptionId:
            payload.payload?.subscription?.entity?.id ??
            existing.razorpaySubscriptionId,
          razorpayPaymentId:
            payload.payload?.payment?.entity?.id ?? existing.razorpayPaymentId,
        })
        .where(eq(studioRazorpayWebhookEventsTable.eventId, eventId));
    }

    try {
      const result = await handleRazorpayEvent(eventType, payload);
      await db
        .update(studioRazorpayWebhookEventsTable)
        .set({
          processingStatus: RazorpayWebhookProcessingStatus.PROCESSED,
          errorMessage: null,
        })
        .where(eq(studioRazorpayWebhookEventsTable.eventId, eventId));
      return { ...result, duplicate: false };
    } catch (error) {
      await db
        .update(studioRazorpayWebhookEventsTable)
        .set({
          processingStatus: RazorpayWebhookProcessingStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(studioRazorpayWebhookEventsTable.eventId, eventId));
      throw error;
    }
  });
}

async function handleRazorpayEvent(
  eventType: string,
  payload: RazorpayWebhookPayload,
): Promise<{ handled: boolean; grantedCredits: number }> {
  if (eventType === "payment.captured") {
    const payment = payload.payload?.payment?.entity;
    if (!payment) {
      return { handled: false, grantedCredits: 0 };
    }
    return grantStudioAddOnFromCapturedPayment({ payment });
  }

  const subscription = payload.payload?.subscription?.entity;
  if (!subscription?.id) {
    return { handled: false, grantedCredits: 0 };
  }

  const [row] = await db
    .select()
    .from(studioRazorpaySubscriptionsTable)
    .where(
      eq(
        studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
        subscription.id,
      ),
    )
    .limit(1);

  if (!row) {
    logger.warn(
      { subscriptionId: subscription.id, eventType },
      "Razorpay webhook for unknown subscription — ignored",
    );
    return { handled: false, grantedCredits: 0 };
  }

  const payment = payload.payload?.payment?.entity;
  const invoiceId =
    payload.payload?.invoice?.entity?.id ?? payment?.invoice_id ?? null;

  return syncMembershipSubscriptionRowAndMaybeGrant({
    row,
    subscription,
    payment,
    invoiceId,
    eventType,
  });
}

/**
 * Missed/delayed webhook recovery: sync local membership from live Razorpay
 * and grant via the same subscription.charged path (payment source_reference
 * idempotency). Safe when the real webhook arrives later.
 */
export async function reconcilePaidMembershipSubscription(input: {
  razorpaySubscriptionId: string;
  live?: RazorpaySubscriptionEntity;
}): Promise<{ grantedCredits: number; status: string }> {
  const live =
    input.live ??
    (await fetchRazorpaySubscription(input.razorpaySubscriptionId));

  const [row] = await db
    .select()
    .from(studioRazorpaySubscriptionsTable)
    .where(
      eq(
        studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
        input.razorpaySubscriptionId,
      ),
    )
    .limit(1);

  if (!row) {
    throw new SubscriptionValidationError(
      "Membership subscription was not found for reconciliation.",
    );
  }

  let payment: RazorpayPaymentEntity | null = null;
  let invoiceId: string | null = null;

  try {
    const invoices = await fetchRazorpayInvoicesForSubscription(
      input.razorpaySubscriptionId,
    );
    const paidInvoice = pickLatestPaidSubscriptionInvoice(invoices);
    invoiceId = paidInvoice?.id ?? null;
    if (paidInvoice?.payment_id) {
      payment = await fetchRazorpayPayment(paidInvoice.payment_id);
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        subscriptionId: input.razorpaySubscriptionId,
        userId: row.userId,
      },
      "Unable to fetch Razorpay invoice/payment during membership reconciliation",
    );
  }

  const result = await syncMembershipSubscriptionRowAndMaybeGrant({
    row,
    subscription: live,
    payment,
    invoiceId,
    eventType: "subscription.charged",
  });

  return {
    grantedCredits: result.grantedCredits,
    status: live.status || row.status,
  };
}

type LocalMembershipSubscriptionRow =
  typeof studioRazorpaySubscriptionsTable.$inferSelect;

async function syncMembershipSubscriptionRowAndMaybeGrant(input: {
  row: LocalMembershipSubscriptionRow;
  subscription: RazorpaySubscriptionEntity;
  payment: RazorpayPaymentEntity | null | undefined;
  invoiceId: string | null;
  eventType: string;
}): Promise<{ handled: boolean; grantedCredits: number }> {
  const { row, subscription, payment, invoiceId, eventType } = input;

  const planSync = resolveSubscriptionPlanSync({
    studioPlan: row.studioPlan,
    studioTier: row.studioTier,
    razorpayPlanId: row.razorpayPlanId,
    pendingUpgradePlan: row.pendingUpgradePlan,
    pendingRazorpayPlanId: row.pendingRazorpayPlanId,
    razorpayEntityPlanId: subscription.plan_id,
    mappedStudioPlan: studioPlanForRazorpayPlanId(subscription.plan_id),
  });

  const effectiveStudioPlan = planSync?.studioPlan ?? row.studioPlan;
  const effectiveStudioTier = planSync?.studioTier ?? row.studioTier;
  const effectiveRazorpayPlanId =
    planSync?.razorpayPlanId ?? row.razorpayPlanId;

  await db
    .update(studioRazorpaySubscriptionsTable)
    .set({
      status: subscription.status || row.status,
      currentStart: unixToDate(subscription.current_start) ?? row.currentStart,
      currentEnd: unixToDate(subscription.current_end) ?? row.currentEnd,
      razorpayCustomerId:
        subscription.customer_id ?? row.razorpayCustomerId,
      latestPaymentId: payment?.id ?? row.latestPaymentId,
      latestInvoiceId: invoiceId ?? row.latestInvoiceId,
      razorpayPlanId: effectiveRazorpayPlanId,
      studioPlan: effectiveStudioPlan,
      studioTier: effectiveStudioTier,
      ...(planSync?.clearPending
        ? {
            pendingUpgradePlan: null,
            pendingRazorpayPlanId: null,
            pendingUpgradeScheduledAt: null,
            pendingUpgradePaymentId: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(studioRazorpaySubscriptionsTable.id, row.id));

  const nextStatus = subscription.status || row.status;
  if (row.scheduleKind === SCHEDULE_KIND_SCHEDULED_PRO) {
    await ensureBasicCycleEndCancelForScheduledPro({
      userId: row.userId,
      proSubscriptionId: row.razorpaySubscriptionId,
      proStatus: nextStatus,
      proScheduleKind: row.scheduleKind,
      linkedBasicSubscriptionId: row.linkedSubscriptionId,
    });
  }

  // Lifecycle updates without credit grants.
  if (
    eventType === "subscription.authenticated" ||
    eventType === "subscription.activated" ||
    eventType === "subscription.pending" ||
    eventType === "subscription.halted" ||
    eventType === "subscription.cancelled" ||
    eventType === "subscription.completed" ||
    eventType === "subscription.paused" ||
    eventType === "subscription.resumed" ||
    eventType === "subscription.updated"
  ) {
    return { handled: true, grantedCredits: 0 };
  }

  if (eventType !== "subscription.charged") {
    return { handled: false, grantedCredits: 0 };
  }

  if (row.scheduleKind === SCHEDULE_KIND_SCHEDULED_PRO) {
    await ensureBasicCycleEndCancelForScheduledPro({
      userId: row.userId,
      proSubscriptionId: row.razorpaySubscriptionId,
      proStatus: nextStatus,
      proScheduleKind: row.scheduleKind,
      linkedBasicSubscriptionId: row.linkedSubscriptionId,
    });
  }

  if (effectiveStudioPlan !== "basic" && effectiveStudioPlan !== "pro") {
    logger.warn(
      { subscriptionId: subscription.id, studioPlan: effectiveStudioPlan },
      "subscription.charged with unknown studio_plan — no credits",
    );
    return { handled: true, grantedCredits: 0 };
  }

  const decision = evaluateSubscriptionChargedGrant({
    studioPlan: effectiveStudioPlan,
    studioTier: effectiveStudioTier,
    subscription,
    payment,
    invoiceId,
  });

  if (!decision.grant) {
    if (decision.reason === "missing_period_bounds") {
      throw new Error(
        `subscription.charged missing current_start/current_end for ${subscription.id}`,
      );
    }
    if (decision.reason === "amount_mismatch") {
      const currency = payment?.currency?.toUpperCase() ?? null;
      const expectedAmount =
        currency === "INR"
          ? RAZORPAY_EXPECTED_PLAN_AMOUNT_PAISE[
              effectiveStudioPlan as "basic" | "pro"
            ]
          : currency === "USD"
            ? RAZORPAY_EXPECTED_PLAN_AMOUNT_CENTS[
                effectiveStudioPlan as "basic" | "pro"
              ]
            : null;
      logger.warn(
        {
          subscriptionId: subscription.id,
          studioPlan: effectiveStudioPlan,
          paymentId: payment?.id ?? null,
          paymentAmount: payment?.amount ?? null,
          paymentCurrency: currency,
          expectedAmount,
          expectedCurrency: currency === "INR" || currency === "USD" ? currency : null,
        },
        "subscription.charged amount/currency mismatch — membership credits not granted",
      );
      return { handled: true, grantedCredits: 0 };
    }
    logger.info(
      {
        subscriptionId: subscription.id,
        reason: decision.reason,
        paymentId: payment?.id ?? null,
        paymentStatus: payment?.status ?? null,
      },
      "subscription.charged not eligible for credits",
    );
    return { handled: true, grantedCredits: 0 };
  }

  // Payment-level lock: different event IDs for the same payment serialize here.
  // grantCreditAllocation UNIQUE(source_reference) remains the final financial guard.
  const runGrant = async () => {
    // Grant before updating user tier so a failed grant does not look "paid".
    const grant = await grantCreditAllocation({
      userId: row.userId,
      reasonCode: StudioCreditReasonCode.MEMBERSHIP_ALLOCATION,
      credits: decision.credits,
      sourceReference: decision.sourceReference,
      startsAt: decision.startsAt,
      expiresAt: decision.expiresAt,
      periodKey: decision.periodKey,
      tier: decision.studioTier,
    });

    await db
      .update(usersTable)
      .set({ subscriptionTier: decision.studioTier })
      .where(eq(usersTable.id, row.userId));

    const grantedCredits = grant.created ? decision.credits : 0;

    logger.info(
      {
        userId: row.userId,
        subscriptionId: subscription.id,
        sourceReference: decision.sourceReference,
        grantedCredits,
        created: grant.created,
        periodKey: decision.periodKey,
        allowance:
          decision.studioTier === "enterprise"
            ? MembershipCreditAllowances.pro
            : MembershipCreditAllowances.basic,
      },
      "Razorpay membership allocation processed",
    );

    return { handled: true, grantedCredits };
  };

  if (payment?.id) {
    return withRazorpayPaymentGrantLock(payment.id, runGrant);
  }
  return runGrant();
}

export function listOpenMembershipStatuses(): readonly string[] {
  return OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES;
}

export { isOpenMembershipSubscriptionStatus };
