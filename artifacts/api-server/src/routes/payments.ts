import { Router, type IRouter, type Request } from "express";
import { CreateMembershipSubscriptionBody } from "@workspace/api-zod";
import {
  createMembershipSubscription,
  processRazorpayWebhookPayload,
  SubscriptionConflictError,
  SubscriptionPersistenceError,
  SubscriptionValidationError,
} from "../billing/razorpay-membership.js";
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
