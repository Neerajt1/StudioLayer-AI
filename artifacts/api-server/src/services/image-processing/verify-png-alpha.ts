// ---------------------------------------------------------------------------
// PNG alpha verification — Remove Background quality gate (V1)
//
// Uses Node built-ins only (zlib). Confirms a PNG contains real transparency,
// not merely a PNG extension or opaque white backdrop.
// ---------------------------------------------------------------------------

import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class PngTransparencyVerificationError extends Error {
  readonly code = "PNG_TRANSPARENCY_VERIFICATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "PngTransparencyVerificationError";
  }
}

export interface PngAlphaVerificationResult {
  mimeType: "image/png";
  colorType: number;
  width: number;
  height: number;
  hasTransparentPixels: boolean;
  transparentPixelCount: number;
}

interface PngMetadata {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  idat: Buffer[];
  hasTrns: boolean;
}

function readChunkType(buffer: Buffer, offset: number): string {
  return buffer.toString("ascii", offset, offset + 4);
}

function parsePngMetadata(buffer: Buffer): PngMetadata {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PngTransparencyVerificationError("Asset is not a valid PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let hasTrns = false;
  const idat: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = readChunkType(buffer, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > buffer.length) {
      throw new PngTransparencyVerificationError("PNG chunk extends past file end");
    }

    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      if (data.length !== 13) {
        throw new PngTransparencyVerificationError("PNG IHDR chunk has invalid length");
      }
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "tRNS") {
      hasTrns = true;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width === 0 || height === 0 || idat.length === 0) {
    throw new PngTransparencyVerificationError("PNG is missing IHDR or IDAT data");
  }

  if (bitDepth !== 8) {
    throw new PngTransparencyVerificationError(
      `PNG bit depth ${bitDepth} is not supported for alpha verification`,
    );
  }

  return { width, height, bitDepth, colorType, idat, hasTrns };
}

function bytesPerPixel(colorType: number): number {
  switch (colorType) {
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      return 0;
  }
}

function alphaIndexForPixel(colorType: number, pixelIndex: number): number {
  if (colorType === 6) return pixelIndex * 4 + 3;
  if (colorType === 4) return pixelIndex * 2 + 1;
  return -1;
}

function unfilterScanline(
  filterType: number,
  row: Buffer,
  previousRow: Buffer | null,
  bpp: number,
): Buffer {
  const out = Buffer.from(row);

  switch (filterType) {
    case 0:
      return out;
    case 1:
      for (let i = bpp; i < out.length; i++) {
        out[i] = (out[i]! + out[i - bpp]!) & 0xff;
      }
      return out;
    case 2:
      if (!previousRow) return out;
      for (let i = 0; i < out.length; i++) {
        out[i] = (out[i]! + previousRow[i]!) & 0xff;
      }
      return out;
    case 3:
      for (let i = 0; i < out.length; i++) {
        const left = i >= bpp ? out[i - bpp]! : 0;
        const up = previousRow ? previousRow[i]! : 0;
        out[i] = (out[i]! + Math.floor((left + up) / 2)) & 0xff;
      }
      return out;
    case 4:
      for (let i = 0; i < out.length; i++) {
        const left = i >= bpp ? out[i - bpp]! : 0;
        const up = previousRow ? previousRow[i]! : 0;
        const upLeft = i >= bpp && previousRow ? previousRow[i - bpp]! : 0;
        out[i] = (out[i]! + paethPredictor(left, up, upLeft)) & 0xff;
      }
      return out;
    default:
      throw new PngTransparencyVerificationError(`Unsupported PNG filter type ${filterType}`);
  }
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function countTransparentPixels(
  metadata: PngMetadata,
  raw: Buffer,
): number {
  const bpp = bytesPerPixel(metadata.colorType);
  if (bpp === 0) {
    if (metadata.colorType === 3 && metadata.hasTrns) {
      return 1;
    }
    return 0;
  }

  const rowBytes = metadata.width * bpp;
  let offset = 0;
  let previousRow: Buffer | null = null;
  let transparentCount = 0;

  for (let y = 0; y < metadata.height; y++) {
    const filterType = raw[offset]!;
    offset += 1;
    const row = raw.subarray(offset, offset + rowBytes);
    offset += rowBytes;

    const reconstructed = unfilterScanline(filterType, row, previousRow, bpp);
    previousRow = reconstructed;

    for (let x = 0; x < metadata.width; x++) {
      const alphaIndex = alphaIndexForPixel(metadata.colorType, x);
      if (alphaIndex >= 0 && reconstructed[alphaIndex]! < 255) {
        transparentCount += 1;
      }
    }
  }

  return transparentCount;
}

export function verifyPngHasTransparency(buffer: Buffer): PngAlphaVerificationResult {
  const metadata = parsePngMetadata(buffer);

  if (metadata.colorType === 3 && metadata.hasTrns) {
    return {
      mimeType: "image/png",
      colorType: metadata.colorType,
      width: metadata.width,
      height: metadata.height,
      hasTransparentPixels: true,
      transparentPixelCount: 1,
    };
  }

  if (metadata.colorType !== 4 && metadata.colorType !== 6) {
    return {
      mimeType: "image/png",
      colorType: metadata.colorType,
      width: metadata.width,
      height: metadata.height,
      hasTransparentPixels: false,
      transparentPixelCount: 0,
    };
  }

  const raw = inflateSync(Buffer.concat(metadata.idat));
  const transparentPixelCount = countTransparentPixels(metadata, raw);

  return {
    mimeType: "image/png",
    colorType: metadata.colorType,
    width: metadata.width,
    height: metadata.height,
    hasTransparentPixels: transparentPixelCount > 0,
    transparentPixelCount,
  };
}

export function assertPngHasTransparency(buffer: Buffer): PngAlphaVerificationResult {
  const result = verifyPngHasTransparency(buffer);

  if (!result.hasTransparentPixels) {
    throw new PngTransparencyVerificationError(
      `PNG has no transparent pixels (colorType=${result.colorType}, ${result.width}x${result.height})`,
    );
  }

  return result;
}
