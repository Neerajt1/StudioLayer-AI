/**
 * LOCAL QA ONLY — Nano Pro Standalone mode gate + pose-master path helpers.
 * No network / Vite API imports — safe for Node contract tests.
 */

export const NANO_PRO_STANDALONE_QA_VITE_FLAG = 'VITE_NANO_PRO_STANDALONE_QA' as const;

/** True only in Vite DEV when VITE_NANO_PRO_STANDALONE_QA is explicitly enabled. */
export function isNanoProStandaloneQaModeEnabled(
  env: ImportMetaEnv | Record<string, unknown> = import.meta.env,
): boolean {
  const isDev = Boolean((env as { DEV?: boolean }).DEV);
  if (!isDev) return false;
  const raw = String(
    (env as Record<string, unknown>)[NANO_PRO_STANDALONE_QA_VITE_FLAG] ?? '',
  )
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function buildNanoProStandaloneQaPoseMasterPath(poseId: string): string {
  return `assets/pose-references-face-neutral/${poseId}-face-neutral-backend.png`;
}
