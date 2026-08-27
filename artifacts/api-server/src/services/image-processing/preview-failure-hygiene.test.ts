import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAdvertiseGalleryPreview,
  clearPreviewAvailability,
  getPreviewImageUrl,
  markPreviewAvailable,
  resetPreviewRegistryState,
} from "./preview-registry.js";
import { discardRenderGalleryPreview } from "./preview-storage.js";

/**
 * Mirrors artifacts/studiolayer-ai/src/lib/gallery-card-image.ts —
 * keep in sync; do not weaken completed/failed preview rules.
 */
function resolveGalleryCardImageUrl(render: {
  previewImageUrl?: string | null;
  outputImageUrl?: string | null;
  status?: string | null;
}): string | null {
  const original = render.outputImageUrl;
  const hasOutput = typeof original === "string" && original.length > 0;
  const preview = render.previewImageUrl;
  if (
    render.status === "completed" &&
    hasOutput &&
    typeof preview === "string" &&
    preview.length > 0
  ) {
    return preview;
  }
  if (hasOutput) {
    return original;
  }
  return null;
}

describe("Gallery preview failure hygiene", () => {
  it("A. completed + valid preview → Gallery resolver keeps preview", () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: "completed",
        previewImageUrl: "https://cdn.example/renders/10/preview.webp",
        outputImageUrl: "https://cdn.example/renders/10/original.jpg",
      }),
      "https://cdn.example/renders/10/preview.webp",
    );
  });

  it("B. completed + no preview → Gallery resolver keeps output", () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: "completed",
        previewImageUrl: null,
        outputImageUrl: "https://cdn.example/renders/11/original.jpg",
      }),
      "https://cdn.example/renders/11/original.jpg",
    );
  });

  it("C. failed + stale preview → Gallery resolver returns null", () => {
    assert.equal(
      resolveGalleryCardImageUrl({
        status: "failed",
        previewImageUrl: "https://cdn.example/renders/142/preview.webp",
        outputImageUrl: null,
      }),
      null,
    );
  });

  it("D. failed render cannot advertise a usable preview merely because R2/registry has one", () => {
    resetPreviewRegistryState();
    markPreviewAvailable(142, "webp");

    assert.equal(
      canAdvertiseGalleryPreview({
        status: "failed",
        outputImageUrl: null,
      }),
      false,
    );

    assert.equal(
      canAdvertiseGalleryPreview({
        status: "processing",
        outputImageUrl: null,
      }),
      false,
    );

    assert.equal(
      canAdvertiseGalleryPreview({
        status: "completed",
        outputImageUrl: null,
      }),
      false,
    );

    assert.equal(
      canAdvertiseGalleryPreview({
        status: "completed",
        outputImageUrl: "https://cdn.example/renders/10/original.jpg",
      }),
      true,
    );

    const advertised = canAdvertiseGalleryPreview({
      status: "failed",
      outputImageUrl: null,
    })
      ? getPreviewImageUrl(142)
      : null;
    assert.equal(advertised, null);

    clearPreviewAvailability(142);
  });

  it("E. preview cleanup is idempotent/safe when the R2 object does not exist", async () => {
    resetPreviewRegistryState();
    markPreviewAvailable(999001, "webp");

    await assert.doesNotReject(() => discardRenderGalleryPreview(999001));
    assert.equal(getPreviewImageUrl(999001), null);

    await assert.doesNotReject(() => discardRenderGalleryPreview(999001));
    assert.equal(getPreviewImageUrl(999001), null);
  });
});
