/**
 * Pure display helpers for scheduled Basic → Pro (no network imports).
 */

export function formatMembershipBillingDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function scheduledProNeedsCheckout(status: string | null | undefined): boolean {
  return status === 'created' || status === 'pending';
}
