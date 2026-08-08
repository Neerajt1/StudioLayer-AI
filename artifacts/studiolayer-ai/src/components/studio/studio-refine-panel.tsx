// ---------------------------------------------------------------------------
// Studio Refine Panel — Batch 21 Reliable Refine (Fix #5 simplified UX)
// ---------------------------------------------------------------------------

import { RotateCcw, Scissors, Wand2, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  StudioToggleOption,
  StudioWorkspaceButton,
} from '@/components/studio/studio-workspace-controls';
import { AI_REFINEMENT_OPTIONS, type RefinementType } from '@/lib/refinement-types';

interface StudioRefinePanelProps {
  disabled?: boolean;
  refineInFlight?: boolean;
  activeRefinement?: RefinementType | null;
  hasCropApplied?: boolean;
  canRevert: boolean;
  imageLabel?: string;
  onRefine: (type: RefinementType) => void;
  onOpenCrop: () => void;
  onRevert: () => void;
  onZoom: () => void;
}

export function StudioRefinePanel({
  disabled = false,
  refineInFlight = false,
  activeRefinement = null,
  hasCropApplied = false,
  canRevert,
  imageLabel,
  onRefine,
  onOpenCrop,
  onRevert,
  onZoom,
}: StudioRefinePanelProps) {
  const busy = disabled || refineInFlight;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">Refine</p>
        <p className="sl-ui-helper">
          {imageLabel
            ? `Choose one AI refinement for ${imageLabel}. Each uses 1 Studio Credit.`
            : 'Choose one AI refinement for this image. Each uses 1 Studio Credit.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {AI_REFINEMENT_OPTIONS.map((option) => {
          const isRunning = refineInFlight && activeRefinement === option.type;
          return (
            <StudioToggleOption
              key={option.type}
              selected={isRunning}
              disabled={busy}
              onClick={() => onRefine(option.type)}
              className="rounded px-2 py-2.5 text-left"
            >
              <p className="text-xs font-semibold flex items-center gap-1.5">
                {!isRunning ? <Wand2 className="size-3 shrink-0 opacity-70" aria-hidden /> : null}
                {isRunning ? 'Refining…' : option.label}
              </p>
              <p className={cn(
                'text-[10px] font-mono mt-0.5 leading-tight',
                isRunning ? 'opacity-75' : 'text-muted-foreground',
              )}>
                {option.description} · 1 credit
              </p>
            </StudioToggleOption>
          );
        })}
      </div>

      <div className="space-y-2 pt-1 border-t border-border/50">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Studio Tools</p>
          <p className="sl-ui-helper">Free — no AI, no Studio Credits.</p>
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
