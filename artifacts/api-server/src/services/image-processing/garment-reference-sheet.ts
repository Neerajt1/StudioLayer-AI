// ---------------------------------------------------------------------------
// StudioLayer AI — Garment Reference Sheet
//
// Combines Front (+ optional Back/Detail) into ONE garment reference image
// for OpenRouter Ref 1. Front-only is pass-through (unchanged).
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { logger } from "../../lib/logger.js";
import { fetchRemoteImageBuffer } from "../../rendering/image-storage.js";
import { prepareGarmentImage } from "../../rendering/preprocessing.js";
import {
  resolveGarmentEvidenceMode,
  type GarmentEvidenceMode,
} from "./garment-evidence-set.js";

export const GARMENT_REFERENCE_SHEET_GAP_PX = 8;

/**
 * Secondary band (Back / Detail) may use at most this fraction of Front height.
 * Keeps Front visually primary when Back is near full native size.
 */
export const GARMENT_REFERENCE_SHEET_MAX_SECONDARY_HEIGHT_RATIO = 0.55;

/** Neutral fill for letterboxing / gutters — unobtrusive, not decorative. */
export const GARMENT_REFERENCE_SHEET_BACKGROUND = {
  r: 250,
  g: 250,
  b: 250,
} as const;

export type GarmentReferenceSheetMode =
  | "front_only"
  | "front_back"
  | "front_detail"
  | "front_back_detail";

export type ImageDimensions = {
  width: number;
  height: number;
};

export type GarmentReferenceSheetPanel = {
  role: "front" | "back" | "detail";
  /** Panel origin on the sheet. */
  x: number;
  y: number;
  panelWidth: number;
  panelHeight: number;
  /** Drawn image size inside the panel (aspect preserved, never upscaled). */
  drawWidth: number;
  drawHeight: number;
  /** Offset of the drawn image within the panel (centering). */
  offsetX: number;
  offsetY: number;
};

export type GarmentReferenceSheetLayout = {
  mode: GarmentReferenceSheetMode;
  sheetWidth: number;
  sheetHeight: number;
  gapPx: number;
  panels: GarmentReferenceSheetPanel[];
  /** True when no composition occurred — caller should keep the original front buffer. */
  passThrough: boolean;
};

export type ComposeGarmentReferenceSheetInput = {
  front: Buffer;
  back?: Buffer;
  detail?: Buffer;
  /** Gutter between panels. Default GARMENT_REFERENCE_SHEET_GAP_PX. */
  gapPx?: number;
};

export type ComposeGarmentReferenceSheetResult = {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/octet-stream";
  width: number;
  height: number;
  layout: GarmentReferenceSheetLayout;
};

export class GarmentReferenceSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarmentReferenceSheetError";
  }
}

/** Scale to fit within max box; never upscale; never change aspect ratio. */
export function fitContainNeverUpscale(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): ImageDimensions {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new GarmentReferenceSheetError("Image dimensions must be positive");
  }
  if (maxWidth <= 0 || maxHeight <= 0) {
    throw new GarmentReferenceSheetError("Panel dimensions must be positive");
  }

  const scale = Math.min(1, maxWidth / srcWidth, maxHeight / srcHeight);
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

function resolveMode(hasBack: boolean, hasDetail: boolean): GarmentReferenceSheetMode {
  if (hasBack && hasDetail) return "front_back_detail";
  if (hasBack) return "front_back";
  if (hasDetail) return "front_detail";
  return "front_only";
}

function panelFor(
  role: GarmentReferenceSheetPanel["role"],
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  src: ImageDimensions,
): GarmentReferenceSheetPanel {
  const fitted = fitContainNeverUpscale(src.width, src.height, panelWidth, panelHeight);
  return {
    role,
    x,
    y,
    panelWidth,
    panelHeight,
    drawWidth: fitted.width,
    drawHeight: fitted.height,
    offsetX: Math.floor((panelWidth - fitted.width) / 2),
    offsetY: Math.floor((panelHeight - fitted.height) / 2),
  };
}

/**
 * Pure layout planner — Front stays at native size as the primary band.
 * Missing Back/Detail never create empty panels.
 */
export function planGarmentReferenceSheetLayout(params: {
  front: ImageDimensions;
  back?: ImageDimensions;
  detail?: ImageDimensions;
  gapPx?: number;
}): GarmentReferenceSheetLayout {
  const { front, back, detail } = params;
  const gapPx = params.gapPx ?? GARMENT_REFERENCE_SHEET_GAP_PX;

  if (!front.width || !front.height) {
    throw new GarmentReferenceSheetError("Front image is required");
  }

  const hasBack = Boolean(back);
  const hasDetail = Boolean(detail);
  const mode = resolveMode(hasBack, hasDetail);

  if (mode === "front_only") {
    return {
      mode,
      sheetWidth: front.width,
      sheetHeight: front.height,
      gapPx,
      panels: [
        {
          role: "front",
          x: 0,
          y: 0,
          panelWidth: front.width,
          panelHeight: front.height,
          drawWidth: front.width,
          drawHeight: front.height,
          offsetX: 0,
          offsetY: 0,
        },
      ],
      passThrough: true,
    };
  }

  const sheetWidth = front.width;
  const frontPanel = panelFor("front", 0, 0, sheetWidth, front.height, front);
  const maxSecondaryHeight = Math.max(
    1,
    Math.round(front.height * GARMENT_REFERENCE_SHEET_MAX_SECONDARY_HEIGHT_RATIO),
  );

  const secondaryY = front.height + gapPx;
  const secondaries: Array<{ role: "back" | "detail"; dims: ImageDimensions }> = [];
  if (back) secondaries.push({ role: "back", dims: back });
  if (detail) secondaries.push({ role: "detail", dims: detail });

  if (secondaries.length === 1) {
    const only = secondaries[0]!;
    // Full-width secondary band — fit within sheet width and Front-priority height cap.
    const fitted = fitContainNeverUpscale(
      only.dims.width,
      only.dims.height,
      sheetWidth,
      maxSecondaryHeight,
    );
    const secondaryPanel = panelFor(
      only.role,
      0,
      secondaryY,
      sheetWidth,
      fitted.height,
      only.dims,
    );

    return {
      mode,
      sheetWidth,
      sheetHeight: secondaryY + fitted.height,
      gapPx,
      panels: [frontPanel, secondaryPanel],
      passThrough: false,
    };
  }

  // Front + Back + Detail — stack full-width secondary bands (Back, then Detail).
  // Avoid half-width columns that crush fine embroidery / print detail.
  const panels: GarmentReferenceSheetPanel[] = [frontPanel];
  let cursorY = secondaryY;

  for (const entry of secondaries) {
    const fitted = fitContainNeverUpscale(
      entry.dims.width,
      entry.dims.height,
      sheetWidth,
      maxSecondaryHeight,
    );
    panels.push(
      panelFor(entry.role, 0, cursorY, sheetWidth, fitted.height, entry.dims),
    );
    cursorY += fitted.height + gapPx;
  }

  return {
    mode,
    sheetWidth,
    sheetHeight: cursorY - gapPx,
    gapPx,
    panels,
    passThrough: false,
  };
}

async function readDimensions(buffer: Buffer, label: string): Promise<ImageDimensions> {
  const meta = await sharp(buffer, { failOn: "none" }).metadata();
  if (!meta.width || !meta.height) {
    throw new GarmentReferenceSheetError(`${label} image has invalid dimensions`);
  }
  return { width: meta.width, height: meta.height };
}

function detectMime(buffer: Buffer, metaFormat: string | undefined): ComposeGarmentReferenceSheetResult["mimeType"] {
  if (metaFormat === "jpeg") return "image/jpeg";
  if (metaFormat === "png") return "image/png";
  if (metaFormat === "webp") return "image/webp";
  // Heuristic fallback for pass-through of unknown encodings.
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  return "application/octet-stream";
}

async function renderPanelImage(
  source: Buffer,
  panel: GarmentReferenceSheetPanel,
): Promise<Buffer> {
  return sharp(source, { failOn: "none" })
    .rotate() // honour EXIF orientation without distorting aspect
    .resize({
      width: panel.drawWidth,
      height: panel.drawHeight,
      fit: "fill", // draw size already aspect-correct; fill avoids double letterbox
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 6, effort: 6 })
    .toBuffer();
}

/**
 * Compose Front (+ optional Back/Detail) into one garment reference image.
 *
 * Front-only returns the original front buffer unchanged (pass-through).
 * Multi-view sheets are lossless PNG composites on a neutral background.
 */
export async function composeGarmentReferenceSheet(
  input: ComposeGarmentReferenceSheetInput,
): Promise<ComposeGarmentReferenceSheetResult> {
  if (!input.front || input.front.length === 0) {
    throw new GarmentReferenceSheetError("Front image is required");
  }

  const frontMeta = await sharp(input.front, { failOn: "none" }).metadata();
  if (!frontMeta.width || !frontMeta.height) {
    throw new GarmentReferenceSheetError("Front image is required");
  }

  const frontDims = { width: frontMeta.width, height: frontMeta.height };
  const backDims = input.back ? await readDimensions(input.back, "Back") : undefined;
  const detailDims = input.detail ? await readDimensions(input.detail, "Detail") : undefined;

  const layout = planGarmentReferenceSheetLayout({
    front: frontDims,
    back: backDims,
    detail: detailDims,
    gapPx: input.gapPx,
  });

  if (layout.passThrough) {
    return {
      buffer: input.front,
      mimeType: detectMime(input.front, frontMeta.format),
      width: layout.sheetWidth,
      height: layout.sheetHeight,
      layout,
    };
  }

  const sources: Record<"front" | "back" | "detail", Buffer | undefined> = {
    front: input.front,
    back: input.back,
    detail: input.detail,
  };

  const composites: sharp.OverlayOptions[] = [];
  for (const panel of layout.panels) {
    const source = sources[panel.role];
    if (!source) {
      throw new GarmentReferenceSheetError(`Missing buffer for panel role: ${panel.role}`);
    }
    const rendered = await renderPanelImage(source, panel);
    composites.push({
      input: rendered,
      left: panel.x + panel.offsetX,
      top: panel.y + panel.offsetY,
    });
  }

  const buffer = await sharp({
    create: {
      width: layout.sheetWidth,
      height: layout.sheetHeight,
      channels: 3,
      background: GARMENT_REFERENCE_SHEET_BACKGROUND,
    },
  })
    .composite(composites)
    .png({ compressionLevel: 6, effort: 6 })
    .toBuffer();

  return {
    buffer,
    mimeType: "image/png",
    width: layout.sheetWidth,
    height: layout.sheetHeight,
    layout,
  };
}

async function loadImageBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    if (comma === -1) {
      throw new GarmentReferenceSheetError("Malformed data-URI garment image");
    }
    return Buffer.from(imageUrl.slice(comma + 1), "base64");
  }

  const { buffer } = await fetchRemoteImageBuffer(imageUrl, { timeoutMs: 30_000 });
  return buffer;
}

export type PrepareGarmentReferenceForGenerationResult = {
  /**
   * Primary garment URL for OpenRouter (sheet mode / Front-only) and
   * refinement. In separate evidence mode this is always the Front image.
   */
  garmentImageUrl: string;
  /** True when a multi-view sheet was composed. */
  usedReferenceSheet: boolean;
  mode: GarmentReferenceSheetMode;
  /**
   * Packaging used for this preparation.
   * - sheet: single garmentImageUrl (passthrough or composite)
   * - separate: Front (+ optional Back/Detail) as distinct images
   */
  packaging: "sheet" | "separate";
  /** Front garment URL — primary construction authority when multi-view evidence exists. */
  garmentFrontImageUrl?: string;
  /**
   * Composed multi-view sheet — supplemental evidence only.
   * Must not replace garmentImageUrl / front as primary construction Ref.
   */
  garmentReferenceSheetImageUrl?: string;
  /** Optional Back garment URL — separate packaging only. */
  garmentBackImageUrl?: string;
  /** Optional Detail garment URL — separate packaging only. */
  garmentDetailImageUrl?: string;
};

/**
 * Compact semantic mapping for multi-view supplemental sheets.
 * Primary construction authority remains the original Front garment (Ref 1).
 * Returns undefined for Front-only (no sheet) — callers must not inject anything.
 */
export function buildGarmentReferenceCorrespondenceInstruction(
  mode: GarmentReferenceSheetMode,
): string | undefined {
  if (mode === "front_only") {
    return undefined;
  }

  /** Front features must not be transferred onto Back when absent from the Back panel. */
  const negativeBackCorrespondence = [
    "NEGATIVE CORRESPONDENCE — the Back panel is authoritative for the visible back surface.",
    "A garment feature visible on the Front but absent from the Back is intentionally absent from the Back and must not be transferred, mirrored, repeated, or creatively reconstructed on the Back.",
    "Do not transfer Front embroidery onto the Back merely because it exists on the Front.",
    "Do not mirror Front decoration onto the Back.",
    "Do not add decorative elements to complete or aesthetically balance the garment.",
    "Absence of embroidery or decorative construction in the Back reference is meaningful and must be preserved.",
    "Match the actual Back panel rather than inferring what the Back should look like from the Front.",
  ].join(" ");

  const primaryAuthority = [
    "PRIMARY GARMENT AUTHORITY:",
    "Reference Image 1 is the original uploaded FRONT garment — the sole primary visual/construction authority for silhouette, proportions, panels, seams, closures, hardware, material, texture, colour and design.",
    "Any composed multi-view sheet is SUPPLEMENTAL evidence only and must never replace or outrank Reference Image 1 for front construction.",
    "Do not redesign or substitute garment construction based on a common or popular category interpretation — reproduce only what the uploaded garment evidence shows.",
  ].join(" ");

  if (mode === "front_back") {
    return [
      primaryAuthority,
      "SUPPLEMENTAL MULTI-VIEW SHEET (when provided after Reference Image 1):",
      "Contains Front and Back views of the SAME garment for secondary surface reference.",
      "When the generated camera shows the back of the garment, use the supplied Back View as the authoritative visual reference for that surface.",
      "Do not invent or redesign back-specific garment details that are visible in the supplied Back View.",
      negativeBackCorrespondence,
    ].join(" ");
  }

  if (mode === "front_detail") {
    return [
      primaryAuthority,
      "SUPPLEMENTAL MULTI-VIEW SHEET (when provided after Reference Image 1):",
      "Contains Front and Design/Texture Detail views of the SAME garment.",
      "Use the detail panel to preserve visible embroidery, print, texture, stitching, trim, and other fine garment characteristics.",
      "Do not invent a different design where the supplied detail provides authoritative visual information.",
    ].join(" ");
  }

  // front_back_detail
  return [
    primaryAuthority,
    "SUPPLEMENTAL MULTI-VIEW SHEET (when provided after Reference Image 1):",
    "Contains Front, Back, and Design/Texture Detail views of the SAME garment.",
    "When the generated camera shows the back of the garment, use the supplied Back View as the authoritative visual reference for that surface.",
    "Use the detail panel to preserve visible embroidery, print, texture, stitching, trim, and other fine garment characteristics.",
    "Do not invent or redesign details that are already visible in the corresponding supplied panel.",
    negativeBackCorrespondence,
  ].join(" ");
}

/**
 * Resolves the garment image(s) used as OpenRouter garment evidence.
 *
 * - Front only → existing passthrough (unchanged) in both evidence modes.
 * - Front + Back and/or Detail + sheet mode → Front remains primary Ref 1;
 *   composed sheet is returned as supplemental evidence.
 * - Front + Back and/or Detail + separate mode → Front/Back/Detail kept separate.
 */
export async function prepareGarmentReferenceForGeneration(params: {
  frontImageUrl: string;
  backImageUrl?: string;
  detailImageUrl?: string;
  renderId: number;
  /** Defaults to resolveGarmentEvidenceMode() from GARMENT_EVIDENCE_MODE. */
  evidenceMode?: GarmentEvidenceMode;
}): Promise<PrepareGarmentReferenceForGenerationResult> {
  const { frontImageUrl, backImageUrl, detailImageUrl, renderId } = params;
  const evidenceMode = params.evidenceMode ?? resolveGarmentEvidenceMode();
  const hasSupplementary = Boolean(backImageUrl || detailImageUrl);

  if (!hasSupplementary) {
    const garmentImageUrl = await prepareGarmentImage(frontImageUrl, renderId);
    return {
      garmentImageUrl,
      usedReferenceSheet: false,
      mode: "front_only",
      // Front-only is identical in both modes — keep packaging as sheet path.
      packaging: "sheet",
      garmentFrontImageUrl: garmentImageUrl,
    };
  }

  if (evidenceMode === "separate") {
    const garmentFrontImageUrl = await prepareGarmentImage(frontImageUrl, renderId);
    const mode = resolveMode(Boolean(backImageUrl), Boolean(detailImageUrl));
    logger.info(
      {
        renderId,
        mode,
        packaging: "separate",
        hasBack: Boolean(backImageUrl),
        hasDetail: Boolean(detailImageUrl),
      },
      "garment-evidence-set: separate Front/Back/Detail refs (no sheet)",
    );
    return {
      garmentImageUrl: garmentFrontImageUrl,
      usedReferenceSheet: false,
      mode,
      packaging: "separate",
      garmentFrontImageUrl,
      garmentBackImageUrl: backImageUrl,
      garmentDetailImageUrl: detailImageUrl,
    };
  }

  const [frontPrepared, frontBuf, back, detail] = await Promise.all([
    prepareGarmentImage(frontImageUrl, renderId),
    loadImageBuffer(frontImageUrl),
    backImageUrl ? loadImageBuffer(backImageUrl) : Promise.resolve(undefined),
    detailImageUrl ? loadImageBuffer(detailImageUrl) : Promise.resolve(undefined),
  ]);

  const sheet = await composeGarmentReferenceSheet({
    front: frontBuf,
    back,
    detail,
  });

  const garmentReferenceSheetImageUrl = `data:${sheet.mimeType};base64,${sheet.buffer.toString("base64")}`;

  logger.info(
    {
      renderId,
      mode: sheet.layout.mode,
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
      sizeBytes: sheet.buffer.length,
      panels: sheet.layout.panels.map((p) => p.role),
      packaging: "sheet",
      primaryRef: "original_front",
    },
    "garment-reference-sheet: Front primary + supplemental multi-view sheet",
  );

  return {
    /** Primary construction authority — original prepared Front. */
    garmentImageUrl: frontPrepared,
    usedReferenceSheet: true,
    mode: sheet.layout.mode,
    packaging: "sheet",
    garmentFrontImageUrl: frontPrepared,
    garmentReferenceSheetImageUrl,
  };
}
