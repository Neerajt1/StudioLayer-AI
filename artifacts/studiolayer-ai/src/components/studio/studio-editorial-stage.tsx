// ---------------------------------------------------------------------------
// Studio Workspace — Editorial result canvas (hero image area)
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react';
import { Camera, Download, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GenerationProgressIndicator } from '@/components/studio/generation-progress-indicator';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';
import { EditorialDownloadMenu } from '@/components/shared/editorial-download-menu';

interface StudioEditorialEmptyStateProps {
  compact?: boolean;
}

export function StudioEditorialEmptyState({ compact = false }: StudioEditorialEmptyStateProps) {
  if (compact) {
    return (
      <div className="sl-studio-editorial-placeholder sl-studio-editorial-placeholder--compact">
        <div className="sl-studio-editorial-placeholder-icon sl-studio-editorial-placeholder-icon--compact">
          <Camera className="h-5 w-5 text-muted-foreground/60" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Your Editorial Image</p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Appears here after creation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sl-studio-editorial-placeholder">
      <div className="sl-studio-editorial-placeholder-frame">
        <div className="sl-studio-editorial-placeholder-icon">
          <Camera className="h-7 w-7 text-muted-foreground/55" aria-hidden />
        </div>
        <div className="sl-studio-editorial-placeholder-copy">
          <p className="text-base font-medium text-foreground">Your Editorial Image</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Upload a garment and choose a Studio Talent to begin creating professional fashion
            photography.
          </p>
        </div>
      </div>
    </div>
  );
}

interface StudioResultToolbarProps {
  renderId?: number;
  outputImageUrl?: string;
  /** When set, renders a direct download-all action (original images ZIP). */
  onDownloadAll?: () => void;
  downloadAllLoading?: boolean;
  downloadAllPreparingLabel?: string;
  onNewImage: () => void;
  /** Omitted during V1 soft launch — refine control hidden when unset. */
  onRefine?: () => void;
  downloadLabel?: string;
  disableRefine?: boolean;
  onInsufficientCredits?: () => void;
  onDownloadError?: (message: string) => void;
  onCreditsConsumed?: () => void;
}

export function StudioResultToolbar({
  renderId,
  outputImageUrl,
  onDownloadAll,
  downloadAllLoading = false,
  downloadAllPreparingLabel = 'Preparing…',
  onNewImage,
  onRefine,
  downloadLabel = 'Download',
  disableRefine = false,
  onInsufficientCredits,
  onDownloadError,
  onCreditsConsumed,
}: StudioResultToolbarProps) {
  return (
    <div className="sl-studio-result-toolbar">
      {onDownloadAll ? (
        <StudioWorkspaceButton
          className="sl-studio-toolbar-btn gap-2"
          onClick={onDownloadAll}
          disabled={downloadAllLoading}
          loading={downloadAllLoading}
          data-testid="button-download"
        >
          {!downloadAllLoading ? (
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
          {downloadAllLoading ? downloadAllPreparingLabel : downloadLabel}
        </StudioWorkspaceButton>
      ) : (
        <EditorialDownloadMenu
          renderId={renderId!}
          outputImageUrl={outputImageUrl!}
          label={downloadLabel}
          variant="toolbar"
          onDownloadError={onDownloadError}
        />
      )}
      <StudioWorkspaceButton
        className="sl-studio-toolbar-btn"
        onClick={onNewImage}
        data-testid="button-new-photoshoot"
      >
        New Image
      </StudioWorkspaceButton>
      {onRefine ? (
        <StudioWorkspaceButton
          className="sl-studio-toolbar-btn gap-2"
          onClick={onRefine}
          disabled={disableRefine}
        >
          <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Refine Image
        </StudioWorkspaceButton>
      ) : null}
    </div>
  );
}

interface StudioEditorialCanvasProps {
  children: ReactNode;
  className?: string;
  minHeightClass?: string;
  maxHeightClass?: string;
}

export function StudioEditorialCanvas({
  children,
  className,
  minHeightClass = 'min-h-[580px]',
  maxHeightClass = 'max-h-[min(92vh,1000px)]',
}: StudioEditorialCanvasProps) {
  return (
    <div className={cn('sl-studio-editorial-canvas', minHeightClass, maxHeightClass, className)}>
      <div className="sl-studio-editorial-canvas-inner">{children}</div>
    </div>
  );
}

interface StudioEditorialImageProps {
  src: string;
  alt: string;
  visible: boolean;
  maxHeightClass?: string;
  onLoad?: () => void;
  imageRef?: (node: HTMLImageElement | null) => void;
  testId?: string;
  /** Opens the premium image inspection viewer at full render quality. */
  onInspect?: () => void;
}

export function StudioEditorialImage({
  src,
  alt,
  visible,
  maxHeightClass = 'max-h-[min(calc(92vh-4rem),920px)]',
  onLoad,
  imageRef,
  testId,
  onInspect,
}: StudioEditorialImageProps) {
  const image = (
    <img
      key={src}
      src={src}
      alt={alt}
      data-testid={testId}
      onLoad={onLoad}
      ref={imageRef}
      draggable={false}
      className={cn(
        'mx-auto w-auto max-w-full object-contain transition-opacity duration-300 ease-out',
        maxHeightClass,
        visible ? 'opacity-100' : 'opacity-0',
        onInspect && visible && 'cursor-zoom-in',
      )}
    />
  );

  if (!onInspect || !visible) {
    return image;
  }

  return (
    <button
      type="button"
      className="sl-studio-editorial-image-inspect-trigger"
      onClick={onInspect}
      aria-label={`Inspect ${alt}`}
    >
      {image}
    </button>
  );
}

interface StudioEditorialPlaceholderProps {
  visible: boolean;
  compact?: boolean;
}

export function StudioEditorialPlaceholder({ visible, compact }: StudioEditorialPlaceholderProps) {
  return (
    <div
      className={cn(
        'sl-studio-editorial-placeholder-shell transition-opacity duration-300 ease-out',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <StudioEditorialEmptyState compact={compact} />
    </div>
  );
}

export function StudioEditorialProgressOverlay({
  visible,
  label,
  hint,
  elapsedSec,
}: {
  visible: boolean;
  label: string;
  hint?: string;
  elapsedSec: number;
}) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-[#FAFAF8]/90 backdrop-blur-[1px]">
      <GenerationProgressIndicator label={label} hint={hint} elapsedSec={elapsedSec} />
    </div>
  );
}

/** Fallback icon for multi-image failed slots */
export function StudioEditorialFailedState() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center">
      <Camera className="h-5 w-5 text-muted-foreground/50" aria-hidden />
      <p className="text-xs font-mono text-muted-foreground">Generation failed</p>
    </div>
  );
}
