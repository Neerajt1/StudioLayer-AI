/**
 * Backend-only Stage-1 Pose Master face-neutral resolution.
 *
 * Frontend continues to display original /pose-references/PoseN.png assets.
 * Production Create Stage-1 (Nano Pro / Flux Max / Flash) loads neutralized
 * variants from api-server/assets/pose-references-face-neutral/ so Pose Master
 * facial identity cannot compete with Studio Talent.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../lib/logger";
import { traceRenderFailure } from "../lib/render-pipeline-trace.js";

export const POSE_FACE_NEUTRAL_BACKEND_SUFFIX =
  "-face-neutral-backend.png" as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveFaceNeutralBackendDir(): string {
  const candidates = [
    // Runtime cwd = artifacts/api-server (local + typical Railway start)
    path.resolve(process.cwd(), "assets/pose-references-face-neutral"),
    // Runtime cwd = monorepo root
    path.resolve(
      process.cwd(),
      "artifacts/api-server/assets/pose-references-face-neutral",
    ),
    // Bundled dist/index.mjs → ../assets/...
    path.resolve(__dirname, "../assets/pose-references-face-neutral"),
    // Source module src/rendering/*.ts → ../../assets/...
    path.resolve(__dirname, "../../assets/pose-references-face-neutral"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0]!;
}

/**
 * Normalize a production pose id or filename stem to canonical PoseN.
 * Accepts: "Pose36", "pose36", "Pose36.png", "/pose-references/pose44.png"
 */
export function normalizeProductionPoseId(
  poseIdOrPath: string,
): string | null {
  const raw = poseIdOrPath.trim();
  if (!raw) return null;

  const base = path
    .basename(raw)
    .replace(/\.(png|jpe?g|webp)$/i, "")
    .trim();

  const match = base.match(/^pose(\d+)$/i);
  if (!match) return null;
  return `Pose${match[1]}`;
}

export function faceNeutralBackendFilenameForPoseId(poseId: string): string {
  const normalized = normalizeProductionPoseId(poseId);
  if (!normalized) {
    throw new Error(
      `pose-face-neutral-backend: cannot map pose id "${poseId}" to Face-neutral backend filename`,
    );
  }
  return `${normalized}${POSE_FACE_NEUTRAL_BACKEND_SUFFIX}`;
}

/**
 * Given a production pose id (or production visual path), return the
 * backend-only face-neutral filename. Does not touch frontend public assets.
 */
export function resolveFaceNeutralBackendFilename(
  poseIdOrProductionPath: string,
): string {
  return faceNeutralBackendFilenameForPoseId(poseIdOrProductionPath);
}

export function resolveFaceNeutralBackendAbsolutePath(
  poseIdOrProductionPath: string,
): string {
  return path.join(
    resolveFaceNeutralBackendDir(),
    faceNeutralBackendFilenameForPoseId(poseIdOrProductionPath),
  );
}

/**
 * Load the Stage-1 Pose Master reference as a data URI using the
 * face-neutral backend asset (never the face-bearing frontend PNG).
 */
export function loadStage1PoseReferenceImageAsDataUri(
  poseIdOrProductionPath: string,
  renderId?: number,
): string {
  const poseId = normalizeProductionPoseId(poseIdOrProductionPath);
  if (!poseId) {
    const err = new Error(
      `preprocessing: cannot resolve face-neutral Stage-1 Pose Master for "${poseIdOrProductionPath}"`,
    );
    traceRenderFailure("Stage-1 face-neutral Pose Master resolve", err, {
      renderId,
      poseIdOrProductionPath,
    });
    throw err;
  }

  const filename = faceNeutralBackendFilenameForPoseId(poseId);
  const filePath = path.join(resolveFaceNeutralBackendDir(), filename);

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (error) {
    const err = new Error(
      `preprocessing: face-neutral Stage-1 Pose Master not found — ${filename}`,
      { cause: error },
    );
    traceRenderFailure("Stage-1 face-neutral Pose Master load", err, {
      renderId,
      poseId,
      filename,
      filePath,
    });
    throw err;
  }

  const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;

  logger.info(
    {
      renderId,
      poseId,
      filename,
      sizeBytes: buffer.length,
      mimeType: "image/png",
      faceNeutralBackend: true,
    },
    "preprocessing: loaded face-neutral Stage-1 Pose Master as base64 data URI",
  );

  return dataUri;
}
