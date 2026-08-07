export const CASTING_SCROLL_TO_HEADER_KEY = 'studiolayer:casting-scroll-to-header';

export function markCastingScrollToHeader(): void {
  try {
    sessionStorage.setItem(CASTING_SCROLL_TO_HEADER_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeCastingScrollToHeader(): boolean {
  try {
    const flagged = sessionStorage.getItem(CASTING_SCROLL_TO_HEADER_KEY) === '1';
    if (flagged) sessionStorage.removeItem(CASTING_SCROLL_TO_HEADER_KEY);
    return flagged;
  } catch {
    return false;
  }
}

export function scrollToCastingPageHeader(): void {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.getElementById('casting-page-header')?.scrollIntoView({
    behavior: 'instant',
    block: 'start',
  });
}
