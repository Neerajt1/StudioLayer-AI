// ---------------------------------------------------------------------------
// StudioLayer AI client storage — clear on Studio deletion
// ---------------------------------------------------------------------------

const STORAGE_PREFIXES = ['studiolayer:', 'sl-'] as const;
const EXPLICIT_SESSION_KEYS = ['studioRefineRender'] as const;

function matchesStudioLayerKey(key: string): boolean {
  return STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function clearPrefixedKeys(storage: Storage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && matchesStudioLayerKey(key)) {
      storage.removeItem(key);
    }
  }
}

/** Remove all StudioLayer AI keys from local and session storage. */
export function clearAllStudioLayerStorage(): void {
  try {
    clearPrefixedKeys(localStorage);
    clearPrefixedKeys(sessionStorage);
    EXPLICIT_SESSION_KEYS.forEach((key) => {
      sessionStorage.removeItem(key);
    });
  } catch {
    // Storage unavailable — deletion redirect still proceeds.
  }
}
