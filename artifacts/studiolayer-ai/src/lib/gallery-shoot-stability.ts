import type { GalleryShoot } from '@/lib/gallery-shoots';

/**
 * Gallery chronology and Shoot data come only from the current API-derived list.
 * Previous client Shoot state must never override identity, images, or createdAt.
 * Kept as a passthrough so delete-animation helpers can share this module.
 */
export function stabilizeGalleryShoots(
  _previous: GalleryShoot[],
  next: GalleryShoot[],
): GalleryShoot[] {
  return next;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Gallery card + detail cell exit duration — keep in sync with CSS. */
export const GALLERY_EXIT_ANIMATION_MS = 280;
