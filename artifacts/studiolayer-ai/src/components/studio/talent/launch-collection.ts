// ---------------------------------------------------------------------------
// Launch Collection — legacy sequence (Sprint 2, preserved)
// Casting Studio Sprint 3 uses editorial-composition.ts instead.
// ---------------------------------------------------------------------------

/** @deprecated Use EDITORIAL_COMPOSITION in editorial-composition.ts */
export const LAUNCH_COLLECTION_ORDER: readonly string[] = [
  'F-CA-01',
  'M-CA-01',
  'F-IN-01',
  'M-IN-01',
  'F-AF-01',
  'M-AF-01',
  'F-EA-01',
  'M-EA-01',
  'F-ME-01',
  'M-ME-01',
  'K-G-01',
  'K-B-01',
];

export function sortByLaunchCollection<T extends { id: string }>(items: T[]): T[] {
  const order = new Map(LAUNCH_COLLECTION_ORDER.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const ai = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}
