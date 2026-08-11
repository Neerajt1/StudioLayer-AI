// ---------------------------------------------------------------------------
// Gallery Post-Production Panel — compact crop + AI refine controls (Fix #10)
// ---------------------------------------------------------------------------

import { Scissors, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';
import { GalleryImageDownloadButton } from '@/components/shared/gallery-image-download-button';
import { AI_REFINEMENT_OPTIONS, type RefinementType } from '@/lib/refinement-types';

interface GalleryPostProductionPanelProps {
  hasCropApplied?: boolean;
  isCropDialogOpen?: boolean;
  displayUrl: string | null;
  masterUrl: string | null;
  renderId: number;
  disabled?: boolean;
  refineInFlight?: boolean;
  activeRefinement?: RefinementType | null;
  onOpenCrop: () => void;
  onRefine: (type: RefinementType) => void;
  onDownloadError?: (message: string) => void;
}

export function GalleryPostProductionPanel({
  hasCropApplied = false,
  isCropDialogOpen = false,
  displayUrl,
  masterUrl,
  renderId,
  disabled = false,
  refineInFlight = false,
  activeRefinement = null,
  onOpenCrop,
  onRefine,
  onDownloadError,
}: GalleryPostProductionPanelProps) {
  const busy = disabled || refineInFlight;
  const isCropActive = hasCropApplied || isCropDialogOpen;
  const downloadUrl = displayUrl ?? masterUrl ?? '';

  return (
    <div className="sl-gallery-post-panel">
      <section className="sl-gallery-post-section">
        <div className="sl-gallery-post-section-head">
          <Scissors className="size-3.5 opacity-70" aria-hidden />
          <div>
            <p className="sl-gallery-post-section-title">Crop</p>
            <p className="sl-gallery-post-section-note">Free — no Studio Credits</p>
          </div>
        </div>
        <div className="sl-gallery-post-chip-row">
          <StudioWorkspaceButton
            className={cn('sl-gallery-post-chip', isCropActive && 'is-active')}
            disabled={busy || !masterUrl}
            aria-pressed={isCropActive}
            onClick={onOpenCrop}
          >
            Crop
          </StudioWorkspaceButton>
        </div>
      </section>

      <section className="sl-gallery-post-section">
        <div className="sl-gallery-post-section-head">
          <Wand2 className="size-3.5 opacity-70" aria-hidden />
          <div>
            <p className="sl-gallery-post-section-title">AI Refinements</p>
            <p className="sl-gallery-post-section-note">1 Studio Credit each when successful</p>
          </div>
        </div>
        <div className="sl-gallery-post-refine-list">
          {AI_REFINEMENT_OPTIONS.map((option) => {
            const isRunning = refineInFlight && activeRefinement === option.type;
            return (
              <button
                key={option.type}
                type="button"
                className={cn(
                  'sl-gallery-post-refine-item',
                  isRunning && 'is-running',
                )}
                disabled={busy || !masterUrl}
                onClick={() => onRefine(option.type)}
              >
                <span className="sl-gallery-post-refine-label">
                  {isRunning ? 'Refining…' : option.label}
                </span>
                <span className="sl-gallery-post-refine-credit">1 credit</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sl-gallery-post-section sl-gallery-post-section--download">
        <GalleryImageDownloadButton
          renderId={renderId}
          outputImageUrl={downloadUrl}
          disabled={!downloadUrl || busy}
          label="Download"
          onDownloadError={onDownloadError}
        />
      </section>
    </div>
  );
}
