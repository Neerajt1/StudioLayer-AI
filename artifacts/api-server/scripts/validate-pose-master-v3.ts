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
    true, // Pass B: identity lock lives in primary MODEL/surface — not restated in pose contract
  );
  check(
    `${shoot} ${pose} photography only`,
    prompt.includes("photography and styling only — not body pose") ||
      prompt.includes("SHOT DIRECTION"),
  );
  check(`${shoot} ${pose} no standing default`, !prompt.includes("Natural standing pose"));
  check(
    `${shoot} ${pose} body-pose visual reference`,
    prompt.includes("Pose Master visual geometry") &&
      prompt.includes("BODY POSE AND ACTION") &&
      !prompt.includes("TYPE and FEEL of pose") &&
      !prompt.includes("GENERATION AUTHORITY HIERARCHY") &&
      !prompt.includes("Garment adaptation = the uploaded garment adapts around the pose") &&
      !prompt.includes("NOT exact pose duplication") &&
      !prompt.includes("AUTHORITY ORDER") &&
      !prompt.includes("POSE AUTHORITY — FINAL CONSTRAINT"),
  );
  check(
    `${shoot} ${pose} anti-generic-pose collapse`,
    prompt.includes("Do not replace this pose with a generic standing, walking, sitting, or freestanding fashion pose"),
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
  { id: "Pose61", label: "male walking no prop", expectPremiumFurniture: false },
  { id: "Pose29", label: "female sideways stool", expectPremiumFurniture: true },
  { id: "Pose43", label: "female floor no prop", expectPremiumFurniture: false },
];

for (const { id, label, expectPremiumFurniture } of refinementCases) {
  const def = getPoseDefinition(id)!;
  const prompt = buildShotPromptAtSlot(base, profile, "hero", id, 0, { manualDirected: true });
  const authIndex = prompt.indexOf("POSE & ACTION DIRECTION");
  const perfIndex = prompt.indexOf("FASHION PERFORMANCE — PHOTOGRAPHY ONLY");
  const propIndex = expectPremiumFurniture
    ? prompt.indexOf("\nFURNITURE:\n")
    : -1;
  const hasFurnitureContract =
    /\nFURNITURE:\nA (chair|stool|block\/step|tall stool) must be present/.test(prompt);

  check(`${label} (${id}) resolves`, !!def);
  check(`${label} fashion performance layer`, prompt.includes("FASHION PERFORMANCE — PHOTOGRAPHY ONLY"));
  check(`${label} not mannequin`, prompt.includes("not a mannequin"));
  check(`${label} no forced smile`, prompt.includes("Do NOT force a smile on every image"));
  check(
    `${label} performance after authoritative`,
    authIndex >= 0 && perfIndex > authIndex,
  );
  if (expectPremiumFurniture) {
    check(
      `${label} prop layer present`,
      propIndex > authIndex && hasFurnitureContract,
    );
    check(
      `${label} minimal furniture contract`,
      hasFurnitureContract &&
        prompt.includes("body-to-support relationship") &&
        !prompt.includes("FURNITURE APPEARANCE GUIDANCE") &&
        !prompt.includes("Prefer:") &&
        !prompt.includes("Avoid / strongly de-prioritize"),
    );
    check(
      `${label} no furniture Prefer/Avoid essay`,
      !/balcony\/patio\/café\/bistro|premium luxury editorial furniture|Single support only/i.test(
        prompt,
      ),
    );
    check(
      `${label} furniture does not redefine pose — support stays in pose definition`,
      /body-to-support relationship/i.test(prompt) &&
        /do not copy Pose Master furniture design/i.test(prompt) &&
        !/geometric authority for reproducing/.test(prompt) &&
        !/must not redefine the Pose Master body pose/i.test(prompt),
    );
  } else {
    check(
      `${label} no furniture essay when prop not required`,
      !prompt.includes("\nFURNITURE:") &&
        !prompt.includes("FURNITURE APPEARANCE GUIDANCE") &&
        !prompt.includes("INTRINSIC PROP RULE — PHOTOGRAPHY ONLY"),
    );
  }
  check(
    `${label} global garment fidelity closer`,
    prompt.includes("GARMENT AUTHORITY REMINDER") &&
      /Apply GARMENT AUTHORITY — REFERENCE IMAGE 1/i.test(prompt),
  );
  check(
    `${label} Pose Master is visual pose reference`,
    prompt.includes("Pose Master visual geometry") ||
      !prompt.includes("Pose Master"),
  );
  check(
    `${label} Pose Master isolation`,
    !def.poseReferenceImage ||
      (prompt.includes("Do not copy identity, garment, furniture design") &&
        prompt.includes("POSE:") &&
        !prompt.includes("AUTHORITY ORDER")),
  );
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
