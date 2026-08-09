#!/usr/bin/env node
// Export machine-readable pose library summary (Phase 5B)
// Run: node --import tsx scripts/export-pose-library-summary.ts

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exportPoseLibrarySummary, POSE_NAMES } from "../src/intelligence/pose-library.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../src/intelligence/pose-library-summary.json");

const summary = {
  version: "5B",
  generatedAt: new Date().toISOString(),
  totalPoses: POSE_NAMES.length,
  poses: exportPoseLibrarySummary(),
};

writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Wrote ${summary.totalPoses} poses to ${outPath}`);
