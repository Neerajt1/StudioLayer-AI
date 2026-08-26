import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreateRenderBody } from "@workspace/api-zod";

const BASE = {
  sourceImageUrl: "https://example.invalid/front.jpg",
  modelPersona: "casual" as const,
  locationEnvironment: "photo_studio" as const,
};

describe("CreateRenderBody multi-reference garment fields", () => {
  it("A. Front only — accepted", () => {
    const parsed = CreateRenderBody.safeParse(BASE);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.sourceImageUrl, BASE.sourceImageUrl);
      assert.equal(parsed.data.backImageUrl, undefined);
      assert.equal(parsed.data.detailImageUrl, undefined);
    }
  });

  it("B. Front + Back — accepted", () => {
    const parsed = CreateRenderBody.safeParse({
      ...BASE,
      backImageUrl: "https://example.invalid/back.jpg",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.backImageUrl, "https://example.invalid/back.jpg");
      assert.equal(parsed.data.detailImageUrl, undefined);
    }
  });

  it("C. Front + Detail — accepted", () => {
    const parsed = CreateRenderBody.safeParse({
      ...BASE,
      detailImageUrl: "https://example.invalid/detail.jpg",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.detailImageUrl, "https://example.invalid/detail.jpg");
      assert.equal(parsed.data.backImageUrl, undefined);
    }
  });

  it("D. Front + Back + Detail — accepted", () => {
    const parsed = CreateRenderBody.safeParse({
      ...BASE,
      backImageUrl: "https://example.invalid/back.jpg",
      detailImageUrl: "https://example.invalid/detail.jpg",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.backImageUrl, "https://example.invalid/back.jpg");
      assert.equal(parsed.data.detailImageUrl, "https://example.invalid/detail.jpg");
    }
  });

  it("rejects missing front/sourceImageUrl", () => {
    const parsed = CreateRenderBody.safeParse({
      modelPersona: "casual",
      locationEnvironment: "photo_studio",
      backImageUrl: "https://example.invalid/back.jpg",
    });
    assert.equal(parsed.success, false);
  });
});
