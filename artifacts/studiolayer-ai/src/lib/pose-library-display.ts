import poseLibraryNames from '@/data/pose-library-names.json';
import poseFigureLayoutsData from '@/data/pose-figure-layouts.json';
import poseReferenceManifest from '@/data/pose-reference-manifest.json';
import poseIllustrationManifest from '@/data/pose-illustration-manifest.json';
import poseCatalogBridge from '@/data/pose-catalog-bridge.json';
import poseCanonicalRegistry from '@/data/pose-canonical-registry.json';

/** Canonical Excel pose names in Pose1–Pose75 order. */
export const POSE_LIBRARY_DISPLAY_NAMES: readonly string[] = poseLibraryNames;

/** Canonical registry — authoritative Pose ID → name → visual → definition link. */
export const POSE_CANONICAL_REGISTRY = poseCanonicalRegistry;

export interface CanonicalPoseEntry {
  poseId: string;
  name: string;
  description: string;
  filename: string;
  visualPath: string;
}

function poseNumber(poseId: string): number {
  return Number(poseId.replace(/^Pose/i, ''));
}

/** All 75 canonical poses ordered by Pose ID. */
export const CANONICAL_POSE_ENTRIES: readonly CanonicalPoseEntry[] = (
  poseCanonicalRegistry.poses as CanonicalPoseEntry[]
).slice().sort((a, b) => poseNumber(a.poseId) - poseNumber(b.poseId));

/** All 75 pose illustration URLs keyed by canonical Excel pose name. */
export const POSE_REFERENCE_IMAGES: Readonly<Record<string, string>> =
  poseReferenceManifest.images;

/** Final Pose1–Pose75 illustration intelligence layer. */
export const POSE_ILLUSTRATION_MANIFEST = poseIllustrationManifest;

/** 1:1 Pose ID ↔ canonical name bridge. */
export const POSE_CATALOG_BRIDGE = poseCatalogBridge;

export function getPoseIllustrationId(poseName: string): string | null {
  return (poseCatalogBridge.catalogNameToPoseId as Record<string, string>)[poseName] ?? null;
}

export function getPoseIllustrationEntry(poseName: string) {
  const poseId = getPoseIllustrationId(poseName);
  if (!poseId) return null;
  return poseIllustrationManifest.poses.find((p) => p.poseId === poseId) ?? null;
}

export function getPoseReferenceImageUrl(poseNameOrId: string): string | null {
  const byName = POSE_REFERENCE_IMAGES[poseNameOrId];
  if (byName) return byName;

  const poseId = poseNameOrId.trim();
  const canonicalName = (poseCatalogBridge.poseIdToCatalogName as Record<string, string>)[poseId];
  return canonicalName ? POSE_REFERENCE_IMAGES[canonicalName] ?? null : null;
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
] as const;

export function getPoseCardFrameVariant(poseIndex: number): string {
  return POSE_CARD_COMPOSITION_TEMPLATES[poseIndex % POSE_CARD_COMPOSITION_TEMPLATES.length]!;
}
