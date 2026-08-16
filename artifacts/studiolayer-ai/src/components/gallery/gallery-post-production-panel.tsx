// ---------------------------------------------------------------------------
// Gallery Post-Production Panel — Crop (free) + Remove Background
// ---------------------------------------------------------------------------

import { Eraser, Scissors } from 'lucide-react';
import { postProductionStudioCreditLabel } from '@workspace/studio-credit-engine';
import { cn } from '@/lib/utils';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';
import { GalleryImageDownloadButton } from '@/components/shared/gallery-image-download-button';

interface GalleryPostProductionPanelProps {
  hasCropApplied?: boolean;
  isCropDialogOpen?: boolean;
  displayUrl: string | null;
  masterUrl: string | null;
  renderId: number;
  disabled?: boolean;
  removeBackgroundInFlight?: boolean;
  preservePngAlpha?: boolean;
  onOpenCrop: () => void;
  onRemoveBackground: () => void;
  onDownloadError?: (message: string) => void;
}

export function GalleryPostProductionPanel({
  hasCropApplied = false,
  isCropDialogOpen = false,
  displayUrl,
  masterUrl,
  renderId,
  disabled = false,
  removeBackgroundInFlight = false,
  preservePngAlpha = false,
  onOpenCrop,
  onRemoveBackground,
  onDownloadError,
}: GalleryPostProductionPanelProps) {
  const busy = disabled || removeBackgroundInFlight;
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
          <Eraser className="size-3.5 opacity-70" aria-hidden />
          <div>
            <p className="sl-gallery-post-section-title">Remove Background</p>
          </div>
        </div>
        <div className="sl-gallery-post-chip-row">
          <StudioWorkspaceButton
            className="sl-gallery-post-chip"
            disabled={busy || !masterUrl || preservePngAlpha}
            loading={removeBackgroundInFlight}
            onClick={onRemoveBackground}
          >
            {removeBackgroundInFlight ? 'Removing background…' : 'Remove Background'}
          </StudioWorkspaceButton>
        </div>
        <p className="sl-gallery-post-section-note sl-post-production-credit-note sl-gallery-post-credit-below-action">
          {postProductionStudioCreditLabel()}
        </p>
        <p className="sl-gallery-post-section-note">
          Transparent PNG at original resolution
        </p>
        <p className="text-[10px] font-normal leading-relaxed text-muted-foreground/75">
          AI background removal may produce minor variations around fine details such as hair or very fine edges.
        </p>
      </section>

      <section className="sl-gallery-post-section sl-gallery-post-section--download">
        <GalleryImageDownloadButton
          renderId={renderId}
          outputImageUrl={downloadUrl}
          disabled={!downloadUrl || busy}
          preservePngAlpha={preservePngAlpha}
          label="Download"
          onDownloadError={onDownloadError}
        />
      </section>
    </div>
  );
}
