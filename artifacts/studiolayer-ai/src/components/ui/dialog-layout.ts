// ---------------------------------------------------------------------------
// StudioLayer AI — canonical dialog layout (centering · motion · z-index)
// All modals inherit these classes. Do not define positioning elsewhere.
// ---------------------------------------------------------------------------

/** Fixed viewport overlay — shared backdrop */
export const SL_DIALOG_OVERLAY = 'sl-dialog-overlay bg-black/80';

/** Viewport-centered panel — positioning defined in index.css (.sl-dialog-content) */
export const SL_DIALOG_CONTENT =
  'sl-dialog-content grid w-full max-w-lg gap-4 overflow-y-auto border bg-background p-6 shadow-lg sm:rounded-lg';
