/**
 * Studio Pass / Top-Up one-time checkout order creation.
 */

import { apiUrl } from '@/lib/api-base-url';
import { CLIENT_TIMEZONE_HEADER } from '@/lib/fetch-pricing-market';
import { browserTimeZone } from '@/lib/pricing-market';
import type {
  MembershipPricingMarket,
  StudioAddOnProductId,
} from '@workspace/studio-credit-engine';

export type StudioAddOnCheckout = {
  orderId: string;
  keyId: string;
  amount: number;
  currency: 'INR' | 'USD';
  product: StudioAddOnProductId;
  market: MembershipPricingMarket;
};

function timezoneHeaders(): HeadersInit | undefined {
  const timeZone = browserTimeZone();
  return timeZone ? { [CLIENT_TIMEZONE_HEADER]: timeZone } : undefined;
}

export async function createStudioAddOnCheckoutOrder(
  product: StudioAddOnProductId,
): Promise<StudioAddOnCheckout> {
  const response = await fetch(apiUrl('/api/payments/add-ons/checkout'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...timezoneHeaders(),
    },
    body: JSON.stringify({ product }),
  });

  const payload = (await response.json().catch(() => null)) as
    | StudioAddOnCheckout
    | { error?: string }
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'Unable to start checkout.';
    throw new Error(message);
  }

  return payload as StudioAddOnCheckout;
}
