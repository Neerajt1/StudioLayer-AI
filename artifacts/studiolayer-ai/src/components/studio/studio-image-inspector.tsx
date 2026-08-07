import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Extensible inspection target — reserved for future compare/metadata modes. */
export interface StudioImageInspectionTarget {
  imageUrl: string;
  alt?: string;
  renderId?: number;
}

interface StudioImageInspectorProps {
  target: StudioImageInspectionTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3, 4] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function StudioImageInspector({
  target,
  open,
  onOpenChange,
}: StudioImageInspectorProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const scale = ZOOM_LEVELS[zoomIndex] ?? 1;
  const canPan = scale > 1;

  const resetView = useCallback(() => {
    setZoomIndex(0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) {
      resetView();
    }
  }, [open, resetView]);

  useEffect(() => {
    resetView();
  }, [target?.imageUrl, resetView]);

  const zoomIn = useCallback(() => {
    setZoomIndex((current) => Math.min(current + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((current) => {
      const next = Math.max(current - 1, 0);
      if (next === 0) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canPan) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    dragOrigin.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !canPan) return;

    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    const viewport = viewportRef.current;
    const maxX = viewport ? viewport.clientWidth * (scale - 1) * 0.45 : 240;
    const maxY = viewport ? viewport.clientHeight * (scale - 1) * 0.45 : 240;

    setPan({
      x: clamp(dragOrigin.current.panX + dx, -maxX, maxX),
      y: clamp(dragOrigin.current.panY + dy, -maxY, maxY),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
      }
      if (event.key === '-') {
        event.preventDefault();
        zoomOut();
      }
      if (event.key === '0') {
        event.preventDefault();
        resetView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, zoomIn, zoomOut, resetView]);

  const zoomLabel = `${Math.round(scale * 100)}%`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sl-studio-image-inspector border-0 bg-transparent p-0 shadow-none sm:rounded-none [&>button]:hidden"
        onPointerDownOutside={() => onOpenChange(false)}
      >
        <DialogTitle className="sr-only">
          Image inspection{target?.alt ? ` — ${target.alt}` : ''}
        </DialogTitle>

        <div className="sl-studio-image-inspector-shell">
          <div className="sl-studio-image-inspector-toolbar" role="toolbar" aria-label="Image inspection controls">
            <button
              type="button"
              className="sl-studio-image-inspector-control"
              onClick={zoomOut}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="sl-studio-image-inspector-zoom-label" aria-live="polite">
              {zoomLabel}
            </span>
            <button
              type="button"
              className="sl-studio-image-inspector-control"
              onClick={zoomIn}
              disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="sl-studio-image-inspector-divider" aria-hidden />
            <button
              type="button"
              className="sl-studio-image-inspector-control"
              onClick={resetView}
              disabled={zoomIndex === 0 && pan.x === 0 && pan.y === 0}
              aria-label="Reset to fit"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="sl-studio-image-inspector-control sl-studio-image-inspector-control--close"
              onClick={() => onOpenChange(false)}
              aria-label="Close inspection"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <div
            ref={viewportRef}
            className={cn(
              'sl-studio-image-inspector-viewport',
              canPan && 'sl-studio-image-inspector-viewport--pannable',
              isDragging && 'sl-studio-image-inspector-viewport--dragging',
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {target?.imageUrl ? (
              <img
                src={target.imageUrl}
                alt={target.alt ?? 'Editorial image inspection'}
                className={cn(
                  'sl-studio-image-inspector-image',
                  !isDragging && 'sl-studio-image-inspector-image--animated',
                )}
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
                }}
                draggable={false}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
