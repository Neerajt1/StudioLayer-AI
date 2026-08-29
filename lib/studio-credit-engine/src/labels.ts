import {
  creditCostForCustomCampaign,
  creditCostForGenerationType,
  creditCostForImageCount,
  creditCostForRemoveBackground,
} from './costs';
import { formatCreditAmount } from './credit-units';
import type { GenerationType, ImageCount } from './rules';

function pluralCredits(count: number): string {
  return count === 1 ? 'Studio Credit' : 'Studio Credits';
}

/** Credit amounts may be fractional — "1.5", never "1.50". */
function creditAmountText(count: number): string {
  return formatCreditAmount(count);
}

/** Workspace hover label — e.g. "✦ Uses 2 Studio Credits" */
export function workspaceCreditTooltip(imageCount: ImageCount): string {
  const cost = creditCostForImageCount(imageCount);
  return `✦ Uses ${creditAmountText(cost)} ${pluralCredits(cost)}`;
}

/** Custom Campaign credit label for the stepper control. */
export function workspaceCreditTooltipForCustomCampaign(imageCount: number): string {
  const cost = creditCostForCustomCampaign(imageCount);
  return `✦ Uses ${creditAmountText(cost)} ${pluralCredits(cost)}`;
}

/** Gallery accounting strip — generation cost for a type. */
export function galleryGenerationCreditLabel(generationType: GenerationType): number {
  return creditCostForGenerationType(generationType);
}

export function formatStudioCredits(count: number): string {
  return `${creditAmountText(count)} ${pluralCredits(count)}`;
}

/** Post-production step cost — e.g. Remove Background → "Studio Credit 1". */
export function postProductionStudioCreditLabel(
  cost: number = creditCostForRemoveBackground(),
): string {
  return `Studio Credit ${creditAmountText(cost)}`;
}

/** Membership transparency copy — one creative step. */
/** Membership transparency copy — canonical generation economics. */
export function creativeStepCreditCopy(): string {
  return '2K generation uses 1.5 Studio Credits. 4K uses 3 Studio Credits. Remove Background uses 1 Studio Credit.';
}
