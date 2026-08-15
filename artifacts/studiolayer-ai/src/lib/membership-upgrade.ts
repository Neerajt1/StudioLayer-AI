/**
 * Membership subscription status + Basic → Pro upgrade checkout helpers.
 */

import { apiUrl } from '@/lib/api-base-url';
import { CLIENT_TIMEZONE_HEADER } from '@/lib/fetch-pricing-market';
import { browserTimeZone } from '@/lib/pricing-market';
import type { MembershipPricingMarket } from '@workspace/studio-credit-engine';
import {
  membershipPlanDisplayPrice,
  membershipUpgradeDisplayPrice,
} from '@workspace/studio-credit-engine';
import {
  upgradeAlreadyActiveToastCopy,
  upgradeCardCopy,
  upgradeSuccessToastCopy,
  isImmediateUpgradeFulfilled,
} from '@/lib/membership-upgrade-copy';

export type MembershipSubscriptionStatus = {
  studioPlan: 'basic' | 'pro' | null;
  studioTier: 'pro' | 'enterprise' | null;
  status: string | null;
  pendingUpgradePlan: 'pro' | null;
  currentEnd: string | null;
  subscriptionId: string | null;
  /** Server flag STUDIO_UPGRADE_IMMEDIATE_ENTITLEMENT (default false). */
  immediateUpgradeEntitlement: boolean;
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

export function membershipRenewalDisplayPrice(
  market: MembershipPricingMarket,
): string {
  return membershipPlanDisplayPrice('pro', market);
}

export async function fetchMembershipSubscriptionStatus(): Promise<MembershipSubscriptionStatus | null> {
  try {
    const response = await fetch(apiUrl('/api/payments/subscriptions/membership'), {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<MembershipSubscriptionStatus>;
    return {
      studioPlan: payload.studioPlan ?? null,
      studioTier: payload.studioTier ?? null,
      status: payload.status ?? null,
      pendingUpgradePlan: payload.pendingUpgradePlan ?? null,
      currentEnd: payload.currentEnd ?? null,
      subscriptionId: payload.subscriptionId ?? null,
      immediateUpgradeEntitlement: payload.immediateUpgradeEntitlement === true,
    };
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

export {
  membershipUpgradeDisplayPrice,
  upgradeAlreadyActiveToastCopy,
  upgradeCardCopy,
  upgradeSuccessToastCopy,
  isImmediateUpgradeFulfilled,
};
