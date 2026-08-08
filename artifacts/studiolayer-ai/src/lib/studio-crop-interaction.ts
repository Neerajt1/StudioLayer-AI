import {
  CUSTOM_CROP_ASPECT_VALUE,
  type CropAspectMode,
  type NormalizedCropRect,
} from '@/lib/studio-crop';

export type CropHandle =
  | 'move'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw';

const MIN_CROP_SIZE = 0.08;

export function clampNormalizedRect(rect: NormalizedCropRect): NormalizedCropRect {
  let { x, y, w, h } = rect;
  w = Math.max(MIN_CROP_SIZE, Math.min(w, 1));
  h = Math.max(MIN_CROP_SIZE, Math.min(h, 1));
  x = Math.max(0, Math.min(x, 1 - w));
  y = Math.max(0, Math.min(y, 1 - h));
  return { x, y, w, h };
}

/** Enforce crop aspect in normalized image coordinates. */
export function enforceCropAspect(
  rect: NormalizedCropRect,
  aspect: CropAspectMode,
  imageAspect: number,
  anchor: 'center' | 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w' = 'center',
): NormalizedCropRect {
  const target = CUSTOM_CROP_ASPECT_VALUE[aspect];
  if (target == null) return clampNormalizedRect(rect);

  let { x, y, w, h } = rect;
  const currentAspect = (w * imageAspect) / h;

  if (currentAspect > target) {
    w = (h * target) / imageAspect;
  } else {
    h = (w * imageAspect) / target;
  }

  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;

  switch (anchor) {
    case 'se':
      x = right - w;
      y = bottom - h;
      break;
    case 'sw':
      x = rect.x;
      y = bottom - h;
      break;
    case 'ne':
      x = right - w;
      y = rect.y;
      break;
    case 'nw':
      x = rect.x;
      y = rect.y;
      break;
    case 'n':
      x = rect.x + (rect.w - w) / 2;
      y = rect.y;
      break;
    case 's':
      x = rect.x + (rect.w - w) / 2;
      y = bottom - h;
      break;
    case 'e':
      x = right - w;
      y = rect.y + (rect.h - h) / 2;
      break;
    case 'w':
      x = rect.x;
      y = rect.y + (rect.h - h) / 2;
      break;
    default:
      x = rect.x + (rect.w - w) / 2;
      y = rect.y + (rect.h - h) / 2;
      break;
  }

  return clampNormalizedRect({ x, y, w, h });
}

function anchorForHandle(handle: CropHandle): Parameters<typeof enforceCropAspect>[3] {
  switch (handle) {
    case 'se':
      return 'nw';
    case 'sw':
      return 'ne';
    case 'ne':
      return 'sw';
    case 'nw':
      return 'se';
    case 'n':
      return 's';
    case 's':
      return 'n';
    case 'e':
      return 'w';
    case 'w':
      return 'e';
    default:
      return 'center';
  }
}

export function adjustCropRect(
  origin: NormalizedCropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  aspect: CropAspectMode,
  imageAspect: number,
): NormalizedCropRect {
  if (handle === 'move') {
    return clampNormalizedRect({
      x: origin.x + dx,
      y: origin.y + dy,
      w: origin.w,
      h: origin.h,
    });
  }

  let x = origin.x;
  let y = origin.y;
  let w = origin.w;
  let h = origin.h;

  switch (handle) {
    case 'se':
      w = origin.w + dx;
      h = origin.h + dy;
      break;
    case 'sw':
      x = origin.x + dx;
      w = origin.w - dx;
      h = origin.h + dy;
      break;
    case 'ne':
      y = origin.y + dy;
      w = origin.w + dx;
      h = origin.h - dy;
      break;
    case 'nw':
      x = origin.x + dx;
      y = origin.y + dy;
      w = origin.w - dx;
      h = origin.h - dy;
      break;
    case 'n':
      y = origin.y + dy;
      h = origin.h - dy;
      break;
    case 's':
      h = origin.h + dy;
      break;
    case 'e':
      w = origin.w + dx;
      break;
    case 'w':
      x = origin.x + dx;
      w = origin.w - dx;
      break;
    default:
      break;
  }

  let rect = clampNormalizedRect({ x, y, w, h });
  if (aspect !== 'free') {
    rect = enforceCropAspect(rect, aspect, imageAspect, anchorForHandle(handle));
  }
  return rect;
}

export const CROP_HANDLES: ReadonlyArray<{
  id: CropHandle;
  className: string;
  cursor: string;
}> = [
  { id: 'nw', className: 'sl-crop-handle sl-crop-handle--nw', cursor: 'nwse-resize' },
  { id: 'n', className: 'sl-crop-handle sl-crop-handle--n', cursor: 'ns-resize' },
  { id: 'ne', className: 'sl-crop-handle sl-crop-handle--ne', cursor: 'nesw-resize' },
  { id: 'e', className: 'sl-crop-handle sl-crop-handle--e', cursor: 'ew-resize' },
  { id: 'se', className: 'sl-crop-handle sl-crop-handle--se', cursor: 'nwse-resize' },
  { id: 's', className: 'sl-crop-handle sl-crop-handle--s', cursor: 'ns-resize' },
  { id: 'sw', className: 'sl-crop-handle sl-crop-handle--sw', cursor: 'nesw-resize' },
  { id: 'w', className: 'sl-crop-handle sl-crop-handle--w', cursor: 'ew-resize' },
];
