import { and, eq, inArray } from "drizzle-orm";
import {
  MembershipCreditAllowances,
  MembershipUpgradeCreditGrant,
  StudioCreditReasonCode,
} from "@workspace/studio-credit-engine";
import {
  db,
  pool,
  studioCreditAllocationsTable,
  studioRazorpaySubscriptionsTable,
  studioRazorpayWebhookEventsTable,
  usersTable,
} from "@workspace/db";
import { grantCreditAllocation } from "../services/studio-credit-service.js";
import {
  cancelRazorpaySubscription,
  createRazorpayOrder,
  createRazorpaySubscription,
  fetchRazorpayOrder,
  getRazorpayKeyId,
  isCapturedRazorpayPayment,
  isOpenMembershipSubscriptionStatus,
  isStudioMembershipPlanId,
  OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
  RazorpayWebhookProcessingStatus,
  type RazorpayPaymentEntity,
  type RazorpaySubscriptionEntity,
  type StudioMembershipPlanId,
  studioTierForPlan,
  resolveRazorpayPlanId,
  resolveProPlanIdForUpgrade,
  studioPlanForRazorpayPlanId,
  updateRazorpaySubscriptionPlan,
} from "./razorpay-client.js";
import {
  claimWebhookEventForProcessing,
  evaluateSubscriptionChargedGrant,
  resolveBasicToProUpgrade,
  resolveOpenMembershipForCreate,
  resolveRazorpayWebhookEventId,
  resolveSubscriptionPlanSync,
  unixToDate,
} from "./razorpay-membership-logic.js";
import {
  STUDIO_UPGRADE_NOTE_MARKET,
  STUDIO_UPGRADE_NOTE_PRODUCT,
  STUDIO_UPGRADE_NOTE_SUBSCRIPTION_ID,
  STUDIO_UPGRADE_NOTE_USER_ID,
  STUDIO_UPGRADE_PRODUCT,
  assertUpgradePaymentMatchesOrder,
  buildMembershipUpgradePeriodKey,
  isCapturedUpgradePaymentMarker,
  isStudioUpgradeProduct,
  parseUpgradeCheckoutOrderId,
  parseUpgradeMarketFromNotes,
  parseUpgradeSubscriptionIdFromNotes,
  parseUpgradeUserIdFromNotes,
  readStudioUpgradeImmediateEntitlementFlag,
  resolveUpgradeCreditPeriodBounds,
  resolveUpgradeCheckoutOrderReuse,
  resolveUpgradeOrderAmount,
  upgradeCheckoutOrderMarker,
  upgradePaymentSourceReference,
} from "./razorpay-upgrade-logic.js";
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

export type UpgradeMembershipToProResult = {
  subscriptionId: string;
  currentPlan: "basic";
  scheduledPlan: "pro";
  status: string;
  alreadyScheduled: boolean;
  currentEnd: string | null;
  /** Present when checkout is required (not already scheduled). */
  orderId: string | null;
  keyId: string | null;
  amount: number | null;
  currency: "INR" | "USD" | null;
  market: PricingMarket | null;
  pendingRazorpayPlanId: string | null;
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
      return {
        subscriptionId: existing.razorpaySubscriptionId,
        keyId: getRazorpayKeyId(),
        plan,
        studioTier: existing.studioTier as "pro" | "enterprise",
        razorpayPlanId: existing.razorpayPlanId,
        status: existing.status,
        shortUrl: null,
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
 * Create a one-time Razorpay Order for the fixed Basic → Pro upgrade difference.
 * Does NOT change the subscription plan yet — that happens on payment.captured
 * via schedule_change_at=cycle_end (no immediate Razorpay proration).
 * Credits / StudioLayer Pro entitlement apply only after captured fulfillment
 * when STUDIO_UPGRADE_IMMEDIATE_ENTITLEMENT is enabled.
 */
export async function upgradeMembershipToPro(input: {
  userId: number;
  pricingMarket?: PricingMarket;
}): Promise<UpgradeMembershipToProResult> {
  const market = input.pricingMarket ?? "international";

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

    const row = openRows[0];
    const { amount, currency } = resolveUpgradeOrderAmount({ market });

    // U3: captured/processing upgrade already known — never open a second Order.
    if (row && isCapturedUpgradePaymentMarker(row.pendingUpgradePaymentId)) {
      return {
        subscriptionId: row.razorpaySubscriptionId,
        currentPlan: "basic",
        scheduledPlan: "pro",
        status: row.status,
        alreadyScheduled: true,
        currentEnd: row.currentEnd?.toISOString() ?? null,
        orderId: null,
        keyId: null,
        amount,
        currency,
        market,
        pendingRazorpayPlanId: row.pendingRazorpayPlanId ?? null,
      };
    }

    const [existingUpgradeLot] = await db
      .select({ id: studioCreditAllocationsTable.id })
      .from(studioCreditAllocationsTable)
      .where(
        and(
          eq(studioCreditAllocationsTable.userId, input.userId),
          eq(
            studioCreditAllocationsTable.reasonCode,
            StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION,
          ),
        ),
      )
      .limit(1);

    if (existingUpgradeLot) {
      return {
        subscriptionId: row?.razorpaySubscriptionId ?? "",
        currentPlan: "basic",
        scheduledPlan: "pro",
        status: row?.status ?? "active",
        alreadyScheduled: true,
        currentEnd: row?.currentEnd?.toISOString() ?? null,
        orderId: null,
        keyId: null,
        amount,
        currency,
        market,
        pendingRazorpayPlanId: row?.pendingRazorpayPlanId ?? null,
      };
    }

    const decision = resolveBasicToProUpgrade({
      openSubscriptions: openRows.map((openRow) => ({
        studioPlan: openRow.studioPlan,
        status: openRow.status,
        pendingUpgradePlan: openRow.pendingUpgradePlan,
        pendingRazorpayPlanId: openRow.pendingRazorpayPlanId,
      })),
    });

    if (decision.action === "reject") {
      throw new SubscriptionValidationError(decision.message);
    }

    if (!row) {
      throw new SubscriptionValidationError(
        "An active Studio Basic membership is required to upgrade.",
      );
    }

    if (decision.action === "already_scheduled") {
      return {
        subscriptionId: row.razorpaySubscriptionId,
        currentPlan: "basic",
        scheduledPlan: "pro",
        status: row.status,
        alreadyScheduled: true,
        currentEnd: row.currentEnd?.toISOString() ?? null,
        orderId: null,
        keyId: null,
        amount,
        currency,
        market,
        pendingRazorpayPlanId:
          decision.pendingRazorpayPlanId ?? row.pendingRazorpayPlanId ?? null,
      };
    }

    // Resume an existing unpaid upgrade Order instead of creating a duplicate.
    // Expired / invalid Orders are cleared so a fresh ₹3,000 Order can be created.
    const existingOrderId = parseUpgradeCheckoutOrderId(
      row.pendingUpgradePaymentId,
    );
    if (existingOrderId) {
      let reuse = resolveUpgradeCheckoutOrderReuse({
        orderId: existingOrderId,
        order: null,
        fetchFailed: true,
      });
      try {
        const existingOrder = await fetchRazorpayOrder(existingOrderId);
        reuse = resolveUpgradeCheckoutOrderReuse({
          orderId: existingOrderId,
          order: {
            status: existingOrder.status,
            amount_paid: existingOrder.amount_paid,
          },
        });
      } catch (error) {
        logger.warn(
          {
            err: error,
            userId: input.userId,
            orderId: existingOrderId,
            subscriptionId: row.razorpaySubscriptionId,
          },
          "Unable to fetch existing upgrade Order — allowing a fresh Order if unpaid",
        );
        reuse = resolveUpgradeCheckoutOrderReuse({
          orderId: existingOrderId,
          order: null,
          fetchFailed: true,
        });
      }

      if (reuse.action === "reuse") {
        return {
          subscriptionId: row.razorpaySubscriptionId,
          currentPlan: "basic",
          scheduledPlan: "pro",
          status: row.status,
          alreadyScheduled: false,
          currentEnd: row.currentEnd?.toISOString() ?? null,
          orderId: existingOrderId,
          keyId: getRazorpayKeyId(),
          amount,
          currency,
          market,
          pendingRazorpayPlanId: null,
        };
      }

      if (reuse.action === "already_paid") {
        return {
          subscriptionId: row.razorpaySubscriptionId,
          currentPlan: "basic",
          scheduledPlan: "pro",
          status: row.status,
          alreadyScheduled: true,
          currentEnd: row.currentEnd?.toISOString() ?? null,
          orderId: null,
          keyId: null,
          amount,
          currency,
          market,
          pendingRazorpayPlanId: row.pendingRazorpayPlanId ?? null,
        };
      }

      // create_fresh — clear stale order: marker, then fall through to create.
      await db
        .update(studioRazorpaySubscriptionsTable)
        .set({
          pendingUpgradePaymentId: null,
          updatedAt: new Date(),
        })
        .where(eq(studioRazorpaySubscriptionsTable.id, row.id));

      logger.info(
        {
          userId: input.userId,
          subscriptionId: row.razorpaySubscriptionId,
          expiredOrderId: existingOrderId,
          reason: reuse.reason,
        },
        "Cleared expired/invalid unpaid upgrade Order marker — creating a fresh Order",
      );
    }

    const order = await createRazorpayOrder({
      amount,
      currency,
      receipt: `upg_${input.userId}_${Date.now()}`.slice(0, 40),
      notes: {
        [STUDIO_UPGRADE_NOTE_USER_ID]: String(input.userId),
        [STUDIO_UPGRADE_NOTE_PRODUCT]: STUDIO_UPGRADE_PRODUCT,
        [STUDIO_UPGRADE_NOTE_MARKET]: market,
        [STUDIO_UPGRADE_NOTE_SUBSCRIPTION_ID]: row.razorpaySubscriptionId,
      },
    });

    if (order.amount !== amount || order.currency.toUpperCase() !== currency) {
      throw new SubscriptionUpgradeError(
        "Razorpay upgrade order amount/currency did not match StudioLayer charge table",
      );
    }

    // U3 marker: checkout Order exists before payment.captured writes pending plan.
    await db
      .update(studioRazorpaySubscriptionsTable)
      .set({
        pendingUpgradePaymentId: upgradeCheckoutOrderMarker(order.id),
        updatedAt: new Date(),
      })
      .where(eq(studioRazorpaySubscriptionsTable.id, row.id));

    return {
      subscriptionId: row.razorpaySubscriptionId,
      currentPlan: "basic",
      scheduledPlan: "pro",
      status: row.status,
      alreadyScheduled: false,
      currentEnd: row.currentEnd?.toISOString() ?? null,
      orderId: order.id,
      keyId: getRazorpayKeyId(),
      amount,
      currency,
      market,
      pendingRazorpayPlanId: null,
    };
  });
}

async function applyImmediateUpgradeEntitlementAndCredits(input: {
  userId: number;
  subscriptionRowId: number;
  subscriptionId: string;
  paymentId: string;
  currentStart: Date;
  currentEnd: Date;
  razorpayPlanIdBeforeSync: string;
}): Promise<{ grantedCredits: number }> {
  const now = new Date();
  const periodKey = buildMembershipUpgradePeriodKey({
    subscriptionId: input.subscriptionId,
    currentStart: input.currentStart,
    currentEnd: input.currentEnd,
  });

  await db
    .update(studioRazorpaySubscriptionsTable)
    .set({
      studioPlan: "pro",
      studioTier: "enterprise",
      // Keep Razorpay plan_id as Basic until Razorpay reports Pro.
      razorpayPlanId: input.razorpayPlanIdBeforeSync,
      updatedAt: now,
    })
    .where(eq(studioRazorpaySubscriptionsTable.id, input.subscriptionRowId));

  await db
    .update(usersTable)
    .set({
      subscriptionTier: "enterprise",
      updatedAt: now,
    })
    .where(eq(usersTable.id, input.userId));

  const grant = await grantCreditAllocation({
    userId: input.userId,
    reasonCode: StudioCreditReasonCode.MEMBERSHIP_UPGRADE_ALLOCATION,
    credits: MembershipUpgradeCreditGrant,
    sourceReference: upgradePaymentSourceReference(input.paymentId),
    startsAt: input.currentStart,
    expiresAt: input.currentEnd,
    periodKey,
    tier: "enterprise",
  });

  return {
    grantedCredits: grant.created ? MembershipUpgradeCreditGrant : 0,
  };
}

/**
 * After upgrade-difference payment.captured:
 * 1) schedule Basic → Pro at cycle_end (never now)
 * 2) write pending Razorpay-lag fields
 * 3) when flag ON: immediate StudioLayer Pro + exactly +120 upgrade credits
 *
 * Idempotent on payment id + allocation source_reference.
 */
export async function fulfillMembershipUpgradeFromCapturedPayment(input: {
  payment: RazorpayPaymentEntity;
}): Promise<{ handled: boolean; grantedCredits: number }> {
  const payment = input.payment;
  if (!isCapturedRazorpayPayment(payment) || !payment.id) {
    return { handled: false, grantedCredits: 0 };
  }

  let notes = payment.notes ?? null;
  if (
    (!isStudioUpgradeProduct(notes?.[STUDIO_UPGRADE_NOTE_PRODUCT]) ||
      !parseUpgradeUserIdFromNotes(notes)) &&
    payment.order_id
  ) {
    try {
      const order = await fetchRazorpayOrder(payment.order_id);
      notes = order.notes ?? notes;
    } catch (error) {
      logger.warn(
        { err: error, orderId: payment.order_id, paymentId: payment.id },
        "Unable to fetch Razorpay order for upgrade payment notes",
      );
    }
  }

  if (!isStudioUpgradeProduct(notes?.[STUDIO_UPGRADE_NOTE_PRODUCT])) {
    return { handled: false, grantedCredits: 0 };
  }

  const userId = parseUpgradeUserIdFromNotes(notes);
  const subscriptionId = parseUpgradeSubscriptionIdFromNotes(notes);
  const market = parseUpgradeMarketFromNotes(notes) ?? "international";
  const immediate = readStudioUpgradeImmediateEntitlementFlag();

  if (!userId || !subscriptionId) {
    logger.warn(
      { paymentId: payment.id },
      "Upgrade payment missing user/subscription notes — ignored",
    );
    return { handled: true, grantedCredits: 0 };
  }

  if (
    !assertUpgradePaymentMatchesOrder({
      market,
      paymentAmount: payment.amount,
      paymentCurrency: payment.currency,
    })
  ) {
    logger.warn(
      {
        paymentId: payment.id,
        market,
        amount: payment.amount,
        currency: payment.currency,
      },
      "Upgrade payment amount/currency mismatch — plan change not scheduled",
    );
    return { handled: true, grantedCredits: 0 };
  }

  return withRazorpayPaymentGrantLock(payment.id, async () => {
    return withMembershipSubscriptionUserLock(userId, async () => {
      const [row] = await db
        .select()
        .from(studioRazorpaySubscriptionsTable)
        .where(
          eq(
            studioRazorpaySubscriptionsTable.razorpaySubscriptionId,
            subscriptionId,
          ),
        )
        .limit(1);

      if (!row || row.userId !== userId) {
        logger.warn(
          { paymentId: payment.id, subscriptionId, userId },
          "Upgrade payment subscription not found for user",
        );
        return { handled: true, grantedCredits: 0 };
      }

      // Idempotent retry for the same captured payment.
      if (row.pendingUpgradePaymentId === payment.id) {
        if (!immediate) {
          return { handled: true, grantedCredits: 0 };
        }
        const bounds = resolveUpgradeCreditPeriodBounds({
          currentStart: row.currentStart,
          currentEnd: row.currentEnd,
        });
        if (!bounds) {
          throw new Error(
            `Upgrade fulfillment missing currentStart/currentEnd for ${subscriptionId} (payment ${payment.id})`,
          );
        }
        const result = await applyImmediateUpgradeEntitlementAndCredits({
          userId,
          subscriptionRowId: row.id,
          subscriptionId: row.razorpaySubscriptionId,
          paymentId: payment.id,
          currentStart: bounds.currentStart,
          currentEnd: bounds.currentEnd,
          razorpayPlanIdBeforeSync: row.razorpayPlanId,
        });
        logger.info(
          {
            userId,
            subscriptionId: row.razorpaySubscriptionId,
            paymentId: payment.id,
            grantedCredits: result.grantedCredits,
            immediateEntitlement: true,
            idempotentRetry: true,
          },
          "Upgrade payment already pending — ensured immediate Pro + upgrade credits",
        );
        return { handled: true, grantedCredits: result.grantedCredits };
      }

      // Different payment already fulfilled this upgrade path.
      if (
        row.pendingUpgradePlan === "pro" &&
        isCapturedUpgradePaymentMarker(row.pendingUpgradePaymentId) &&
        row.pendingUpgradePaymentId !== payment.id
      ) {
        logger.info(
          {
            paymentId: payment.id,
            subscriptionId,
            existingPaymentId: row.pendingUpgradePaymentId,
          },
          "Upgrade already scheduled — skipping duplicate plan change",
        );
        return { handled: true, grantedCredits: 0 };
      }

      // U3: another captured upgrade payment marker exists for this subscription.
      if (
        isCapturedUpgradePaymentMarker(row.pendingUpgradePaymentId) &&
        row.pendingUpgradePaymentId !== payment.id
      ) {
        logger.info(
          {
            paymentId: payment.id,
            subscriptionId,
            existingPaymentId: row.pendingUpgradePaymentId,
          },
          "Captured upgrade payment already recorded — refusing duplicate fulfillment",
        );
        return { handled: true, grantedCredits: 0 };
      }

      if (row.pendingUpgradePlan === "pro") {
        logger.info(
          {
            paymentId: payment.id,
            subscriptionId,
            existingPaymentId: row.pendingUpgradePaymentId,
          },
          "Upgrade already scheduled — skipping duplicate plan change",
        );
        return { handled: true, grantedCredits: 0 };
      }

      if (row.status !== "active") {
        logger.warn(
          { paymentId: payment.id, status: row.status },
          "Upgrade payment captured but membership not active",
        );
        return { handled: true, grantedCredits: 0 };
      }

      // Allow Basic (including unpaid order: marker). Allow Pro only when
      // completing a retry after a partial immediate apply without pending plan.
      if (row.studioPlan !== "basic" && row.studioPlan !== "pro") {
        logger.warn(
          { paymentId: payment.id, studioPlan: row.studioPlan },
          "Upgrade payment captured but membership not eligible",
        );
        return { handled: true, grantedCredits: 0 };
      }

      if (row.studioPlan === "pro" && !immediate) {
        logger.warn(
          { paymentId: payment.id },
          "Upgrade payment captured for non-Basic membership while immediate entitlement is off",
        );
        return { handled: true, grantedCredits: 0 };
      }

      const proPlanId = resolveProPlanIdForUpgrade({
        currentRazorpayPlanId: row.razorpayPlanId,
        pricingMarket: market,
      });

      let updated: RazorpaySubscriptionEntity;
      try {
        updated = await updateRazorpaySubscriptionPlan({
          subscriptionId: row.razorpaySubscriptionId,
          planId: proPlanId,
          scheduleChangeAt: "cycle_end",
        });
      } catch (error) {
        logger.error(
          {
            err: error,
            userId,
            subscriptionId: row.razorpaySubscriptionId,
            proPlanId,
            paymentId: payment.id,
          },
          "Razorpay Basic → Pro cycle_end plan change failed after upgrade payment",
        );
        // C: schedule failure → no Pro, no +120; webhook fails/retries.
        throw error;
      }

      const currentStart =
        unixToDate(updated.current_start) ?? row.currentStart;
      const currentEnd = unixToDate(updated.current_end) ?? row.currentEnd;

      if (immediate) {
        const bounds = resolveUpgradeCreditPeriodBounds({
          currentStart,
          currentEnd,
        });
        if (!bounds) {
          // U2: fail closed — do not write Pro / +120 without a valid expiry.
          throw new Error(
            `Upgrade fulfillment missing currentStart/currentEnd for ${subscriptionId} (payment ${payment.id})`,
          );
        }
      }

      const scheduledAt = new Date();
      await db
        .update(studioRazorpaySubscriptionsTable)
        .set({
          pendingUpgradePlan: "pro",
          pendingRazorpayPlanId: proPlanId,
          pendingUpgradeScheduledAt: scheduledAt,
          pendingUpgradePaymentId: payment.id,
          status: updated.status || row.status,
          currentStart: currentStart ?? row.currentStart,
          currentEnd: currentEnd ?? row.currentEnd,
          updatedAt: scheduledAt,
        })
        .where(eq(studioRazorpaySubscriptionsTable.id, row.id));

      if (!immediate) {
        logger.info(
          {
            userId,
            subscriptionId: row.razorpaySubscriptionId,
            paymentId: payment.id,
            fromPlan: "basic",
            toPlan: "pro",
            pendingRazorpayPlanId: proPlanId,
            scheduleChangeAt: "cycle_end",
            grantedCredits: 0,
            immediateEntitlement: false,
          },
          "Upgrade difference paid — Studio Pro scheduled for next billing cycle (no credits granted)",
        );
        return { handled: true, grantedCredits: 0 };
      }

      const bounds = resolveUpgradeCreditPeriodBounds({
        currentStart,
        currentEnd,
      });
      if (!bounds) {
        throw new Error(
          `Upgrade fulfillment missing currentStart/currentEnd for ${subscriptionId} (payment ${payment.id})`,
        );
      }

      let grantedCredits = 0;
      try {
        const result = await applyImmediateUpgradeEntitlementAndCredits({
          userId,
          subscriptionRowId: row.id,
          subscriptionId: row.razorpaySubscriptionId,
          paymentId: payment.id,
          currentStart: bounds.currentStart,
          currentEnd: bounds.currentEnd,
          razorpayPlanIdBeforeSync: row.razorpayPlanId,
        });
        grantedCredits = result.grantedCredits;
      } catch (error) {
        // D: schedule + pending succeeded; credit/entitlement failure must retry.
        logger.error(
          {
            err: error,
            userId,
            subscriptionId: row.razorpaySubscriptionId,
            paymentId: payment.id,
          },
          "Immediate upgrade entitlement or +120 grant failed after cycle_end schedule",
        );
        throw error;
      }

      logger.info(
        {
          userId,
          subscriptionId: row.razorpaySubscriptionId,
          paymentId: payment.id,
          fromPlan: "basic",
          toPlan: "pro",
          pendingRazorpayPlanId: proPlanId,
          scheduleChangeAt: "cycle_end",
          razorpayPlanIdUnchanged: row.razorpayPlanId,
          studioPlan: "pro",
          studioTier: "enterprise",
          grantedCredits,
          upgradeCredits: MembershipUpgradeCreditGrant,
          immediateEntitlement: true,
        },
        "Upgrade difference paid — Studio Pro active immediately; +120 upgrade credits granted; Razorpay Pro pending cycle_end",
      );

      return { handled: true, grantedCredits };
    });
  });
}

export async function getMembershipSubscriptionStatus(input: {
  userId: number;
}): Promise<{
  studioPlan: StudioMembershipPlanId | null;
  studioTier: "pro" | "enterprise" | null;
  status: string | null;
  pendingUpgradePlan: "pro" | null;
  currentEnd: string | null;
  subscriptionId: string | null;
  immediateUpgradeEntitlement: boolean;
}> {
  const immediateUpgradeEntitlement = readStudioUpgradeImmediateEntitlementFlag();
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
    )
    .limit(1);

  const row = openRows[0];
  if (!row) {
    return {
      studioPlan: null,
      studioTier: null,
      status: null,
      pendingUpgradePlan: null,
      currentEnd: null,
      subscriptionId: null,
      immediateUpgradeEntitlement,
    };
  }

  return {
    studioPlan:
      row.studioPlan === "basic" || row.studioPlan === "pro"
        ? row.studioPlan
        : null,
    studioTier:
      row.studioTier === "pro" || row.studioTier === "enterprise"
        ? row.studioTier
        : null,
    status: row.status,
    pendingUpgradePlan: row.pendingUpgradePlan === "pro" ? "pro" : null,
    currentEnd: row.currentEnd?.toISOString() ?? null,
    subscriptionId: row.razorpaySubscriptionId,
    immediateUpgradeEntitlement,
  };
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
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionPersistenceError";
  }
}

export class SubscriptionUpgradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionUpgradeError";
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
    const upgrade = await fulfillMembershipUpgradeFromCapturedPayment({
      payment,
    });
    if (upgrade.handled) {
      return upgrade;
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
