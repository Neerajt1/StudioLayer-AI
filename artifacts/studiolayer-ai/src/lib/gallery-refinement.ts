// ---------------------------------------------------------------------------
// Gallery Remove Background — reuse Studio API with render-row metadata
// ---------------------------------------------------------------------------

import { REMOVE_BACKGROUND_TYPE } from '@/lib/refinement-types';
import type { CreativeLedgerCardRender } from '@/components/gallery/creative-ledger-card';

/** Build POST /renders payload for Gallery-initiated Remove Background. */
export function buildGalleryRemoveBackgroundRequest(render: CreativeLedgerCardRender) {
  const sourceImageUrl = render.sourceImageUrl;
  if (!sourceImageUrl) {
    throw new Error('Gallery render is missing sourceImageUrl');
  }

  if (!render.outputImageUrl) {
    throw new Error('Gallery render is missing outputImageUrl');
  }

  return {
    sourceImageUrl,
    modelPersona: (render.modelPersona ?? 'confident_commercial') as 'confident_commercial',
    locationEnvironment: (render.locationEnvironment ?? 'photo_studio') as 'photo_studio',
    smartLighting: true,
    imageDimensions: 'portrait_45' as const,
    parentRenderId: render.id,
    refinementType: REMOVE_BACKGROUND_TYPE,
  };
}

/** @deprecated Use buildGalleryRemoveBackgroundRequest */
export const buildGalleryRefinementRequest = buildGalleryRemoveBackgroundRequest;
