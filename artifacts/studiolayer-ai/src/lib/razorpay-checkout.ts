/**
 * Lazily load Razorpay Checkout.js and open Subscription Checkout.
 * Uses only the public keyId returned by the API — never a server secret.
 */

const RAZORPAY_CHECKOUT_SCRIPT_ID = 'razorpay-checkout-js';
const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Safety net if Checkout never fires success, dismiss, or payment.failed. */
export const SUBSCRIPTION_CHECKOUT_SAFETY_TIMEOUT_MS = 10 * 60 * 1000;

export type RazorpayCheckoutSuccessResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
};

/**
 * Safe subset of Razorpay `payment.failed` payload.
 * Never includes card, OTP, CVV, or other sensitive fields.
 */
export type RazorpayCheckoutPaymentFailure = {
  code: string | null;
  description: string | null;
  source: string | null;
  step: string | null;
  reason: string | null;
  paymentId: string | null;
};

type RazorpayCheckoutInstance = {
  open: () => void;
  on?: (event: string, handler: (response: unknown) => void) => void;
};

type RazorpayCheckoutConstructor = new (
  options: Record<string, unknown>,
) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor;
  }
}

type CheckoutScope = {
  Razorpay?: RazorpayCheckoutConstructor;
  document: Document;
};

/**
 * Resolve browser (or test) scope. Uses `globalThis.window` when present so
 * Node tests can inject a mock without a real DOM.
 */
function resolveCheckoutScope(): CheckoutScope {
  const g = globalThis as typeof globalThis & {
    window?: CheckoutScope;
    document?: Document;
    Razorpay?: RazorpayCheckoutConstructor;
  };
  const scope = g.window ?? g;
  if (!scope.document) {
    throw new Error('Razorpay Checkout is only available in the browser');
  }
  return scope as CheckoutScope;
}

function getRazorpayConstructor(scope: CheckoutScope): RazorpayCheckoutConstructor {
  if (!scope.Razorpay) {
    throw new Error('Razorpay Checkout failed to initialize');
  }
  return scope.Razorpay;
}

export async function loadRazorpayCheckout(): Promise<RazorpayCheckoutConstructor> {
  const scope = resolveCheckoutScope();

  if (scope.Razorpay) {
    return scope.Razorpay;
  }

  const existing = scope.document.getElementById(
    RAZORPAY_CHECKOUT_SCRIPT_ID,
  ) as HTMLScriptElement | null;

  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (scope.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Razorpay Checkout')),
        { once: true },
      );
    });
    return getRazorpayConstructor(scope);
  }

  await new Promise<void>((resolve, reject) => {
    const script = scope.document.createElement('script');
    script.id = RAZORPAY_CHECKOUT_SCRIPT_ID;
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
    scope.document.body.appendChild(script);
  });

  return getRazorpayConstructor(scope);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parse Razorpay Checkout `payment.failed` response into a safe failure object.
 * Ignores unknown / sensitive fields.
 */
export function parseRazorpayCheckoutPaymentFailure(
  response: unknown,
): RazorpayCheckoutPaymentFailure {
  const root =
    response && typeof response === 'object'
      ? (response as Record<string, unknown>)
      : null;
  const error =
    root && root.error && typeof root.error === 'object'
      ? (root.error as Record<string, unknown>)
      : root;
  const metadata =
    error && error.metadata && typeof error.metadata === 'object'
      ? (error.metadata as Record<string, unknown>)
      : null;

  return {
    code: asTrimmedString(error?.code),
    description: asTrimmedString(error?.description),
    source: asTrimmedString(error?.source),
    step: asTrimmedString(error?.step),
    reason: asTrimmedString(error?.reason),
    paymentId:
      asTrimmedString(metadata?.payment_id) ??
      asTrimmedString(error?.payment_id),
  };
}

export function membershipPaymentFailedToastCopy(
  failure: RazorpayCheckoutPaymentFailure,
): { title: string; description: string } {
  const detail = failure.description;
  return {
    title: 'Your payment was declined.',
    description: detail
      ? detail
      : 'No payment was completed. You can try again when you are ready.',
  };
}

export function logRazorpaySubscriptionCheckoutFailure(input: {
  subscriptionId: string;
  failure: RazorpayCheckoutPaymentFailure;
  at?: string;
}): void {
  console.warn('[razorpay-subscription-checkout]', {
    event: 'payment_failed',
    subscriptionId: input.subscriptionId,
    code: input.failure.code,
    description: input.failure.description,
    source: input.failure.source,
    step: input.failure.step,
    reason: input.failure.reason,
    paymentId: input.failure.paymentId,
    at: input.at ?? new Date().toISOString(),
  });
}

export function logRazorpaySubscriptionCheckoutTimeout(input: {
  subscriptionId: string;
  at?: string;
}): void {
  console.warn('[razorpay-subscription-checkout]', {
    event: 'checkout_timeout',
    subscriptionId: input.subscriptionId,
    at: input.at ?? new Date().toISOString(),
  });
}

/**
 * Ensures success / dismiss / payment-failed / timeout handlers run at most once.
 */
export function createCheckoutSettlementGuard(): {
  settle: (fn: () => void) => boolean;
  isSettled: () => boolean;
} {
  let settled = false;
  return {
    isSettled: () => settled,
    settle: (fn: () => void) => {
      if (settled) return false;
      settled = true;
      fn();
      return true;
    },
  };
}

export async function openRazorpaySubscriptionCheckout(input: {
  keyId: string;
  subscriptionId: string;
  description: string;
  onSuccess: (response: RazorpayCheckoutSuccessResponse) => void;
  onDismiss: () => void;
  /** Only called for Razorpay Checkout `payment.failed` (actual payment failure). */
  onPaymentFailed?: (failure: RazorpayCheckoutPaymentFailure) => void;
  /** Override safety timeout (tests). Default: {@link SUBSCRIPTION_CHECKOUT_SAFETY_TIMEOUT_MS}. */
  safetyTimeoutMs?: number;
}): Promise<void> {
  const Razorpay = await loadRazorpayCheckout();
  const guard = createCheckoutSettlementGuard();
  const safetyTimeoutMs =
    input.safetyTimeoutMs ?? SUBSCRIPTION_CHECKOUT_SAFETY_TIMEOUT_MS;

  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  const clearSafetyTimer = () => {
    if (safetyTimer != null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };

  const checkout = new Razorpay({
    key: input.keyId,
    subscription_id: input.subscriptionId,
    name: 'StudioLayer AI',
    description: input.description,
    handler: (response: RazorpayCheckoutSuccessResponse) => {
      guard.settle(() => {
        clearSafetyTimer();
        input.onSuccess(response);
      });
    },
    modal: {
      ondismiss: () => {
        guard.settle(() => {
          clearSafetyTimer();
          input.onDismiss();
        });
      },
    },
    theme: {
      color: '#5F785C',
    },
  });

  if (typeof checkout.on === 'function') {
    checkout.on('payment.failed', (response: unknown) => {
      const failure = parseRazorpayCheckoutPaymentFailure(response);
      guard.settle(() => {
        clearSafetyTimer();
        logRazorpaySubscriptionCheckoutFailure({
          subscriptionId: input.subscriptionId,
          failure,
        });
        if (input.onPaymentFailed) {
          input.onPaymentFailed(failure);
        } else {
          input.onDismiss();
        }
      });
    });
  }

  safetyTimer = setTimeout(() => {
    guard.settle(() => {
      clearSafetyTimer();
      logRazorpaySubscriptionCheckoutTimeout({
        subscriptionId: input.subscriptionId,
      });
      input.onDismiss();
    });
  }, safetyTimeoutMs);

  checkout.open();
}

/**
 * One-time Order Checkout for Studio Pass / Top-Up / Membership upgrade.
 * Uses the same settlement guard as subscription checkout so payment.failed,
 * dismiss, success, and timeout each settle at most once.
 */
export async function openRazorpayOrderCheckout(input: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: 'INR' | 'USD';
  description: string;
  onSuccess: (response: RazorpayCheckoutSuccessResponse) => void;
  onDismiss: () => void;
  /** Only called for Razorpay Checkout `payment.failed` (actual payment failure). */
  onPaymentFailed?: (failure: RazorpayCheckoutPaymentFailure) => void;
  /** Override safety timeout (tests). Default: {@link SUBSCRIPTION_CHECKOUT_SAFETY_TIMEOUT_MS}. */
  safetyTimeoutMs?: number;
}): Promise<void> {
  const Razorpay = await loadRazorpayCheckout();
  const guard = createCheckoutSettlementGuard();
  const safetyTimeoutMs =
    input.safetyTimeoutMs ?? SUBSCRIPTION_CHECKOUT_SAFETY_TIMEOUT_MS;

  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  const clearSafetyTimer = () => {
    if (safetyTimer != null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };

  const checkout = new Razorpay({
    key: input.keyId,
    order_id: input.orderId,
    amount: input.amount,
    currency: input.currency,
    name: 'StudioLayer AI',
    description: input.description,
    handler: (response: RazorpayCheckoutSuccessResponse) => {
      guard.settle(() => {
        clearSafetyTimer();
        input.onSuccess(response);
      });
    },
    modal: {
      ondismiss: () => {
        guard.settle(() => {
          clearSafetyTimer();
          input.onDismiss();
        });
      },
    },
    theme: {
      color: '#5F785C',
    },
  });

  if (typeof checkout.on === 'function') {
    checkout.on('payment.failed', (response: unknown) => {
      const failure = parseRazorpayCheckoutPaymentFailure(response);
      guard.settle(() => {
        clearSafetyTimer();
        console.warn('[razorpay-order-checkout]', {
          event: 'payment_failed',
          orderId: input.orderId,
          code: failure.code,
          description: failure.description,
          source: failure.source,
          step: failure.step,
          reason: failure.reason,
          paymentId: failure.paymentId,
          at: new Date().toISOString(),
        });
        if (input.onPaymentFailed) {
          input.onPaymentFailed(failure);
        } else {
          input.onDismiss();
        }
      });
    });
  }

  safetyTimer = setTimeout(() => {
    guard.settle(() => {
      clearSafetyTimer();
      console.warn('[razorpay-order-checkout]', {
        event: 'checkout_timeout',
        orderId: input.orderId,
        at: new Date().toISOString(),
      });
      input.onDismiss();
    });
  }, safetyTimeoutMs);

  checkout.open();
}
