import { StudioCreditRules } from './rules';

/** Monthly / product allowances — commercial configuration (not per-action costs). */
export const MembershipCreditAllowances = {
  complimentary: 1,
  basic: 120,
  pro: 240,
  studioPass: 40,
  topUp: 35,
} as const;

/** Default credits invested per finished image (hero + up to 3 refinements). */
export const DEFAULT_CREDITS_PER_FINISHED_IMAGE =
  StudioCreditRules.hero + 3 * StudioCreditRules.refine;

export function membershipAllowanceForTier(
  tier: string,
  limit: number | null,
): number {
  if (tier === 'free') return MembershipCreditAllowances.complimentary;
  if (limit != null) return limit;
  if (tier === 'pro') return MembershipCreditAllowances.basic;
  if (tier === 'enterprise') return MembershipCreditAllowances.pro;
  return 0;
}

export function membershipCreditsRemaining(
  tier: string,
  used: number,
  limit: number | null,
): number {
  return Math.max(0, membershipAllowanceForTier(tier, limit) - used);
}

export function membershipAllowanceLabel(tier: string): string {
  if (tier === 'pro') {
    return `${MembershipCreditAllowances.basic} Studio Credits`;
  }
  if (tier === 'enterprise') {
    return `${MembershipCreditAllowances.pro} Studio Credits`;
  }
  return `${MembershipCreditAllowances.complimentary} Studio Credit`;
}

/** Estimated finished images from allowance — derived from official credit rules. */
export function estimateFinishedImagesFromAllowance(
  allowanceCredits: number,
  creditsPerFinishedImage = DEFAULT_CREDITS_PER_FINISHED_IMAGE,
): number {
  if (creditsPerFinishedImage <= 0) return 0;
  return Math.floor(allowanceCredits / creditsPerFinishedImage);
}

export function finishedImagesOutcomeLabel(allowanceCredits: number): string {
  const count = estimateFinishedImagesFromAllowance(allowanceCredits);
  return `Create up to ${count} finished images`;
}

export function compactFinishedImagesLabel(allowanceCredits: number): string {
  const count = estimateFinishedImagesFromAllowance(allowanceCredits);
  return `≈${count} Finished Images`;
}

export type MembershipPricingMarket = 'india' | 'international';

/** Frozen membership prices — display only. Not FX conversion. */
export const MembershipMarketPricing = {
  india: {
    currency: 'INR',
    basicMonthly: '₹3,999',
    proMonthly: '₹6,999',
  },
  international: {
    currency: 'USD',
    basicMonthly: '$49',
    proMonthly: '$79',
  },
} as const;

export function membershipPlanDisplayPrice(
  plan: 'basic' | 'pro',
  market: MembershipPricingMarket,
): string {
  const prices = MembershipMarketPricing[market];
  return plan === 'basic' ? prices.basicMonthly : prices.proMonthly;
}

/** International display defaults. Studio Pass / Top-Up are not market-priced yet. */
export const MembershipDisplayPricing = {
  basicMonthly: MembershipMarketPricing.international.basicMonthly,
  proMonthly: MembershipMarketPricing.international.proMonthly,
  studioPass: '$35',
  topUp: '$20',
} as const;
