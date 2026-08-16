// ---------------------------------------------------------------------------
// Resolution-preserving background removal compositor
//
// Applies a FAL segmentation mask to the ORIGINAL full-resolution image.
// Output dimensions always match the original — never FAL's operating size.
// ---------------------------------------------------------------------------

import sharp from "sharp";

export class MaskCompositeError extends Error {
  readonly code = "MASK_COMPOSITE_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "MaskCompositeError";
  }
}

export async function readImageDimensions(
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new MaskCompositeError("Could not read image dimensions");
  }
  return { width: meta.width, height: meta.height };
}

/**
 * Composite a grayscale segmentation mask onto the original RGB image.
 * The mask is resized to exactly match the original width × height.
 * White mask pixels → opaque; black mask pixels → transparent.
 */
export async function applyMaskToOriginal(
  originalBuffer: Buffer,
  maskBuffer: Buffer,
): Promise<Buffer> {
  const oriented = sharp(originalBuffer).rotate();
  const meta = await oriented.metadata();
  const width = meta.width;
  const height = meta.height;

  if (!width || !height) {
    throw new MaskCompositeError("Original image has no readable dimensions");
  }

  const rgb = await oriented
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (rgb.info.width !== width || rgb.info.height !== height) {
    throw new MaskCompositeError("Original RGB extraction dimension mismatch");
  }

  const channels = rgb.info.channels;
  if (channels !== 3 && channels !== 4) {
    throw new MaskCompositeError(
      `Unsupported original channel count: ${channels}`,
    );
  }

  const alpha = await sharp(maskBuffer)
    .resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (alpha.info.width !== width || alpha.info.height !== height) {
    throw new MaskCompositeError(
      `Mask resize produced ${alpha.info.width}×${alpha.info.height}, `
        + `expected ${width}×${height}`,
    );
  }

  const pixelCount = width * height;
  const rgba = Buffer.alloc(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const rgbOffset = i * channels;
    rgba[i * 4] = rgb.data[rgbOffset]!;
    rgba[i * 4 + 1] = rgb.data[rgbOffset + 1]!;
    rgba[i * 4 + 2] = rgb.data[rgbOffset + 2]!;
    rgba[i * 4 + 3] = alpha.data[i]!;
  }

  const output = await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 6, effort: 4, force: true, palette: false })
    .toBuffer();

  const outMeta = await sharp(output).metadata();
  if (outMeta.width !== width || outMeta.height !== height) {
    throw new MaskCompositeError(
      `Compositor output ${outMeta.width ?? "?"}×${outMeta.height ?? "?"} `
        + `does not match source ${width}×${height}`,
    );
  }

  return output;
}
