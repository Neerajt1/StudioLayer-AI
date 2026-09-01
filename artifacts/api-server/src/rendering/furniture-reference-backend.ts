/**
 * Backend-only furniture reference resolution.
 *
 * The furniture selector picks a catalogue asset; this module resolves the
 * corresponding product reference photograph and supplies it as a data URI for
 * the generation provider. Reference filenames are ID-keyed here and nowhere
 * else.
 *
 * Generation contract: when furniture is selected for a shot, a loadable
 * reference image is required. Silent null → text-only fallback is forbidden
 * on the production Create path (enforced by furniture-reference-contract).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Furniture asset id → reference filename.
 *
 * Keys are canonical catalogue IDs only. Filenames live under
 * assets/furniture-references/. Every selectable asset must appear here with a
 * file that exists on disk, or it is excluded from the selection pool.
 */
export const FURNITURE_REFERENCE_FILENAMES: Readonly<Record<string, string>> = {
  furn_chair_solid_walnut_editorial: "chair_01_walnut_sculpted_armchair.png",
  furn_chair_dark_oak_editorial: "chair_02_dark_walnut_cane.png",
  furn_chair_warm_timber_editorial: "chair_03_sculpted_walnut_shell.png",
  furn_chair_walnut_frame_lounge: "chair_04_walnut_light_upholstered.png",
  furn_chair_natural_oak_lounge: "chair_05_natural_oak_lounge.png",
  furn_stool_solid_walnut_editorial: "stool_01_walnut_saddle.png",
  furn_stool_dark_wood_substantial: "stool_02_dark_walnut_round.png",
  furn_stool_natural_oak_editorial: "stool_03_natural_oak_round.png",
  furn_block_warm_timber_accent: "block_warm_timber_accent.png",
};

/** Candidate order mirrors the Pose Master loader so both ship identically. */
export function resolveFurnitureReferenceDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "assets/furniture-references"),
    path.resolve(
      process.cwd(),
      "artifacts/api-server/assets/furniture-references",
    ),
    path.resolve(__dirname, "../assets/furniture-references"),
    path.resolve(__dirname, "../../assets/furniture-references"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0]!;
}

/** Registered filename for a furniture asset id, or undefined when unregistered. */
export function resolveFurnitureReferenceFilename(
  furnitureAssetId: string | null | undefined,
): string | undefined {
  if (!furnitureAssetId) return undefined;
  return FURNITURE_REFERENCE_FILENAMES[furnitureAssetId.trim()];
}

/** Absolute path for a registered furniture reference, or null. */
export function resolveFurnitureReferenceAbsolutePath(
  furnitureAssetId: string | null | undefined,
): string | null {
  const filename = resolveFurnitureReferenceFilename(furnitureAssetId);
  if (!filename) return null;
  return path.join(resolveFurnitureReferenceDir(), filename);
}

/** True when a reference image is registered AND present on disk. */
export function hasFurnitureReferenceImage(
  furnitureAssetId: string | null | undefined,
): boolean {
  const filePath = resolveFurnitureReferenceAbsolutePath(furnitureAssetId);
  return Boolean(filePath && existsSync(filePath));
}

export type FurnitureReferenceLoadFailureReason =
  | "missing_asset_id"
  | "unregistered"
  | "missing_file";

export type FurnitureReferenceLoadResult =
  | {
      ok: true;
      dataUri: string;
      furnitureAssetId: string;
      filename: string;
      filePath: string;
      sizeBytes: number;
      mimeType: string;
    }
  | {
      ok: false;
      reason: FurnitureReferenceLoadFailureReason;
      furnitureAssetId: string | null;
      filename?: string;
      filePath?: string;
      message: string;
    };

function resolveMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

/**
 * Attempt to load a furniture reference. Returns a structured result — never
 * throws. Used by diagnostics and optional probes.
 */
export function tryLoadFurnitureReferenceImage(
  furnitureAssetId: string | null | undefined,
  renderId?: number,
): FurnitureReferenceLoadResult {
  if (!furnitureAssetId?.trim()) {
    return {
      ok: false,
      reason: "missing_asset_id",
      furnitureAssetId: furnitureAssetId ?? null,
      message: "furniture asset id is missing",
    };
  }

  const id = furnitureAssetId.trim();
  const filename = resolveFurnitureReferenceFilename(id);
  if (!filename) {
    return {
      ok: false,
      reason: "unregistered",
      furnitureAssetId: id,
      message: `no furniture reference registered for asset id ${id}`,
    };
  }

  const filePath = path.join(resolveFurnitureReferenceDir(), filename);

  try {
    const buffer = readFileSync(filePath);
    const mimeType = resolveMimeType(filename);
    logger.info(
      {
        renderId,
        furnitureAssetId: id,
        filename,
        filePath,
        referenceDir: resolveFurnitureReferenceDir(),
        sizeBytes: buffer.length,
        mimeType,
      },
      "furniture reference: loaded furniture reference as base64 data URI",
    );
    return {
      ok: true,
      dataUri: `data:${mimeType};base64,${buffer.toString("base64")}`,
      furnitureAssetId: id,
      filename,
      filePath,
      sizeBytes: buffer.length,
      mimeType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      {
        renderId,
        furnitureAssetId: id,
        filename,
        filePath,
        referenceDir: resolveFurnitureReferenceDir(),
        err: message,
      },
      "furniture reference: registered asset image missing on disk",
    );
    return {
      ok: false,
      reason: "missing_file",
      furnitureAssetId: id,
      filename,
      filePath,
      message,
    };
  }
}

/**
 * Load the furniture reference as a data URI.
 *
 * Returns null when the asset is unregistered or its file is absent. Production
 * Create must not treat null as acceptable when furniture is required — use
 * {@link requireFurnitureReferenceDataUri} instead.
 */
export function loadFurnitureReferenceImageAsDataUri(
  furnitureAssetId: string | null | undefined,
  renderId?: number,
): string | null {
  const result = tryLoadFurnitureReferenceImage(furnitureAssetId, renderId);
  return result.ok ? result.dataUri : null;
}
