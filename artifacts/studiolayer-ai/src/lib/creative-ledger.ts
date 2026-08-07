// ---------------------------------------------------------------------------
// Creative Ledger — accounting helpers (Studio Credit Engine preferred)
// ---------------------------------------------------------------------------

import {
  galleryGenerationCreditLabel,
  type GenerationType,
} from '@workspace/studio-credit-engine';

export interface LedgerRender {
  id: number;
  parentRenderId?: number | null;
  generationSessionId?: string | null;
  studioCreditsUsed?: number;
  refinementCount?: number;
  generationType?: GenerationType;
  createdAt?: string | Date;
  status?: string;
}

export function getAncestorChain<T extends LedgerRender>(
  renders: T[],
  renderId: number,
): T[] {
  const byId = new Map(renders.map((r) => [r.id, r]));
  const chain: T[] = [];
  let current = byId.get(renderId);

  while (current) {
    chain.unshift(current);
    current =
      current.parentRenderId != null
        ? byId.get(current.parentRenderId)
        : undefined;
  }

  return chain;
}

/** Legacy fallback when generation type is unavailable. */
export function estimatedRefinementCount<T extends LedgerRender>(
  renders: T[],
  renderId: number,
): number {
  return Math.max(0, getAncestorChain(renders, renderId).length - 1);
}

/** Resolve Studio Credits for gallery display — Studio Credit Engine first. */
export function studioCreditsForRender<T extends LedgerRender>(render: T): number {
  if (render.generationType) {
    return galleryGenerationCreditLabel(render.generationType);
  }
  if (render.studioCreditsUsed != null) {
    return render.studioCreditsUsed;
  }
  return galleryGenerationCreditLabel('hero');
}

/** Resolve refinement count for display — persisted metadata first. */
export function refinementsForRender<T extends LedgerRender>(
  renders: T[],
  render: T,
): number {
  if (render.refinementCount != null) {
    return render.refinementCount;
  }
  return estimatedRefinementCount(renders, render.id);
}

/** Default portrait ratio; future ratios plug in here without layout redesign. */
export function ledgerAspectRatio(_renderId?: number): string {
  return '4 / 5';
}

/** Completed renders with a public output URL — safe for Gallery display. */
export function filterCompletedRenders<
  T extends { status?: string; outputImageUrl?: string | null },
>(renders: T[]): T[] {
  return renders.filter(
    (render) =>
      render.status === 'completed' &&
      typeof render.outputImageUrl === 'string' &&
      render.outputImageUrl.length > 0,
  );
}

/** Ghost onboarding slots shown until the ledger reaches this many real assets. */
export const GHOST_LEDGER_SLOT_COUNT = 8;

export const CREATIVE_LEDGER_ONBOARDED_KEY = 'studiolayer:creative-ledger-onboarded';

export function ghostSlotCount(realAssetCount: number, onboardingComplete: boolean): number {
  if (onboardingComplete || realAssetCount >= GHOST_LEDGER_SLOT_COUNT) {
    return 0;
  }
  return Math.max(0, GHOST_LEDGER_SLOT_COUNT - realAssetCount);
}

/** Skeleton placeholders while the ledger list is still fetching (no cache yet). */
export function loadingSkeletonCount(
  isInitialLoading: boolean,
  knownAssetCount: number,
): number {
  if (!isInitialLoading) {
    return 0;
  }
  return Math.max(GHOST_LEDGER_SLOT_COUNT, knownAssetCount) - knownAssetCount;
}

/** First row of cards should load images eagerly for faster above-the-fold paint. */
export const LEDGER_EAGER_IMAGE_COUNT = 8;

export function readCreativeLedgerOnboarded(): boolean {
  try {
    return localStorage.getItem(CREATIVE_LEDGER_ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markCreativeLedgerOnboarded(): void {
  try {
    localStorage.setItem(CREATIVE_LEDGER_ONBOARDED_KEY, '1');
  } catch {
    /* ignore storage errors */
  }
}

export interface BillingCycleStats {
  studioCreditsUsed: number;
  imagesCreated: number;
  averageRefinementsPerImage: number;
  creditsRemaining: number;
  studioCreditAllowance: number;
}

export const EMPTY_BILLING_CYCLE_STATS: BillingCycleStats = {
  studioCreditsUsed: 0,
  imagesCreated: 0,
  averageRefinementsPerImage: 0,
  creditsRemaining: 0,
  studioCreditAllowance: 0,
};

/** Merge API cycle stats with live allowance — never estimate credit usage client-side. */
export function mergeBillingCycleStats(
  cycleStats?: Partial<BillingCycleStats> | null,
  creditsRemaining = 0,
  studioCreditAllowance = 0,
): BillingCycleStats {
  return {
    studioCreditsUsed: cycleStats?.studioCreditsUsed ?? 0,
    imagesCreated: cycleStats?.imagesCreated ?? 0,
    averageRefinementsPerImage: cycleStats?.averageRefinementsPerImage ?? 0,
    creditsRemaining,
    studioCreditAllowance,
  };
}
