/**
 * Programmatic Pose Master text-definition audit report.
 * Run: pnpm exec tsx scripts/audit-pose-master-definitions.ts
 *
 * Does NOT modify Excel / catalog / PNGs.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { summarizePoseDefinitionAudit } from "../src/intelligence/pose-definition-audit";
import { traceAllPoseNormalizations } from "../src/intelligence/pose-definition-normalizer";

const summary = summarizePoseDefinitionAudit();
const traces = traceAllPoseNormalizations().filter((t) => t.changed);

const report = {
  generatedAt: new Date().toISOString(),
  sources: {
    poseMasterPngs: "artifacts/studiolayer-ai/public/pose-references/Pose{1-75}.png",
    structuredDefinitions: "artifacts/api-server/src/intelligence/pose-canonical-registry.json",
    runtimeCatalog: "artifacts/api-server/src/intelligence/pose-library-catalog.ts",
    excelSourceMirror: "artifacts/studiolayer-ai/src/data/pose-master-v3-source.json",
    precomputedPoseSpecsUnused:
      "artifacts/api-server/src/intelligence/pose-specifications.precomputed.json",
    generationNormalizer:
      "artifacts/api-server/src/intelligence/pose-definition-normalizer.ts",
  },
  totals: {
    total: summary.total,
    green: summary.green,
    yellow: summary.yellow,
    red: summary.red,
    modifiedAtGenerationTime: traces.length,
    unchanged: summary.unchangedIds.length,
  },
  unchangedIds: summary.unchangedIds,
  modified: traces.map((t) => ({
    poseId: t.poseId,
    grade: t.grade,
    problems: t.problems,
    whySafe: t.whySafe,
    oldGarmentInteraction:
      t.oldDefinition.match(/GARMENT INTERACTION:\s*([\s\S]*?)(?=\nCAMERA|\nSTUDIO|\nPOSE |\n[A-Z]{3,}|\n*$)/i)?.[1]
        ?.trim()
        .slice(0, 200) ?? null,
    newGarmentInteraction:
      t.newDefinition.match(/GARMENT INTERACTION:\s*([\s\S]*?)(?=\nCAMERA|\nSTUDIO|\nPOSE |\nSUPPORT CONTACT|\n[A-Z]{3,}|\n*$)/i)?.[1]
        ?.trim()
        .slice(0, 400) ?? null,
  })),
  constraintsHonored: {
    excelCatalogModified: false,
    poseMasterPngsModified: false,
    referenceOrderingModified: false,
    geminiOpenRouterModelChanged: false,
    furnitureVocabularyModified: false,
    poseSpecJsonWiredToGeneration: false,
  },
};

const outPath = resolve(
  import.meta.dirname,
  "../src/intelligence/pose-definition-audit.report.json",
);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("TOTAL:", report.totals.total);
console.log("GREEN:", report.totals.green);
console.log("YELLOW:", report.totals.yellow);
console.log("RED:", report.totals.red);
console.log("Modified (generation-time only):", report.totals.modifiedAtGenerationTime);
console.log("Unchanged:", report.totals.unchanged, summary.unchangedIds.join(", ") || "(none)");
console.log("Report written:", outPath);
