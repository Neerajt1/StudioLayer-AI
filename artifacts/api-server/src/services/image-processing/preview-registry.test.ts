import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  canAdvertiseGalleryPreview,
  getPreviewImageUrl,
  hasPreviewAvailability,
  hydratePreviewCache,
  isPreviewLastModifiedFresh,
  markPreviewAvailable,
  resetPreviewRegistryState,
  setHeadPreviewObjectForTests,
} from "./preview-registry.js";

describe("preview registry", () => {
  afterEach(() => {
    resetPreviewRegistryState();
    setHeadPreviewObjectForTests(null);
  });

  it("returns null when preview is not registered", () => {
    assert.equal(getPreviewImageUrl(999), null);
    assert.equal(hasPreviewAvailability(999), false);
  });

  it("returns a public URL after preview is marked available", () => {
    markPreviewAvailable(7, "webp");
    assert.equal(hasPreviewAvailability(7), true);

    const url = getPreviewImageUrl(7);
    if (process.env.R2_PUBLIC_URL) {
      assert.match(url ?? "", /renders\/7\/preview\.webp$/);
    } else {
      assert.equal(url, null);
    }
  });

  it("canAdvertiseGalleryPreview requires completed + output", () => {
    assert.equal(
      canAdvertiseGalleryPreview({
        status: "failed",
        outputImageUrl: null,
      }),
      false,
    );
    assert.equal(
      canAdvertiseGalleryPreview({
        status: "completed",
        outputImageUrl: "https://cdn.example/out.jpg",
      }),
      true,
    );
  });

  it("freshness: Last-Modified not older than updatedAt", () => {
    const updatedAt = new Date("2026-08-26T18:29:15.616Z");
    assert.equal(
      isPreviewLastModifiedFresh(new Date("2026-08-26T18:29:20.000Z"), updatedAt),
      true,
    );
    assert.equal(
      isPreviewLastModifiedFresh(new Date("2026-08-26T18:29:15.616Z"), updatedAt),
      true,
    );
    assert.equal(
      isPreviewLastModifiedFresh(new Date("2026-08-17T14:42:46.000Z"), updatedAt),
      false,
    );
    assert.equal(isPreviewLastModifiedFresh(undefined, updatedAt), false);
    assert.equal(
      isPreviewLastModifiedFresh(new Date("2026-08-26T18:29:20.000Z"), null),
      false,
    );
  });
});

describe("hydratePreviewCache freshness gate", () => {
  afterEach(() => {
    resetPreviewRegistryState();
    setHeadPreviewObjectForTests(null);
  });

  const completed = {
    id: 146,
    status: "completed" as const,
    outputImageUrl: "https://cdn.example/renders/146/out.jpg",
    updatedAt: new Date("2026-08-26T18:29:15.616Z"),
  };

  it("A. completed render + fresh preview → preview is advertised", async () => {
    setHeadPreviewObjectForTests(async () => ({
      exists: true,
      lastModified: new Date("2026-08-26T18:29:20.000Z"),
    }));

    await hydratePreviewCache([completed]);
    assert.equal(hasPreviewAvailability(146), true);
  });

  it("B. completed render + stale preview → preview is NOT advertised", async () => {
    setHeadPreviewObjectForTests(async () => ({
      exists: true,
      lastModified: new Date("2026-08-17T14:42:46.000Z"),
    }));

    await hydratePreviewCache([completed]);
    assert.equal(hasPreviewAvailability(146), false);
    assert.equal(getPreviewImageUrl(146), null);
  });

  it("C. completed render + no preview → preview is NOT advertised", async () => {
    setHeadPreviewObjectForTests(async () => ({ exists: false }));

    await hydratePreviewCache([completed]);
    assert.equal(hasPreviewAvailability(146), false);
  });

  it("D. failed render + preview exists → preview is NOT advertised", async () => {
    setHeadPreviewObjectForTests(async () => ({
      exists: true,
      lastModified: new Date("2026-08-26T18:29:20.000Z"),
    }));

    await hydratePreviewCache([
      {
        id: 142,
        status: "failed",
        outputImageUrl: null,
        updatedAt: new Date("2026-08-26T16:05:19.883Z"),
      },
    ]);
    assert.equal(hasPreviewAvailability(142), false);
  });

  it("E. completed render + preview HEAD failure → preview is NOT advertised", async () => {
    setHeadPreviewObjectForTests(async () => ({ exists: false }));

    await hydratePreviewCache([completed]);
    assert.equal(hasPreviewAvailability(146), false);
  });

  it("E2. completed + exists but missing Last-Modified → NOT advertised", async () => {
    setHeadPreviewObjectForTests(async () => ({
      exists: true,
      lastModified: undefined,
    }));

    await hydratePreviewCache([completed]);
    assert.equal(hasPreviewAvailability(146), false);
  });

  it("F. completed render + outputImageUrl missing → preview is NOT advertised", async () => {
    setHeadPreviewObjectForTests(async () => ({
      exists: true,
      lastModified: new Date("2026-08-26T18:29:20.000Z"),
    }));

    await hydratePreviewCache([
      {
        id: 146,
        status: "completed",
        outputImageUrl: null,
        updatedAt: new Date("2026-08-26T18:29:15.616Z"),
      },
    ]);
    assert.equal(hasPreviewAvailability(146), false);
  });
});
