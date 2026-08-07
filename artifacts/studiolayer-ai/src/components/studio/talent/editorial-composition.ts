// ---------------------------------------------------------------------------
// Editorial Composition — Casting Studio (Sprint 3, frozen layout)
//
// Hand-curated magazine spread. No algorithmic alternation — placements are
// art-directed so the eye drifts diagonally through the page.
// ---------------------------------------------------------------------------

import {
  PORTRAIT_SIZE_ADULT_HERO,
  PORTRAIT_SIZE_ADULT_STANDARD,
} from './casting-tokens';

const CASTING_STUDIO_PORTRAIT_HEIGHT = PORTRAIT_SIZE_ADULT_STANDARD;
const CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT = PORTRAIT_SIZE_ADULT_STANDARD;
const CASTING_STUDIO_PORTRAIT_HEIGHT_HERO = PORTRAIT_SIZE_ADULT_HERO;

export interface EditorialPlacement {
  id: string;
  cell: string;
  portraitHeight: string;
}

/**
 * Launch Collection — editorial sequence & grid placement.
 * Order is intentional; do not sort alphabetically or by API response.
 */
export const EDITORIAL_COMPOSITION: readonly EditorialPlacement[] = [
  // ── Opening spread ──
  { id: 'F-CA-01', cell: 'col-span-12 lg:col-span-9 lg:col-start-1', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_HERO },
  { id: 'M-EA-02', cell: 'col-span-12 lg:col-span-4 lg:col-start-9 lg:-mt-36 xl:-mt-44', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT },

  // ── Drift right, then anchor left ──
  { id: 'F-ME-02', cell: 'col-span-12 lg:col-span-5 lg:col-start-4 lg:mt-20', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },
  { id: 'F-AF-02', cell: 'col-span-12 lg:col-span-6 lg:col-start-7 lg:mt-10', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_HERO },
  { id: 'M-CA-02', cell: 'col-span-12 lg:col-span-4 lg:col-start-1 lg:mt-24', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT },

  // ── Centre moment ──
  { id: 'F-IN-02', cell: 'col-span-12 lg:col-span-8 lg:col-start-3 lg:mt-6', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_HERO },
  { id: 'M-AF-02', cell: 'col-span-12 lg:col-span-4 lg:col-start-10 lg:-mt-28', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },

  // ── Staggered pair, same side twice (breaks alternation) ──
  { id: 'M-IN-02', cell: 'col-span-12 lg:col-span-5 lg:col-start-2 lg:mt-16', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },
  { id: 'M-ME-02', cell: 'col-span-12 lg:col-span-5 lg:col-start-1 lg:mt-12', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT },
  { id: 'F-EA-02', cell: 'col-span-12 lg:col-span-7 lg:col-start-6 lg:mt-8', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_HERO },

  // ── Mid-page breath ──
  { id: 'F-CA-02', cell: 'col-span-12 lg:col-span-6 lg:col-start-3 lg:mt-20', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },
  { id: 'F-AF-01', cell: 'col-span-12 lg:col-span-5 lg:col-start-8 lg:mt-14', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_HERO },

  // ── Diagonal descent ──
  { id: 'M-IN-01', cell: 'col-span-12 lg:col-span-4 lg:col-start-2 lg:mt-28', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT },
  { id: 'F-IN-01', cell: 'col-span-12 lg:col-span-7 lg:col-start-5 lg:-mt-16', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },
  { id: 'M-EA-01', cell: 'col-span-12 lg:col-span-5 lg:col-start-1 lg:mt-20', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },

  // ── Wide hero, offset companion ──
  { id: 'F-ME-01', cell: 'col-span-12 lg:col-span-10 lg:col-start-2 lg:mt-10', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_HERO },
  { id: 'M-CA-01', cell: 'col-span-12 lg:col-span-4 lg:col-start-9 lg:-mt-32', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT },

  // ── Closing chapter ──
  { id: 'F-EA-01', cell: 'col-span-12 lg:col-span-6 lg:col-start-3 lg:mt-16', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },
  { id: 'M-AF-01', cell: 'col-span-12 lg:col-span-5 lg:col-start-7 lg:mt-8', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },
  { id: 'M-ME-01', cell: 'col-span-12 lg:col-span-4 lg:col-start-2 lg:mt-24', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },

  // ── Youth coda — clustered, not mirrored ──
  { id: 'K-G-02', cell: 'col-span-12 lg:col-span-5 lg:col-start-6 lg:mt-12', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_HERO },
  { id: 'K-B-01', cell: 'col-span-12 lg:col-span-4 lg:col-start-1 lg:mt-20', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT },
  { id: 'K-G-01', cell: 'col-span-12 lg:col-span-5 lg:col-start-8 lg:mt-6', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT },
  { id: 'K-B-02', cell: 'col-span-12 lg:col-span-4 lg:col-start-4 lg:mt-16 lg:mb-8', portraitHeight: CASTING_STUDIO_PORTRAIT_HEIGHT_ACCENT },
];

export function buildEditorialCatalog<T extends { id: string }>(
  identities: T[],
): Array<T & EditorialPlacement> {
  const byId = new Map(identities.map((item) => [item.id, item]));
  return EDITORIAL_COMPOSITION.flatMap((placement) => {
    const identity = byId.get(placement.id);
    return identity ? [{ ...identity, ...placement }] : [];
  });
}
