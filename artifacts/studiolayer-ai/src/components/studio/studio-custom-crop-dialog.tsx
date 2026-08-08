import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';
import { StudioCropSelector, initialCropRectForAspect } from '@/components/studio/studio-crop-selector';
import { cn } from '@/lib/utils';
import {
  CROP_ASPECT_OPTIONS,
  type CropAspectMode,
  type NormalizedCropRect,
} from '@/lib/studio-crop';

interface StudioCustomCropDialogProps {
  open: boolean;
  imageUrl: string | null;
  initialRect?: NormalizedCropRect;
  initialAspect?: CropAspectMode;
  onOpenChange: (open: boolean) => void;
  onApply: (rect: NormalizedCropRect, aspect: CropAspectMode) => void;
}

export function StudioCustomCropDialog({
  open,
  imageUrl,
  initialRect,
  initialAspect = 'free',
  onOpenChange,
  onApply,
}: StudioCustomCropDialogProps) {
  const [aspect, setAspect] = useState<CropAspectMode>(initialAspect);
  const [imageAspect, setImageAspect] = useState(4 / 5);
  const [rect, setRect] = useState<NormalizedCropRect>(
    initialRect ?? initialCropRectForAspect(initialAspect, 4 / 5),
  );

  useEffect(() => {
    if (!open) return;
    setAspect(initialAspect);
    setRect(initialCropRectForAspect(initialAspect, imageAspect, initialRect));
  }, [open, initialAspect, initialRect, imageAspect]);

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => {
      const nextAspect = img.naturalWidth / img.naturalHeight;
      setImageAspect(nextAspect);
      setRect((current) => initialCropRectForAspect(aspect, nextAspect, initialRect ?? current));
    };
    img.src = imageUrl;
  }, [imageUrl, aspect, initialRect]);

  const handleAspectChange = (nextAspect: CropAspectMode) => {
    setAspect(nextAspect);
    setRect((current) => initialCropRectForAspect(nextAspect, imageAspect, current));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sl-custom-crop-dialog gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium">Crop</DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Drag to move. Use corner and edge handles to resize. Free has no aspect lock.
          </p>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CROP_ASPECT_OPTIONS.map((option) => (
              <StudioWorkspaceButton
                key={option.value}
                className={cn(
                  'h-7 px-2.5 text-[11px]',
                  aspect === option.value && 'ring-1 ring-foreground/20',
                )}
                onClick={() => handleAspectChange(option.value)}
              >
                {option.label}
              </StudioWorkspaceButton>
            ))}
          </div>

          <StudioCropSelector
            imageUrl={imageUrl}
            imageAspect={imageAspect}
            aspect={aspect}
            rect={rect}
            onRectChange={setRect}
          />
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border gap-2 sm:gap-2">
          <StudioWorkspaceButton onClick={() => onOpenChange(false)}>Cancel</StudioWorkspaceButton>
          <StudioWorkspaceButton
            variant="primary"
            onClick={() => {
              onApply(rect, aspect);
              onOpenChange(false);
            }}
          >
            Apply Crop
          </StudioWorkspaceButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
