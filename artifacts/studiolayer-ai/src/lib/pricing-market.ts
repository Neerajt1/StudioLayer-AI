/**
 * Membership pricing-display market — hint only, never stored on the account.
 *
 * Priority: reliable country code → timezone fallback → international.
 */

export type BrowserPricingMarket = 'india' | 'international';

const INDIA_COUNTRY_CODE = 'IN';
const REJECTED_COUNTRY_CODES = new Set(['XX', 'T1']);
const INDIA_TIMEZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta']);

/** ISO 3166-1 alpha-2 only. Rejects empty, malformed, XX, and T1. */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (REJECTED_COUNTRY_CODES.has(code)) return null;
  return code;
}

export function isIndiaTimezone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  return INDIA_TIMEZONES.has(timeZone.trim());
}

export function resolvePricingMarket(input: {
  countryCode?: string | null;
  timeZone?: string | null;
}): BrowserPricingMarket {
  const country = normalizeCountryCode(input.countryCode ?? null);
  if (country) {
    return country === INDIA_COUNTRY_CODE ? 'india' : 'international';
  }
  if (isIndiaTimezone(input.timeZone)) {
    return 'india';
  }
  return 'international';
}

export function pricingMarketFromTimezone(
  timeZone: string | undefined | null,
): BrowserPricingMarket {
  return resolvePricingMarket({ timeZone });
}

export function pricingMarketFromBrowserTimezone(): BrowserPricingMarket {
  try {
    return resolvePricingMarket({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return 'international';
  }
}

export function browserTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && timeZone.trim() ? timeZone : null;
  } catch {
    return null;
  }
}
