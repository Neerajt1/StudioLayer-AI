/**
 * Fetch the server pricing-display hint.
 * Server applies: country header → timezone fallback → international.
 * Never persisted to the account.
 */

import { apiUrl } from '@/lib/api-base-url';
import type { MembershipPricingMarket } from '@workspace/studio-credit-engine';
import {
  browserTimeZone,
  pricingMarketFromBrowserTimezone,
} from '@/lib/pricing-market';

export const CLIENT_TIMEZONE_HEADER = 'X-Client-Timezone';

export async function fetchPricingMarket(): Promise<MembershipPricingMarket> {
  const timeZone = browserTimeZone();
  try {
    const query = timeZone ? `?tz=${encodeURIComponent(timeZone)}` : '';
    const response = await fetch(apiUrl(`/api/pricing/market${query}`), {
      credentials: 'include',
      headers: timeZone ? { [CLIENT_TIMEZONE_HEADER]: timeZone } : undefined,
    });
    if (response.ok) {
      const payload = (await response.json()) as { market?: unknown };
      if (payload.market === 'india' || payload.market === 'international') {
        return payload.market;
      }
    }
  } catch {
    /* timezone fallback only when the country-aware endpoint is unavailable */
  }

  return pricingMarketFromBrowserTimezone();
}
