import {
  DEFAULT_OUTPUT_RESOLUTION,
  imageCountToGenerationType,
  resolveGenerationCreditCost,
  type GenerationType,
  type ImageCount,
  type OutputResolution,
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
  imageCount: number,
  options?: { customCampaign?: boolean; outputResolution?: OutputResolution },
): RenderLedgerMetadata {
  if (parentRenderId != null && parentMetadata) {
    return {
      generationType: parentMetadata.generationType,
      studioCreditsUsed: parentMetadata.studioCreditsUsed,
      refinementCount: parentMetadata.refinementCount + 1,
    };
  }

  const outputResolution = options?.outputResolution ?? DEFAULT_OUTPUT_RESOLUTION;

  if (options?.customCampaign) {
    return {
      generationType: "campaign",
      studioCreditsUsed: resolveGenerationCreditCost({
        imageCount,
        customCampaign: true,
        outputResolution,
      }),
      refinementCount: 0,
    };
  }

  const generationType = imageCountToGenerationType(imageCount as ImageCount);
  return {
    generationType,
    studioCreditsUsed: resolveGenerationCreditCost({
      imageCount,
      outputResolution,
    }),
    refinementCount: 0,
  };
}
