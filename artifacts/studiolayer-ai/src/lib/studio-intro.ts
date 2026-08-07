// ---------------------------------------------------------------------------
// Brand intro — display rules and session persistence
//
// Storage strategy (browser-scoped, not account-scoped):
//   localStorage  studiolayer:intro-seen        — persists after intro completes
//   sessionStorage studiolayer:intro-on-logout — replay once after explicit logout
//   sessionStorage studiolayer:intro-session-started — suppress replay during auth nav
//   localStorage  sl-force-intro                — developer preview (cleared after playback)
// ---------------------------------------------------------------------------

import { PUBLIC_LEGAL_ROUTES } from '@/lib/legal-documents';

export const STUDIO_INTRO_ROUTES = new Set([
  '/login',
  '/register',
  '/forgot-password',
  ...PUBLIC_LEGAL_ROUTES,
]);

const INTRO_SEEN_KEY = 'studiolayer:intro-seen';
const INTRO_LOGOUT_KEY = 'studiolayer:intro-on-logout';
const INTRO_SESSION_STARTED_KEY = 'studiolayer:intro-session-started';
const FORCE_INTRO_KEY = 'sl-force-intro';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isStudioIntroRoute(path: string): boolean {
  return STUDIO_INTRO_ROUTES.has(path);
}

function isDeveloperPreviewForced(): boolean {
  try {
    if (localStorage.getItem(FORCE_INTRO_KEY) === 'true') {
      return true;
    }
  } catch {
    // Storage unavailable — fall through to URL check.
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('intro') === 'true';
}

export function shouldPlayStudioIntro(): boolean {
  if (prefersReducedMotion()) {
    return false;
  }

  if (isDeveloperPreviewForced()) {
    return true;
  }

  if (sessionStorage.getItem(INTRO_LOGOUT_KEY) === '1') {
    return true;
  }

  if (localStorage.getItem(INTRO_SEEN_KEY) === '1') {
    return false;
  }

  // Intro already started this session (e.g. login → register before completion).
  if (sessionStorage.getItem(INTRO_SESSION_STARTED_KEY) === '1') {
    return false;
  }

  return true;
}

/** Call when intro playback begins — prevents replay on auth-page navigation. */
export function markStudioIntroStarted(): void {
  try {
    sessionStorage.setItem(INTRO_SESSION_STARTED_KEY, '1');
  } catch {
    // Storage unavailable — intro may replay on auth navigation.
  }
}

export function markStudioIntroComplete(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
    localStorage.removeItem(FORCE_INTRO_KEY);
    sessionStorage.removeItem(INTRO_LOGOUT_KEY);
    sessionStorage.removeItem(INTRO_SESSION_STARTED_KEY);
  } catch {
    // Storage unavailable — intro may replay; auth remains unaffected.
  }
}

/**
 * Call before redirecting to an auth route after explicit logout.
 * Clears the browser intro flag so the sequence replays exactly once.
 */
export function requestStudioIntroOnLogout(): void {
  try {
    localStorage.removeItem(INTRO_SEEN_KEY);
    sessionStorage.removeItem(INTRO_SESSION_STARTED_KEY);
    sessionStorage.setItem(INTRO_LOGOUT_KEY, '1');
  } catch {
    // Storage unavailable — skip intro on logout.
  }
}

export function preloadStudioIntroAssets(): void {
  const href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/brand/logo.svg`;
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
