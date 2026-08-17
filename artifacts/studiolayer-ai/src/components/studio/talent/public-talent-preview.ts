// ---------------------------------------------------------------------------
// Public Talent preview — visitor exploration without calling GET /identities.
//
// Images already live in `public/identities/` and are served statically.
// This maps the approved layout sequence to those public assets only.
// Authenticated Talent continues to use the identities API for full metadata.
// ---------------------------------------------------------------------------

import { TALENT_SEQUENCE } from './talent-layout-spec';
import type { ModelIdentity } from './types';

function genderFromTalentCode(id: string): ModelIdentity['gender'] {
  if (id.startsWith('K-')) return 'kids';
  if (id.startsWith('M-')) return 'mens';
  return 'womens';
}

/** Display catalogue for unauthenticated visitors — public static assets only. */
export function buildPublicTalentPreviewIdentities(): ModelIdentity[] {
  return TALENT_SEQUENCE.map((id) => ({
    id,
    displayName: id,
    imageUrl: `/identities/${id}.png`,
    ethnicity: 'catalogue',
    gender: genderFromTalentCode(id),
  }));
}
