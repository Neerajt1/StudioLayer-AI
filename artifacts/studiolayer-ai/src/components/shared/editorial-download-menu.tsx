// ---------------------------------------------------------------------------
// Editorial download — Batch 21: always free, original image only
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerImageDownload } from '@/lib/download-image';
import { formatDownloadPreparingLabel } from '@/lib/download-preparing-label';
import { useDownloadInFlight } from '@/hooks/use-download-in-flight';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';

export interface EditorialDownloadMenuProps {
  renderId: number;
  outputImageUrl: string;
  /** Toolbar button label when closed. */
  label?: string;
  variant?: 'toolbar' | 'icon';
  disabled?: boolean;
  onDownloadError?: (message: string) => void;
}

export function EditorialDownloadMenu({
  renderId,
  outputImageUrl,
  label = 'Download',
  variant = 'toolbar',
  disabled = false,
  onDownloadError,
}: EditorialDownloadMenuProps) {
  const { inFlight, elapsedSec, run } = useDownloadInFlight();
  const preparingLabel = formatDownloadPreparingLabel(elapsedSec);

  const handleDownload = async () => {
    if (inFlight) return;

    await run(async () => {
      try {
        await triggerImageDownload(outputImageUrl, { renderId });
      } catch {
        onDownloadError?.("We couldn't download this image.");
      }
    });
  };

  if (variant === 'icon') {
    return (
      <StudioWorkspaceButton
        variant="icon"
        disabled={disabled || inFlight}
        loading={inFlight}
        onClick={() => void handleDownload()}
        aria-label={label}
      >
        {!inFlight ? <Download className="h-4 w-4" aria-hidden /> : null}
      </StudioWorkspaceButton>
    );
  }

  return (
    <StudioWorkspaceButton
      className={cn('sl-studio-toolbar-btn gap-2')}
      disabled={disabled || inFlight}
      loading={inFlight}
      onClick={() => void handleDownload()}
      data-testid="button-download"
    >
      {!inFlight ? <Download className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      {inFlight ? preparingLabel : label}
    </StudioWorkspaceButton>
  );
}
