// ---------------------------------------------------------------------------
// Studio welcome screen — browser-session entry gate (not auth)
//
// sessionStorage  studiolayer_welcome_seen  — set when user clicks Enter Studio
// Survives refresh within the same browser session; clears when the session ends.
// Independent of login / logout / auth restoration.
// ---------------------------------------------------------------------------

/** Routes where the welcome overlay may appear above Studio. */
export const STUDIO_WELCOME_ROUTES = new Set(['/', '/studio']);

export const STUDIO_WELCOME_SEEN_KEY = 'studiolayer_welcome_seen';

export function isStudioWelcomeRoute(path: string): boolean {
  return STUDIO_WELCOME_ROUTES.has(path);
}

function readWelcomeSeenFlag(): boolean {
  try {
    return sessionStorage.getItem(STUDIO_WELCOME_SEEN_KEY) === '1';
  } catch {
    // Storage unavailable — treat as not entered so welcome can still show.
    return false;
  }
}

/**
 * True when the visitor has already clicked Enter Studio in this browser session.
 * Auth state is never consulted.
 */
export function hasEnteredStudioWelcome(): boolean {
  return readWelcomeSeenFlag();
}

/**
 * Whether the welcome overlay should be shown.
 * Driven only by sessionStorage — never by authentication.
 */
export function shouldShowStudioWelcome(): boolean {
  return !hasEnteredStudioWelcome();
}

/** Call when the visitor clicks Enter Studio. */
export function markStudioWelcomeEntered(): void {
  try {
    sessionStorage.setItem(STUDIO_WELCOME_SEEN_KEY, '1');
  } catch {
    // Storage unavailable — overlay still dismisses via in-memory gate state.
  }
}

export function getStudioWelcomeAssetBase(): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/welcome`;
}

export function preloadStudioWelcomeAssets(): void {
  const base = getStudioWelcomeAssetBase();
  const href = `${base}/studiolayer-welcome-desktop.svg`;
  if (document.querySelector(`link[rel="preload"][href="${href}"]`)) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.type = 'image/svg+xml';
  link.href = href;
  document.head.appendChild(link);
}
