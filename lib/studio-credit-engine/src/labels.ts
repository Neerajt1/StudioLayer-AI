import { creditCostForGenerationType, creditCostForImageCount } from './costs';
import type { GenerationType, ImageCount } from './rules';

function pluralCredits(count: number): string {
  return count === 1 ? 'Studio Credit' : 'Studio Credits';
}

/** Workspace hover label — e.g. "✦ Uses 2 Studio Credits" */
export function workspaceCreditTooltip(imageCount: ImageCount): string {
  const cost = creditCostForImageCount(imageCount);
  return `✦ Uses ${cost} ${pluralCredits(cost)}`;
}

/** Gallery accounting strip — generation cost for a type. */
export function galleryGenerationCreditLabel(generationType: GenerationType): number {
  return creditCostForGenerationType(generationType);
}

export function formatStudioCredits(count: number): string {
  return `${count} ${pluralCredits(count)}`;
}

/** Membership transparency copy — one creative step. */
export function creativeStepCreditCopy(): string {
  return 'Every creative step uses 1 Studio Credit. A creative step includes generating or refining an image.';
}
