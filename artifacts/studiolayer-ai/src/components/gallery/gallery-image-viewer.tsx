import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

interface GalleryImageViewerProps {
  imageUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GalleryImageViewer({
  imageUrl,
  open,
  onOpenChange,
}: GalleryImageViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sl-gallery-image-viewer border-0 bg-transparent p-4 shadow-none sm:rounded-none [&>button]:text-white/90 [&>button]:hover:text-white">
        <DialogTitle className="sr-only">Editorial image preview</DialogTitle>
        {imageUrl ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
            <img
              src={imageUrl}
              alt="Editorial image"
              className="max-h-[calc(100dvh-2rem)] w-auto max-w-full object-contain"
              draggable={false}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
