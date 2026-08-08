import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  defaultCropRectForAspect,
  type CropAspectMode,
  type NormalizedCropRect,
} from '@/lib/studio-crop';
import {
  adjustCropRect,
  CROP_HANDLES,
  enforceCropAspect,
  type CropHandle,
} from '@/lib/studio-crop-interaction';

interface StudioCropSelectorProps {
  imageUrl: string | null;
  imageAspect: number;
  aspect: CropAspectMode;
  rect: NormalizedCropRect;
  onRectChange: (rect: NormalizedCropRect) => void;
  className?: string;
}

export function StudioCropSelector({
  imageUrl,
  imageAspect,
  aspect,
  rect,
  onRectChange,
  className,
}: StudioCropSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: CropHandle;
    startX: number;
    startY: number;
    origin: NormalizedCropRect;
  } | null>(null);

  const onPointerDown = useCallback(
    (handle: CropHandle) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin: rect,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [rect],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;

      const bounds = container.getBoundingClientRect();
      const dx = (event.clientX - drag.startX) / bounds.width;
      const dy = (event.clientY - drag.startY) / bounds.height;

      onRectChange(
        adjustCropRect(drag.origin, drag.handle, dx, dy, aspect, imageAspect),
      );
    },
    [aspect, imageAspect, onRectChange],
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('sl-crop-selector', className)}
      style={{ aspectRatio: `${imageAspect}` }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="sl-crop-selector-image"
          draggable={false}
        />
      ) : null}
      <div className="sl-crop-selector-shade" aria-hidden />
      <div
        className="sl-crop-selector-box"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
        onPointerDown={onPointerDown('move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sl-crop-selector-grid" aria-hidden />
        {CROP_HANDLES.map((handle) => (
          <div
            key={handle.id}
            className={handle.className}
            style={{ cursor: handle.cursor }}
            onPointerDown={onPointerDown(handle.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ))}
      </div>
    </div>
  );
}

export function initialCropRectForAspect(
  aspect: CropAspectMode,
  imageAspect: number,
  existing?: NormalizedCropRect,
): NormalizedCropRect {
  const base = existing ?? defaultCropRectForAspect(aspect, imageAspect);
  if (aspect === 'free') return base;
  return enforceCropAspect(base, aspect, imageAspect, 'center');
}
