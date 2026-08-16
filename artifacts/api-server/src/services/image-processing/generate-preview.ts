// ---------------------------------------------------------------------------
// Gallery card preview generation — Sharp resize only (original untouched)
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { verifyPngHasTransparency } from "./verify-png-alpha.js";

export const PREVIEW_LONG_EDGE_PX = 512;

export type PreviewFormat = "webp" | "png";

export interface GeneratedPreview {
  buffer: Buffer;
  format: PreviewFormat;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export interface GeneratePreviewOptions {
  /** Force alpha-preserving PNG output (Remove Background child renders). */
  preserveAlpha?: boolean;
}

export function previewObjectKey(renderId: number, format: PreviewFormat): string {
  return `renders/${renderId}/preview.${format}`;
}

async function sourceHasTransparency(sourceBuffer: Buffer, metadata: sharp.Metadata): Promise<boolean> {
  if (metadata.hasAlpha === true || metadata.channels === 4) {
    return true;
  }

  if (metadata.format !== "png") {
    return false;
  }

  try {
    const verification = verifyPngHasTransparency(sourceBuffer);
    return verification.hasTransparentPixels;
  } catch {
    return false;
  }
}

/**
 * Builds a lightweight Gallery preview from a full-resolution source buffer.
 * Does not mutate the original buffer or object.
 */
export async function generatePreviewBuffer(
  sourceBuffer: Buffer,
  options: GeneratePreviewOptions = {},
): Promise<GeneratedPreview> {
  const metadata = await sharp(sourceBuffer, { failOn: "none" }).metadata();
  const hasAlpha =
    options.preserveAlpha === true || (await sourceHasTransparency(sourceBuffer, metadata));

  const resized = sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .resize({
      width: PREVIEW_LONG_EDGE_PX,
      height: PREVIEW_LONG_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (hasAlpha) {
    const buffer = await resized.png({ compressionLevel: 9, effort: 7 }).toBuffer();
    const outMeta = await sharp(buffer).metadata();
    return {
      buffer,
      format: "png",
      width: outMeta.width ?? 0,
      height: outMeta.height ?? 0,
      hasAlpha: true,
    };
  }

  const buffer = await resized.webp({ quality: 82, effort: 4 }).toBuffer();
  const outMeta = await sharp(buffer).metadata();
  return {
    buffer,
    format: "webp",
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    hasAlpha: false,
  };
}
