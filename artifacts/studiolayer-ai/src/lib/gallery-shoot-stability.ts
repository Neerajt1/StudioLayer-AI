import type { GalleryShoot } from '@/lib/gallery-shoots';

/** True when `next` is the same creative session as `prev` (including after image deletion). */
function shootsRepresentSameSession(prev: GalleryShoot, next: GalleryShoot): boolean {
  if (prev.id === next.id) return true;

  const prevIsLegacy = prev.id.startsWith('shoot-');
  const nextIsLegacy = next.id.startsWith('shoot-');
  if (!prevIsLegacy || !nextIsLegacy) return false;

  if (prev.generationType !== next.generationType) return false;
  if ((prev.sourceImageUrl ?? '') !== (next.sourceImageUrl ?? '')) return false;

  const prevImageIds = new Set(prev.images.map((image) => image.id));
  const nextImageIds = next.images.map((image) => image.id);
  if (nextImageIds.length === 0) return false;

  const sharedCount = nextImageIds.filter((id) => prevImageIds.has(id)).length;
  if (sharedCount === 0) return false;

  if (nextImageIds.every((id) => prevImageIds.has(id))) {
    return true;
  }

  return sharedCount === prev.imageCount && sharedCount === next.imageCount;
}

function mergeShootIdentity(prev: GalleryShoot, next: GalleryShoot): GalleryShoot {
  return {
    ...next,
    id: prev.id,
    rootId: prev.rootId,
    createdAt: prev.createdAt,
    studioCreditsUsed: prev.studioCreditsUsed,
    refinementCount: prev.refinementCount,
    imageCount: next.images.length,
  };
}

/**
 * Preserve Shoot identity and grid order after deletions — gallery UX only.
 * Does not alter batch grouping rules in buildGalleryShoots().
 */
export function stabilizeGalleryShoots(
  previous: GalleryShoot[],
  next: GalleryShoot[],
): GalleryShoot[] {
  if (previous.length === 0) return next;

  const matchedNextIndices = new Set<number>();
  const stabilized: GalleryShoot[] = [];

  for (const prev of previous) {
    const matchIndex = next.findIndex(
      (candidate, index) =>
        !matchedNextIndices.has(index) && shootsRepresentSameSession(prev, candidate),
    );
    if (matchIndex === -1) continue;
    matchedNextIndices.add(matchIndex);
    stabilized.push(mergeShootIdentity(prev, next[matchIndex]!));
  }

  const unmatched = next.filter((_, index) => !matchedNextIndices.has(index));
  if (unmatched.length === 0) return stabilized;

  return [
    ...stabilized,
    ...unmatched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  ];
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Gallery card + detail cell exit duration — keep in sync with CSS. */
export const GALLERY_EXIT_ANIMATION_MS = 280;
