/**
 * Membership subscription status + Basic → Pro upgrade checkout helpers.
 */

import { apiUrl } from '@/lib/api-base-url';
import { CLIENT_TIMEZONE_HEADER } from '@/lib/fetch-pricing-market';
import { browserTimeZone } from '@/lib/pricing-market';
import type { MembershipPricingMarket } from '@workspace/studio-credit-engine';

export type MembershipSubscriptionStatus = {
  studioPlan: 'basic' | 'pro' | null;
  studioTier: 'pro' | 'enterprise' | null;
  status: string | null;
  pendingUpgradePlan: 'pro' | null;
  currentEnd: string | null;
  subscriptionId: string | null;
};

export type MembershipUpgradeToProResult = {
  subscriptionId: string;
  currentPlan: 'basic';
  scheduledPlan: 'pro';
  pendingRazorpayPlanId: string | null;
  status: string;
  alreadyScheduled: boolean;
  currentEnd: string | null;
  orderId: string | null;
  keyId: string | null;
  amount: number | null;
  currency: 'INR' | 'USD' | null;
  market: MembershipPricingMarket | null;
};

function timezoneHeaders(): HeadersInit | undefined {
  const timeZone = browserTimeZone();
  return timeZone ? { [CLIENT_TIMEZONE_HEADER]: timeZone } : undefined;
}

export function formatMembershipBillingDate(iso: string | null): string {
  if (!iso) return 'your next billing date';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'your next billing date';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export async function fetchMembershipSubscriptionStatus(): Promise<MembershipSubscriptionStatus | null> {
  try {
    const response = await fetch(apiUrl('/api/payments/subscriptions/membership'), {
      credentials: 'include',
    });
    if (!response.ok) return null;
    return (await response.json()) as MembershipSubscriptionStatus;
  } catch {
    return null;
  }
}

export async function startStudioProUpgradeCheckout(): Promise<MembershipUpgradeToProResult> {
  const response = await fetch(apiUrl('/api/payments/subscriptions/upgrade-to-pro'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...timezoneHeaders(),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | MembershipUpgradeToProResult
    | { error?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Unable to start Studio Pro upgrade.';
    throw new Error(message);
  }

  return payload as MembershipUpgradeToProResult;
}
