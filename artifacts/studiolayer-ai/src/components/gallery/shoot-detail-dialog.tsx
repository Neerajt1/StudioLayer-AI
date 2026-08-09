import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Wand2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { GalleryImageDownloadButton } from '@/components/shared/gallery-image-download-button';
import { FixedBatchViewport } from '@/components/shared/fixed-batch-viewport';
import {
  formatShootDate,
  SHOOT_TYPE_LABEL,
  type GalleryShoot,
} from '@/lib/gallery-shoots';
import { GALLERY_EXIT_ANIMATION_MS } from '@/lib/gallery-shoot-stability';
import { fetchEditorialImageBlob } from '@/lib/download-image';
import { formatDownloadPreparingLabel } from '@/lib/download-preparing-label';
import { useDownloadInFlight } from '@/hooks/use-download-in-flight';
import { useStudioPressFeedback } from '@/components/studio/studio-workspace-controls';
import type { CreativeLedgerCardRender } from '@/components/gallery/creative-ledger-card';

interface ShootDetailDialogProps {
  shoot: GalleryShoot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInspect: (render: CreativeLedgerCardRender) => void;
  onEdit: (render: CreativeLedgerCardRender) => void;
  onDelete: (render: CreativeLedgerCardRender) => Promise<void>;
  onDownloadError?: (message: string) => void;
  getDisplayUrl?: (render: CreativeLedgerCardRender) => string | null | undefined;
}

export function ShootDetailDialog({
  shoot,
  open,
  onOpenChange,
  onInspect,
  onEdit,
  onDelete,
  onDownloadError,
  getDisplayUrl,
}: ShootDetailDialogProps) {
  const {
    inFlight: downloadingAll,
    elapsedSec: downloadAllElapsedSec,
    run: runDownloadAll,
  } = useDownloadInFlight();
  const [pendingDelete, setPendingDelete] = useState<CreativeLedgerCardRender | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [exitingIds, setExitingIds] = useState<Set<number>>(() => new Set());
  const [removedIds, setRemovedIds] = useState<Set<number>>(() => new Set());
  const displayImages = useMemo(() => {
    if (!shoot) return [];
    return shoot.images.filter((render) => !removedIds.has(render.id));
  }, [shoot, removedIds]);
  const deleteInFlight = deletingId != null;
  const downloadAllDisabled =
    downloadingAll || displayImages.length === 0 || deleteInFlight;
  const { pressed: downloadAllPressed, pressHandlers: downloadAllPressHandlers } =
    useStudioPressFeedback(downloadAllDisabled);

  useEffect(() => {
    setExitingIds(new Set());
    setRemovedIds(new Set());
    setPendingDelete(null);
    setDeletingId(null);
  }, [shoot?.id]);

  if (!shoot) {
    return null;
  }

  const renderDetailCell = (index: number) => {
    const render = displayImages[index];
    if (!render) return null;

    const isExiting = exitingIds.has(render.id);
    const isDeleting = deletingId === render.id;
    const imageUrl = getDisplayUrl?.(render) ?? render.outputImageUrl;

    return (
      <div
        key={render.id}
        className={cn(
          'sl-shoot-detail-cell',
          isExiting && 'sl-shoot-detail-cell--exit',
        )}
      >
        <button
          type="button"
          className="sl-shoot-detail-image-trigger"
          onClick={() => onInspect(render)}
          aria-label={`Inspect image ${index + 1}`}
          disabled={deleteInFlight}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Image ${index + 1}`}
              className="sl-shoot-detail-image"
              draggable={false}
            />
          ) : null}
        </button>
        <div className="sl-shoot-detail-actions" aria-label={`Image ${index + 1} actions`}>
          <button
            type="button"
            className="sl-ledger-card-action"
            disabled={deleteInFlight}
            onClick={() => onInspect(render)}
          >
            View
          </button>
          <button
            type="button"
            className="sl-ledger-card-action sl-shoot-detail-refine"
            disabled={deleteInFlight || !render.outputImageUrl}
            onClick={() => onEdit(render)}
          >
            <Wand2 className="size-3 shrink-0 opacity-70" aria-hidden />
            Edit
          </button>
          <GalleryImageDownloadButton
            renderId={render.id}
            outputImageUrl={imageUrl ?? render.outputImageUrl!}
            disabled={!imageUrl || deleteInFlight}
            onDownloadError={onDownloadError}
          />
          <button
            type="button"
            className="sl-ledger-card-action sl-ledger-card-action--delete sl-shoot-detail-delete"
            disabled={deleteInFlight}
            aria-busy={isDeleting || undefined}
            onClick={() => setPendingDelete(render)}
          >
            {isDeleting ? (
              <>
                <Spinner className="sl-shoot-detail-delete-spinner" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    );
  };

  const handleDownloadAll = () => {
    void runDownloadAll(async () => {
      const zip = new JSZip();
      await Promise.all(
        displayImages.map(async (render, index) => {
          if (!render.outputImageUrl) return;
          const blob = await fetchEditorialImageBlob(render.outputImageUrl, render.id);
          if (blob.size === 0) return;
          zip.file(`image_${index + 1}.png`, blob);
        }),
      );
      const blob = await zip.generateAsync({ type: 'blob' });
      const ts = formatShootDate(shoot.createdAt).replace(/\s/g, '-');
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `StudioLayer_${SHOOT_TYPE_LABEL[shoot.generationType].replace(/\s/g, '')}_${ts}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    });
  };

  const handleConfirmDelete = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (!pendingDelete || deleteInFlight) return;

    const target = pendingDelete;
    setDeletingId(target.id);

    try {
      await onDelete(target);
      setExitingIds((current) => new Set(current).add(target.id));
      await new Promise((resolve) => {
        window.setTimeout(resolve, GALLERY_EXIT_ANIMATION_MS);
      });
      setRemovedIds((current) => new Set(current).add(target.id));
      setExitingIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
      setPendingDelete(null);
    } catch {
      setExitingIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sl-shoot-detail-dialog gap-0 border border-border bg-card p-0 sm:max-w-4xl">
          <DialogHeader className="sl-shoot-detail-header space-y-3 border-b border-border px-6 py-5 text-left">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <DialogTitle className="text-base font-medium tracking-normal">
                  {SHOOT_TYPE_LABEL[shoot.generationType]}
                </DialogTitle>
                <p className="text-xs text-muted-foreground font-mono">
                  Generated {formatShootDate(shoot.createdAt)}
                </p>
              </div>
              <button
                type="button"
                className={cn(
                  'sl-shoot-detail-download-all',
                  downloadAllPressed && 'is-pressed',
                  downloadingAll && 'is-loading',
                )}
                disabled={downloadAllDisabled}
                aria-busy={downloadingAll || undefined}
                onClick={handleDownloadAll}
                {...downloadAllPressHandlers}
              >
                {downloadingAll ? (
                  <>
                    <span className="sl-shoot-detail-download-all-spinner" aria-hidden />
                    {formatDownloadPreparingLabel(downloadAllElapsedSec)}
                  </>
                ) : (
                  'Download All'
                )}
              </button>
            </div>
            <dl className="sl-shoot-detail-stats">
              <div>
                <dt>Studio Credits Used</dt>
                <dd>{shoot.studioCreditsUsed}</dd>
              </div>
              <div>
                <dt>Refinements</dt>
                <dd>{shoot.refinementCount}</dd>
              </div>
            </dl>
          </DialogHeader>

          <div className="sl-shoot-detail-body">
            <FixedBatchViewport
              totalCount={displayImages.length}
              gridClassName="sl-shoot-detail-grid"
              renderCell={(index) => renderDetailCell(index)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleteInFlight) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="sl-gallery-delete-dialog">
          <AlertDialogHeader className="sl-gallery-delete-header">
            <AlertDialogTitle className="sl-gallery-delete-title">
              Delete Image?
            </AlertDialogTitle>
            <AlertDialogDescription className="sl-gallery-delete-description">
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sl-gallery-delete-footer">
            <AlertDialogCancel
              className="sl-gallery-delete-cancel"
              disabled={deleteInFlight}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="sl-gallery-delete-confirm"
              disabled={deleteInFlight}
              onClick={(event) => void handleConfirmDelete(event)}
            >
              {deleteInFlight ? (
                <>
                  <Spinner className="sl-gallery-delete-spinner" />
                  Delete
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
