// ---------------------------------------------------------------------------
// API base URL — mirrors setBaseUrl() for raw fetch() calls outside Orval client
// ---------------------------------------------------------------------------

const configuredBase = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? '';

/** Resolves a relative /api path against VITE_API_URL when set (production). */
export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  return configuredBase ? `${configuredBase}${path}` : path;
}
