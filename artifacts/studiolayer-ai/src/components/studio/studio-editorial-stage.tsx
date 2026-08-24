// ---------------------------------------------------------------------------
// Studio Workspace — Editorial result canvas (hero image area)
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react';
import { Camera, Download, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { workspaceGenerationFailedSlotCopy } from '@/lib/generation-failure-copy';
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
            Your generated fashion image will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

interface EditorialImageActionsProps {
  renderId: number;
  outputImageUrl: string;
  editDisabled?: boolean;
  editActive?: boolean;
  onEdit: () => void;
  onDownloadError?: (message: string) => void;
}

/** Compact Edit + Download controls overlaid on a result image. */
export function EditorialImageActions({
  renderId,
  outputImageUrl,
  editDisabled = false,
  editActive = false,
  onEdit,
  onDownloadError,
}: EditorialImageActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <StudioWorkspaceButton
        variant="icon"
        disabled={editDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        aria-label="Edit image"
        title="Edit image"
        className={cn(editActive && 'ring-1 ring-white/80')}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
      </StudioWorkspaceButton>
      <div onClick={(event) => event.stopPropagation()}>
        <EditorialDownloadMenu
          renderId={renderId}
          outputImageUrl={outputImageUrl}
          label="Download image"
          variant="icon"
          onDownloadError={onDownloadError}
        />
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
  /** Opens post-production controls (Crop, Remove Background). */
  onEdit?: () => void;
  downloadLabel?: string;
  disableEdit?: boolean;
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
  onEdit,
  downloadLabel = 'Download',
  disableEdit = false,
  onInsufficientCredits,
  onDownloadError,
  onCreditsConsumed,
}: StudioResultToolbarProps) {
  const hasDownload = Boolean(onDownloadAll || (renderId && outputImageUrl));
  const hasEdit = Boolean(onEdit);

  if (!hasDownload && !hasEdit) {
    return null;
  }

  return (
    <div className={cn(
      'sl-studio-result-toolbar',
      !(hasDownload && hasEdit) && 'sl-studio-result-toolbar--single',
    )}>
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
      ) : renderId && outputImageUrl ? (
        <EditorialDownloadMenu
          renderId={renderId}
          outputImageUrl={outputImageUrl}
          label={downloadLabel}
          variant="toolbar"
          onDownloadError={onDownloadError}
        />
      ) : null}
      {onEdit ? (
        <StudioWorkspaceButton
          className="sl-studio-toolbar-btn gap-2"
          onClick={onEdit}
          disabled={disableEdit}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Edit Image
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

/** Fallback for multi-image failed slots — subtle, does not overpower successes. */
export function StudioEditorialFailedState({
  onRetry,
}: {
  onRetry?: () => void;
}) {
  const copy = workspaceGenerationFailedSlotCopy();

  return (
    <div className="sl-studio-editorial-failed flex flex-col items-center gap-1.5 px-3 py-4 text-center">
      <Camera className="h-4 w-4 text-muted-foreground/35" aria-hidden />
      <p className="text-[10px] font-mono text-muted-foreground/70">{copy.headline}</p>
      <p className="text-[9px] font-mono text-muted-foreground/55">{copy.creditLine}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-1 text-[10px] font-mono text-muted-foreground/80 underline underline-offset-2 transition-opacity hover:text-foreground"
          onClick={onRetry}
        >
          {copy.retryLabel}
        </button>
      ) : null}
    </div>
  );
}
