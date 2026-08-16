import type { Logger } from "pino";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { cancelStripeSubscriptionIfPresent } from "../billing/stripe-subscription.js";
import { cancelAllOpenRazorpayMembershipsForUser } from "../billing/razorpay-membership.js";

export class StudioDeletionError extends Error {
  readonly name = "StudioDeletionError";

  constructor(
    readonly code: "DELETE_FAILED",
    readonly step: string,
    options?: { cause?: unknown },
  ) {
    super(`Studio deletion failed at step: ${step}`, options);
  }
}

async function readStripeSubscriptionId(
  userId: number,
  log: Logger,
): Promise<string | null> {
  try {
    const result = await db.execute<{ stripe_subscription_id: string | null }>(
      sql`SELECT stripe_subscription_id FROM users WHERE id = ${userId} LIMIT 1`,
    );

    const row = result.rows[0];
    return row?.stripe_subscription_id?.trim() ?? null;
  } catch (error) {
    log.warn(
      { err: error, userId, step: "stripe_lookup" },
      "Stripe subscription lookup skipped — column may be unavailable in local dev",
    );
    return null;
  }
}

/**
 * Permanently delete a Studio account and all cascaded user data.
 * Razorpay membership cancellation is required before deletion (fail closed).
 * Stripe cancellation remains best-effort and never blocks deletion.
 */
export async function deleteStudioAccount(userId: number, log: Logger): Promise<void> {
  log.info(
    { userId, step: "razorpay_cancellation" },
    "Razorpay membership cancellation phase starting",
  );

  try {
    await cancelAllOpenRazorpayMembershipsForUser({ userId });
  } catch (error) {
    log.error(
      {
        err: error,
        userId,
        step: "razorpay_cancellation",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Razorpay membership cancellation failed — account deletion blocked",
    );
    throw new StudioDeletionError("DELETE_FAILED", "razorpay_cancellation", {
      cause: error,
    });
  }

  log.info({ userId, step: "stripe_cancellation" }, "Stripe cancellation phase starting");

  const stripeSubscriptionId = await readStripeSubscriptionId(userId, log);

  if (stripeSubscriptionId) {
    log.info(
      { userId, step: "stripe_cancellation", stripeSubscriptionId },
      "Stripe cancellation attempted",
    );
    await cancelStripeSubscriptionIfPresent({ stripeSubscriptionId }, log);
  } else {
    log.info(
      { userId, step: "stripe_cancellation" },
      "Stripe cancellation skipped — no subscription id",
    );
  }

  log.info({ userId, step: "database_deletion" }, "Database deletion begins");

  let deleted: { id: number }[];

  try {
    deleted = await db
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });
  } catch (error) {
    log.error(
      { err: error, userId, step: "database_deletion", stack: error instanceof Error ? error.stack : undefined },
      "Database deletion failed",
    );
    throw new StudioDeletionError("DELETE_FAILED", "database_deletion", { cause: error });
  }

  if (deleted.length === 0) {
    log.error({ userId, step: "database_deletion" }, "Database deletion returned no rows");
    throw new StudioDeletionError("DELETE_FAILED", "database_deletion");
  }

  log.info(
    { userId, step: "database_deletion", deletedUserId: deleted[0]?.id },
    "Database deletion succeeds",
  );
}
