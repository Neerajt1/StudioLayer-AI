// ---------------------------------------------------------------------------
// StudioLayer AI — centralized administrator permissions
// Single source of truth for admin bypass of credits, tiers, and gating.
// ---------------------------------------------------------------------------

export type StudioAdminSubject = {
  isAdmin?: boolean | null;
} | null | undefined;

export type StudioUsageSubject = {
  isAdmin?: boolean | null;
  canRender?: boolean;
  tier?: string;
} | null | undefined;

/** True when the user has the StudioLayer administrator role. */
export function isStudioAdmin(subject: StudioAdminSubject): boolean {
  return subject?.isAdmin === true;
}

/** Administrators receive unlimited Studio Credits and generation access. */
export function hasUnlimitedStudioAccess(usage: StudioUsageSubject): boolean {
  return isStudioAdmin(usage);
}

/** Non-admin users blocked when complimentary or paid credits are exhausted. */
export function isStudioCreditLimitBlocked(usage: StudioUsageSubject): boolean {
  if (!usage) return false;
  if (isStudioAdmin(usage)) return false;
  return usage.canRender === false;
}

/** Complimentary (free) tier restrictions — waived for administrators. */
export function isComplimentaryMembershipTier(usage: StudioUsageSubject): boolean {
  if (!usage || isStudioAdmin(usage)) return false;
  return usage.tier === 'free';
}

/** Complimentary credit exhausted modal — never shown to administrators. */
export function isComplimentaryCreditExhausted(usage: StudioUsageSubject): boolean {
  return isComplimentaryMembershipTier(usage) && isStudioCreditLimitBlocked(usage);
}

/** Server-side balance returned for administrator accounts. */
export function adminStudioCreditBalance(): {
  used: number;
  limit: number | null;
  remaining: number;
  canRender: boolean;
} {
  return {
    used: 0,
    limit: null,
    remaining: Infinity,
    canRender: true,
  };
}

/** Shoot types beyond Hero are membership-gated on complimentary tier only. */
export function isPremiumShootTypeLocked(
  usage: StudioUsageSubject,
  imageCount: number,
): boolean {
  return isComplimentaryMembershipTier(usage) && imageCount !== 1;
}

/** Resolve admin from authenticated user profile and/or usage payload. */
export function resolveStudioAdminFlag(
  user: StudioAdminSubject,
  usage: StudioUsageSubject,
): boolean {
  return isStudioAdmin(user) || isStudioAdmin(usage);
}

/** Modal gate — respects admin from either live API source (avoids stale usage cache). */
export function isComplimentaryCreditExhaustedForUser(
  user: StudioAdminSubject,
  usage: StudioUsageSubject,
): boolean {
  if (resolveStudioAdminFlag(user, usage)) return false;
  return isComplimentaryCreditExhausted(usage);
}
