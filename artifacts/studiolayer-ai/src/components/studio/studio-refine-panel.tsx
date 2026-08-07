// ---------------------------------------------------------------------------
// Studio Refine Panel — Batch 21 Reliable Refine
// ---------------------------------------------------------------------------

import { RotateCcw, Scissors, Wand2, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  StudioToggleOption,
  StudioWorkspaceButton,
} from '@/components/studio/studio-workspace-controls';
import { AI_REFINEMENT_OPTIONS, type RefinementType } from '@/lib/refinement-types';
import {
  CROP_PRESET_OPTIONS,
  type CropPreset,
} from '@/lib/studio-crop';

interface StudioRefinePanelProps {
  disabled?: boolean;
  refineInFlight?: boolean;
  activeRefinement?: RefinementType | null;
  cropPreset: CropPreset;
  canRevert: boolean;
  onRefine: (type: RefinementType) => void;
  onCropPresetChange: (preset: CropPreset) => void;
  onRevert: () => void;
  onZoom: () => void;
}

export function StudioRefinePanel({
  disabled = false,
  refineInFlight = false,
  activeRefinement = null,
  cropPreset,
  canRevert,
  onRefine,
  onCropPresetChange,
  onRevert,
  onZoom,
}: StudioRefinePanelProps) {
  const busy = disabled || refineInFlight;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">Refine</p>
        <p className="sl-ui-helper">
          Each AI refinement uses 1 Studio Credit and does exactly what its name promises.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {AI_REFINEMENT_OPTIONS.map((option) => {
          const isActive = refineInFlight && activeRefinement === option.type;
          return (
            <StudioToggleOption
              key={option.type}
              selected={isActive}
              disabled={busy}
              onClick={() => onRefine(option.type)}
              className="rounded px-2 py-2.5 text-left"
            >
              <p className="text-xs font-semibold flex items-center gap-1.5">
                {!isActive ? <Wand2 className="size-3 shrink-0 opacity-70" aria-hidden /> : null}
                {isActive ? 'Refining…' : option.label}
              </p>
              <p className={cn(
                'text-[10px] font-mono mt-0.5 leading-tight',
                isActive ? 'opacity-75' : 'text-muted-foreground',
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
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-wide">
            <Scissors className="size-3" aria-hidden />
            Crop
          </div>
          {CROP_PRESET_OPTIONS.map((preset) => (
            <StudioWorkspaceButton
              key={preset.value}
              className={cn(
                'h-7 px-2.5 text-[11px] font-medium',
                cropPreset === preset.value && 'ring-1 ring-foreground/20',
              )}
              disabled={busy}
              onClick={() => onCropPresetChange(preset.value)}
            >
              {preset.label}
            </StudioWorkspaceButton>
          ))}
        </div>

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
