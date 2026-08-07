import {
  membershipAllowanceLabel,
  membershipAllowanceForTier,
  membershipCreditsRemaining,
  finishedImagesOutcomeLabel,
  estimateFinishedImagesFromAllowance,
  MembershipCreditAllowances,
} from '@workspace/studio-credit-engine';

export {
  membershipAllowanceForTier,
  membershipCreditsRemaining,
  membershipAllowanceLabel,
  finishedImagesOutcomeLabel,
  estimateFinishedImagesFromAllowance,
  MembershipCreditAllowances,
};

export function isActiveMembership(tier: string): boolean {
  return tier === 'pro' || tier === 'enterprise';
}

export function membershipLabel(tier: string): string {
  if (tier === 'free') return 'Complimentary Studio';
  if (tier === 'pro') return 'Studio Basic';
  return 'Studio Pro';
}

/** @deprecated Use membershipAllowanceLabel */
export function membershipCreditsAllowanceLabel(tier: string): string {
  return membershipAllowanceLabel(tier);
}
