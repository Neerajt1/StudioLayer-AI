/**
 * Gallery delete toast copy (P0 delete-failure UX).
 * Failure copy must never imply the image left the Creative Ledger or that credits changed.
 */

export type GalleryDeleteToast = {
  title: string;
  description: string;
};

/** Success path — keep existing Gallery wording. */
export function galleryDeleteSucceededToast(): GalleryDeleteToast {
  return {
    title: 'Asset deleted',
    description: 'The image has been removed.',
  };
}

/**
 * Delete API/mutation failure — image remains; Studio Credits unchanged.
 * Shared by Gallery Shoot Detail (and any other caller of the same delete handler).
 */
export function galleryDeleteFailedToast(): GalleryDeleteToast {
  return {
    title: "We couldn't delete this image.",
    description:
      "It's still in your Creative Ledger. No Studio Credits were affected. Try again.",
  };
}
