/**
 * Phase 5C — Symmetrical presentation experiment (presentation-only, fully revertible).
 * Toggle off to restore prior fitting without removing overlay data.
 */
import presentationData from '@/data/pose-presentation-overlays.json';

/** Set false to instantly revert to base pose-figure-layouts presentation. */
export const SYMMETRICAL_PRESENTATION_EXPERIMENT_ENABLED = true;

export interface PosePresentationOverlay {
  figureScale: number;
  figureMaxWidth: string;
  figureMaxHeight: string;
  transformOrigin: string;
  canvasInset?: string;
}

const OVERLAYS = presentationData.overlays as Record<string, PosePresentationOverlay>;

export function isSymmetricalPresentationExperimentActive(): boolean {
  return SYMMETRICAL_PRESENTATION_EXPERIMENT_ENABLED;
}

export function getPosePresentationOverlay(
  poseName: string,
): PosePresentationOverlay | null {
  if (!SYMMETRICAL_PRESENTATION_EXPERIMENT_ENABLED) {
    return null;
  }
  return OVERLAYS[poseName] ?? null;
}

export function getPosePresentationFigureVars(
  overlay: PosePresentationOverlay | null,
): Record<string, string | undefined> {
  if (!overlay) {
    return {};
  }

  return {
    '--pose-figure-scale': String(overlay.figureScale),
    '--pose-figure-max-w': overlay.figureMaxWidth,
    '--pose-figure-max-h': overlay.figureMaxHeight,
    '--pose-figure-origin': overlay.transformOrigin,
    ...(overlay.canvasInset ? { '--pose-canvas-inset': overlay.canvasInset } : {}),
  };
}
