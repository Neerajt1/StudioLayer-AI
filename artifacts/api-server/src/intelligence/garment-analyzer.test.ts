import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGarmentAnalysisVisionContent } from "./garment-analyzer.js";

const FRONT = "https://example.invalid/front.jpg";
const BACK = "https://example.invalid/back.jpg";
const DETAIL = "https://example.invalid/detail.jpg";

function imageUrls(content: ReturnType<typeof buildGarmentAnalysisVisionContent>): string[] {
  return content
    .filter((part): part is { type: "image_url"; image_url: { url: string; detail: "low" } } =>
      part.type === "image_url",
    )
    .map((part) => part.image_url.url);
}

describe("buildGarmentAnalysisVisionContent", () => {
  it("A. Front only — preserves historical single-image content shape", () => {
    const content = buildGarmentAnalysisVisionContent({
      frontImageUrl: FRONT,
    });

    assert.equal(content.length, 2);
    assert.equal(content[0]?.type, "text");
    assert.equal(content[1]?.type, "image_url");
    assert.deepEqual(imageUrls(content), [FRONT]);
    assert.ok(
      content.every(
        (part) =>
          part.type !== "text" ||
          (!part.text.includes("Back") && !part.text.includes("Detail") && !part.text.includes("Front (primary")),
      ),
    );
  });

  it("B. Front + Back — includes both images with front first", () => {
    const content = buildGarmentAnalysisVisionContent({
      frontImageUrl: FRONT,
      backImageUrl: BACK,
    });

    assert.deepEqual(imageUrls(content), [FRONT, BACK]);
    assert.ok(content.some((part) => part.type === "text" && part.text.includes("Back")));
  });

  it("C. Front + Detail — includes both images with front first", () => {
    const content = buildGarmentAnalysisVisionContent({
      frontImageUrl: FRONT,
      detailImageUrl: DETAIL,
    });

    assert.deepEqual(imageUrls(content), [FRONT, DETAIL]);
    assert.ok(content.some((part) => part.type === "text" && part.text.includes("Detail")));
  });

  it("D. Front + Back + Detail — includes all three images in order", () => {
    const content = buildGarmentAnalysisVisionContent({
      frontImageUrl: FRONT,
      backImageUrl: BACK,
      detailImageUrl: DETAIL,
    });

    assert.deepEqual(imageUrls(content), [FRONT, BACK, DETAIL]);
  });
});
