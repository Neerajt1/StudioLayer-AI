/**
 * Pricing-display market hint.
 *
 * Priority:
 * 1. Reliable ISO country header / edge country signal
 * 2. Browser timezone (fallback only)
 * 3. International / USD
 *
 * Not stored on the user account. Does not call a geolocation API.
 */

export type PricingMarket = 'india' | 'international';

const INDIA_COUNTRY_CODE = 'IN';
const REJECTED_COUNTRY_CODES = new Set(['XX', 'T1']);
const INDIA_TIMEZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta']);

const COUNTRY_HEADER_NAMES = [
  'CF-IPCountry',
  'CloudFront-Viewer-Country',
  'X-AppEngine-Country',
  'X-Country-Code',
] as const;

export type RequestHeaderMap =
  | { get?(name: string): string | undefined | null }
  | Record<string, unknown>
  | undefined;

function firstHeaderValue(headers: RequestHeaderMap, name: string): string | null {
  if (!headers) return null;

  if (typeof headers.get === 'function') {
    const value = headers.get(name) ?? headers.get(name.toLowerCase());
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  const record = headers as Record<string, unknown>;
  const direct = record[name] ?? record[name.toLowerCase()];
  if (Array.isArray(direct)) {
    const first = direct[0];
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  }
  return typeof direct === 'string' && direct.trim() ? direct.trim() : null;
}

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

export function countryCodeFromRequestHeaders(headers: RequestHeaderMap): string | null {
  for (const name of COUNTRY_HEADER_NAMES) {
    const normalized = normalizeCountryCode(firstHeaderValue(headers, name));
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Country signal wins over timezone. Timezone is used only when no reliable
 * country code is present.
 */
export function resolvePricingMarket(input: {
  countryCode?: string | null;
  timeZone?: string | null;
}): PricingMarket {
  const country = normalizeCountryCode(input.countryCode ?? null);
  if (country) {
    return country === INDIA_COUNTRY_CODE ? 'india' : 'international';
  }
  if (isIndiaTimezone(input.timeZone)) {
    return 'india';
  }
  return 'international';
}

export function pricingMarketFromRequest(
  headers: RequestHeaderMap,
  timeZone?: string | null,
): PricingMarket {
  return resolvePricingMarket({
    countryCode: countryCodeFromRequestHeaders(headers),
    timeZone,
  });
}

/** @deprecated Use pricingMarketFromRequest — headers only, no timezone fallback. */
export function pricingMarketFromRequestHeaders(
  headers: RequestHeaderMap,
): PricingMarket {
  return pricingMarketFromRequest(headers);
}
