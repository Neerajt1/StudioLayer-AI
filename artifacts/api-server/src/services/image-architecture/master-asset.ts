// ---------------------------------------------------------------------------
// StudioLayer AI — Standard Image Architecture (Batch 23)
//
// Platform master asset standard: 3200 × 4000 px (4:5).
// The first generated image is the immutable Master Asset — all derivatives
// (crops, AI refinements, future exports) branch from it.
// ---------------------------------------------------------------------------

/** Permanent platform output standard for every generation. */
export const PLATFORM_MASTER_WIDTH = 3200;
export const PLATFORM_MASTER_HEIGHT = 4000;
export const PLATFORM_ASPECT_RATIO = 4 / 5;
export const PLATFORM_ASPECT_LABEL = "4:5";

/** Injected into OpenRouter generation and refinement prompts. */
export const PLATFORM_IMAGE_STANDARD_INSTRUCTION = `
PLATFORM IMAGE STANDARD — MASTER ASSET (MANDATORY):

Every output must be exactly ${PLATFORM_MASTER_WIDTH} × ${PLATFORM_MASTER_HEIGHT} pixels (${PLATFORM_ASPECT_LABEL} aspect ratio).
This is the permanent StudioLayer AI platform standard for Hero, Campaign, and Editorial generations.
Output at full resolution — suitable for e-commerce, editorial, catalogues, print, Instagram, and marketplaces.
Do not crop, letterbox, pad, stretch, or distort to a different aspect ratio.
Preserve original composition and framing within the ${PLATFORM_ASPECT_LABEL} frame.
The first generated image is the Master Asset — never resize below this standard.`;

/** Appended to every AI refinement — preserves master dimensions. */
export const REFINEMENT_MASTER_ASSET_PRESERVATION = `
MASTER ASSET PRESERVATION — REFINEMENT (MANDATORY):

Preserve exact resolution (${PLATFORM_MASTER_WIDTH} × ${PLATFORM_MASTER_HEIGHT}), aspect ratio (${PLATFORM_ASPECT_LABEL}),
and image framing from Reference Image 3 unless explicitly performing Remove Background.
Do not accidentally resize, distort, re-crop, or change composition.
The refinement creates a child variant — the Master Asset remains immutable and is never overwritten.
Preserve colours, garment, identity, background (except Remove Background), and metadata lineage.`;

export interface MasterAssetMetadata {
  masterRenderId: number;
  width: number;
  height: number;
  aspectRatio: string;
  generationSessionId: string | null;
  generationType: string;
}

/** Minimal render row shape for master resolution. */
export interface RenderLineageNode {
  id: number;
  parentRenderId: number | null;
  generationSessionId?: string | null;
  generationType?: string | null;
}

/**
 * Walks the parent chain to find the Master Asset (root render with no parent).
 * All AI variants are children of the Master Asset in the asset tree.
 */
export function resolveMasterRenderId(
  render: RenderLineageNode,
  lookupParent: (id: number) => RenderLineageNode | null | undefined,
): number {
  let current: RenderLineageNode = render;

  while (current.parentRenderId != null) {
    const parent = lookupParent(current.parentRenderId);
    if (!parent) break;
    current = parent;
  }

  return current.id;
}

export function buildMasterAssetMetadata(master: RenderLineageNode): MasterAssetMetadata {
  return {
    masterRenderId: master.id,
    width: PLATFORM_MASTER_WIDTH,
    height: PLATFORM_MASTER_HEIGHT,
    aspectRatio: PLATFORM_ASPECT_LABEL,
    generationSessionId: master.generationSessionId ?? null,
    generationType: master.generationType ?? "hero",
  };
}

/** True when this render row is the immutable Master Asset. */
export function isMasterAsset(render: Pick<RenderLineageNode, "parentRenderId">): boolean {
  return render.parentRenderId == null;
}

/**
 * Walks the parent chain in the database to resolve the Master Asset row.
 * Used when inserting AI refinement variants — all variants link to the master.
 */
export async function resolveMasterRenderFromDb<T extends RenderLineageNode>(
  startRender: T,
  fetchParent: (parentRenderId: number) => Promise<T | null | undefined>,
): Promise<T> {
  let current = startRender;

  while (current.parentRenderId != null) {
    const parent = await fetchParent(current.parentRenderId);
    if (!parent) break;
    current = parent;
  }

  return current;
}

/** Asset variant kind for logging and future export modules. */
export type AssetVariantKind =
  | "master"
  | "crop"
  | "remove_background"
  | "enhance_model_face"
  | "enhance_garment"
  | "future";
