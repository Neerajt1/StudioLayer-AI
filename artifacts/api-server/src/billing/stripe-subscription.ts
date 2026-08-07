import type { Logger } from "pino";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeCancellableUser = {
  stripeSubscriptionId: string;
};

/**
 * Best-effort Stripe subscription cancellation.
 * Never throws — deletion must not be blocked when Stripe is unavailable.
 */
export async function cancelStripeSubscriptionIfPresent(
  user: StripeCancellableUser,
  log: Logger,
): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const subscriptionId = user.stripeSubscriptionId?.trim();

  if (!secretKey) {
    log.info({ step: "stripe_cancellation" }, "Stripe cancellation skipped — STRIPE_SECRET_KEY not configured");
    return;
  }

  if (!subscriptionId) {
    log.info({ step: "stripe_cancellation" }, "Stripe cancellation skipped — no subscription id");
    return;
  }

  try {
    const response = await fetch(`${STRIPE_API_BASE}/subscriptions/${subscriptionId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    if (!response.ok) {
      log.warn(
        { step: "stripe_cancellation", subscriptionId, status: response.status },
        "Stripe subscription cancellation failed — continuing with Studio deletion",
      );
      return;
    }

    log.info(
      { step: "stripe_cancellation", subscriptionId },
      "Stripe subscription cancelled",
    );
  } catch (error) {
    log.warn(
      { err: error, step: "stripe_cancellation", subscriptionId, stack: error instanceof Error ? error.stack : undefined },
      "Stripe subscription cancellation error — continuing with Studio deletion",
    );
  }
}
