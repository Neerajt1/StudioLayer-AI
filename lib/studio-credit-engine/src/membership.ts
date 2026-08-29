import { IMAGE_GENERATION_CREDITS_PER_IMAGE, StudioCreditRules } from './rules';
import { formatCreditAmount } from './credit-units';
import {
  DEFAULT_OUTPUT_RESOLUTION,
  resolutionCreditMultiplier,
  type OutputResolution,
} from './resolution';

/**
 * Monthly / product allowances — commercial configuration (not per-action costs).
 *
 * The complimentary grant is deliberately equal to one 2K image so a new Studio
 * can create exactly once before choosing a membership. It is not stored as an
 * allocation lot: the free-tier balance is the lifetime residual of this
 * allowance minus lifetime usage.
 */
export const MembershipCreditAllowances = {
  complimentary: IMAGE_GENERATION_CREDITS_PER_IMAGE,
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
  return `${formatCreditAmount(MembershipCreditAllowances.complimentary)} Studio Credits`;
}

/** Estimated finished images from allowance — derived from official credit rules. */
export function estimateFinishedImagesFromAllowance(
  allowanceCredits: number,
  creditsPerFinishedImage = DEFAULT_CREDITS_PER_FINISHED_IMAGE,
): number {
  if (creditsPerFinishedImage <= 0) return 0;
  return Math.floor(allowanceCredits / creditsPerFinishedImage);
}

/**
 * Images an allowance buys at a given resolution — the membership/marketing
 * quantity.
 *
 * Rounds to the nearest whole image rather than truncating: 40 credits buys
 * 26.67 images at 2K and the product presents that as 27. This is a
 * presentation figure only; nothing bills against it.
 */
export function estimateImagesAtResolution(
  allowanceCredits: number,
  resolution: OutputResolution = DEFAULT_OUTPUT_RESOLUTION,
): number {
  const perImage =
    IMAGE_GENERATION_CREDITS_PER_IMAGE * resolutionCreditMultiplier(resolution);
  if (perImage <= 0) return 0;
  return Math.round(allowanceCredits / perImage);
}

/** Membership copy — e.g. "Create up to 80 images at 2K". */
export function imagesAtResolutionOutcomeLabel(
  allowanceCredits: number,
  resolution: OutputResolution = DEFAULT_OUTPUT_RESOLUTION,
): string {
  return `Create up to ${estimateImagesAtResolution(allowanceCredits, resolution)} images at ${resolution}`;
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
    studioPass: '₹2,499',
    topUp: '₹1,899',
  },
  international: {
    currency: 'USD',
    basicMonthly: '$49',
    proMonthly: '$79',
    studioPass: '$35',
    topUp: '$20',
  },
} as const;

export function membershipPlanDisplayPrice(
  plan: 'basic' | 'pro',
  market: MembershipPricingMarket,
): string {
  const prices = MembershipMarketPricing[market];
  return plan === 'basic' ? prices.basicMonthly : prices.proMonthly;
}

export function membershipAddOnDisplayPrice(
  product: 'studioPass' | 'topUp',
  market: MembershipPricingMarket,
): string {
  return MembershipMarketPricing[market][product];
}

/**
 * Frozen Pass / Top-Up charge amounts in the smallest currency unit
 * (INR paise / USD cents). Display prices are GST-inclusive — do not add tax.
 */
export const MembershipAddOnChargeAmounts = {
  india: {
    currency: 'INR' as const,
    studioPass: 249_900,
    topUp: 189_900,
  },
  international: {
    currency: 'USD' as const,
    studioPass: 3_500,
    topUp: 2_000,
  },
} as const;

export type StudioAddOnProductId = 'studioPass' | 'topUp';

export function membershipAddOnCharge(input: {
  product: StudioAddOnProductId;
  market: MembershipPricingMarket;
}): { amount: number; currency: 'INR' | 'USD' } {
  const table = MembershipAddOnChargeAmounts[input.market];
  return {
    amount: table[input.product],
    currency: table.currency,
  };
}

/** International display defaults for surfaces that are not market-aware yet. */
export const MembershipDisplayPricing = {
  basicMonthly: MembershipMarketPricing.international.basicMonthly,
  proMonthly: MembershipMarketPricing.international.proMonthly,
  studioPass: MembershipMarketPricing.international.studioPass,
  topUp: MembershipMarketPricing.international.topUp,
} as const;
