import { fromCreditMinorUnits } from "@workspace/studio-credit-engine";
import type {
  Render,
  RenderDeletionEvent,
  StudioCreditAllocation,
  StudioCreditTransaction,
} from "@workspace/db";

/**
 * THE credit-unit boundary.
 *
 * Studio Credits are stored as integer minor units (100 = 1 credit), but every
 * consumer above the database — statements, sheets, exports, Gallery, admin
 * views, API responses and the UI — reasons in credits. Rows are normalised
 * here, immediately after loading, so no downstream module has to know the
 * storage unit and no two surfaces can disagree about what a number means.
 *
 * This is the ONLY place database rows are converted. Do not add a competing
 * conversion elsewhere: a second boundary is how 1.5 becomes 150 on one screen
 * and 1.5 on another.
 *
 * These conversions are lossless — minor units are integers, and dividing by
 * 100 returns the exact credit amount that was charged.
 */
export function toCreditDenominatedTransactions(
  rows: readonly StudioCreditTransaction[],
): StudioCreditTransaction[] {
  return rows.map((row) => ({
    ...row,
    amount: fromCreditMinorUnits(row.amount),
  }));
}

export function toCreditDenominatedRenders(
  rows: readonly Render[],
): Render[] {
  return rows.map((row) => ({
    ...row,
    studioCreditsUsed: fromCreditMinorUnits(row.studioCreditsUsed),
  }));
}

export function toCreditDenominatedDeletionEvents(
  rows: readonly RenderDeletionEvent[],
): RenderDeletionEvent[] {
  return rows.map((row) => ({
    ...row,
    originalCreditsConsumed: fromCreditMinorUnits(row.originalCreditsConsumed),
  }));
}

export function toCreditDenominatedAllocations(
  rows: readonly StudioCreditAllocation[],
): StudioCreditAllocation[] {
  return rows.map((row) => ({
    ...row,
    originalAmount: fromCreditMinorUnits(row.originalAmount),
    remainingAmount: fromCreditMinorUnits(row.remainingAmount),
  }));
}

/**
 * Convert a single stored credit amount.
 *
 * For projections that select individual amount columns rather than whole
 * rows, such as the transaction-master loaders and admin queries.
 */
export function toCreditDenominatedAmount(minorUnits: number): number {
  return fromCreditMinorUnits(minorUnits);
}

/** Convert an optional stored credit amount, preserving null. */
export function toCreditDenominatedAmountOrNull(
  minorUnits: number | null | undefined,
): number | null {
  if (minorUnits == null) return null;
  return fromCreditMinorUnits(minorUnits);
}
