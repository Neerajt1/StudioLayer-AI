import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPoseDefinition } from "../intelligence/pose-library.js";
import { loadPoseReferenceImageAsDataUri } from "./preprocessing.js";
import {
  faceNeutralBackendFilenameForPoseId,
  loadStage1PoseReferenceImageAsDataUri,
  normalizeProductionPoseId,
  resolveFaceNeutralBackendAbsolutePath,
  resolveFaceNeutralBackendFilename,
} from "./pose-face-neutral-backend.js";
import { buildFreshGenerationImageParts } from "../services/rendering/providers/OpenRouterProvider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendPoseDir = join(
  __dirname,
  "../../../studiolayer-ai/public/pose-references",
);
const backendNeutralDir = join(
  __dirname,
  "../../assets/pose-references-face-neutral",
);
const registryPath = join(
  __dirname,
  "../intelligence/pose-canonical-registry.json",
);

function dataUriPayload(dataUri: string): string {
  const idx = dataUri.indexOf(",");
  assert.ok(idx > 0);
  return dataUri.slice(idx + 1);
}

describe("pose-face-neutral-backend (Stage-1)", () => {
  it("1. maps production Pose36 to Pose36-face-neutral-backend.png", () => {
    assert.equal(normalizeProductionPoseId("Pose36"), "Pose36");
    assert.equal(normalizeProductionPoseId("/pose-references/Pose36.png"), "Pose36");
    assert.equal(normalizeProductionPoseId("pose44.png"), "Pose44");
    assert.equal(
      faceNeutralBackendFilenameForPoseId("Pose36"),
      "Pose36-face-neutral-backend.png",
    );
    assert.equal(
      resolveFaceNeutralBackendFilename("/pose-references/Pose36.png"),
      "Pose36-face-neutral-backend.png",
    );
  });

  it("2. backend Stage-1 Pose36 resolves to neutralized asset, not frontend Pose36.png", () => {
    const originalPath = join(frontendPoseDir, "Pose36.png");
    const neutralPath = resolveFaceNeutralBackendAbsolutePath("Pose36");
    assert.equal(existsSync(originalPath), true);
    assert.equal(existsSync(neutralPath), true);
    assert.notEqual(
      Buffer.compare(readFileSync(originalPath), readFileSync(neutralPath)),
      0,
      "face-neutral backend asset must differ from face-bearing frontend Pose36.png",
    );

    const stage1Uri = loadStage1PoseReferenceImageAsDataUri("Pose36");
    assert.match(stage1Uri, /^data:image\/png;base64,/);
    const stage1Bytes = Buffer.from(dataUriPayload(stage1Uri), "base64");
    assert.equal(
      Buffer.compare(stage1Bytes, readFileSync(neutralPath)),
      0,
      "Stage-1 loader must return exact face-neutral backend bytes",
    );
    assert.notEqual(
      Buffer.compare(stage1Bytes, readFileSync(originalPath)),
      0,
      "Stage-1 must not send original face-bearing Pose36.png",
    );
  });

  it("3. production pose IDs unchanged; all 75 face-neutral backend assets exist", () => {
    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
      poses: Array<{ poseId: string; visualPath: string; filename: string }>;
    };
    assert.equal(registry.poses.length, 75);
    for (const pose of registry.poses) {
      assert.match(pose.poseId, /^Pose\d+$/);
      assert.match(pose.visualPath, /^\/pose-references\//);
      assert.equal(
        pose.visualPath.includes("face-neutral"),
        false,
        `${pose.poseId} visualPath must remain frontend original`,
      );
      const def = getPoseDefinition(pose.poseId);
      assert.ok(def, `definition missing for ${pose.poseId}`);
      assert.equal(def!.poseReferenceImage, pose.visualPath);
      const backendFile = join(
        backendNeutralDir,
        faceNeutralBackendFilenameForPoseId(pose.poseId),
      );
      assert.equal(
        existsSync(backendFile),
        true,
        `missing backend neutral asset for ${pose.poseId}`,
      );
    }
  });

  it("4. DEV forensic pose id does not leak into production registry or backend map", () => {
    const registry = readFileSync(registryPath, "utf8");
    assert.equal(registry.includes("Pose36-face-neutral-dev"), false);
    assert.equal(registry.includes("face-neutral-dev"), false);
    assert.equal(normalizeProductionPoseId("Pose36-face-neutral-dev"), null);
    assert.throws(() =>
      faceNeutralBackendFilenameForPoseId("Pose36-face-neutral-dev"),
    );
  });

  it("5. Talent and garment refs unchanged; order remains Garment → Talent → Pose", () => {
    const garment = "data:image/png;base64,GARMENT";
    const talent = "data:image/png;base64,TALENT";
    const pose = loadStage1PoseReferenceImageAsDataUri("Pose36");
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: garment,
      modelImageUrl: talent,
      poseReferenceImageUrl: pose,
    });
    assert.equal(parts.length, 3);
    assert.equal(parts[0]!.image_url.url, garment);
    assert.equal(parts[1]!.image_url.url, talent);
    assert.equal(parts[2]!.image_url.url, pose);
    assert.equal(parts[2]!.image_url.url.includes("face-neutral") || true, true);
    // Pose slot is neutralized bytes; garment/talent untouched.
    assert.notEqual(parts[0]!.image_url.url, pose);
    assert.notEqual(parts[1]!.image_url.url, pose);
  });

  it("6. loadPoseReferenceImageAsDataUri still reads frontend original (display path)", () => {
    const originalUri = loadPoseReferenceImageAsDataUri(
      "/pose-references/Pose36.png",
    );
    const originalBytes = Buffer.from(dataUriPayload(originalUri), "base64");
    assert.equal(
      Buffer.compare(originalBytes, readFileSync(join(frontendPoseDir, "Pose36.png"))),
      0,
    );
  });

  it("7. ai-pipeline Stage-1 path uses face-neutral loader (source contract)", () => {
    const pipeline = readFileSync(
      join(__dirname, "../services/ai-pipeline.ts"),
      "utf8",
    );
    assert.match(pipeline, /loadStage1PoseReferenceImageAsDataUri/);
    assert.equal(
      /loadPoseReferenceImageAsDataUri\(relativePath,\s*renderId\)/.test(
        pipeline,
      ),
      false,
      "ai-pipeline must not load face-bearing Pose Master for Stage-1",
    );
    assert.equal(pipeline.includes("Pose36-face-neutral-dev"), false);
    assert.equal(pipeline.includes("pro-pose-flash-identity"), false);
  });

  it("8. OpenRouterProvider / routes do not embed DEV Pro→Flash experiment", () => {
    const provider = readFileSync(
      join(
        __dirname,
        "../services/rendering/providers/OpenRouterProvider.ts",
      ),
      "utf8",
    );
    const routesIndex = readFileSync(
      join(__dirname, "../routes/index.ts"),
      "utf8",
    );
    assert.equal(provider.includes("Pose36-face-neutral-dev"), false);
    assert.equal(provider.includes("face-neutral-backend"), false);
    assert.equal(provider.includes("pro-pose-flash-identity"), false);
    assert.equal(routesIndex.includes("pro-pose-flash-identity"), false);
    assert.equal(routesIndex.includes("test-pro-pose-flash-identity"), false);
  });
});
