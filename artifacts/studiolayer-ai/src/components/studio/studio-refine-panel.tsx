// ---------------------------------------------------------------------------
// Studio Post-Production Panel — Crop (free) + Remove Background
// ---------------------------------------------------------------------------

import { Eraser, RotateCcw, Scissors, ZoomIn } from 'lucide-react';
import { postProductionStudioCreditLabel } from '@workspace/studio-credit-engine';
import { cn } from '@/lib/utils';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';

interface StudioPostProductionPanelProps {
  disabled?: boolean;
  removeBackgroundInFlight?: boolean;
  hasCropApplied?: boolean;
  canRevert: boolean;
  imageLabel?: string;
  onRemoveBackground: () => void;
  onOpenCrop: () => void;
  onRevert: () => void;
  onZoom: () => void;
}

/** @deprecated Use StudioPostProductionPanel */
export type StudioRefinePanelProps = StudioPostProductionPanelProps;

export function StudioPostProductionPanel({
  disabled = false,
  removeBackgroundInFlight = false,
  hasCropApplied = false,
  canRevert,
  imageLabel,
  onRemoveBackground,
  onOpenCrop,
  onRevert,
  onZoom,
}: StudioPostProductionPanelProps) {
  const busy = disabled || removeBackgroundInFlight;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">Post-Production</p>
        <p className="sl-ui-helper">
          {imageLabel
            ? `Crop or remove the background for ${imageLabel}.`
            : 'Crop or remove the background for this image.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <StudioWorkspaceButton
          className={cn(
            'h-8 px-3 text-xs gap-1.5',
            hasCropApplied && 'ring-1 ring-foreground/20',
          )}
          disabled={busy}
          onClick={onOpenCrop}
        >
          <Scissors className="size-3.5" aria-hidden />
          Crop
        </StudioWorkspaceButton>
        <StudioWorkspaceButton
          className="h-8 px-3 text-xs gap-1.5"
          disabled={busy}
          loading={removeBackgroundInFlight}
          onClick={onRemoveBackground}
        >
          {!removeBackgroundInFlight ? (
            <Eraser className="size-3.5" aria-hidden />
          ) : null}
          {removeBackgroundInFlight ? 'Removing background…' : 'Remove Background'}
        </StudioWorkspaceButton>
      </div>

      <div className="space-y-2 pt-1 border-t border-border/50">
        <p className="sl-post-production-credit-note text-[10px]">
          Remove Background · {postProductionStudioCreditLabel()}
        </p>
        <p className="text-[10px] text-muted-foreground">Crop is free — no Studio Credits.</p>
        <div className="flex flex-wrap gap-2">
          <StudioWorkspaceButton
            className="h-8 px-3 text-xs gap-1.5"
            disabled={busy || !canRevert}
            onClick={onRevert}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Revert to Original
          </StudioWorkspaceButton>
          <StudioWorkspaceButton
            className="h-8 px-3 text-xs gap-1.5"
            disabled={busy}
            onClick={onZoom}
          >
            <ZoomIn className="size-3.5" aria-hidden />
            Zoom
          </StudioWorkspaceButton>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use StudioPostProductionPanel */
export const StudioRefinePanel = StudioPostProductionPanel;
