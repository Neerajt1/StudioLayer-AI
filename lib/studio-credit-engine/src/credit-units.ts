/**
 * Studio Credit minor units — the persistence representation.
 *
 * Studio Credits are quoted to customers in whole and fractional credits
 * (a 2K image costs 1.5). They are STORED as integer minor units, one credit
 * being 100 units, exactly as currency is stored in paise or cents. Every
 * Studio Credit column in the database holds minor units.
 *
 * Nothing in the accounting path may store or sum a fractional credit value:
 * integers make totals, comparisons and FIFO allocation decrements exact, and
 * remove any possibility of a 1.5 charge being coerced to 1.
 *
 * Convert at the database boundary only. Business logic and API responses
 * speak credits; storage speaks minor units.
 */
export const CREDIT_MINOR_UNITS_PER_CREDIT = 100;

/**
 * Credits → stored minor units.
 *
 * Rounds to the nearest unit so no representable credit price can drift.
 * Throws on non-finite input rather than persisting a corrupt ledger amount.
 */
export function toCreditMinorUnits(credits: number): number {
  if (!Number.isFinite(credits)) {
    throw new Error(`Invalid Studio Credit amount: ${credits}`);
  }
  return Math.round(credits * CREDIT_MINOR_UNITS_PER_CREDIT);
}

/** Stored minor units → credits. */
export function fromCreditMinorUnits(minorUnits: number): number {
  if (!Number.isFinite(minorUnits)) {
    throw new Error(`Invalid Studio Credit minor-unit amount: ${minorUnits}`);
  }
  return minorUnits / CREDIT_MINOR_UNITS_PER_CREDIT;
}

/**
 * True when a credit amount can be stored without loss.
 * Guards prices introduced later that are finer than 1/100 of a credit.
 */
export function isRepresentableCreditAmount(credits: number): boolean {
  if (!Number.isFinite(credits)) return false;
  return (
    Math.abs(
      credits * CREDIT_MINOR_UNITS_PER_CREDIT
        - Math.round(credits * CREDIT_MINOR_UNITS_PER_CREDIT),
    ) < 1e-9
  );
}

/**
 * Display form for a credit amount — "1.5", "3", "0.5".
 * Trailing zeros are dropped so whole credits never read as "3.00".
 */
export function formatCreditAmount(credits: number): string {
  const rounded = Math.round(credits * CREDIT_MINOR_UNITS_PER_CREDIT)
    / CREDIT_MINOR_UNITS_PER_CREDIT;
  return String(rounded);
}
