/**
 * Phase 5C — White-sheet 4-column grid experiment (presentation-only, inactive).
 * Not wired into the Phase-1 Direct Shoot path.
 */
import { getMasterArtworkContactSheetSlots } from '@/lib/contact-sheet-artwork-layout';
import {
  getPoseIllustrationEntry,
  POSE_LIBRARY_DISPLAY_NAMES,
} from '@/lib/pose-library-display';
import {
  getPosePresentationOverlay,
  isSymmetricalPresentationExperimentActive,
} from '@/lib/pose-presentation-experiment';

export interface WhiteSheetPoseSlot {
  slotId: number;
  poseIndex: number;
  poseName: string;
}

export interface WhiteSheetCellProfile {
  rowSpan: number;
  minHeight: string;
  figureScale: number;
  transformOrigin: string;
}

const WHITE_SHEET_POSE_SLOTS: readonly WhiteSheetPoseSlot[] = [...getMasterArtworkContactSheetSlots()]
  .sort((a, b) => a.slotId - b.slotId)
  .map((slot) => ({
    slotId: slot.slotId,
    poseIndex: slot.poseIndex,
    poseName: POSE_LIBRARY_DISPLAY_NAMES[slot.poseIndex]!,
  }));

export function isWhiteSheetGridExperimentActive(): boolean {
  return false;
}

export function getWhiteSheetPoseSlots(): readonly WhiteSheetPoseSlot[] {
  return WHITE_SHEET_POSE_SLOTS;
}

function baseCellProfile(poseName: string): WhiteSheetCellProfile {
  const entry = getPoseIllustrationEntry(poseName);
  const framing = entry?.framing ?? 'full_body';
  const family = entry?.primaryFamily ?? '';

  if (framing === 'chest_up') {
    return {
      rowSpan: 1,
      minHeight: '7.25rem',
      figureScale: 1.04,
      transformOrigin: 'center 44%',
    };
  }

  if (framing === 'waist_up' || framing === 'three_quarter_body') {
    return {
      rowSpan: 1,
      minHeight: '8.5rem',
      figureScale: 1.02,
      transformOrigin: 'center 48%',
    };
  }

  if (family.includes('Seated') || family === 'Kneeling' || family.includes('Floor')) {
    return {
      rowSpan: 2,
      minHeight: '10.75rem',
      figureScale: 0.94,
      transformOrigin: 'center bottom',
    };
  }

  if (family.includes('Portrait')) {
    return {
      rowSpan: 1,
      minHeight: '8rem',
      figureScale: 1.03,
      transformOrigin: 'center 46%',
    };
  }

  if (family.includes('Walking') || family === 'Dynamic' || family.includes('Garment')) {
    return {
      rowSpan: 2,
      minHeight: '10.25rem',
      figureScale: 0.97,
      transformOrigin: 'center bottom',
    };
  }

  return {
    rowSpan: 2,
    minHeight: '10rem',
    figureScale: 0.98,
    transformOrigin: 'center bottom',
  };
}

export function getWhiteSheetCellProfile(poseName: string): WhiteSheetCellProfile {
  const base = baseCellProfile(poseName);

  if (!isSymmetricalPresentationExperimentActive()) {
    return base;
  }

  const overlay = getPosePresentationOverlay(poseName);
  if (!overlay) {
    return base;
  }

  return {
    ...base,
    figureScale: Math.min(1.08, base.figureScale * overlay.figureScale),
    transformOrigin: overlay.transformOrigin,
  };
}

export function getWhiteSheetCellStyle(profile: WhiteSheetCellProfile): Record<string, string> {
  return {
    '--white-sheet-row-span': String(profile.rowSpan),
    '--white-sheet-cell-min-h': profile.minHeight,
    '--pose-figure-scale': String(profile.figureScale),
    '--pose-figure-origin': profile.transformOrigin,
    '--pose-figure-max-w': '108%',
    '--pose-figure-max-h': '108%',
  };
}
