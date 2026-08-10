/**
 * Phase-1 Direct Shoot controlled editorial grid layout.
 */
import boardLayout from '@/data/pose-curated-board-layout.json';

export interface CuratedPosePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
  tier: 'hero' | 'standard' | 'accent';
  edgeAnchor?: 'left' | 'right' | 'top' | 'bottom' | null;
  objectPosition: string;
  transformOrigin: string;
  section?: 'main' | 'finale';
}

export const CURATED_BOARD_LAYOUT = boardLayout;

export const CURATED_BOARD_ASPECT_RATIO = boardLayout.boardAspectRatio as number;

const PLACEMENTS = boardLayout.placements as Record<string, CuratedPosePlacement>;

export function getCuratedPosePlacement(poseName: string): CuratedPosePlacement | null {
  return PLACEMENTS[poseName] ?? null;
}

export function getAllCuratedPlacements(): Array<{ poseName: string; placement: CuratedPosePlacement }> {
  return Object.entries(PLACEMENTS).map(([poseName, placement]) => ({ poseName, placement }));
}

export function getCuratedPlacementStyle(
  placement: CuratedPosePlacement,
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
