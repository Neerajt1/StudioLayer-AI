/**
 * Static validation — Pose Master v3 canonical registry.
 * Run: pnpm exec tsx scripts/validate-pose-master-v3.ts
 */
import master from "../../studiolayer-ai/src/data/pose-master-v3-source.json";
import registry from "../src/intelligence/pose-canonical-registry.json";
import {
  getPoseDefinition,
  getAllPoseDefinitions,
  POSE_ID_LIST,
  CANONICAL_POSE_COUNT,
} from "../src/intelligence/pose-library";
import {
  buildShotPromptAtSlot,
  buildShotPromptsWithPlan,
} from "../src/intelligence/pose-selection-engine";
import type { GarmentProfile } from "../src/intelligence/types";
import { loadPoseReferenceImageAsDataUri } from "../src/rendering/preprocessing";

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1;
    return;
  }
  fail += 1;
  console.log("FAIL", label, detail);
}

const masterById = Object.fromEntries(
  (master.records as Array<Record<string, string>>).map((r) => [r["Pose ID"], r]),
);

check("exactly 75 IDs in list", POSE_ID_LIST.length === 75);
check("CANONICAL_POSE_COUNT", CANONICAL_POSE_COUNT === 75);
check("registry totalPoses", registry.totalPoses === 75);
check("registry poses length", registry.poses.length === 75);
check("authority worksheet", (registry as { authoritativeWorksheet?: string }).authoritativeWorksheet === "Pose Master");

for (let i = 1; i <= 75; i++) {
  const id = `Pose${i}`;
  const def = getPoseDefinition(id);
  const masterRow = masterById[id]!;
  check(`${id} resolves`, !!def);
  check(`${id} poseId match`, def?.poseId === id, def?.poseId);
  check(`${id} name match master`, def?.name === masterRow["Pose Name"], def?.name);
  check(
    `${id} prompt-ready in description`,
    !!def && def.description.includes(masterRow["Prompt-Ready Pose Definition"]),
  );
  check(`${id} mirroring in description`, !!def && def.description.includes("MIRRORING RULE:"));
}

const p29 = getPoseDefinition("Pose29")!;
check("Pose29 name", p29.name === "Sideways Stool Sit");
check("Pose29 seated", p29.bodyState === "seated");
check("Pose29 stool", p29.prop === "stool");
check("Pose29 sideways text", p29.description.toLowerCase().includes("sideways"));
check("Pose29 not one-line only", p29.description.length > 200);

const profile: GarmentProfile = {
  category: "tops",
  subcategory: "blouse",
  gender: "womens",
  ageGroup: "young_adult",
  colour: ["white"],
  fit: "relaxed",
  fabric: "cotton",
  pattern: "solid",
  texture: "smooth",
  season: ["spring"],
  occasion: ["casual"],
};
const base =
  "Natural standing pose, balanced posture, neutral expression. Full body visible head to foot. Subtle realistic grounding shadow beneath the feet.";

for (const [shoot, pose, slot] of [
  ["hero", "Pose7", 0],
  ["campaign", "Pose29", 1],
  ["editorial", "Pose43", 2],
  ["hero", "Pose75", 0],
] as const) {
  const prompt = buildShotPromptAtSlot(base, profile, shoot, pose, slot, {
    manualDirected: true,
  });
  const masterRow = masterById[pose]!;
  check(`${shoot} ${pose} authoritative`, prompt.startsWith(`POSE & ACTION DIRECTION (Pose ID: ${pose}`));
  check(
    `${shoot} ${pose} detailed def`,
    prompt.includes(masterRow["Prompt-Ready Pose Definition"]),
  );
  check(`${shoot} ${pose} mirroring`, prompt.includes("MIRRORING RULE:"));
  check(
    `${shoot} ${pose} identity rule`,
    prompt.includes("Reference Image 2 provides model identity"),
  );
  check(
    `${shoot} ${pose} photography only`,
    prompt.includes("photography and styling only — not body pose"),
  );
  check(`${shoot} ${pose} no standing default`, !prompt.includes("Natural standing pose"));
  check(
    `${shoot} ${pose} creative direction language`,
    prompt.includes("TYPE and FEEL of pose") ||
      prompt.includes("strong creative direction") ||
      prompt.includes("NOT exact pose duplication"),
  );
  check(
    `${shoot} ${pose} action energy preserved`,
    prompt.includes("ACTION and EDITORIAL ENERGY"),
  );
}

const c0 = buildShotPromptAtSlot(base, profile, "campaign", "Pose7", 0, {
  manualDirected: true,
});
const c1 = buildShotPromptAtSlot(base, profile, "campaign", "Pose29", 1, {
  manualDirected: true,
});
check("campaign slot0 Pose7 only", c0.includes("Pose ID: Pose7") && !c0.includes("Pose ID: Pose29"));
check("campaign slot1 Pose29 only", c1.includes("Pose ID: Pose29") && !c1.includes("Pose ID: Pose7"));

const e0 = buildShotPromptAtSlot(base, profile, "editorial", "Pose1", 0, {
  manualDirected: true,
});
const e1 = buildShotPromptAtSlot(base, profile, "editorial", "Pose7", 1, {
  manualDirected: true,
});
check(
  "editorial slots independent",
  e0.includes("Pose1") && e1.includes("Pose7") && !e0.includes("half-seated on a chair"),
);

const auto = buildShotPromptsWithPlan(base, profile, { shootType: "hero", count: 1 });
check(
  "auto has pose reference authority",
  auto.prompts[0]!.includes("POSE & ACTION DIRECTION"),
);
check(
  "auto uses diverse builder structure",
  auto.prompts[0]!.includes("SHOT DIRECTION — HERO PRODUCT SHOWCASE") &&
    auto.prompts[0]!.includes("POSE MASTER STRUCTURED DEFINITION"),
);
check(
  "auto planned pose has poseId",
  !!auto.plannedPoses[0]?.poseId || !!getAllPoseDefinitions().find((d) => d.name === auto.plannedPoses[0]!.name)?.poseId,
);
const autoDef = getAllPoseDefinitions().find((d) => d.name === auto.plannedPoses[0]!.name);
check("auto pose from canonical catalog", !!autoDef && (autoDef.description?.length ?? 0) > 100);

const females = getAllPoseDefinitions().filter((d) => d.genderPool === "female");
const males = getAllPoseDefinitions().filter((d) => d.genderPool === "male");
check("51 female", females.length === 51);
check("24 male", males.length === 24);
check(
  "no universal pool",
  getAllPoseDefinitions().every((d) => d.genderPool === "female" || d.genderPool === "male"),
);

for (const id of POSE_ID_LIST) {
  const entry = registry.poses.find((p: { poseId: string }) => p.poseId === id) as {
    poseId: string;
    filename: string;
    visualPath: string;
  };
  const filenameOk = (entry?.filename || "").toLowerCase().replace(/\.png$/, "") === id.toLowerCase();
  check(
    `${id} visual path`,
    !!entry && entry.visualPath === `/pose-references/${entry.filename}` && filenameOk,
    entry?.filename,
  );
}

for (const id of ["Pose7", "Pose29", "Pose43", "Pose75"] as const) {
  const prompt = buildShotPromptAtSlot(base, profile, "hero", id, 0, { manualDirected: true });
  const m = masterById[id]!;
  check(`${id} has prompt-ready`, prompt.includes(m["Prompt-Ready Pose Definition"]));
  check(`${id} has critical anchors`, prompt.includes(m["Critical Pose Anchors"]));
  check(`${id} has forbidden`, prompt.includes(m["Forbidden Variants"]));
  check(`${id} has mirror rule text`, prompt.includes(m["Mirror / Left-Right Rule"]));
}

// Photography refinement layer (prop quality + fashion performance)
const refinementCases: Array<{
  id: string;
  label: string;
  expectPremiumFurniture: boolean;
}> = [
  { id: "Pose2", label: "female standing no prop", expectPremiumFurniture: false },
  { id: "Pose7", label: "female chair", expectPremiumFurniture: true },
  { id: "Pose28", label: "male seated stool", expectPremiumFurniture: true },
  { id: "Pose61", label: "male standing", expectPremiumFurniture: false },
  { id: "Pose29", label: "female sideways stool", expectPremiumFurniture: true },
  { id: "Pose43", label: "female floor no prop", expectPremiumFurniture: false },
];

for (const { id, label, expectPremiumFurniture } of refinementCases) {
  const def = getPoseDefinition(id)!;
  const prompt = buildShotPromptAtSlot(base, profile, "hero", id, 0, { manualDirected: true });
  const authIndex = prompt.indexOf("POSE & ACTION DIRECTION");
  const perfIndex = prompt.indexOf("FASHION PERFORMANCE — PHOTOGRAPHY ONLY");
  const propIndex = prompt.indexOf(
    expectPremiumFurniture
      ? "INTRINSIC PROP QUALITY — PHOTOGRAPHY ONLY"
      : "INTRINSIC PROP RULE — PHOTOGRAPHY ONLY",
  );

  check(`${label} (${id}) resolves`, !!def);
  check(`${label} fashion performance layer`, prompt.includes("FASHION PERFORMANCE — PHOTOGRAPHY ONLY"));
  check(`${label} not mannequin`, prompt.includes("not a mannequin"));
  check(`${label} no forced smile`, prompt.includes("Do NOT force a smile on every image"));
  check(
    `${label} performance after authoritative`,
    authIndex >= 0 && perfIndex > authIndex,
  );
  check(
    `${label} prop layer present`,
    propIndex > authIndex,
  );
  if (expectPremiumFurniture) {
    check(`${label} premium wood guidance`, prompt.includes("premium hardwood") || prompt.includes("solid natural wood"));
    check(`${label} avoid plastic`, prompt.includes("plastic"));
    check(`${label} no lifestyle add-ons`, prompt.includes("Do NOT add tables, bags, plants"));
  } else {
    check(
      `${label} no premium furniture invent`,
      prompt.includes("Do not invent chairs, stools, blocks") &&
        !prompt.includes("INTRINSIC PROP QUALITY — PHOTOGRAPHY ONLY"),
    );
  }
  check(`${label} canonical still present`, prompt.includes(masterById[id]!["Prompt-Ready Pose Definition"]));
  check(`${label} mirroring still present`, prompt.includes(masterById[id]!["Mirror / Left-Right Rule"]));
}

// SHOT FRAMING LOCK — photography only; present in manual + auto builders
{
  const framingMarker = "SHOT FRAMING LOCK — PHOTOGRAPHY ONLY";
  const geometryGuard =
    "This framing lock does not alter body-pose geometry, limb positions, weight distribution, or support points.";
  const noInventCloseUp =
    "If the requested shot does not specify close-up framing, do not invent close-up framing.";
  const fullBodyPreserve =
    "preserve the complete model from head through feet";

  const manualFullBody = buildShotPromptAtSlot(base, profile, "hero", "Pose2", 0, {
    manualDirected: true,
  });
  check("manual framing lock present", manualFullBody.includes(framingMarker));
  check("manual framing lock after shot direction", {
    ok:
      manualFullBody.indexOf("SHOT DIRECTION") >= 0 &&
      manualFullBody.indexOf(framingMarker) > manualFullBody.indexOf("SHOT DIRECTION") &&
      manualFullBody.indexOf("FASHION PERFORMANCE") > manualFullBody.indexOf(framingMarker),
  }.ok);
  check("manual framing lock geometry guard", manualFullBody.includes(geometryGuard));
  check("manual full-body preserves head-to-feet", manualFullBody.toLowerCase().includes(fullBodyPreserve));
  check("manual no invent close-up", manualFullBody.includes(noInventCloseUp));
  check(
    "manual framing after authoritative",
    manualFullBody.indexOf(framingMarker) > manualFullBody.indexOf("POSE & ACTION DIRECTION"),
  );

  const auto = buildShotPromptsWithPlan(base, profile, { shootType: "hero", count: 1 });
  const autoPrompt = auto.prompts[0]!;
  check("auto framing lock present", autoPrompt.includes(framingMarker));
  check("auto framing lock geometry guard", autoPrompt.includes(geometryGuard));
  check(
    "auto framing before fashion performance",
    autoPrompt.indexOf(framingMarker) >= 0 &&
      autoPrompt.indexOf("FASHION PERFORMANCE") > autoPrompt.indexOf(framingMarker),
  );
  check(
    "auto framing does not replace pose block",
    autoPrompt.includes("POSE MASTER STRUCTURED DEFINITION") && autoPrompt.includes(framingMarker),
  );
}

// Pose Master visual reference loader — files resolve for all 75 Pose IDs
{
  let loaded = 0;
  let missing = 0;
  for (const id of POSE_ID_LIST) {
    const def = getPoseDefinition(id);
    const rel = def?.poseReferenceImage;
    if (!rel) {
      missing += 1;
      check(`${id} has poseReferenceImage path`, false);
      continue;
    }
    try {
      const dataUri = loadPoseReferenceImageAsDataUri(rel);
      if (dataUri.startsWith("data:image/") && dataUri.length > 1000) loaded += 1;
      else {
        missing += 1;
        check(`${id} pose reference data URI`, false, rel);
      }
    } catch (error) {
      missing += 1;
      check(`${id} pose reference loads`, false, String(error));
    }
  }
  check("all 75 pose reference PNGs loadable", loaded === 75, `loaded=${loaded} missing=${missing}`);
}

// Confirm registry definitions unchanged by this photography-layer task
check(
  "registry still Pose Master v3",
  (registry as { version?: string }).version === "CANONICAL-POSE-MASTER-V3",
);

console.log("---");
console.log("PASS", pass, "FAIL", fail);
if (fail > 0) process.exit(1);
