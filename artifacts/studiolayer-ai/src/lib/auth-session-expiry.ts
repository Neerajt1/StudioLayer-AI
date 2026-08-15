/**
 * Session-expiry redirect notice (P0-2).
 * AuthGuard sets a one-shot flag + login query; Login consumes the flag once.
 */

export const SESSION_ENDED_LOGIN_REASON = 'session';

const SESSION_ENDED_NOTICE_FLAG = 'studiolayer:show-session-ended-notice';

export const sessionEndedToastCopy = {
  title: 'Your session ended.',
  description:
    'Sign in again to continue. Your Studio and Gallery were not deleted.',
} as const;

/** Login path after AuthGuard detects an ended / missing session. */
export function buildLoginPathAfterSessionEnded(): string {
  return `/login?reason=${SESSION_ENDED_LOGIN_REASON}`;
}

export function markSessionEndedNoticePending(): void {
  try {
    sessionStorage.setItem(SESSION_ENDED_NOTICE_FLAG, '1');
  } catch {
    /* sessionStorage unavailable */
  }
}

/**
 * Returns true once when a session-ended notice should be shown, then clears
 * the pending flag so remounts / navigations do not repeat the toast.
 */
export function consumeSessionEndedNoticePending(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_ENDED_NOTICE_FLAG) !== '1') {
      return false;
    }
    sessionStorage.removeItem(SESSION_ENDED_NOTICE_FLAG);
    return true;
  } catch {
    return false;
  }
}

export function loginPathHasSessionEndedReason(search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return params.get('reason') === SESSION_ENDED_LOGIN_REASON;
}
