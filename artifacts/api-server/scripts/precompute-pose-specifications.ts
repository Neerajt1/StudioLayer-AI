/**
 * Precompute compact Pose Specifications for all 75 Pose Master PNGs.
 *
 * GPT-4o vision only — does NOT call OpenRouter/Gemini or consume Studio Credits.
 * Does NOT wire specs into generation.
 *
 * Usage (from artifacts/api-server):
 *   node --import tsx --env-file=../../.env scripts/precompute-pose-specifications.ts
 *
 * Optional:
 *   --only=Pose7,Pose49     limit poses
 *   --concurrency=3         parallel GPT calls (default 2)
 *   --force                 re-analyse even if poseId already in output file
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzePoseSpecification,
  POSE_SPECIFICATION_MODEL,
} from "../src/intelligence/pose-specification-analyzer.js";
import type {
  PoseSpecificationPrecomputeFile,
  PoseSpecificationRecord,
} from "../src/intelligence/pose-specification-types.js";
import registry from "../src/intelligence/pose-canonical-registry.json";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.join(__dirname, "..");
const POSE_DIR = path.resolve(API_ROOT, "../studiolayer-ai/public/pose-references");
const OUT_DIR = path.join(API_ROOT, "src/intelligence");
const OUT_FILE = path.join(OUT_DIR, "pose-specifications.precomputed.json");
const REPORT_FILE = path.join(OUT_DIR, "pose-specifications.quality-report.json");

type RegistryPose = {
  poseId: string;
  name: string;
  active: boolean;
  filename?: string;
  visualPath?: string;
  bodyGeometry?: string[];
  prop?: string;
  bodyState?: string;
};

function parseArgs(argv: string[]) {
  let only: Set<string> | null = null;
  let concurrency = 2;
  let force = false;
  for (const arg of argv) {
    if (arg.startsWith("--only=")) {
      only = new Set(
        arg
          .slice("--only=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith("--concurrency=")) {
      concurrency = Math.max(1, Number(arg.slice("--concurrency=".length)) || 2);
    } else if (arg === "--force") {
      force = true;
    }
  }
  return { only, concurrency, force };
}

function mimeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function loadDataUri(filename: string): string {
  const filePath = path.join(POSE_DIR, filename);
  if (!existsSync(filePath)) {
    throw new Error(`Pose PNG missing: ${filePath}`);
  }
  const buffer = readFileSync(filePath);
  return `data:${mimeFor(filename)};base64,${buffer.toString("base64")}`;
}

function loadExisting(): PoseSpecificationPrecomputeFile | null {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8")) as PoseSpecificationPrecomputeFile;
  } catch {
    return null;
  }
}

function complexityScore(pose: RegistryPose, record: PoseSpecificationRecord | undefined): number {
  let score = 0;
  const geo = pose.bodyGeometry ?? [];
  score += geo.length * 2;
  if (pose.prop && pose.prop !== "none") score += 5;
  if (/perch|chair|floor|lean|kneel|wall|rail/i.test(String(pose.bodyState))) score += 3;
  if (record?.specification.supportObject?.required) score += 4;
  if (record?.specification.supportObject?.bodySupportRelationship) score += 3;
  const crit = record?.specification.criticalPoseGeometry?.length ?? 0;
  score += crit;
  const nullCount = record?.meta.nullFields.length ?? 0;
  score += Math.max(0, 8 - nullCount); // more filled fields → more structural content
  return score;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function main() {
  if (!process.env.OPENAPI_API_KEY?.trim()) {
    console.error("OPENAPI_API_KEY is not set — cannot run GPT-4o vision precompute.");
    process.exit(1);
  }

  const { only, concurrency, force } = parseArgs(process.argv.slice(2));
  const poses = (registry.poses as RegistryPose[]).filter((p) => p.active !== false);
  const targets = only
    ? poses.filter((p) => only.has(p.poseId))
    : poses;

  if (targets.length === 0) {
    console.error("No poses matched.");
    process.exit(1);
  }

  console.log(
    `Precomputing Pose Specifications for ${targets.length} poses (model=${POSE_SPECIFICATION_MODEL}, concurrency=${concurrency})`,
  );
  console.log(`Pose PNG dir: ${POSE_DIR}`);
  console.log(`Output: ${OUT_FILE}`);

  const existing = loadExisting();
  const byPoseId: Record<string, PoseSpecificationRecord> = {
    ...(existing?.byPoseId ?? {}),
  };

  const failures: Array<{ poseId: string; errors: string[] }> = [];
  let analyzed = 0;
  let skipped = 0;
  let validationFailures = 0;

  await mapPool(targets, concurrency, async (pose) => {
    if (!force && byPoseId[pose.poseId]?.meta.validationOk) {
      skipped++;
      console.log(`skip ${pose.poseId} (already present)`);
      return;
    }

    const filename = pose.filename ?? path.basename(pose.visualPath ?? `${pose.poseId}.png`);
    try {
      const imageUrl = loadDataUri(filename);
      console.log(`analyse ${pose.poseId} ← ${filename}`);
      const result = await analyzePoseSpecification({
        poseId: pose.poseId,
        imageUrl,
      });
      analyzed++;

      if (!result.persistable || !result.specification) {
        validationFailures++;
        failures.push({
          poseId: pose.poseId,
          errors: result.validation.errors.length
            ? result.validation.errors
            : ["not persistable"],
        });
        console.warn(`FAIL ${pose.poseId}: ${result.validation.errors.join("; ")}`);
        // Keep a failed stub out of byPoseId for clean cache; record in report only
        return;
      }

      const record: PoseSpecificationRecord = {
        specification: result.specification,
        meta: {
          poseId: pose.poseId,
          sourceFilename: filename,
          analyzedAt: new Date().toISOString(),
          model: POSE_SPECIFICATION_MODEL,
          nullFields: result.validation.nullFields,
          reviewFlags: [
            ...result.reviewFlags,
            ...result.validation.warnings.map((w) => `warning:${w}`),
          ],
          validationOk: true,
          validationErrors: [],
        },
      };
      byPoseId[pose.poseId] = record;
      console.log(
        `ok ${pose.poseId} nullFields=${record.meta.nullFields.length} flags=${record.meta.reviewFlags.join(",") || "none"}`,
      );
    } catch (err) {
      validationFailures++;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ poseId: pose.poseId, errors: [message] });
      console.error(`ERROR ${pose.poseId}: ${message}`);
    }
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const file: PoseSpecificationPrecomputeFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    model: POSE_SPECIFICATION_MODEL,
    byPoseId,
  };
  writeFileSync(OUT_FILE, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  const successIds = Object.keys(byPoseId).sort(
    (a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")),
  );
  const withNulls = successIds.filter(
    (id) => (byPoseId[id]?.meta.nullFields.length ?? 0) > 0,
  );
  const flagged = successIds.filter(
    (id) => (byPoseId[id]?.meta.reviewFlags.length ?? 0) > 0,
  );

  const ranked = [...poses]
    .map((p) => ({
      poseId: p.poseId,
      name: p.name,
      score: complexityScore(p, byPoseId[p.poseId]),
      specification: byPoseId[p.poseId]?.specification ?? null,
    }))
    .filter((r) => r.specification)
    .sort((a, b) => b.score - a.score);

  const top10 = ranked.slice(0, 10);

  const report = {
    generatedAt: file.generatedAt,
    model: POSE_SPECIFICATION_MODEL,
    targetsRequested: targets.map((p) => p.poseId),
    summary: {
      successfullyAnalyzedInCache: successIds.length,
      analyzedThisRun: analyzed,
      skippedExisting: skipped,
      validationFailuresThisRun: validationFailures,
      withAnyNullFields: withNulls.length,
      withReviewFlags: flagged.length,
    },
    validationFailures: failures,
    nullFieldCounts: Object.fromEntries(
      successIds.map((id) => [id, byPoseId[id]!.meta.nullFields.length]),
    ),
    reviewFlagsByPose: Object.fromEntries(
      flagged.map((id) => [id, byPoseId[id]!.meta.reviewFlags]),
    ),
    pose7: byPoseId["Pose7"]?.specification ?? null,
    pose49: byPoseId["Pose49"]?.specification ?? null,
    top10StructurallyComplex: top10.map((t) => ({
      poseId: t.poseId,
      name: t.name,
      complexityScore: t.score,
      specification: t.specification,
    })),
    outputFile: OUT_FILE,
  };

  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("\n=== QUALITY SUMMARY ===");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Wrote ${REPORT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
