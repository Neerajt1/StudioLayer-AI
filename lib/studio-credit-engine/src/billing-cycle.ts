/**
 * Canonical UTC billing-cycle boundary for paid memberships.
 * All credit usage, ledger stats, and account statements must use this function.
 */
export function billingCycleStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
