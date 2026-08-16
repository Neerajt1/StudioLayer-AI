import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPreviewImageUrl,
  markPreviewAvailable,
  resetPreviewRegistryState,
} from "./preview-registry.js";

describe("preview registry", () => {
  it("returns null when preview is not registered", () => {
    resetPreviewRegistryState();
    assert.equal(getPreviewImageUrl(999), null);
  });

  it("returns a public URL after preview is marked available", () => {
    resetPreviewRegistryState();
    markPreviewAvailable(7, "webp");

    const url = getPreviewImageUrl(7);
    if (process.env.R2_PUBLIC_URL) {
      assert.match(url ?? "", /renders\/7\/preview\.webp$/);
    } else {
      assert.equal(url, null);
    }
  });
});
