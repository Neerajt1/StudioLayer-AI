/**
 * Generation-failure user copy (P0-5).
 * Credit lines are only for states the Creative Ledger treats as uncharged.
 */

export type GenerationFailureToast = {
  title: string;
  description: string;
};

/**
 * True when Creative Ledger accounting treats this status as not charged
 * (`studioCreditsForRender` returns 0 unless status === 'completed').
 */
export function isUnchargedFailedRenderStatus(status: string): boolean {
  return status === 'failed';
}

/** Workspace: server rejected the generation before it started. */
export function workspaceShootGenerationRejectedToast(): GenerationFailureToast {
  return {
    title: "We couldn't create this Shoot.",
    description: 'Your garment upload is unchanged. Please try again.',
  };
}

/** Workspace: another Create is still coordinating — not a failed Shoot. */
export function workspaceShootGenerationBusyToast(): GenerationFailureToast {
  return {
    title: 'This Shoot is still being prepared.',
    description: 'Create remains unavailable until this Shoot is ready.',
  };
}

/** @deprecated Use workspaceShootGenerationRejectedToast — do not claim credits unused on transport failure. */
export function workspaceShootGenerationFailedToast(): GenerationFailureToast {
  return workspaceShootGenerationRejectedToast();
}

/** Workspace editorial slot when a render settles as failed. */
export function workspaceGenerationFailedSlotCopy(): {
  headline: string;
  creditLine: string;
  retryLabel: string;
} {
  return {
    headline: "We couldn't create this Shoot.",
    creditLine: 'No Studio Credits were used.',
    retryLabel: 'Try again',
  };
}

/** Existing Workspace create flow — do not invent a new generation path. */
export const GALLERY_FAILED_CREATE_AGAIN_PATH = '/studio';

/**
 * Gallery failed render with no output (Creative Ledger card + Shoot detail).
 * Credit line only when status is confirmed uncharged (`failed`).
 */
export function galleryFailedRenderCopy(status: string): {
  headline: string;
  creditLine: string | null;
  retryLabel: string;
} {
  if (!isUnchargedFailedRenderStatus(status)) {
    return {
      headline: 'Unavailable',
      creditLine: null,
      retryLabel: 'Create again',
    };
  }

  return {
    headline: "This image couldn't be created.",
    creditLine: 'No Studio Credits were charged for this image.',
    retryLabel: 'Create again',
  };
}
