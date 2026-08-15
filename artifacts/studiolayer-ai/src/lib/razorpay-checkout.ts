/**
 * Lazily load Razorpay Checkout.js and open Subscription Checkout.
 * Uses only the public keyId returned by the API — never a server secret.
 */

const RAZORPAY_CHECKOUT_SCRIPT_ID = 'razorpay-checkout-js';
const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export type RazorpayCheckoutSuccessResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
};

type RazorpayCheckoutInstance = {
  open: () => void;
};

type RazorpayCheckoutConstructor = new (
  options: Record<string, unknown>,
) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor;
  }
}

function getRazorpayConstructor(): RazorpayCheckoutConstructor {
  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout failed to initialize');
  }
  return window.Razorpay;
}

export async function loadRazorpayCheckout(): Promise<RazorpayCheckoutConstructor> {
  if (typeof window === 'undefined') {
    throw new Error('Razorpay Checkout is only available in the browser');
  }

  if (window.Razorpay) {
    return window.Razorpay;
  }

  const existing = document.getElementById(
    RAZORPAY_CHECKOUT_SCRIPT_ID,
  ) as HTMLScriptElement | null;

  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.Razorpay) {
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
    return getRazorpayConstructor();
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = RAZORPAY_CHECKOUT_SCRIPT_ID;
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
    document.body.appendChild(script);
  });

  return getRazorpayConstructor();
}

export async function openRazorpaySubscriptionCheckout(input: {
  keyId: string;
  subscriptionId: string;
  description: string;
  onSuccess: (response: RazorpayCheckoutSuccessResponse) => void;
  onDismiss: () => void;
}): Promise<void> {
  const Razorpay = await loadRazorpayCheckout();

  const checkout = new Razorpay({
    key: input.keyId,
    subscription_id: input.subscriptionId,
    name: 'StudioLayer AI',
    description: input.description,
    handler: (response: RazorpayCheckoutSuccessResponse) => {
      input.onSuccess(response);
    },
    modal: {
      ondismiss: () => {
        input.onDismiss();
      },
    },
    theme: {
      color: '#5F785C',
    },
  });

  checkout.open();
}

/**
 * One-time Order Checkout for Studio Pass / Top-Up (not subscriptions).
 */
export async function openRazorpayOrderCheckout(input: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: 'INR' | 'USD';
  description: string;
  onSuccess: (response: RazorpayCheckoutSuccessResponse) => void;
  onDismiss: () => void;
}): Promise<void> {
  const Razorpay = await loadRazorpayCheckout();

  const checkout = new Razorpay({
    key: input.keyId,
    order_id: input.orderId,
    amount: input.amount,
    currency: input.currency,
    name: 'StudioLayer AI',
    description: input.description,
    handler: (response: RazorpayCheckoutSuccessResponse) => {
      input.onSuccess(response);
    },
    modal: {
      ondismiss: () => {
        input.onDismiss();
      },
    },
    theme: {
      color: '#5F785C',
    },
  });

  checkout.open();
}
