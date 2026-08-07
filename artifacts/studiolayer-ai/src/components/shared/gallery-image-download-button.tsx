import { cn } from '@/lib/utils';
import { formatDownloadPreparingLabel } from '@/lib/download-preparing-label';
import { useDownloadInFlight } from '@/hooks/use-download-in-flight';
import { triggerImageDownload } from '@/lib/download-image';
import { useStudioPressFeedback } from '@/components/studio/studio-workspace-controls';

export interface GalleryImageDownloadButtonProps {
  renderId: number;
  outputImageUrl: string;
  disabled?: boolean;
  label?: string;
  onDownloadError?: (message: string) => void;
}

/** Gallery-only direct original download — no format menu, no Workspace UI. */
export function GalleryImageDownloadButton({
  renderId,
  outputImageUrl,
  disabled = false,
  label = 'Download',
  onDownloadError,
}: GalleryImageDownloadButtonProps) {
  const { inFlight, elapsedSec, run } = useDownloadInFlight();
  const isDisabled = disabled || inFlight;
  const { pressed, pressHandlers } = useStudioPressFeedback(isDisabled);

  const handleClick = () => {
    void run(async () => {
      try {
        await triggerImageDownload(outputImageUrl, { renderId });
      } catch {
        onDownloadError?.("We couldn't download this image.");
      }
    });
  };

  return (
    <button
      type="button"
      className={cn(
        'sl-ledger-card-action',
        pressed && 'is-pressed',
        inFlight && 'is-loading',
      )}
      disabled={isDisabled}
      aria-busy={inFlight || undefined}
      data-testid={`btn-download-render-${renderId}`}
      onClick={handleClick}
      {...pressHandlers}
    >
      {inFlight ? (
        <>
          <span className="sl-ledger-card-action-spinner" aria-hidden />
          {formatDownloadPreparingLabel(elapsedSec)}
        </>
      ) : (
        label
      )}
    </button>
  );
}
