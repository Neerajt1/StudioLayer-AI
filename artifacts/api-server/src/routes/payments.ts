import { Router, type IRouter, type Request } from "express";
import { CreateMembershipSubscriptionBody, CreateStudioAddOnCheckoutBody } from "@workspace/api-zod";
import {
  createMembershipSubscription,
  cancelMembershipAtCycleEnd,
  getMembershipSubscriptionStatus,
  processRazorpayWebhookPayload,
  scheduleMembershipUpgradeToPro,
  SubscriptionConflictError,
  SubscriptionPersistenceError,
  SubscriptionValidationError,
} from "../billing/razorpay-membership.js";
import {
  AddOnPersistenceError,
  AddOnValidationError,
  createStudioAddOnCheckout,
} from "../billing/razorpay-add-ons.js";
import { verifyRazorpayWebhookSignature } from "../billing/razorpay-client.js";
import { pricingMarketFromRequest } from "../billing/pricing-market.js";
import { logger } from "../lib/logger.js";

type RequestWithRawBody = Request & { rawBody?: Buffer };

function clientTimeZoneFromRequest(req: Request): string | null {
  const header = req.header("X-Client-Timezone")?.trim();
  if (header) return header;

  const queryTz = req.query.tz;
  if (typeof queryTz === "string" && queryTz.trim()) return queryTz.trim();
  return null;
}

const router: IRouter = Router();

/**
 * POST /api/payments/subscriptions
 * Authenticated — creates (or reuses) a Razorpay membership subscription.
 */
router.post("/payments/subscriptions", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = CreateMembershipSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'plan must be "basic" or "pro"' });
    return;
  }

  try {
    const result = await createMembershipSubscription({
      userId,
      plan: parsed.data.plan,
      pricingMarket: pricingMarketFromRequest(
        req.headers,
        clientTimeZoneFromRequest(req),
      ),
    });

    // Public fields only — never include RAZORPAY_KEY_SECRET.
    res.status(201).json({
      subscriptionId: result.subscriptionId,
      keyId: result.keyId,
      plan: result.plan,
      studioTier: result.studioTier,
      status: result.status,
      shortUrl: result.shortUrl,
    });
  } catch (error) {
    if (error instanceof SubscriptionValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof SubscriptionConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof SubscriptionPersistenceError) {
      logger.error({ err: error }, "Razorpay subscription orphan after create");
      res.status(502).json({ error: "Unable to persist subscription" });
      return;
    }
    logger.error({ err: error }, "Failed to create Razorpay subscription");
    res.status(502).json({ error: "Unable to create subscription" });
  }
});

/**
 * GET /api/payments/subscriptions/membership
 * Authenticated — open membership subscription status.
 */
router.get(
  "/payments/subscriptions/membership",
  async (req, res): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const status = await getMembershipSubscriptionStatus({ userId });
      res.json(status);
    } catch (error) {
      logger.error({ err: error }, "Failed to load membership subscription status");
      res.status(500).json({ error: "Unable to load membership status" });
    }
  },
);

/**
 * POST /api/payments/subscriptions/schedule-pro
 * Authenticated Basic member — schedule Studio Pro at Basic current_end
 * via a separate future-start Pro subscription (no mid-cycle charge).
 */
router.post("/payments/subscriptions/schedule-pro", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const result = await scheduleMembershipUpgradeToPro({
      userId,
      pricingMarket: pricingMarketFromRequest(
        req.headers,
        clientTimeZoneFromRequest(req),
      ),
    });

    res.status(201).json({
      subscriptionId: result.subscriptionId,
      keyId: result.keyId,
      plan: result.plan,
      studioTier: result.studioTier,
      status: result.status,
      shortUrl: result.shortUrl,
      startAt: result.startAt,
      basicSubscriptionId: result.basicSubscriptionId,
      alreadyScheduled: result.alreadyScheduled,
      market: result.market,
    });
  } catch (error) {
    if (error instanceof SubscriptionValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof SubscriptionConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof SubscriptionPersistenceError) {
      logger.error({ err: error }, "Scheduled Pro subscription orphan after create");
      res.status(502).json({
        error:
          "Studio Pro could not be scheduled safely. Nothing was charged. Please try again shortly.",
      });
      return;
    }
    logger.error({ err: error }, "Failed to schedule Studio Pro subscription");
    res.status(502).json({
      error:
        "Unable to schedule Studio Pro right now. Your Studio Basic membership is unchanged.",
    });
  }
});

/**
 * POST /api/payments/subscriptions/cancel
 * Authenticated — cancel renewal at cycle end (membership stays active until current_end).
 */
router.post("/payments/subscriptions/cancel", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const result = await cancelMembershipAtCycleEnd({ userId });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof SubscriptionValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof SubscriptionConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof SubscriptionPersistenceError) {
      res.status(502).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, "Failed to cancel membership at cycle end");
    res.status(502).json({
      error:
        "Unable to cancel membership renewal right now. Your membership is unchanged.",
    });
  }
});

/**
 * POST /api/payments/add-ons/checkout
 * Authenticated — create a one-time Razorpay order for Studio Pass or Studio Top-Up.
 */
router.post("/payments/add-ons/checkout", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = CreateStudioAddOnCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'product must be "studioPass" or "topUp"' });
    return;
  }

  try {
    const result = await createStudioAddOnCheckout({
      userId,
      product: parsed.data.product,
      pricingMarket: pricingMarketFromRequest(
        req.headers,
        clientTimeZoneFromRequest(req),
      ),
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof AddOnValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof AddOnPersistenceError) {
      res.status(502).json({ error: error.message });
      return;
    }
    logger.error({ err: error }, "Failed to create add-on Razorpay order");
    res.status(502).json({ error: "Unable to create checkout order" });
  }
});

/**
 * GET /api/pricing/market
 * Display hint only — never persisted to the user account.
 * Country headers take precedence; tz query / X-Client-Timezone is fallback only.
 */
router.get("/pricing/market", (req, res): void => {
  const market = pricingMarketFromRequest(
    req.headers,
    clientTimeZoneFromRequest(req),
  );
  res.json({ market });
});

/**
 * POST /api/payments/razorpay/webhook
 * Unauthenticated — HMAC verified against raw body.
 */
router.post("/payments/razorpay/webhook", async (req, res): Promise<void> => {
  const rawReq = req as RequestWithRawBody;
  const rawBody = rawReq.rawBody;
  const signature = req.header("X-Razorpay-Signature") ?? undefined;

  if (!rawBody || rawBody.length === 0) {
    res.status(400).json({ error: "Missing raw webhook body" });
    return;
  }

  let signatureOk = false;
  try {
    signatureOk = verifyRazorpayWebhookSignature({
      rawBody,
      signatureHeader: signature,
    });
  } catch (error) {
    logger.error({ err: error }, "Razorpay webhook secret not configured");
    res.status(500).json({ error: "Webhook verification unavailable" });
    return;
  }

  if (!signatureOk) {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }

  try {
    const result = await processRazorpayWebhookPayload(
      payload as Parameters<typeof processRazorpayWebhookPayload>[0],
      { eventIdHeader: req.header("X-Razorpay-Event-Id") },
    );
    res.status(200).json({
      ok: true,
      duplicate: result.duplicate,
      grantedCredits: result.grantedCredits,
    });
  } catch (error) {
    logger.error({ err: error }, "Razorpay webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
