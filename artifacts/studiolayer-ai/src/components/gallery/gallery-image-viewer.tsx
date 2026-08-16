import { StudioImageInspector } from '@/components/studio/studio-image-inspector';

interface GalleryImageViewerProps {
  imageUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Gallery preview viewer — reuses Workspace StudioImageInspector so zoom
 * levels (100%–400%, including 200% and 300%) stay in one place.
 */
export function GalleryImageViewer({
  imageUrl,
  open,
  onOpenChange,
}: GalleryImageViewerProps) {
  return (
    <StudioImageInspector
      target={
        imageUrl
          ? { imageUrl, alt: 'Editorial image' }
          : null
      }
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
