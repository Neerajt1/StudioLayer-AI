/**
 * User-facing auth failure copy (P0-3 Login / P0-4 Registration).
 * Maps HTTP status only — never surfaces raw server bodies or stacks.
 */

export type AuthErrorToast = {
  title: string;
  description: string;
};

/** Extract HTTP status from ApiError-shaped errors or `HTTP NNN …` messages. */
export function httpStatusFromAuthError(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status) && status > 0) {
      return status;
    }
  }

  if (error instanceof Error) {
    const match = error.message.match(/\bHTTP\s+(\d{3})\b/i);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

/**
 * Login failure toast.
 * - 401 → invalid credentials
 * - network / 5xx → reachability
 * - other 4xx → credentials-style (do not claim outage)
 */
export function loginErrorToast(error: unknown): AuthErrorToast {
  const status = httpStatusFromAuthError(error);

  if (status != null && status >= 500) {
    return {
      title: "We couldn't reach StudioLayer.",
      description: 'Please try again in a few moments.',
    };
  }

  if (status === 401 || (status != null && status >= 400 && status < 500)) {
    return {
      title: "We couldn't sign you in.",
      description: 'Check your email and password.',
    };
  }

  // No status: network / abort / unexpected client failure
  return {
    title: "We couldn't reach StudioLayer.",
    description: 'Please try again in a few moments.',
  };
}

/**
 * Registration API failure toast (not client-side password/Terms validation).
 * - 409 → duplicate email
 * - everything else → create Studio failure (no raw server text)
 */
export function registerErrorToast(error: unknown): AuthErrorToast {
  const status = httpStatusFromAuthError(error);

  if (status === 409) {
    return {
      title: 'An account with this email already exists.',
      description: 'Sign in instead.',
    };
  }

  return {
    title: "We couldn't create your Studio.",
    description: 'Please try again.',
  };
}
