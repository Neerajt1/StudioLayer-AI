// ---------------------------------------------------------------------------
// Gallery Image Edit — slim post-production dialog (Fix #10 UX)
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GalleryPostProductionPanel } from '@/components/gallery/gallery-post-production-panel';
import { StudioCustomCropDialog } from '@/components/studio/studio-custom-crop-dialog';
import type { CreativeLedgerCardRender } from '@/components/gallery/creative-ledger-card';
import type { RefinementType } from '@/lib/refinement-types';
import {
  cropImageBlobToRect,
  revokeCropObjectUrl,
  type CropAspectMode,
  type NormalizedCropRect,
} from '@/lib/studio-crop';
import { fetchEditorialImageBlob } from '@/lib/download-image';
import { useToast } from '@/hooks/use-toast';

export interface GalleryCropState {
  displayUrl: string;
  customRect: NormalizedCropRect;
  customAspect: CropAspectMode;
}

interface GalleryImageEditDialogProps {
  render: CreativeLedgerCardRender | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cropState?: GalleryCropState;
  onCropStateChange: (renderId: number, state: GalleryCropState | null) => void;
  refineInFlight?: boolean;
  activeRefinement?: RefinementType | null;
  onRefine: (render: CreativeLedgerCardRender, type: RefinementType) => void;
  onDownloadError?: (message: string) => void;
}

export function GalleryImageEditDialog({
  render,
  open,
  onOpenChange,
  cropState,
  onCropStateChange,
  refineInFlight = false,
  activeRefinement = null,
  onRefine,
  onDownloadError,
}: GalleryImageEditDialogProps) {
  const { toast } = useToast();
  const [cropDialogOpen, setCropDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) setCropDialogOpen(false);
  }, [open]);

  const displayUrl = useMemo(() => {
    if (!render) return null;
    return cropState?.displayUrl ?? render.outputImageUrl;
  }, [cropState?.displayUrl, render]);

  if (!render) {
    return null;
  }

  const masterUrl = render.outputImageUrl;
  const hasCropApplied = cropState?.displayUrl != null;

  const handleCropApply = async (
    rect: NormalizedCropRect,
    aspect: CropAspectMode,
  ) => {
    if (!masterUrl) return;

    try {
      const sourceBlob = await fetchEditorialImageBlob(masterUrl, render.id);
      const croppedUrl = await cropImageBlobToRect(sourceBlob, rect);
      revokeCropObjectUrl(cropState?.displayUrl);
      onCropStateChange(render.id, {
        displayUrl: croppedUrl,
        customRect: rect,
        customAspect: aspect,
      });
    } catch {
      toast({
        title: "Couldn't apply crop.",
        description: 'Please try again.',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sl-gallery-edit-dialog gap-0 border border-border bg-card p-0">
          <DialogHeader className="sl-gallery-edit-header">
            <DialogTitle className="text-sm font-medium tracking-normal">
              Edit Image
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              Original preserved · crop is free · refinements use Studio Credits
            </p>
          </DialogHeader>

          <div className="sl-gallery-edit-layout">
            <div className="sl-gallery-edit-preview">
              {displayUrl ? (
                <img
                  src={displayUrl}
                  alt=""
                  className="sl-gallery-edit-preview-image"
                  draggable={false}
                />
              ) : null}
            </div>

            <GalleryPostProductionPanel
              hasCropApplied={hasCropApplied}
              displayUrl={displayUrl}
              masterUrl={masterUrl}
              renderId={render.id}
              disabled={!masterUrl}
              refineInFlight={refineInFlight}
              activeRefinement={activeRefinement}
              onOpenCrop={() => setCropDialogOpen(true)}
              onRefine={(type) => onRefine(render, type)}
              onDownloadError={onDownloadError}
            />
          </div>
        </DialogContent>
      </Dialog>

      <StudioCustomCropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageUrl={masterUrl}
        initialRect={cropState?.customRect}
        initialAspect={cropState?.customAspect ?? 'free'}
        onApply={(rect, aspect) => void handleCropApply(rect, aspect)}
      />
    </>
  );
}
