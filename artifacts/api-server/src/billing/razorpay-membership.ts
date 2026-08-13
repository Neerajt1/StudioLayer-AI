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
  getRazorpayKeyId,
  isOpenMembershipSubscriptionStatus,
  isStudioMembershipPlanId,
  OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES,
  RazorpayWebhookProcessingStatus,
  type RazorpayPaymentEntity,
  type RazorpaySubscriptionEntity,
  type StudioMembershipPlanId,
  studioTierForPlan,
  resolveRazorpayPlanId,
} from "./razorpay-client.js";
import {
  claimWebhookEventForProcessing,
  evaluateSubscriptionChargedGrant,
  resolveOpenMembershipForCreate,
  unixToDate,
} from "./razorpay-membership-logic.js";
import { logger } from "../lib/logger.js";

export type CreateMembershipSubscriptionResult = {
  subscriptionId: string;
  keyId: string;
  plan: StudioMembershipPlanId;
  studioTier: "pro" | "enterprise";
  razorpayPlanId: string;
  status: string;
  shortUrl: string | null;
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
}): Promise<CreateMembershipSubscriptionResult> {
  if (!isStudioMembershipPlanId(input.plan)) {
    throw new SubscriptionValidationError(
      'plan must be "basic" or "pro"',
    );
  }

  const plan = input.plan;
  const razorpayPlanId = resolveRazorpayPlanId(plan);
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
 * Credits are granted only on subscription.charged with a captured payment.
 *
 * Retry model (UNIQUE event_id preserved):
 * - processed → idempotent duplicate (no re-grant)
 * - failed / received / processing → reprocess under event advisory lock
 * - concurrent identical deliveries → one grant (lock + allocation source_reference)
 */
export async function processRazorpayWebhookPayload(
  payload: RazorpayWebhookPayload,
): Promise<{ handled: boolean; grantedCredits: number; duplicate: boolean }> {
  const eventType = payload.event ?? "";
  const eventId =
    typeof payload.id === "string" && payload.id.length > 0
      ? payload.id
      : null;

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

  if (
    row.studioPlan !== "basic" &&
    row.studioPlan !== "pro"
  ) {
    logger.warn(
      { subscriptionId: subscription.id, studioPlan: row.studioPlan },
      "subscription.charged with unknown studio_plan — no credits",
    );
    return { handled: true, grantedCredits: 0 };
  }

  const decision = evaluateSubscriptionChargedGrant({
    studioPlan: row.studioPlan,
    studioTier: row.studioTier,
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
