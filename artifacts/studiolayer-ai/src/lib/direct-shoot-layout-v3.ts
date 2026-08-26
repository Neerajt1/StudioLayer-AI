/**
 * Layout V3 — reference-sheet-derived editorial board placement data (presentation-only).
 * Positions sourced from RS01–RS13 composition analysis, not algorithmic packing.
 */
import editorialLayout from '@/data/pose-editorial-layout-v3.json';

export interface EditorialBoundaryCrop {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface EditorialAnchor {
  vertical: 'top' | 'center' | 'bottom';
  horizontal: 'left' | 'center' | 'right';
  objectPosition: string;
  transformOrigin: string;
  insetTop: number;
  insetBottom: number;
  insetLeft: number;
  insetRight: number;
  boundaryCrop: EditorialBoundaryCrop;
}

export interface EditorialPlacement {
  poseId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
  figureScale: number;
  objectFit?: 'contain' | 'cover';
  anchor: EditorialAnchor;
  compositionClass?: string;
  column?: number;
  referenceSheet?: number;
  matchScore?: number;
  framing?: string;
  primaryFamily?: string;
  visualArchetype?: string;
}

export const EDITORIAL_LAYOUT_V3 = editorialLayout;

export const EDITORIAL_CANVAS_ASPECT_RATIO = editorialLayout.canvasAspectRatio as number;

const PLACEMENTS = editorialLayout.placements as Record<string, EditorialPlacement>;

export function getEditorialPlacement(poseName: string): EditorialPlacement | null {
  return PLACEMENTS[poseName] ?? null;
}

export function getAllEditorialPlacements(): Array<{ poseName: string; placement: EditorialPlacement }> {
  return Object.entries(PLACEMENTS).map(([poseName, placement]) => ({ poseName, placement }));
}

export function getEditorialPlacementStyle(
  placement: EditorialPlacement,
): Record<string, string | number> {
  const { anchor } = placement;
  const alignItems =
    anchor.vertical === 'top'
      ? 'flex-start'
      : anchor.vertical === 'center'
        ? 'center'
        : 'flex-end';
  const justifyContent =
    anchor.horizontal === 'left'
      ? 'flex-start'
      : anchor.horizontal === 'center'
        ? 'center'
        : 'flex-end';

  return {
    '--editorial-left': `${placement.left}%`,
    '--editorial-top': `${placement.top}%`,
    '--editorial-width': `${placement.width}%`,
    '--editorial-height': `${placement.height}%`,
    '--editorial-z': placement.zIndex,
    '--pose-figure-scale': String(placement.figureScale),
    '--pose-figure-origin': anchor.transformOrigin,
    '--pose-figure-max-w': '100%',
    '--pose-figure-max-h': '100%',
    '--editorial-align-items': alignItems,
    '--editorial-justify-content': justifyContent,
    '--editorial-object-fit': placement.objectFit ?? 'contain',
    objectPosition: anchor.objectPosition,
  };
}

export function getEditorialCanvasAlignStyle(placement: EditorialPlacement): Record<string, string> {
  return {
    alignItems: placement.anchor.vertical === 'top'
      ? 'flex-start'
      : placement.anchor.vertical === 'center'
        ? 'center'
        : 'flex-end',
    justifyContent: placement.anchor.horizontal === 'left'
      ? 'flex-start'
      : placement.anchor.horizontal === 'center'
        ? 'center'
        : 'flex-end',
  };
}
