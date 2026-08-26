/**
 * Direct Shoot presentation mode coordinator.
 *
 * Phase 1 active path: controlled editorial grid (`DirectShootPoseBoard`).
 * Legacy experiments remain in repo but are not wired into Direct Shoot.
 */

export type DirectShootPresentationMode = 'phase-1-editorial-grid';

export function getActiveDirectShootPresentationMode(): DirectShootPresentationMode {
  return 'phase-1-editorial-grid';
}
