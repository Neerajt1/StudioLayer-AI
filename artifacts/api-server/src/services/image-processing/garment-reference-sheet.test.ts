import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  composeGarmentReferenceSheet,
  fitContainNeverUpscale,
  GarmentReferenceSheetError,
  planGarmentReferenceSheetLayout,
  prepareGarmentReferenceForGeneration,
} from "./garment-reference-sheet.js";

async function solidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

function assertAspectPreserved(
  srcW: number,
  srcH: number,
  drawW: number,
  drawH: number,
  label: string,
): void {
  const srcAspect = srcW / srcH;
  const drawAspect = drawW / drawH;
  assert.ok(
    Math.abs(srcAspect - drawAspect) < 0.02,
    `${label}: aspect drifted (src ${srcAspect.toFixed(4)} vs draw ${drawAspect.toFixed(4)})`,
  );
  assert.ok(drawW <= srcW + 1, `${label}: unexpectedly upscaled width`);
  assert.ok(drawH <= srcH + 1, `${label}: unexpectedly upscaled height`);
}

describe("fitContainNeverUpscale", () => {
  it("preserves aspect and never upscales", () => {
    const fitted = fitContainNeverUpscale(1000, 2000, 400, 400);
    assert.equal(fitted.width, 200);
    assert.equal(fitted.height, 400);
    assertAspectPreserved(1000, 2000, fitted.width, fitted.height, "portrait");
  });

  it("keeps native size when already within the box", () => {
    const fitted = fitContainNeverUpscale(300, 400, 1000, 1000);
    assert.deepEqual(fitted, { width: 300, height: 400 });
  });
});

describe("planGarmentReferenceSheetLayout", () => {
  it("A. Front only — pass-through at native size", () => {
    const layout = planGarmentReferenceSheetLayout({
      front: { width: 1200, height: 1600 },
    });
    assert.equal(layout.mode, "front_only");
    assert.equal(layout.passThrough, true);
    assert.equal(layout.sheetWidth, 1200);
    assert.equal(layout.sheetHeight, 1600);
    assert.equal(layout.panels.length, 1);
    assert.equal(layout.panels[0]?.role, "front");
  });

  it("B. Front + Back — front primary, one secondary band", () => {
    const layout = planGarmentReferenceSheetLayout({
      front: { width: 1000, height: 1400 },
      back: { width: 800, height: 1000 },
    });
    assert.equal(layout.mode, "front_back");
    assert.equal(layout.passThrough, false);
    assert.equal(layout.panels.length, 2);
    assert.equal(layout.panels[0]?.role, "front");
    assert.equal(layout.panels[1]?.role, "back");
    assert.equal(layout.panels[0]?.drawWidth, 1000);
    assert.equal(layout.panels[0]?.drawHeight, 1400);
    assert.ok(layout.panels[1]!.panelHeight <= Math.round(1400 * 0.55) + 1);
    assert.ok(layout.sheetHeight < 1400 + 8 + 1000);
    assertAspectPreserved(800, 1000, layout.panels[1]!.drawWidth, layout.panels[1]!.drawHeight, "back");
  });

  it("C. Front + Detail — no empty back panel", () => {
    const layout = planGarmentReferenceSheetLayout({
      front: { width: 1000, height: 1400 },
      detail: { width: 600, height: 600 },
    });
    assert.equal(layout.mode, "front_detail");
    assert.equal(layout.panels.map((p) => p.role).join(","), "front,detail");
    assert.ok(!layout.panels.some((p) => p.role === "back"));
  });

  it("D. Front + Back + Detail — stacked full-width secondaries (Detail not crushed)", () => {
    const layout = planGarmentReferenceSheetLayout({
      front: { width: 1000, height: 1400 },
      back: { width: 900, height: 1200 },
      detail: { width: 800, height: 200 }, // wide embroidery strip
    });
    assert.equal(layout.mode, "front_back_detail");
    assert.equal(layout.panels.length, 3);
    assert.equal(layout.panels.map((p) => p.role).join(","), "front,back,detail");
    const back = layout.panels[1]!;
    const detail = layout.panels[2]!;
    assert.equal(back.x, 0);
    assert.equal(detail.x, 0);
    assert.ok(detail.y > back.y + back.panelHeight - 1);
    assert.equal(back.panelWidth, 1000);
    assert.equal(detail.panelWidth, 1000);
    // Detail keeps near-native width (not half-column crush).
    assert.ok(detail.drawWidth >= 750);
    assertAspectPreserved(900, 1200, back.drawWidth, back.drawHeight, "back");
    assertAspectPreserved(800, 200, detail.drawWidth, detail.drawHeight, "detail");
  });

  it("rejects missing / invalid front dimensions", () => {
    assert.throws(
      () => planGarmentReferenceSheetLayout({ front: { width: 0, height: 100 } }),
      GarmentReferenceSheetError,
    );
  });
});

describe("composeGarmentReferenceSheet", () => {
  it("A. Front only — returns original buffer unchanged", async () => {
    const front = await solidPng(640, 800, { r: 180, g: 140, b: 110 });
    const result = await composeGarmentReferenceSheet({ front });
    assert.equal(result.layout.mode, "front_only");
    assert.equal(result.layout.passThrough, true);
    assert.equal(result.buffer, front);
    assert.equal(result.width, 640);
    assert.equal(result.height, 800);
  });

  it("B. Front + Back — composite taller than front, front band intact", async () => {
    const front = await solidPng(600, 800, { r: 200, g: 170, b: 140 });
    const back = await solidPng(500, 700, { r: 90, g: 110, b: 150 });
    const result = await composeGarmentReferenceSheet({ front, back });
    assert.equal(result.layout.mode, "front_back");
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.width, 600);
    assert.ok(result.height > 800);
    const meta = await sharp(result.buffer).metadata();
    assert.equal(meta.width, result.width);
    assert.equal(meta.height, result.height);
  });

  it("C. Front + Detail", async () => {
    const front = await solidPng(600, 800, { r: 200, g: 170, b: 140 });
    const detail = await solidPng(400, 400, { r: 160, g: 60, b: 60 });
    const result = await composeGarmentReferenceSheet({ front, detail });
    assert.equal(result.layout.mode, "front_detail");
    assert.equal(result.layout.panels.length, 2);
  });

  it("D. Front + Back + Detail", async () => {
    const front = await solidPng(800, 1000, { r: 200, g: 170, b: 140 });
    const back = await solidPng(700, 900, { r: 90, g: 110, b: 150 });
    const detail = await solidPng(420, 420, { r: 160, g: 60, b: 60 });
    const result = await composeGarmentReferenceSheet({ front, back, detail });
    assert.equal(result.layout.mode, "front_back_detail");
    assert.equal(result.layout.panels.length, 3);
    assert.equal(result.width, 800);
    assert.ok(result.height > 1000);
  });

  it("rejects missing Front", async () => {
    await assert.rejects(
      () => composeGarmentReferenceSheet({ front: Buffer.alloc(0) }),
      (err: unknown) => {
        assert.ok(err instanceof GarmentReferenceSheetError);
        assert.match(err.message, /Front image is required/);
        return true;
      },
    );
  });

  it("does not distort aspect ratios in composed panels", async () => {
    const front = await solidPng(1000, 1500, { r: 210, g: 180, b: 150 });
    const back = await solidPng(900, 600, { r: 80, g: 100, b: 140 }); // landscape
    const detail = await solidPng(300, 500, { r: 150, g: 50, b: 50 }); // tall
    const result = await composeGarmentReferenceSheet({ front, back, detail });

    for (const panel of result.layout.panels) {
      const src =
        panel.role === "front"
          ? { width: 1000, height: 1500 }
          : panel.role === "back"
            ? { width: 900, height: 600 }
            : { width: 300, height: 500 };
      assertAspectPreserved(src.width, src.height, panel.drawWidth, panel.drawHeight, panel.role);
    }

    const backPanel = result.layout.panels[1]!;
    const detailPanel = result.layout.panels[2]!;
    assert.ok(detailPanel.y > backPanel.y);
    assert.equal(backPanel.panelWidth, 1000);
    assert.equal(detailPanel.panelWidth, 1000);
  });
});

describe("prepareGarmentReferenceForGeneration", () => {
  it("A. Front only — pass-through without composing a sheet", async () => {
    const result = await prepareGarmentReferenceForGeneration({
      frontImageUrl: "https://example.invalid/front-only.jpg",
      renderId: 1,
    });
    assert.equal(result.usedReferenceSheet, false);
    assert.equal(result.mode, "front_only");
    assert.equal(result.garmentImageUrl, "https://example.invalid/front-only.jpg");
  });
});
