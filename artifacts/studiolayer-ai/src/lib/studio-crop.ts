// ---------------------------------------------------------------------------
// Studio crop — free client-side tool (Batch 21)
// Operates on the Master Asset (3200 × 4000, 4:5) — never invokes AI.
// Never consumes Studio Credits.
// ---------------------------------------------------------------------------

import {
  PLATFORM_ASPECT_RATIO,
  PLATFORM_MASTER_HEIGHT,
  PLATFORM_MASTER_WIDTH,
} from './image-architecture';

export type CropPreset = 'original' | 'portrait' | 'full_body' | 'square';

/** Portrait preset matches the platform master aspect ratio (4:5). */
const PRESET_ASPECT: Record<Exclude<CropPreset, 'original'>, number> = {
  portrait: PLATFORM_ASPECT_RATIO,
  full_body: 2 / 3,
  square: 1,
};

/** Platform master dimensions — crop always sources from the stored master asset. */
export const MASTER_ASSET_DIMENSIONS = {
  width: PLATFORM_MASTER_WIDTH,
  height: PLATFORM_MASTER_HEIGHT,
} as const;

export const CROP_PRESET_OPTIONS: ReadonlyArray<{ value: CropPreset; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'square', label: 'Square' },
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for crop'));
    img.src = url;
  });
}

function computeCropRect(
  width: number,
  height: number,
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  const imageAspect = width / height;
  if (imageAspect > aspect) {
    const w = Math.round(height * aspect);
    const x = Math.round((width - w) / 2);
    return { x, y: 0, w, h: height };
  }
  const h = Math.round(width / aspect);
  const y = Math.round((height - h) / 2);
  return { x: 0, y, w: width, h };
}

/** Crop an image URL to a preset aspect ratio. Returns a blob object URL. */
export async function cropImageToPreset(
  imageUrl: string,
  preset: CropPreset,
): Promise<string> {
  if (preset === 'original') {
    return imageUrl;
  }

  const img = await loadImage(imageUrl);
  const aspect = PRESET_ASPECT[preset];
  const { x, y, w, h } = computeCropRect(img.naturalWidth, img.naturalHeight, aspect);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }

  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Crop export failed'))),
      'image/png',
    );
  });

  return URL.createObjectURL(blob);
}

export function revokeCropObjectUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
