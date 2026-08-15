/**
 * Server-side Razorpay REST client for StudioLayer membership subscriptions.
 * Secrets never leave the backend. Uses fetch (same pattern as Stripe remnant).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { PricingMarket } from "./pricing-market.js";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/** Finite cycle count ≈ auto-renew until cancelled (Razorpay requires total_count). */
export const RAZORPAY_ONGOING_SUBSCRIPTION_TOTAL_COUNT = 1200;

/** Conservative timeout for Razorpay REST calls (ms). */
export const RAZORPAY_FETCH_TIMEOUT_MS = 30_000;

/** Expected plan amounts in the smallest currency unit (USD cents). */
export const RAZORPAY_EXPECTED_PLAN_AMOUNT_CENTS = {
  basic: 4900,
  pro: 7900,
} as const;

export type StudioMembershipPlanId = "basic" | "pro";

export type StudioMembershipTier = "pro" | "enterprise";

export interface RazorpaySubscriptionEntity {
  id: string;
  entity: string;
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  quantity?: number;
  total_count?: number;
  paid_count?: number;
  short_url?: string | null;
  notes?: Record<string, string>;
  created_at?: number;
}

export interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string | null;
  invoice_id?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  notes?: Record<string, string> | null;
}

export interface RazorpayOrderEntity {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status?: string;
  amount_paid?: number;
  receipt?: string | null;
  notes?: Record<string, string> | null;
}

export interface CreateRazorpayOrderInput {
  amount: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface CreateRazorpaySubscriptionInput {
  planId: string;
  totalCount?: number;
  notes?: Record<string, string>;
  customerNotify?: boolean;
}

export class RazorpayApiError extends Error {
  readonly status: number;
  readonly bodyText: string;

  constructor(message: string, status: number, bodyText: string) {
    super(message);
    this.name = "RazorpayApiError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required for Razorpay`);
  }
  return value;
}

export function getRazorpayKeyId(): string {
  return requireEnv("RAZORPAY_KEY_ID");
}

export function getRazorpayKeySecret(): string {
  return requireEnv("RAZORPAY_KEY_SECRET");
}

export function getRazorpayWebhookSecret(): string {
  return requireEnv("RAZORPAY_WEBHOOK_SECRET");
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Maps StudioLayer plan identifiers to Razorpay Plan IDs.
 * Plan IDs come from env — never accept arbitrary plan IDs from the browser.
 *
 * Optional INR/USD plan IDs are used only when configured. Otherwise the
 * existing RAZORPAY_*_PLAN_ID values are unchanged.
 */
export function resolveRazorpayPlanId(
  plan: StudioMembershipPlanId,
  market?: PricingMarket,
): string {
  if (plan === "basic") {
    if (market === "india") {
      return optionalEnv("RAZORPAY_BASIC_PLAN_ID_INR") ?? requireEnv("RAZORPAY_BASIC_PLAN_ID");
    }
    if (market === "international") {
      return optionalEnv("RAZORPAY_BASIC_PLAN_ID_USD") ?? requireEnv("RAZORPAY_BASIC_PLAN_ID");
    }
    return requireEnv("RAZORPAY_BASIC_PLAN_ID");
  }
  if (plan === "pro") {
    if (market === "india") {
      return optionalEnv("RAZORPAY_PRO_PLAN_ID_INR") ?? requireEnv("RAZORPAY_PRO_PLAN_ID");
    }
    if (market === "international") {
      return optionalEnv("RAZORPAY_PRO_PLAN_ID_USD") ?? requireEnv("RAZORPAY_PRO_PLAN_ID");
    }
    return requireEnv("RAZORPAY_PRO_PLAN_ID");
  }
  throw new Error(`Unsupported StudioLayer membership plan: ${plan}`);
}

/** DB / credit-engine tier for a StudioLayer plan. */
export function studioTierForPlan(plan: StudioMembershipPlanId): StudioMembershipTier {
  if (plan === "basic") return "pro";
  if (plan === "pro") return "enterprise";
  throw new Error(`Unsupported StudioLayer membership plan: ${plan}`);
}

export function isStudioMembershipPlanId(
  value: unknown,
): value is StudioMembershipPlanId {
  return value === "basic" || value === "pro";
}

function basicAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function parseRazorpayJsonResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const bodyText = await response.text();
  if (!bodyText) {
    return {};
  }
  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw new RazorpayApiError(
      `Razorpay returned non-JSON body (HTTP ${response.status})`,
      response.status,
      bodyText.slice(0, 500),
    );
  }
}

async function razorpayFetch(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();

  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: basicAuthHeader(keyId, keySecret),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(RAZORPAY_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new RazorpayApiError(
        `Razorpay request timed out after ${RAZORPAY_FETCH_TIMEOUT_MS}ms`,
        504,
        "",
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new RazorpayApiError(
        `Razorpay request aborted/timed out after ${RAZORPAY_FETCH_TIMEOUT_MS}ms`,
        504,
        "",
      );
    }
    throw error;
  }

  const payload = await parseRazorpayJsonResponse(response);
  if (!response.ok) {
    const description =
      typeof payload.error === "object" &&
      payload.error &&
      "description" in payload.error &&
      typeof (payload.error as { description?: unknown }).description === "string"
        ? (payload.error as { description: string }).description
        : `Razorpay request failed (HTTP ${response.status})`;
    throw new RazorpayApiError(description, response.status, JSON.stringify(payload));
  }

  return payload;
}

export async function createRazorpaySubscription(
  input: CreateRazorpaySubscriptionInput,
): Promise<RazorpaySubscriptionEntity> {
  const body = {
    plan_id: input.planId,
    total_count:
      input.totalCount ?? RAZORPAY_ONGOING_SUBSCRIPTION_TOTAL_COUNT,
    customer_notify: input.customerNotify ?? 1,
    notes: input.notes ?? {},
  };

  const payload = await razorpayFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (typeof payload.id !== "string" || !payload.id) {
    throw new RazorpayApiError(
      "Razorpay create subscription returned no subscription id",
      502,
      JSON.stringify(payload),
    );
  }

  return payload as unknown as RazorpaySubscriptionEntity;
}

/**
 * Create a one-time Razorpay order (Pass / Top-Up — never subscriptions).
 * Official API: POST /v1/orders
 */
export async function createRazorpayOrder(
  input: CreateRazorpayOrderInput,
): Promise<RazorpayOrderEntity> {
  const body = {
    amount: input.amount,
    currency: input.currency,
    receipt: input.receipt,
    notes: input.notes ?? {},
  };

  const payload = await razorpayFetch("/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (typeof payload.id !== "string" || !payload.id) {
    throw new RazorpayApiError(
      "Razorpay create order returned no order id",
      502,
      JSON.stringify(payload),
    );
  }
  if (typeof payload.amount !== "number" || typeof payload.currency !== "string") {
    throw new RazorpayApiError(
      "Razorpay create order returned incomplete amount/currency",
      502,
      JSON.stringify(payload),
    );
  }

  return payload as unknown as RazorpayOrderEntity;
}

export async function fetchRazorpayOrder(
  orderId: string,
): Promise<RazorpayOrderEntity> {
  const payload = await razorpayFetch(
    `/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" },
  );
  return payload as unknown as RazorpayOrderEntity;
}

export async function fetchRazorpaySubscription(
  subscriptionId: string,
): Promise<RazorpaySubscriptionEntity> {
  const payload = await razorpayFetch(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
  );
  return payload as unknown as RazorpaySubscriptionEntity;
}

/**
 * Cancel a Razorpay subscription.
 * Official API: POST /v1/subscriptions/:id/cancel
 * @see https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/
 *
 * Use cancelAtCycleEnd=false for immediate cancel (required for orphan recovery
 * of newly created subscriptions that may not yet have an active billing cycle).
 */
export async function cancelRazorpaySubscription(input: {
  subscriptionId: string;
  cancelAtCycleEnd?: boolean;
}): Promise<RazorpaySubscriptionEntity> {
  const payload = await razorpayFetch(
    `/subscriptions/${encodeURIComponent(input.subscriptionId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        cancel_at_cycle_end: input.cancelAtCycleEnd ?? false,
      }),
    },
  );
  return payload as unknown as RazorpaySubscriptionEntity;
}

/**
 * Map a Razorpay plan_id back to StudioLayer plan using configured env IDs.
 * Returns null when the id is unrecognized (do not guess).
 */
export function studioPlanForRazorpayPlanId(
  razorpayPlanId: string,
): StudioMembershipPlanId | null {
  const id = razorpayPlanId.trim();
  if (!id) return null;

  const basicIds = [
    process.env.RAZORPAY_BASIC_PLAN_ID,
    process.env.RAZORPAY_BASIC_PLAN_ID_INR,
    process.env.RAZORPAY_BASIC_PLAN_ID_USD,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const proIds = [
    process.env.RAZORPAY_PRO_PLAN_ID,
    process.env.RAZORPAY_PRO_PLAN_ID_INR,
    process.env.RAZORPAY_PRO_PLAN_ID_USD,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (basicIds.includes(id)) return "basic";
  if (proIds.includes(id)) return "pro";
  return null;
}

/**
 * Verify Razorpay webhook HMAC-SHA256 signature against the raw request body.
 * Must run on the unmodified body bytes — never on a re-serialized JSON object.
 */
export function verifyRazorpayWebhookSignature(input: {
  rawBody: Buffer | string;
  signatureHeader: string | undefined;
  webhookSecret?: string;
}): boolean {
  const signature = input.signatureHeader?.trim();
  if (!signature) return false;

  const secret = input.webhookSecret ?? getRazorpayWebhookSecret();
  const body =
    typeof input.rawBody === "string"
      ? Buffer.from(input.rawBody)
      : input.rawBody;

  const expected = createHmac("sha256", secret).update(body).digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(signature, "utf8");
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/** Stable grant identity for a successful subscription charge. */
export function membershipPaymentSourceReference(input: {
  paymentId?: string | null;
  invoiceId?: string | null;
  subscriptionId: string;
  currentStartUnix: number;
  currentEndUnix: number;
}): string {
  if (input.paymentId) {
    return `rzp_payment:${input.paymentId}`;
  }
  if (input.invoiceId) {
    return `rzp_invoice:${input.invoiceId}`;
  }
  return `rzp_sub_period:${input.subscriptionId}:${input.currentStartUnix}:${input.currentEndUnix}`;
}

/**
 * Strict captured-payment gate for membership credit grants.
 * Missing payment / id / status ⇒ not eligible.
 */
export function isCapturedRazorpayPayment(
  payment: RazorpayPaymentEntity | null | undefined,
): payment is RazorpayPaymentEntity & { id: string; status: "captured" } {
  if (!payment) return false;
  if (typeof payment.id !== "string" || payment.id.length === 0) return false;
  return payment.status === "captured";
}

/**
 * Optional amount check when USD cents are present.
 * Returns null when amount/currency are absent (do not reject).
 * Returns false only on a clear USD amount mismatch.
 */
export function matchesExpectedPlanAmountUsdCents(input: {
  plan: StudioMembershipPlanId;
  payment: RazorpayPaymentEntity;
}): boolean | null {
  const amount = input.payment.amount;
  const currency = input.payment.currency?.toUpperCase();
  if (amount == null || !currency) return null;
  if (currency !== "USD") return null;
  return amount === RAZORPAY_EXPECTED_PLAN_AMOUNT_CENTS[input.plan];
}

/** Webhook event processing states — supports retry after failure. */
export const RazorpayWebhookProcessingStatus = {
  RECEIVED: "received",
  PROCESSING: "processing",
  PROCESSED: "processed",
  FAILED: "failed",
} as const;

export type RazorpayWebhookProcessingStatusValue =
  (typeof RazorpayWebhookProcessingStatus)[keyof typeof RazorpayWebhookProcessingStatus];

export function shouldReprocessWebhookEvent(
  status: string | null | undefined,
): boolean {
  return (
    status === RazorpayWebhookProcessingStatus.FAILED ||
    status === RazorpayWebhookProcessingStatus.RECEIVED ||
    status === RazorpayWebhookProcessingStatus.PROCESSING
  );
}

export function isWebhookEventFullyProcessed(
  status: string | null | undefined,
): boolean {
  return status === RazorpayWebhookProcessingStatus.PROCESSED;
}

/**
 * Statuses that count as an open membership (blocks creating another).
 * Terminal: cancelled, completed. Halted/paused can still bill/resume.
 */
export const OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "paused",
] as const;

export function isOpenMembershipSubscriptionStatus(status: string): boolean {
  return (OPEN_MEMBERSHIP_SUBSCRIPTION_STATUSES as readonly string[]).includes(
    status,
  );
}
