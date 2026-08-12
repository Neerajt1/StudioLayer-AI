import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NativeResolutionValidationError,
  validateNativeResolutionFromDataUri,
} from "./native-resolution.js";

function jpegDataUri(width: number, height: number): string {
  // Minimal JPEG with SOF0 dimensions — enough for parseImageDimensionsFromBuffer
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    sof,
    Buffer.from([0xff, 0xd9]),
  ]);
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

describe("native resolution validation", () => {
  it("accepts native 2K dimensions", () => {
    const dims = validateNativeResolutionFromDataUri(jpegDataUri(1856, 2304), "2K");
    assert.equal(dims.width, 1856);
    assert.equal(dims.height, 2304);
  });

  it("accepts native 4K dimensions", () => {
    const dims = validateNativeResolutionFromDataUri(jpegDataUri(3712, 4608), "4K");
    assert.equal(dims.width, 3712);
    assert.equal(dims.height, 4608);
  });

  it("rejects silent 4K→2K downgrade", () => {
    assert.throws(
      () => validateNativeResolutionFromDataUri(jpegDataUri(1856, 2304), "4K"),
      (err: unknown) =>
        err instanceof NativeResolutionValidationError
        && err.message.includes("4K generation returned"),
    );
  });

  it("rejects undersized 2K output", () => {
    assert.throws(
      () => validateNativeResolutionFromDataUri(jpegDataUri(928, 1152), "2K"),
      NativeResolutionValidationError,
    );
  });
});
