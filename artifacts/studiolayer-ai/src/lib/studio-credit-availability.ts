/**
 * Studio Workspace — credit availability for generation options.
 * Uses API remaining when present; never invents credit costs.
 */

import {
  membershipCreditsRemaining,
  resolveGenerationCreditCost,
  resolveStudioAdminFlag,
  type OutputResolution,
} from '@workspace/studio-credit-engine';

export type StudioCreditUsageLike = {
  remaining?: number | null;
  used?: number;
  limit?: number | null;
  tier?: string;
  isAdmin?: boolean | null;
  canRender?: boolean;
} | null | undefined;

export type StudioCreditUserLike = {
  isAdmin?: boolean | null;
} | null | undefined;

/** Spendable Studio Credits for entitlement checks (admins are unrestricted). */
export function resolveAvailableStudioCreditsForGate(
  usage: StudioCreditUsageLike,
  user?: StudioCreditUserLike,
): number {
  if (resolveStudioAdminFlag(user, usage)) {
    return Number.POSITIVE_INFINITY;
  }
  if (usage?.remaining != null && Number.isFinite(usage.remaining)) {
    return Math.max(0, usage.remaining);
  }
  return membershipCreditsRemaining(
    usage?.tier ?? 'free',
    usage?.used ?? 0,
    usage?.limit ?? null,
  );
}

export function hasSufficientStudioCreditsForCost(
  usage: StudioCreditUsageLike,
  requiredCredits: number,
  user?: StudioCreditUserLike,
): boolean {
  if (requiredCredits <= 0) return true;
  return (
    resolveAvailableStudioCreditsForGate(usage, user) >= requiredCredits
  );
}

/** Cost for a preset shoot type at the current resolution. */
export function generationCreditCostForShootType(input: {
  imageCount: 1 | 2 | 4;
  outputResolution: OutputResolution;
}): number {
  return resolveGenerationCreditCost({
    imageCount: input.imageCount,
    customCampaign: false,
    outputResolution: input.outputResolution,
  });
}

/** Cost for Custom Campaign at the current resolution. */
export function generationCreditCostForCustomCampaign(input: {
  imageCount: number;
  outputResolution: OutputResolution;
}): number {
  return resolveGenerationCreditCost({
    imageCount: input.imageCount,
    customCampaign: true,
    outputResolution: input.outputResolution,
  });
}
