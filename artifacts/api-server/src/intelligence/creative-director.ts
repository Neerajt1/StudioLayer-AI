// ---------------------------------------------------------------------------
// StudioLayer AI — Creative Director (Intelligence Engine)
//
// The Creative Director is the decision-making layer between user intent and
// the AI rendering backend.  It:
//
//   1. Classifies the raw user action into an ActionType.
//   2. Uses the GarmentProfile (from the Intelligence Engine) to build a
//      detailed, professionally-informed creative brief.
//   3. Returns a CreativeBrief with:
//      - A rich, context-specific instruction for the rendering model.
//      - A precise locked-element list appropriate to the action.
//      - A short creative concept label for logging.
//
// DESIGN PHILOSOPHY — Locked Editing
//   Each action type has its own frozen / unfrozen matrix.  The generic
//   "lock everything" approach broke Improve Pose and Change Camera Angle by
//   simultaneously locking those elements.  Now each action only locks what
//   should NOT change for that specific request.
//
// EDITORIAL DIVERSITY
//   buildEditorialShotPrompts() generates four genuinely different shot
//   directives (hero front, walking three-quarter, side profile, magazine
//   close-crop).  The caller passes these as perShotPrompts so each of the
//   four OpenRouter calls receives a distinct creative brief.
//
// EXTENSIBILITY
//   To add a new action ("White Background", "Luxury Editorial", etc.) add a
//   new entry to ACTION_KEYWORDS, implement buildXxxBrief(), and add a case
//   to buildCreativeBrief().
// ---------------------------------------------------------------------------

import type { GarmentProfile } from "./types";
import {
  CANONICAL_POSES,
  type PoseName,
} from "./pose-library";
import {
  selectNextPose,
  getPoseDescriptionForName as getPoseDescription,
  buildShotPrompts,
  buildCampaignShotPrompts,
  buildEditorialShotPrompts,
  buildHeroShotPrompt,
  neutralizeBasePromptPose,
} from "./pose-selection-engine";

export { CANONICAL_POSES, type PoseName, selectNextPose };
export {
  buildShotPrompts,
  buildCampaignShotPrompts,
  buildEditorialShotPrompts,
  buildHeroShotPrompt,
  neutralizeBasePromptPose,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionType =
  | "change_background"
  | "change_camera"
  | "improve_pose"
  | "improve_styling"
  | "custom";

export interface CreativeBrief {
  /** Classified action for routing and logging. */
  actionType: ActionType;
  /**
   * Detailed instruction to append to the garment system prompt.
   * Replaces the generic buildRefinementInstruction() template.
   */
  instruction: string;
  /** Short label for logs — never surfaced in UI. */
  creativeConcept: string;
}

// ---------------------------------------------------------------------------
// Action classification
// ---------------------------------------------------------------------------

const ACTION_KEYWORDS: Record<ActionType, string[]> = {
  change_background: [
    "change background", "background", "scene", "environment", "location",
    "setting", "backdrop", "surroundings",
  ],
  change_camera: [
    "change camera", "camera angle", "camera", "angle", "framing", "crop",
    "view", "perspective", "viewpoint", "shot angle",
  ],
  improve_pose: [
    "improve pose", "pose", "posture", "stance", "position", "standing",
    "walking", "movement",
  ],
  improve_styling: [
    "improve styling", "styling", "style", "accessories", "jewellery",
    "jewelry", "footwear", "shoes", "handbag", "watch", "look",
  ],
  custom: [],
};

function classifyAction(refinementPrompt: string): ActionType {
  const lower = refinementPrompt.toLowerCase().trim();

  // Check each action type by keyword presence (longest-match wins)
  const scores: Record<ActionType, number> = {
    change_background: 0,
    change_camera: 0,
    improve_pose: 0,
    improve_styling: 0,
    custom: 0,
  };

  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS) as [ActionType, string[]][]) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        // Multi-word phrases score higher than single words
        scores[action] += keyword.split(" ").length;
      }
    }
  }

  const best = (Object.entries(scores) as [ActionType, number][])
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)[0];

  return best ? best[0] : "custom";
}

// ---------------------------------------------------------------------------
// Background intelligence — context-aware location selection
// ---------------------------------------------------------------------------

interface BackgroundOptions {
  /** Comma-separated list of appropriate locations for this garment. */
  locations: string[];
  /** Locations that would be commercially inappropriate — never used. */
  neverLocations: string[];
}

function selectBackgroundOptions(profile: GarmentProfile): BackgroundOptions {
  const { category, subcategory, occasion, gender } = profile;
  const occ = occasion.map((o) => o.toLowerCase()).join(" ");
  const sub = subcategory.toLowerCase();

  // Bridal / wedding
  if (occ.includes("bridal") || occ.includes("wedding") || sub.includes("bridal") || sub.includes("wedding")) {
    return {
      locations: [
        "luxury bridal studio with draped ivory silk fabric walls",
        "palace grand ballroom with ornate gold details",
        "botanical garden in full bloom with rose arches",
        "cathedral with soaring stone archways and streaming light",
        "elegant lakeside venue at golden hour",
        "luxury hotel penthouse terrace",
      ],
      neverLocations: ["gym", "coffee shop", "corporate office", "street market", "shopping mall"],
    };
  }

  // Formal / evening / gala
  if (occ.includes("formal") || occ.includes("evening") || occ.includes("gala") || occ.includes("black tie")) {
    return {
      locations: [
        "luxury hotel grand foyer with marble floors",
        "rooftop terrace at dusk with city lights",
        "contemporary art gallery with white walls",
        "private members club with dark wood panelling",
        "grand staircase in classical European architecture",
      ],
      neverLocations: ["gym", "playground", "casual street", "supermarket"],
    };
  }

  // Business / professional / office
  if (occ.includes("business") || occ.includes("professional") || occ.includes("work") || occ.includes("office")
    || sub.includes("suit") || sub.includes("blazer") || sub.includes("trouser")) {
    return {
      locations: [
        "executive boardroom with floor-to-ceiling glass windows and city views",
        "modern corporate office with clean architecture and natural light",
        "luxury hotel business lounge",
        "contemporary office building exterior with clean lines",
        "city skyline rooftop at midday",
      ],
      neverLocations: ["beach", "playground", "gym", "festival", "casual street"],
    };
  }

  // Sportswear / activewear
  if (occ.includes("sport") || occ.includes("athletic") || occ.includes("gym") || occ.includes("active")
    || sub.includes("sport") || sub.includes("athletic") || sub.includes("gym") || sub.includes("yoga")
    || sub.includes("legging") || sub.includes("shorts")) {
    return {
      locations: [
        "premium gym with polished concrete floors and industrial design",
        "running track at golden hour with dramatic long shadows",
        "modern sports arena with clean architectural lines",
        "outdoor fitness area in a contemporary urban park",
        "sleek yoga studio with natural light and wooden floors",
      ],
      neverLocations: ["wedding venue", "ballroom", "formal dining room", "office boardroom"],
    };
  }

  // Kidswear / children
  if (gender === "kids" || occ.includes("kids") || occ.includes("children") || sub.includes("kids")) {
    return {
      locations: [
        "bright sunlit park with lush green grass and soft natural light",
        "colourful playground with modern equipment",
        "school courtyard in soft morning light",
        "garden birthday party setting with natural florals",
        "cosy home living area with warm pastel tones",
      ],
      neverLocations: ["corporate office", "nightclub", "industrial space", "formal ballroom"],
    };
  }

  // Vacation / resort / swimwear
  if (occ.includes("vacation") || occ.includes("resort") || occ.includes("beach") || occ.includes("summer")
    || sub.includes("swim") || sub.includes("bikini") || sub.includes("resort")) {
    return {
      locations: [
        "luxury beach club with white umbrellas and turquoise water",
        "infinity pool at a luxury resort with ocean horizon",
        "tropical garden terrace with lush palm foliage",
        "Mediterranean villa courtyard with terracotta tiles",
        "yacht deck at sunset",
      ],
      neverLocations: ["corporate office", "formal ballroom", "cold urban street"],
    };
  }

  // Casual / everyday / streetwear
  if (occ.includes("casual") || occ.includes("street") || occ.includes("everyday")) {
    return {
      locations: [
        "clean urban street with contemporary architecture and soft light",
        "minimal Scandinavian interior with white walls and natural wood",
        "rooftop terrace with urban skyline in soft focus",
        "modern café exterior with clean geometric design",
        "industrial loft space with large windows and natural light",
      ],
      neverLocations: ["formal ballroom", "hospital", "construction site"],
    };
  }

  // Default — general commercial
  return {
    locations: [
      "clean studio with soft gradient backdrop and premium commercial lighting",
      "minimal Scandinavian interior with white walls and natural light",
      "urban architectural backdrop with contemporary lines",
      "modern lifestyle setting with warm natural light",
    ],
    neverLocations: ["construction site", "hospital", "car park"],
  };
}

function buildBackgroundBrief(profile: GarmentProfile): CreativeBrief {
  const options = selectBackgroundOptions(profile);
  const locationList = options.locations
    .map((l, i) => `  Option ${i + 1}: ${l}`)
    .join("\n");
  const neverList = options.neverLocations.join(", ");

  const instruction = `REFINEMENT MODE — BACKGROUND CHANGE.

Reference Image 3 is the exact current state of the image. You are replacing the background environment ONLY.

THE REQUESTED CHANGE: Replace the background with a commercially appropriate premium location.

StudioLayer Creative Director has analysed the garment and selected appropriate environments:

${locationList}

Select the option that will most enhance the commercial presentation of this specific garment. Choose based on which environment best matches the garment's category, occasion, and target customer. Do NOT use these environments: ${neverList}.

WHAT MUST CHANGE:
✓ Background environment and floor / ground surface
✓ Ambient lighting may adjust naturally to match the new environment

WHAT IS COMPLETELY FROZEN — DO NOT CHANGE UNDER ANY CIRCUMSTANCES:
✗ Model face, skin tone, hair colour, and hairstyle
✗ Model body position, pose, stance, limb placement — pixel-identical to Reference Image 3
✗ Camera angle, framing, and crop — identical to Reference Image 3
✗ The uploaded garment (Reference Image 1) — every structural detail unchanged
✗ All complementary outfit items (shoes, trousers, accessories)
✗ Expression and gaze direction

OUTPUT REQUIREMENT: The output must look like Reference Image 3 with the background environment swapped for a premium commercial location. The model should appear naturally composed within the new environment. If it looks like a new generation, you have failed.`;

  return {
    actionType: "change_background",
    instruction,
    creativeConcept: `Background → ${options.locations[0]?.split(" with ")[0] ?? "premium commercial location"}`,
  };
}

// ---------------------------------------------------------------------------
// Camera Angle Director V2 (Deterministic)
// ---------------------------------------------------------------------------
//
// Implements the StudioLayer Camera Angle Director V2 spec.
//
// CANONICAL LIBRARY — 12 named angles, no others permitted.
//
// SESSION MEMORY — two modes:
//   • When usedCameraAngles is provided: deterministic selection — the
//     director picks the first unused angle from the canonical library and
//     instructs the AI to execute THAT EXACT ANGLE. No AI creativity in angle
//     selection. The frontend maintains the list and increments it after each
//     successful camera refinement.
//   • When usedCameraAngles is absent: visual fallback — the AI examines
//     Reference Image 3, identifies the current angle, and selects a different
//     one from the library.
//
// ABSOLUTE RULE (from spec):
//   The ONLY thing allowed to change is the CAMERA POSITION.
//   Imagine a professional fashion photographer physically walking around the
//   model while absolutely everything else remains frozen.
// ---------------------------------------------------------------------------

/**
 * Canonical camera angle library — V2.
 * Exported so the frontend can mirror this list for deterministic session tracking.
 * Order is the selection priority when the AI picks sequentially.
 */
export const CANONICAL_CAMERA_ANGLES = [
  "Straight Front Editorial",
  "Three-Quarter Left",
  "Three-Quarter Right",
  "Full Left Profile",
  "Full Right Profile",
  "Rear Three-Quarter Left",
  "Rear Three-Quarter Right",
  "Full Back View",
  "Low Angle Fashion",
  "High Angle Editorial",
  "Walking Towards Camera",
  "Walking Away From Camera",
] as const;

export type CameraAngle = typeof CANONICAL_CAMERA_ANGLES[number];

const CAMERA_ANGLE_DESCRIPTIONS: Record<CameraAngle, string> = {
  "Straight Front Editorial":
    "Eye-level. Camera positioned directly in front of the model. Full-body, perfectly symmetrical composition. The model faces the camera squarely. Classic ecommerce hero framing.",
  "Three-Quarter Left":
    "Camera positioned 45° to the model's left. Full-body. The model's body is angled slightly toward the camera. Natural off-axis editorial composition showing both the front and left side of the garment.",
  "Three-Quarter Right":
    "Camera positioned 45° to the model's right. Full-body. The model's body is angled slightly toward the camera. Natural off-axis editorial composition showing both the front and right side of the garment.",
  "Full Left Profile":
    "Camera positioned exactly 90° to the model's left. Full-body. Pure side view. The model faces fully to the right. Strong garment silhouette, drape, and hem length clearly visible from a side perspective.",
  "Full Right Profile":
    "Camera positioned exactly 90° to the model's right. Full-body. Pure side view. The model faces fully to the left. Strong garment silhouette, drape, and hem length clearly visible from a side perspective.",
  "Rear Three-Quarter Left":
    "Camera positioned approximately 135° behind and to the model's left. The model looks back over their left shoulder toward the camera. Showcases the rear garment construction, back detailing, back neckline, and hem from behind.",
  "Rear Three-Quarter Right":
    "Camera positioned approximately 135° behind and to the model's right. The model looks back over their right shoulder toward the camera. Showcases the rear garment construction, back detailing, back neckline, and hem from behind.",
  "Full Back View":
    "Camera positioned directly behind the model at 180°. Full-body rear view. The model faces directly away from the camera. Showcases the complete back of the garment — rear seams, back neckline, back construction, hem.",
  "Low Angle Fashion":
    "Camera positioned below waist level, angled upward toward the model. Full-body from a low perspective. The model appears tall and commanding against the background. Premium luxury fashion editorial look.",
  "High Angle Editorial":
    "Camera positioned above eye level, angled slightly downward toward the model. Full-body or three-quarter body from an elevated perspective. Elegant editorial framing with strong background presence.",
  "Walking Towards Camera":
    "Eye-level. The model walks directly toward the camera with a natural stride. Dynamic garment movement. Full-body, energy of forward motion. Fashion editorial movement.",
  "Walking Away From Camera":
    "Eye-level. The model walks directly away from the camera. Full-body rear walking view. Showcases the back of the garment in motion, garment hem movement, and rear construction during a natural stride.",
};

/**
 * Select the next camera angle not already used in this session.
 * When usedCameraAngles is provided, picks the first unused angle from
 * the canonical library (deterministic). Returns undefined only if all
 * 12 angles have been exhausted (very edge case).
 */
function selectNextCameraAngle(usedCameraAngles: string[]): CameraAngle | undefined {
  const usedSet = new Set(usedCameraAngles.map((a) => a.toLowerCase()));
  return CANONICAL_CAMERA_ANGLES.find(
    (angle) => !usedSet.has(angle.toLowerCase()),
  );
}

function buildCameraBrief(
  _profile: GarmentProfile,
  usedCameraAngles?: string[],
): CreativeBrief {
  const hasSessionMemory = Array.isArray(usedCameraAngles) && usedCameraAngles.length >= 0;

  if (hasSessionMemory) {
    // ── Deterministic mode: pick the exact next angle ─────────────────────
    const selectedAngle = selectNextCameraAngle(usedCameraAngles!);

    if (!selectedAngle) {
      // All 12 angles exhausted — reset by falling back to visual inspection
      return buildCameraBriefVisualFallback();
    }

    const description = CAMERA_ANGLE_DESCRIPTIONS[selectedAngle];

    const instruction = `CAMERA ANGLE DIRECTOR V2 — DETERMINISTIC PHOTOSHOOT SIMULATION.

Reference Image 3 is the exact current state of the image.

Your responsibility is to simulate a professional fashion photographer physically moving to a new position around the SAME model during the SAME photoshoot.

========================
YOUR ASSIGNED CAMERA ANGLE
========================

You MUST execute EXACTLY this camera angle — no other angle is permitted:

ANGLE: ${selectedAngle}
DIRECTION: ${description}

Execute this camera position precisely as described. Do not blend with any other angle. Do not improvise. Move the camera ONLY to this exact position.

========================
WHAT MUST CHANGE
========================

✓ Camera position — to the angle described above, and only that angle
✓ Model body orientation may adjust minimally and naturally to physically face the camera from this new position
✓ Depth of field and perspective shift naturally with the new angle

========================
WHAT IS COMPLETELY FROZEN — IDENTICAL TO REFERENCE IMAGE 3
========================

✗ Same person — identical facial identity, same ethnicity, same age
✗ Same hairstyle — not even a strand changes
✗ Same facial expression — unless physically impossible to maintain from this angle
✗ Same body proportions
✗ Same garment — identical fit, drape, garment construction, stitching, texture, fabric behaviour, colour, wrinkles
✗ Same accessories — every piece, completely unchanged
✗ Same footwear — unchanged
✗ Same background — identical environment, unchanged
✗ Same lighting direction — unchanged
✗ Same lighting quality — unchanged
✗ Same exposure — unchanged
✗ Same colour grading — unchanged
✗ Same image quality — unchanged
✗ Same styling — nothing about the look changes

========================
ABSOLUTE RULE
========================

The ONLY thing allowed to change is the CAMERA POSITION.

Imagine a professional fashion photographer physically walking to the position described above while absolutely everything else remains frozen.

The result must look like another photograph taken during the same fashion photoshoot, with the same model, same outfit, same environment, same lighting, and same styling — only from the camera angle: ${selectedAngle}.

If anything other than the camera position has changed, you have failed.`;

    return {
      actionType: "change_camera",
      instruction,
      creativeConcept: `Camera → ${selectedAngle}`,
    };
  }

  // ── Visual fallback mode: AI inspects Ref Image 3 ────────────────────────
  return buildCameraBriefVisualFallback();
}

function buildCameraBriefVisualFallback(): CreativeBrief {
  const angleList = CANONICAL_CAMERA_ANGLES.map((a, i) => `${i + 1}. ${a}`).join("\n");

  const instruction = `CAMERA ANGLE DIRECTOR V2 — PHOTOSHOOT SIMULATION.

Reference Image 3 is the exact current state of the image.

Your responsibility is to simulate a professional fashion photographer physically moving around the SAME model during the SAME photoshoot.

========================
STEP 1 — IDENTIFY THE CURRENT ANGLE
========================

Examine Reference Image 3 carefully. Identify which of the following twelve camera angles it most closely represents:

${angleList}

========================
STEP 2 — SELECT A DIFFERENT ANGLE
========================

Choose EXACTLY ONE angle from the list above that is DIFFERENT from the angle currently shown in Reference Image 3.

Apply that angle precisely. Do not blend or combine angles. Do not choose the same angle as Reference Image 3.

========================
WHAT MUST CHANGE
========================

✓ Camera position — to the newly selected angle only
✓ Model body orientation may adjust minimally and naturally to face the camera from the new position
✓ Depth of field and perspective shift naturally with the new angle

========================
WHAT IS COMPLETELY FROZEN — IDENTICAL TO REFERENCE IMAGE 3
========================

✗ Same person — identical facial identity, same ethnicity, same age
✗ Same hairstyle — not even a strand changes
✗ Same facial expression — unless physically impossible to maintain from this angle
✗ Same body proportions
✗ Same garment — identical fit, drape, construction, stitching, texture, fabric behaviour, colour, wrinkles
✗ Same accessories — every piece, completely unchanged
✗ Same footwear — unchanged
✗ Same background — identical environment
✗ Same lighting direction, quality, exposure, and colour grading — unchanged
✗ Same image quality — unchanged
✗ Same styling — nothing about the look changes

========================
ABSOLUTE RULE
========================

The ONLY thing allowed to change is the CAMERA POSITION.

Imagine a professional fashion photographer physically walking to a new position while absolutely everything else remains frozen.

The result must look like another photograph taken during the same fashion photoshoot, with the same model, same outfit, same environment, same lighting, and same styling — only from a different camera angle.

If anything other than the camera position has changed, you have failed.`;

  return {
    actionType: "change_camera",
    instruction,
    creativeConcept: "Camera Angle Director V2 — visual fallback",
  };
}

// ---------------------------------------------------------------------------
// Pose Director — selection delegated to pose-selection-engine (Batch 17)
// ---------------------------------------------------------------------------

function buildPoseBrief(
  profile: GarmentProfile,
  usedPoses?: string[],
  modelGender?: string | null,
): CreativeBrief {
  const hasSessionMemory = Array.isArray(usedPoses) && usedPoses.length >= 0;

  if (hasSessionMemory) {
    const selectedPose = selectNextPose(profile, usedPoses!, { modelGender });

    if (!selectedPose) {
      return buildPoseBriefVisualFallback();
    }

    const description = getPoseDescription(selectedPose);

    const instruction = `POSE DIRECTOR — DETERMINISTIC PHOTOSHOOT DIRECTION.

Reference Image 3 is the exact current state of the image.

Imagine a professional fashion photographer asking the same model to perform a different pose during the same photoshoot. Everything remains identical except the body pose.

========================
YOUR ASSIGNED POSE
========================

You MUST execute EXACTLY this pose — no other pose is permitted:

POSE: ${selectedPose}
DIRECTION: ${description}

Execute this pose precisely as described. Do not improvise or blend with other poses.

========================
WHAT MUST CHANGE
========================

✓ Model body position, stance, and limb placement
✓ Weight distribution and overall pose energy
✓ Facial expression may adjust naturally to match the new pose energy
✓ Lighting and shadows may shift subtly with the new body position

========================
WHAT IS COMPLETELY FROZEN — IDENTICAL TO REFERENCE IMAGE 3
========================

✗ Same person — identical facial identity, same ethnicity, same age
✗ Same hairstyle — not even a strand changes
✗ Same garment — identical fit, drape, garment construction, texture, colour, fabric behaviour
✗ Same accessories — every piece, completely unchanged
✗ Same footwear — unchanged
✗ Same background — identical environment, unchanged
✗ Same camera angle — the camera does not move
✗ Same lighting — direction, quality, and colour grading unchanged
✗ Same styling — nothing about the look changes

========================
ABSOLUTE RULE
========================

The ONLY thing allowed to change is the BODY POSE.

Imagine a fashion photographer directing: "Now try ${selectedPose}." The model performs the new pose while everything else on set remains exactly the same.

The result must look like another photograph from the same photoshoot — same model, same garment, same environment, same lighting, same camera position — only the pose is different.

If anything other than the body pose has changed, you have failed.`;

    return {
      actionType: "improve_pose",
      instruction,
      creativeConcept: `Pose → ${selectedPose}`,
    };
  }

  // ── Visual fallback mode ──────────────────────────────────────────────────
  return buildPoseBriefVisualFallback();
}

function buildPoseBriefVisualFallback(): CreativeBrief {
  const poseList = CANONICAL_POSES.map((p, i) => `${i + 1}. ${p}`).join("\n");

  const instruction = `POSE DIRECTOR — PHOTOSHOOT DIRECTION.

Reference Image 3 is the exact current state of the image.

Imagine a professional fashion photographer asking the same model to perform a different pose during the same photoshoot. Everything remains identical except the body pose.

========================
STEP 1 — IDENTIFY THE CURRENT POSE
========================

Examine Reference Image 3 carefully. Identify which of the following thirty poses is currently being used:

${poseList}

========================
STEP 2 — SELECT A DIFFERENT POSE
========================

Choose EXACTLY ONE pose from the list above that is:
• DIFFERENT from the pose currently shown in Reference Image 3
• Appropriate for the garment shown — it must not obscure the garment or impede its presentation

Apply that pose precisely as described. Do not blend or combine poses.

========================
WHAT MUST CHANGE
========================

✓ Model body position, stance, and limb placement
✓ Weight distribution and overall pose energy
✓ Facial expression may adjust naturally to match the new pose energy

========================
WHAT IS COMPLETELY FROZEN — IDENTICAL TO REFERENCE IMAGE 3
========================

✗ Same person — identical facial identity, same ethnicity, same age
✗ Same hairstyle — not even a strand changes
✗ Same garment — identical fit, drape, construction, texture, colour, fabric behaviour
✗ Same accessories — every piece, completely unchanged
✗ Same footwear — unchanged
✗ Same background — identical environment
✗ Same camera angle — the camera does not move
✗ Same lighting — direction, quality, and colour grading unchanged
✗ Same styling — nothing about the look changes

========================
ABSOLUTE RULE
========================

The ONLY thing allowed to change is the BODY POSE.

If anything other than the body pose has changed, you have failed.`;

  return {
    actionType: "improve_pose",
    instruction,
    creativeConcept: "Pose Director — visual fallback",
  };
}

// ---------------------------------------------------------------------------
// Styling intelligence — complementary accessories, NEVER touching the garment
// ---------------------------------------------------------------------------

interface StylingUpgrade {
  elements: string[];
  direction: string;
}

function selectStylingUpgrade(profile: GarmentProfile): StylingUpgrade {
  const { category, subcategory, gender, occasion } = profile;
  const occ = occasion.map((o) => o.toLowerCase()).join(" ");
  const sub = subcategory.toLowerCase();

  // Bridal / formal
  if (occ.includes("bridal") || occ.includes("wedding") || occ.includes("formal") || occ.includes("evening")) {
    return {
      elements: ["footwear", "jewellery", "hair styling", "accessories"],
      direction: "Upgrade footwear to elegant satin or strappy heels. Add refined jewellery — pearl or crystal earrings, delicate necklace. Elevate the hairstyle to an elegant updo or soft waves. If appropriate, add a small clutch bag. All styling must complement the formal occasion.",
    };
  }

  // Business / professional
  if (occ.includes("business") || occ.includes("professional") || sub.includes("suit") || sub.includes("blazer")) {
    return {
      elements: ["footwear", "accessories", "jewellery"],
      direction: "Upgrade footwear to polished leather heels or smart Oxford shoes appropriate to gender. Add a sophisticated watch. Upgrade jewellery to minimal, elegant pieces — small gold or silver earrings, a simple necklace or cufflinks. Add a structured leather handbag or briefcase if appropriate.",
    };
  }

  // Sportswear / activewear
  if (occ.includes("sport") || occ.includes("athletic") || sub.includes("sport") || sub.includes("athletic")) {
    return {
      elements: ["footwear", "accessories"],
      direction: "Upgrade footwear to premium athletic or training shoes that coordinate with the garment. Add performance-appropriate accessories — quality sports watch, hair tie, minimalist sports cap if appropriate. All accessories should be functional and sport-appropriate.",
    };
  }

  // Casual / everyday
  return {
    elements: ["footwear", "accessories", "jewellery", "hairstyle"],
    direction: "Upgrade footwear to stylish, fashion-forward shoes that complement the garment — clean white trainers, loafers, ankle boots, or sandals depending on the garment style. Add complementary jewellery — layered necklaces, hoop earrings, rings, or a stylish watch. Refine the hairstyle. Add a fashionable bag if appropriate.",
  };
}

function buildStylingBrief(profile: GarmentProfile): CreativeBrief {
  const upgrade = selectStylingUpgrade(profile);
  const elementList = upgrade.elements.join(", ");

  const instruction = `REFINEMENT MODE — STYLING UPGRADE.

Reference Image 3 is the exact current state of the image. You are upgrading the complementary styling elements ONLY.

THE REQUESTED CHANGE: Improve the complementary styling — ${elementList} — to elevate the overall commercial presentation.

StudioLayer Creative Director's styling direction:

${upgrade.direction}

CRITICAL RULE — THE UPLOADED GARMENT IS SACRED:
The uploaded garment (Reference Image 1) must NOT be altered in any way. You are a fashion stylist selecting complementary accessories and finishing touches — you are NOT changing the hero garment.

WHAT MUST CHANGE:
✓ Footwear — upgrade to a premium, fashion-appropriate choice
✓ Accessories — upgrade jewellery, watch, bag as directed
✓ Hairstyle — refine and elevate as appropriate to the garment
✓ Makeup — subtly enhance as appropriate

WHAT IS COMPLETELY FROZEN — DO NOT CHANGE UNDER ANY CIRCUMSTANCES:
✗ The uploaded garment (Reference Image 1) — every detail: neckline, straps, collar, sleeves, hem length, silhouette, colour, fabric, texture, print, buttons — COMPLETELY UNCHANGED
✗ Model identity — face, skin tone, hair colour (only style may change)
✗ Model pose, body position, limb placement — identical to Reference Image 3
✗ Camera angle, framing, and composition — identical to Reference Image 3
✗ Background environment and setting

OUTPUT REQUIREMENT: The output must look like the same model in the same pose wearing the same garment, with upgraded accessories and finishing touches. If the uploaded garment has changed in any way, you have failed.`;

  return {
    actionType: "improve_styling",
    instruction,
    creativeConcept: `Styling upgrade — ${elementList}`,
  };
}

// ---------------------------------------------------------------------------
// Custom / passthrough — when no action is classified, use the original request
// with appropriate framing
// ---------------------------------------------------------------------------

function buildCustomBrief(refinementPrompt: string): CreativeBrief {
  const instruction = `REFINEMENT MODE — TARGETED EDIT ONLY.

Reference Image 3 is the exact current state of the image. You are editing this existing image — not creating a new one. Treat this like a Photoshop layer operation: touch only the pixels that must change.

THE REQUESTED CHANGE IS: "${refinementPrompt}"

Apply the minimum change necessary to fulfil the request. If ambiguous, choose the most conservative interpretation.

LOCKED — THESE ELEMENTS ARE COMPLETELY FROZEN:
✗ Model face, skin tone, hair colour, and hairstyle
✗ The uploaded garment (Reference Image 1) — every detail unchanged
✗ Expression and gaze direction
✗ All complementary outfit items not mentioned in the request

CHANGE ONLY what the request directly specifies.

OUTPUT REQUIREMENT: The output must look like Reference Image 3 with one specific element changed. If the output looks like a new generation, you have failed.`;

  return {
    actionType: "custom",
    instruction,
    creativeConcept: `Custom edit: ${refinementPrompt}`,
  };
}

// ---------------------------------------------------------------------------
// Public API — buildCreativeBrief
// ---------------------------------------------------------------------------

/**
 * Build a complete creative brief for a refinement action.
 *
 * Uses the GarmentProfile from the Intelligence Engine to make
 * context-aware decisions about background, camera, pose, and styling.
 *
 * @param refinementPrompt  Raw text from the user action button or input.
 * @param profile           GarmentProfile from runIntelligenceAnalysis().
 * @returns CreativeBrief   Detailed instruction + locked elements for the provider.
 */
export function buildCreativeBrief(
  refinementPrompt: string,
  profile: GarmentProfile,
  options?: {
    usedCameraAngles?: string[];
    usedPoses?: string[];
    modelGender?: string | null;
  },
): CreativeBrief {
  const actionType = classifyAction(refinementPrompt);

  switch (actionType) {
    case "change_background": return buildBackgroundBrief(profile);
    case "change_camera":     return buildCameraBrief(profile, options?.usedCameraAngles);
    case "improve_pose":      return buildPoseBrief(profile, options?.usedPoses, options?.modelGender);
    case "improve_styling":   return buildStylingBrief(profile);
    default:                  return buildCustomBrief(refinementPrompt);
  }
}
