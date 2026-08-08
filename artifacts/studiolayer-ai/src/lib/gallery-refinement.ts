// ---------------------------------------------------------------------------
// Gallery refinement — reuse Studio API with render-row metadata
// ---------------------------------------------------------------------------

import type { RefinementType } from '@/lib/refinement-types';
import type { CreativeLedgerCardRender } from '@/components/gallery/creative-ledger-card';

/** Build POST /renders payload for Gallery-initiated refinements. */
export function buildGalleryRefinementRequest(
  render: CreativeLedgerCardRender,
  refinementType: RefinementType,
) {
  const sourceImageUrl = render.sourceImageUrl;
  if (!sourceImageUrl) {
    throw new Error('Gallery render is missing sourceImageUrl');
  }

  return {
    sourceImageUrl,
    modelPersona: (render.modelPersona ?? 'confident_commercial') as 'confident_commercial',
    locationEnvironment: (render.locationEnvironment ?? 'photo_studio') as 'photo_studio',
    smartLighting: true,
    imageDimensions: 'portrait_45' as const,
    parentRenderId: render.id,
    refinementType,
  };
}
