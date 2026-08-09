import poseLibraryNames from '@/data/pose-library-names.json';
import poseFigureLayoutsData from '@/data/pose-figure-layouts.json';
import poseReferenceManifest from '@/data/pose-reference-manifest.json';

/** Display-only pose list for the Phase 5C prototype — names only, no planner metadata. */
export const POSE_LIBRARY_DISPLAY_NAMES: readonly string[] = poseLibraryNames;

/** All 75 pose illustration URLs keyed by catalog pose name. */
export const POSE_REFERENCE_IMAGES: Readonly<Record<string, string>> =
  poseReferenceManifest.images;

export function getPoseReferenceImageUrl(poseName: string): string | null {
  return POSE_REFERENCE_IMAGES[poseName] ?? null;
}

/** Per-pose illustration fitting inside a locked contact-sheet slot. */
export interface PoseFigureLayout {
  objectPosition?: string;
  alignSelf?: string;
  justifySelf?: string;
  /** Flex alignment on the illustration canvas — end for full-body, center for portrait. */
  canvasAlignContent?: 'start' | 'center' | 'end';
}

/** Per-pose fitting derived from slot geometry + pose metadata (Phase 5C-O). */
export const POSE_FIGURE_LAYOUTS: Readonly<Record<string, PoseFigureLayout>> =
  poseFigureLayoutsData.layouts as Record<string, PoseFigureLayout>;

export function getPoseFigureLayout(poseName: string): PoseFigureLayout | null {
  return POSE_FIGURE_LAYOUTS[poseName] ?? null;
}

export function getPoseFigureImageStyle(
  layout: PoseFigureLayout,
): Record<string, string | undefined> {
  return {
    objectPosition: layout.objectPosition,
  };
}

export function getPoseFigureCanvasStyle(
  layout: PoseFigureLayout,
): Record<string, string> | undefined {
  if (!layout.canvasAlignContent) {
    return undefined;
  }

  const alignItems =
    layout.canvasAlignContent === 'center'
      ? 'center'
      : layout.canvasAlignContent === 'start'
        ? 'flex-start'
        : 'flex-end';

  return { alignItems };
}

/** Inner illustration framing within a PDF slot — asymmetric object placement only. */
const POSE_CARD_COMPOSITION_TEMPLATES = [
  'sl-pose-library-card-art--comp-a',
  'sl-pose-library-card-art--comp-b',
  'sl-pose-library-card-art--comp-c',
  'sl-pose-library-card-art--comp-d',
  'sl-pose-library-card-art--comp-e',
  'sl-pose-library-card-art--comp-f',
  'sl-pose-library-card-art--comp-g',
  'sl-pose-library-card-art--comp-h',
  'sl-pose-library-card-art--comp-i',
  'sl-pose-library-card-art--comp-j',
  'sl-pose-library-card-art--comp-k',
  'sl-pose-library-card-art--comp-l',
] as const;

export function getPoseCardFrameVariant(poseIndex: number): string {
  return POSE_CARD_COMPOSITION_TEMPLATES[poseIndex % POSE_CARD_COMPOSITION_TEMPLATES.length]!;
}
