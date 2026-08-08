// ---------------------------------------------------------------------------
// Studio crop — free client-side tool (Batch 21)
// Operates on the Master Asset — never invokes AI. Never consumes Studio Credits.
// ---------------------------------------------------------------------------

import {
  PLATFORM_ASPECT_RATIO,
  PLATFORM_MASTER_HEIGHT,
  PLATFORM_MASTER_WIDTH,
} from './image-architecture';

/** Normalized crop rectangle (0–1) relative to source dimensions. */
export interface NormalizedCropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CropAspectMode =
  | 'free'
  | 'portrait'
  | 'square'
  | 'landscape'
  | 'vertical';

/** @deprecated Use CropAspectMode */
export type CustomCropAspect = CropAspectMode;

export const CROP_ASPECT_VALUE: Record<CropAspectMode, number | null> = {
  free: null,
  portrait: PLATFORM_ASPECT_RATIO,
  square: 1,
  landscape: 16 / 9,
  vertical: 9 / 16,
};

/** @deprecated Use CROP_ASPECT_VALUE */
export const CUSTOM_CROP_ASPECT_VALUE = CROP_ASPECT_VALUE;

export const CROP_ASPECT_OPTIONS: ReadonlyArray<{ value: CropAspectMode; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: 'portrait', label: '4:5 Portrait' },
  { value: 'square', label: '1:1 Square' },
  { value: 'landscape', label: '16:9 Landscape' },
  { value: 'vertical', label: '9:16 Vertical' },
];

/** Platform master dimensions — crop always sources from the stored master asset. */
export const MASTER_ASSET_DIMENSIONS = {
  width: PLATFORM_MASTER_WIDTH,
  height: PLATFORM_MASTER_HEIGHT,
} as const;

/** Default crop window for an aspect mode within the image bounds. */
export function defaultCropRectForAspect(
  aspect: CropAspectMode = 'free',
  imageAspect = 4 / 5,
): NormalizedCropRect {
  const targetAspect = CROP_ASPECT_VALUE[aspect];
  if (targetAspect == null) {
    return { x: 0.06, y: 0.08, w: 0.88, h: 0.84 };
  }

  const width = 1;
  const height = 1;

  if (Math.abs(imageAspect - targetAspect) < 0.02) {
    const scale = aspect === 'portrait' ? 0.88 : 0.92;
    const w = scale;
    const h = w / targetAspect;
    const y = aspect === 'portrait' ? 0.1 : 0.12;
    return {
      x: (1 - w) / 2,
      y,
      w,
      h: Math.min(h, 1 - y),
    };
  }

  if (imageAspect > targetAspect) {
    const h = 0.92;
    const w = h * targetAspect;
    return { x: (1 - w) / 2, y: 0.04, w, h };
  }

  const w = 0.92;
  const h = w / targetAspect;
  const y = aspect === 'vertical' ? 0.02 : 0.06;
  return { x: (1 - w) / 2, y, w, h: Math.min(h, 1 - y) };
}

/** @deprecated Use defaultCropRectForAspect */
export const defaultCustomCropRect = defaultCropRectForAspect;

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for crop'));
    };
    img.src = objectUrl;
  });
}

export interface PixelCropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampRect(rect: PixelCropRect, width: number, height: number): PixelCropRect {
  const x = Math.max(0, Math.min(rect.x, width - 1));
  const y = Math.max(0, Math.min(rect.y, height - 1));
  const w = Math.max(1, Math.min(rect.w, width - x));
  const h = Math.max(1, Math.min(rect.h, height - y));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function normalizedToPixelRect(
  rect: NormalizedCropRect,
  width: number,
  height: number,
): PixelCropRect {
  return clampRect(
    {
      x: rect.x * width,
      y: rect.y * height,
      w: rect.w * width,
      h: rect.h * height,
    },
    width,
    height,
  );
}

async function exportCropToBlob(
  img: HTMLImageElement,
  rect: PixelCropRect,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }

  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Crop export failed'))),
      'image/png',
    );
  });

  return URL.createObjectURL(blob);
}

/** Crop image bytes to a normalized rectangle. Returns a blob object URL. */
export async function cropImageBlobToRect(
  sourceBlob: Blob,
  rect: NormalizedCropRect,
): Promise<string> {
  const img = await loadImageFromBlob(sourceBlob);
  const pixelRect = normalizedToPixelRect(rect, img.naturalWidth, img.naturalHeight);
  return exportCropToBlob(img, pixelRect);
}

export function revokeCropObjectUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
