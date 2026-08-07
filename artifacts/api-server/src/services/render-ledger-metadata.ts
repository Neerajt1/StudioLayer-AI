import {
  creditCostForGenerationType,
  imageCountToGenerationType,
  type GenerationType,
  type ImageCount,
} from "@workspace/studio-credit-engine";

export type { GenerationType };

export interface RenderLedgerMetadata {
  generationType: GenerationType;
  /** Display cost for this generation type (from Studio Credit Engine). */
  studioCreditsUsed: number;
  refinementCount: number;
}

/**
 * Computes Creative Ledger fields persisted on each render row.
 *
 * Refinements inherit generation type and credits from the Master Asset.
 * refinementCount increments from the immediate parent (linear version chain).
 */
export function resolveRenderLedgerMetadata(
  parentRenderId: number | null | undefined,
  parentMetadata: RenderLedgerMetadata | null,
  imageCount: ImageCount,
): RenderLedgerMetadata {
  if (parentRenderId != null && parentMetadata) {
    return {
      generationType: parentMetadata.generationType,
      studioCreditsUsed: parentMetadata.studioCreditsUsed,
      refinementCount: parentMetadata.refinementCount + 1,
    };
  }

  const generationType = imageCountToGenerationType(imageCount);
  return {
    generationType,
    studioCreditsUsed: creditCostForGenerationType(generationType),
    refinementCount: 0,
  };
}
