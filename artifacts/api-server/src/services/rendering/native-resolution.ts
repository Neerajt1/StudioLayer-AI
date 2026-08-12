// ---------------------------------------------------------------------------
// Native resolution validation — OpenRouter Gemini image generation
// ---------------------------------------------------------------------------

import type { NativeOutputResolution } from "./rendering.config.js";

export const NATIVE_2K_WIDTH = 1856;
export const NATIVE_2K_HEIGHT = 2304;
export const NATIVE_4K_WIDTH = 3712;
export const NATIVE_4K_HEIGHT = 4608;

export class NativeResolutionValidationError extends Error {
  readonly code = "NATIVE_RESOLUTION_VALIDATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "NativeResolutionValidationError";
  }
}

export function parseImageDimensionsFromBuffer(buffer: Buffer): { width: number; height: number } {
  if (
    buffer.length >= 24
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }

  throw new NativeResolutionValidationError("Unable to read image dimensions from provider response");
}

function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  if (comma === -1) {
    throw new NativeResolutionValidationError("Malformed image data URI from provider");
  }
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

/** Minimum width thresholds — rejects silent 4K→2K downgrade. */
const MIN_WIDTH_2K = 1700;
const MIN_WIDTH_4K = 3500;

export function validateNativeResolutionFromDataUri(
  dataUri: string,
  requestedResolution: NativeOutputResolution,
): { width: number; height: number } {
  const dims = parseImageDimensionsFromBuffer(dataUriToBuffer(dataUri));

  if (requestedResolution === "4K") {
    if (dims.width < MIN_WIDTH_4K) {
      throw new NativeResolutionValidationError(
        `4K generation returned ${dims.width}×${dims.height} — expected native 4K (~${NATIVE_4K_WIDTH}×${NATIVE_4K_HEIGHT}). Request failed to protect billing integrity.`,
      );
    }
    return dims;
  }

  if (dims.width < MIN_WIDTH_2K) {
    throw new NativeResolutionValidationError(
      `2K generation returned ${dims.width}×${dims.height} — below native 2K minimum (~${NATIVE_2K_WIDTH}×${NATIVE_2K_HEIGHT}).`,
    );
  }

  if (dims.width >= MIN_WIDTH_4K) {
    throw new NativeResolutionValidationError(
      `2K generation returned ${dims.width}×${dims.height} — unexpectedly at 4K tier.`,
    );
  }

  return dims;
}
