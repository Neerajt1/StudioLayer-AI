import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  createCheckoutSettlementGuard,
  logRazorpaySubscriptionCheckoutFailure,
  membershipPaymentFailedToastCopy,
  openRazorpaySubscriptionCheckout,
  parseRazorpayCheckoutPaymentFailure,
  type RazorpayCheckoutPaymentFailure,
} from './razorpay-checkout.js';

type HandlerMap = {
  success?: (response: unknown) => void;
  dismiss?: () => void;
  paymentFailed?: (response: unknown) => void;
};

function installMockRazorpay(handlers: HandlerMap) {
  const g = globalThis as typeof globalThis & {
    window?: Window &
      typeof globalThis & {
        Razorpay?: new (options: Record<string, unknown>) => {
          open: () => void;
          on: (event: string, handler: (response: unknown) => void) => void;
        };
        document?: Document;
      };
  };

  const previousWindow = g.window;

  class MockRazorpay {
    constructor(options: Record<string, unknown>) {
      handlers.success = options.handler as (response: unknown) => void;
      const modal = options.modal as { ondismiss?: () => void } | undefined;
      handlers.dismiss = modal?.ondismiss;
    }

    open() {}

    on(event: string, handler: (response: unknown) => void) {
      if (event === 'payment.failed') {
        handlers.paymentFailed = handler;
      }
    }
  }

  g.window = {
    ...(previousWindow ?? {}),
    Razorpay: MockRazorpay,
    document: previousWindow?.document ?? ({
      getElementById: () => null,
      body: { appendChild: () => undefined },
      createElement: () => ({
        addEventListener: () => undefined,
      }),
    } as unknown as Document),
  } as typeof g.window;

  return () => {
    g.window = previousWindow;
  };
}

describe('parseRazorpayCheckoutPaymentFailure', () => {
  it('extracts safe fields from payment.failed payload', () => {
    const failure = parseRazorpayCheckoutPaymentFailure({
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'Payment failed',
        source: 'gateway',
        step: 'payment_authorization',
        reason: 'payment_failed',
        metadata: { payment_id: 'pay_test_1', order_id: 'order_x' },
        // Sensitive-looking fields must be ignored by the parser surface.
        card: { number: '4111111111111111', cvv: '123' },
        otp: '999999',
      },
    });

    assert.deepEqual(failure, {
      code: 'BAD_REQUEST_ERROR',
      description: 'Payment failed',
      source: 'gateway',
      step: 'payment_authorization',
      reason: 'payment_failed',
      paymentId: 'pay_test_1',
    });
  });

  it('returns nulls for empty / unknown payloads', () => {
    assert.deepEqual(parseRazorpayCheckoutPaymentFailure(null), {
      code: null,
      description: null,
      source: null,
      step: null,
      reason: null,
      paymentId: null,
    });
  });
});

describe('membershipPaymentFailedToastCopy', () => {
  it('uses declined copy only for payment.failed path (with description)', () => {
    const copy = membershipPaymentFailedToastCopy({
      code: 'BAD_REQUEST_ERROR',
      description: 'Bank declined the payment',
      source: 'bank',
      step: null,
      reason: null,
      paymentId: 'pay_1',
    });
    assert.equal(copy.title, 'Your payment was declined.');
    assert.equal(copy.description, 'Bank declined the payment');
  });

  it('falls back when description is missing', () => {
    const copy = membershipPaymentFailedToastCopy({
      code: null,
      description: null,
      source: null,
      step: null,
      reason: null,
      paymentId: null,
    });
    assert.equal(copy.title, 'Your payment was declined.');
    assert.match(copy.description, /No payment was completed/);
  });
});

describe('createCheckoutSettlementGuard', () => {
  it('runs the first settle only', () => {
    const guard = createCheckoutSettlementGuard();
    let count = 0;
    assert.equal(
      guard.settle(() => {
        count += 1;
      }),
      true,
    );
    assert.equal(
      guard.settle(() => {
        count += 1;
      }),
      false,
    );
    assert.equal(count, 1);
    assert.equal(guard.isSettled(), true);
  });
});

describe('logRazorpaySubscriptionCheckoutFailure', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('logs subscription id, error fields, and timestamp — not card/otp', () => {
    const warn = mock.method(console, 'warn', () => {});
    const failure: RazorpayCheckoutPaymentFailure = {
      code: 'BAD_REQUEST_ERROR',
      description: 'Payment failed',
      source: 'gateway',
      step: 'payment_authorization',
      reason: 'payment_failed',
      paymentId: 'pay_abc',
    };

    logRazorpaySubscriptionCheckoutFailure({
      subscriptionId: 'sub_TQ5FC4TErP0aBW',
      failure,
      at: '2026-08-15T15:32:00.000Z',
    });

    assert.equal(warn.mock.callCount(), 1);
    const [label, payload] = warn.mock.calls[0]!.arguments as [
      string,
      Record<string, unknown>,
    ];
    assert.equal(label, '[razorpay-subscription-checkout]');
    assert.equal(payload.event, 'payment_failed');
    assert.equal(payload.subscriptionId, 'sub_TQ5FC4TErP0aBW');
    assert.equal(payload.code, 'BAD_REQUEST_ERROR');
    assert.equal(payload.description, 'Payment failed');
    assert.equal(payload.paymentId, 'pay_abc');
    assert.equal(payload.at, '2026-08-15T15:32:00.000Z');
    assert.equal('card' in payload, false);
    assert.equal('otp' in payload, false);
    assert.equal('cvv' in payload, false);
  });
});

describe('openRazorpaySubscriptionCheckout failure and lock-release paths', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('payment.failed releases via onPaymentFailed once; later dismiss is ignored', async () => {
    const handlers: HandlerMap = {};
    const restore = installMockRazorpay(handlers);

    let paymentFailedCount = 0;
    let dismissCount = 0;
    let successCount = 0;
    const warn = mock.method(console, 'warn', () => {});

    try {
      await openRazorpaySubscriptionCheckout({
        keyId: 'rzp_test_key',
        subscriptionId: 'sub_test_reuse',
        description: 'Studio Basic',
        onSuccess: () => {
          successCount += 1;
        },
        onDismiss: () => {
          dismissCount += 1;
        },
        onPaymentFailed: () => {
          paymentFailedCount += 1;
        },
        safetyTimeoutMs: 60_000,
      });

      assert.ok(handlers.paymentFailed, 'payment.failed listener registered');
      handlers.paymentFailed!({
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'Payment failed',
          metadata: { payment_id: 'pay_failed_1' },
        },
      });
      handlers.dismiss?.();

      assert.equal(paymentFailedCount, 1);
      assert.equal(dismissCount, 0);
      assert.equal(successCount, 0);
      assert.equal(warn.mock.callCount(), 1);
      const payload = warn.mock.calls[0]!.arguments[1] as Record<string, unknown>;
      assert.equal(payload.subscriptionId, 'sub_test_reuse');
      assert.equal(payload.event, 'payment_failed');
    } finally {
      restore();
    }
  });

  it('dismiss releases via onDismiss without treating it as payment declined', async () => {
    const handlers: HandlerMap = {};
    const restore = installMockRazorpay(handlers);
    let dismissCount = 0;
    let paymentFailedCount = 0;

    try {
      await openRazorpaySubscriptionCheckout({
        keyId: 'rzp_test_key',
        subscriptionId: 'sub_dismiss',
        description: 'Studio Basic',
        onSuccess: () => {},
        onDismiss: () => {
          dismissCount += 1;
        },
        onPaymentFailed: () => {
          paymentFailedCount += 1;
        },
        safetyTimeoutMs: 60_000,
      });

      handlers.dismiss?.();
      assert.equal(dismissCount, 1);
      assert.equal(paymentFailedCount, 0);
    } finally {
      restore();
    }
  });

  it('timeout releases via onDismiss and does not call onPaymentFailed', async () => {
    const handlers: HandlerMap = {};
    const restore = installMockRazorpay(handlers);
    const warn = mock.method(console, 'warn', () => {});
    let dismissCount = 0;
    let paymentFailedCount = 0;

    try {
      await openRazorpaySubscriptionCheckout({
        keyId: 'rzp_test_key',
        subscriptionId: 'sub_timeout',
        description: 'Studio Basic',
        onSuccess: () => {},
        onDismiss: () => {
          dismissCount += 1;
        },
        onPaymentFailed: () => {
          paymentFailedCount += 1;
        },
        safetyTimeoutMs: 20,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.equal(dismissCount, 1);
      assert.equal(paymentFailedCount, 0);
      assert.ok(
        warn.mock.calls.some((call) => {
          const payload = call.arguments[1] as Record<string, unknown>;
          return payload?.event === 'checkout_timeout';
        }),
      );
    } finally {
      restore();
    }
  });

  it('success path still invokes onSuccess once', async () => {
    const handlers: HandlerMap = {};
    const restore = installMockRazorpay(handlers);
    let successCount = 0;

    try {
      await openRazorpaySubscriptionCheckout({
        keyId: 'rzp_test_key',
        subscriptionId: 'sub_ok',
        description: 'Studio Basic',
        onSuccess: (response) => {
          successCount += 1;
          assert.equal(response.razorpay_payment_id, 'pay_ok');
        },
        onDismiss: () => {
          assert.fail('dismiss should not run after success');
        },
        onPaymentFailed: () => {
          assert.fail('payment.failed should not run after success');
        },
        safetyTimeoutMs: 60_000,
      });

      handlers.success?.({
        razorpay_payment_id: 'pay_ok',
        razorpay_subscription_id: 'sub_ok',
      });
      handlers.dismiss?.();

      assert.equal(successCount, 1);
    } finally {
      restore();
    }
  });

  it('without onPaymentFailed, payment.failed still settles via onDismiss (lock release)', async () => {
    const handlers: HandlerMap = {};
    const restore = installMockRazorpay(handlers);
    mock.method(console, 'warn', () => {});
    let dismissCount = 0;

    try {
      await openRazorpaySubscriptionCheckout({
        keyId: 'rzp_test_key',
        subscriptionId: 'sub_fallback',
        description: 'Studio Basic',
        onSuccess: () => {},
        onDismiss: () => {
          dismissCount += 1;
        },
        safetyTimeoutMs: 60_000,
      });

      handlers.paymentFailed?.({
        error: { code: 'BAD_REQUEST_ERROR', description: 'Payment failed' },
      });

      assert.equal(dismissCount, 1);
    } finally {
      restore();
    }
  });
});
