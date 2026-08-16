/**
 * Schedule Studio Pro for the next Basic billing date (future-start subscription).
 * Distinct from one-time Order checkout and from normal new Pro subscriptions.
 */

import { apiUrl } from '@/lib/api-base-url';
import { CLIENT_TIMEZONE_HEADER } from '@/lib/fetch-pricing-market';
import { browserTimeZone } from '@/lib/pricing-market';
import type { MembershipPricingMarket } from '@workspace/studio-credit-engine';

export {
  formatMembershipBillingDate,
  scheduledProNeedsCheckout,
} from '@/lib/schedule-studio-pro-copy';

export type ScheduledMembershipUpgradeCheckout = {
  subscriptionId: string;
  keyId: string;
  plan: 'pro';
  studioTier: 'enterprise';
  status: string;
  shortUrl: string | null;
  startAt: string;
  basicSubscriptionId: string;
  alreadyScheduled: boolean;
  market: MembershipPricingMarket;
};

export type MembershipSubscriptionStatus = {
  studioPlan: 'basic' | 'pro' | null;
  studioTier: 'pro' | 'enterprise' | null;
  status: string | null;
  currentEnd: string | null;
  subscriptionId: string | null;
  cancelAtCycleEnd: boolean;
  cancelEffectiveAt: string | null;
  scheduledPro: {
    subscriptionId: string;
    status: string;
    startAt: string | null;
  } | null;
};

export type MembershipCancellationResult = {
  subscriptionId: string;
  studioPlan: 'basic' | 'pro';
  status: string;
  cancelAtCycleEnd: true;
  cancelEffectiveAt: string;
};

function timezoneHeaders(): HeadersInit | undefined {
  const timeZone = browserTimeZone();
  return timeZone ? { [CLIENT_TIMEZONE_HEADER]: timeZone } : undefined;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error: unknown }).error === 'string'
  ) {
    const message = (payload as { error: string }).error.trim();
    if (message) return message;
  }
  return fallback;
}

export async function scheduleStudioProUpgrade(): Promise<ScheduledMembershipUpgradeCheckout> {
  const response = await fetch(apiUrl('/api/payments/subscriptions/schedule-pro'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...timezoneHeaders(),
    },
    body: JSON.stringify({}),
  });

  const payload = (await response.json().catch(() => null)) as
    | ScheduledMembershipUpgradeCheckout
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      readErrorMessage(
        payload,
        'Unable to schedule Studio Pro. Your Studio Basic membership is unchanged.',
      ),
    );
  }

  return payload as ScheduledMembershipUpgradeCheckout;
}

export async function fetchMembershipSubscriptionStatus(): Promise<MembershipSubscriptionStatus> {
  const response = await fetch(apiUrl('/api/payments/subscriptions/membership'), {
    method: 'GET',
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => null)) as
    | MembershipSubscriptionStatus
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, 'Unable to load membership status.'));
  }

  return payload as MembershipSubscriptionStatus;
}

export async function cancelMembershipRenewalAtCycleEnd(): Promise<MembershipCancellationResult> {
  const response = await fetch(apiUrl('/api/payments/subscriptions/cancel'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const payload = (await response.json().catch(() => null)) as
    | MembershipCancellationResult
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      readErrorMessage(
        payload,
        'Unable to cancel membership renewal. Your membership is unchanged.',
      ),
    );
  }

  return payload as MembershipCancellationResult;
}
