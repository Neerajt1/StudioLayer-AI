/**
 * Studio Pass / Top-Up one-time Razorpay Orders + payment.captured grants.
 */
import {
  MembershipCreditAllowances,
  StudioCreditReasonCode,
  studioPassExpiresAt,
  type MembershipPricingMarket,
  type StudioAddOnProductId,
} from "@workspace/studio-credit-engine";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { grantCreditAllocation } from "../services/studio-credit-service.js";
import { logger } from "../lib/logger.js";
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  getRazorpayKeyId,
  isCapturedRazorpayPayment,
  type RazorpayPaymentEntity,
} from "./razorpay-client.js";
import {
  STUDIO_ADD_ON_NOTE_MARKET,
  STUDIO_ADD_ON_NOTE_PRODUCT,
  STUDIO_ADD_ON_NOTE_USER_ID,
  addOnPaymentSourceReference,
  assertAddOnPaymentMatchesOrder,
  expectedAddOnCredits,
  isStudioAddOnProductId,
  parseAddOnProductFromNotes,
  parseAddOnUserIdFromNotes,
  resolveAddOnOrderAmount,
  resolveAddOnPurchaseEligibility,
} from "./razorpay-add-ons-logic.js";

export type CreateAddOnCheckoutResult = {
  orderId: string;
  keyId: string;
  amount: number;
  currency: "INR" | "USD";
  product: StudioAddOnProductId;
  market: MembershipPricingMarket;
};

export class AddOnValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddOnValidationError";
  }
}

export class AddOnPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddOnPersistenceError";
  }
}

async function withUserLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
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

async function withPaymentGrantLock<T>(
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

function receiptFor(product: StudioAddOnProductId, userId: number): string {
  const prefix = product === "studioPass" ? "pass" : "topup";
  return `${prefix}_${userId}_${Date.now()}`.slice(0, 40);
}

export async function createStudioAddOnCheckout(input: {
  userId: number;
  product: unknown;
  pricingMarket: MembershipPricingMarket;
}): Promise<CreateAddOnCheckoutResult> {
  if (!isStudioAddOnProductId(input.product)) {
    throw new AddOnValidationError('product must be "studioPass" or "topUp"');
  }

  const product = input.product;

  return withUserLock(input.userId, async () => {
    const [user] = await db
      .select({
        subscriptionTier: usersTable.subscriptionTier,
      })
      .from(usersTable)
      .where(eq(usersTable.id, input.userId))
      .limit(1);

    if (!user) {
      throw new AddOnValidationError("User not found");
    }

    const eligibility = resolveAddOnPurchaseEligibility({
      product,
      subscriptionTier: user.subscriptionTier,
    });
    if (!eligibility.allowed) {
      throw new AddOnValidationError(eligibility.message);
    }

    const { amount, currency } = resolveAddOnOrderAmount({
      product,
      market: input.pricingMarket,
    });

    const order = await createRazorpayOrder({
      amount,
      currency,
      receipt: receiptFor(product, input.userId),
      notes: {
        [STUDIO_ADD_ON_NOTE_USER_ID]: String(input.userId),
        [STUDIO_ADD_ON_NOTE_PRODUCT]: product,
        [STUDIO_ADD_ON_NOTE_MARKET]: input.pricingMarket,
      },
    });

    if (order.amount !== amount || order.currency.toUpperCase() !== currency) {
      throw new AddOnPersistenceError(
        "Razorpay order amount/currency did not match StudioLayer charge table",
      );
    }

    return {
      orderId: order.id,
      keyId: getRazorpayKeyId(),
      amount,
      currency,
      product,
      market: input.pricingMarket,
    };
  });
}

export async function grantStudioAddOnFromCapturedPayment(input: {
  payment: RazorpayPaymentEntity;
}): Promise<{ handled: boolean; grantedCredits: number }> {
  const payment = input.payment;
  if (!isCapturedRazorpayPayment(payment)) {
    return { handled: false, grantedCredits: 0 };
  }

  let notes = payment.notes ?? null;
  let marketFromNotes =
    notes?.[STUDIO_ADD_ON_NOTE_MARKET] === "india" ||
    notes?.[STUDIO_ADD_ON_NOTE_MARKET] === "international"
      ? (notes[STUDIO_ADD_ON_NOTE_MARKET] as MembershipPricingMarket)
      : null;

  let product = parseAddOnProductFromNotes(notes);
  let userId = parseAddOnUserIdFromNotes(notes);

  if ((!product || !userId || !marketFromNotes) && payment.order_id) {
    try {
      const order = await fetchRazorpayOrder(payment.order_id);
      notes = order.notes ?? notes;
      product = product ?? parseAddOnProductFromNotes(notes);
      userId = userId ?? parseAddOnUserIdFromNotes(notes);
      if (
        !marketFromNotes &&
        (notes?.[STUDIO_ADD_ON_NOTE_MARKET] === "india" ||
          notes?.[STUDIO_ADD_ON_NOTE_MARKET] === "international")
      ) {
        marketFromNotes = notes[
          STUDIO_ADD_ON_NOTE_MARKET
        ] as MembershipPricingMarket;
      }
    } catch (error) {
      logger.warn(
        { err: error, orderId: payment.order_id, paymentId: payment.id },
        "Unable to fetch Razorpay order for add-on payment notes",
      );
    }
  }

  if (!product || !userId) {
    return { handled: false, grantedCredits: 0 };
  }

  const market: MembershipPricingMarket = marketFromNotes ?? "international";
  if (
    !assertAddOnPaymentMatchesOrder({
      product,
      market,
      paymentAmount: payment.amount,
      paymentCurrency: payment.currency,
    })
  ) {
    logger.warn(
      {
        paymentId: payment.id,
        product,
        market,
        amount: payment.amount,
        currency: payment.currency,
      },
      "Add-on payment amount/currency mismatch — no credits granted",
    );
    return { handled: true, grantedCredits: 0 };
  }

  const credits = expectedAddOnCredits(product);
  const startsAt = new Date();
  const expiresAt =
    product === "studioPass" ? studioPassExpiresAt(startsAt) : null;
  const reasonCode =
    product === "studioPass"
      ? StudioCreditReasonCode.STUDIO_PASS_ALLOCATION
      : StudioCreditReasonCode.TOP_UP_ALLOCATION;

  const sourceReference = addOnPaymentSourceReference(payment.id);

  const runGrant = async () => {
    const grant = await grantCreditAllocation({
      userId,
      reasonCode,
      credits,
      sourceReference,
      startsAt,
      expiresAt,
    });

    const grantedCredits = grant.created ? credits : 0;
    logger.info(
      {
        userId,
        product,
        paymentId: payment.id,
        sourceReference,
        grantedCredits,
        created: grant.created,
        allowance:
          product === "studioPass"
            ? MembershipCreditAllowances.studioPass
            : MembershipCreditAllowances.topUp,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
      "Razorpay add-on allocation processed",
    );
    return { handled: true, grantedCredits };
  };

  return withPaymentGrantLock(payment.id, runGrant);
}
