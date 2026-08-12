/**
 * Canonical Direct Shoot board layout — keyed by Pose ID (Pose1–Pose75).
 */
import boardLayout from '@/data/pose-canonical-board-layout.json';

export interface CanonicalPosePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
  objectPosition: string;
  transformOrigin: string;
}

export const CANONICAL_BOARD_LAYOUT = boardLayout;

export const CANONICAL_BOARD_ASPECT_RATIO = boardLayout.boardAspectRatio as number;

const PLACEMENTS = boardLayout.placements as Record<string, CanonicalPosePlacement>;

export function getCanonicalPosePlacement(poseId: string): CanonicalPosePlacement | null {
  return PLACEMENTS[poseId] ?? null;
}

export function getAllCanonicalPlacements(): Array<{ poseId: string; placement: CanonicalPosePlacement }> {
  return Object.entries(PLACEMENTS).map(([poseId, placement]) => ({ poseId, placement }));
}

export function getCanonicalPlacementStyle(
  placement: CanonicalPosePlacement,
): Record<string, string | number> {
  return {
    '--pose-left': `${placement.left}%`,
    '--pose-top': `${placement.top}%`,
    '--pose-width': `${placement.width}%`,
    '--pose-height': `${placement.height}%`,
    '--pose-z': placement.zIndex,
    '--pose-origin': placement.transformOrigin,
    '--pose-object-position': placement.objectPosition,
  };
}
