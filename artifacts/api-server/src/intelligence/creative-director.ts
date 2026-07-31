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
// Camera Angle Director
// ---------------------------------------------------------------------------
//
// Implements the StudioLayer Camera Angle Director spec.
//
// The 12-angle library is the canonical set — no other angles are permitted.
//
// Session memory: Since the backend is stateless, the instruction directs the
// AI model to visually examine Reference Image 3 (the previous generated
// output), identify which camera angle it represents, and then select a
// DIFFERENT angle from the library. This leverages the model's visual
// comprehension to enforce the no-repeat rule without requiring frontend state.
//
// ABSOLUTE RULE (from spec):
//   The ONLY thing allowed to change is the CAMERA POSITION.
//   Imagine a photographer walking around the model while everything else
//   remains unchanged.
// ---------------------------------------------------------------------------

const CAMERA_ANGLE_LIBRARY = `
CAMERA ANGLE LIBRARY — 12 PROFESSIONAL ANGLES

1. Straight Front Editorial
   • Eye-level, camera directly in front
   • Full-body, symmetrical composition
   • Classic ecommerce hero framing

2. Three-Quarter Left
   • Camera 45° to the model's left
   • Full-body, model slightly facing camera
   • Natural off-axis editorial composition

3. Three-Quarter Right
   • Camera 45° to the model's right
   • Full-body, model slightly facing camera
   • Natural off-axis editorial composition

4. Left Side Profile
   • Camera exactly 90° to the model's left
   • Full-body, strong garment silhouette visible
   • Architectural fashion composition

5. Right Side Profile
   • Camera exactly 90° to the model's right
   • Full-body, strong garment silhouette visible
   • Architectural fashion composition

6. Rear Three-Quarter
   • Camera approximately 135° behind the model
   • Model looking back over shoulder toward camera
   • Showcases rear garment details, back construction, hem

7. Walking Towards Camera
   • Eye-level, model walking directly toward the lens
   • Natural walking stride, full-body, dynamic garment movement
   • Energy of motion, approaching editorial

8. Walking Across Frame
   • Left-to-right walking motion across the frame
   • Editorial movement, full-body
   • Street editorial energy, garment in motion

9. Low Angle Fashion
   • Camera positioned below waist level, angled upward
   • Full-body from low perspective
   • Premium luxury fashion editorial — commanding, elevated look

10. High Angle Editorial
    • Camera above eye level, angled slightly downward
    • Elegant editorial perspective
    • Flattering downward crop, strong background presence

11. Waist-Up Portrait
    • Crop from waist upward
    • Emphasis on upper garment details, collar, neckline
    • Editorial portrait framing

12. Close Editorial Portrait
    • Chest-up crop
    • Luxury fashion magazine look
    • Focus on garment surface details, texture, and facial expression
`.trim();

function buildCameraBrief(_profile: GarmentProfile): CreativeBrief {
  const instruction = `CAMERA ANGLE DIRECTOR — PROFESSIONAL PHOTOSHOOT SIMULATION.

Reference Image 3 is the exact current state of the image.

Your responsibility is to simulate a professional fashion photographer physically moving around the SAME model during the SAME photoshoot.

Do NOT interpret this request creatively. Do NOT change anything except the camera position.

========================
STEP 1 — READ REFERENCE IMAGE 3
========================

Examine Reference Image 3 carefully. Identify which camera angle from the library below is currently being used (angle number and name).

========================
STEP 2 — SELECT A DIFFERENT ANGLE
========================

${CAMERA_ANGLE_LIBRARY}

Choose EXACTLY ONE angle from the library above that is DIFFERENT from the angle currently shown in Reference Image 3.

Apply that angle precisely as specified. Do not blend or combine angles.

========================
WHAT MUST CHANGE
========================

✓ Camera position and angle only
✓ Framing and crop only (adjusting naturally to the new viewpoint)
✓ The model's body orientation may adjust naturally to face the new camera position
✓ Depth of field and perspective may shift naturally with the new angle

========================
WHAT IS COMPLETELY FROZEN — IDENTICAL TO REFERENCE IMAGE 3
========================

✗ Same person — identical facial identity, ethnicity, age
✗ Same hairstyle — not even a strand moves
✗ Same expression — unless a natural adjustment is physically required by the pose
✗ Same body proportions
✗ Same garment — identical fit, drape, texture, colour, every construction detail
✗ Same accessories — every piece, unchanged
✗ Same footwear — unchanged
✗ Same background — identical environment, lighting direction, and quality
✗ Same styling — nothing about the look changes

========================
ABSOLUTE RULE
========================

The ONLY thing allowed to change is the CAMERA POSITION.

Imagine a photographer walking around the model while everything else remains unchanged.

The result must look like a different photograph captured during the SAME professional fashion photoshoot — not a different AI-generated person or a new generation.

If anything other than the camera angle has changed, you have failed.`;

  return {
    actionType: "change_camera",
    instruction,
    creativeConcept: "Camera Angle Director — professional photoshoot simulation",
  };
}

// ---------------------------------------------------------------------------
// Pose intelligence — garment-appropriate pose selection
// ---------------------------------------------------------------------------

interface PoseOption {
  name: string;
  direction: string;
}

function selectPose(profile: GarmentProfile): PoseOption {
  const { category, subcategory, fit } = profile;
  const sub = subcategory.toLowerCase();

  // Long dresses, gowns, maxi skirts
  if (sub.includes("gown") || sub.includes("maxi") || sub.includes("full length") || sub.includes("evening dress")) {
    const poses: PoseOption[] = [
      { name: "Elegant standing with hem lift", direction: "Model stands tall and elegant, one hand gently lifting the hem slightly. Full-length garment is completely visible. Weight shifted naturally to one side. Shoulders relaxed and confident." },
      { name: "Slow twirl", direction: "Model captured mid-twirl, skirt flowing outward with natural movement. Hair has slight movement. The full garment length and silhouette is clearly visible. Joyful, editorial energy." },
      { name: "Walking slowly forward", direction: "Model walks elegantly toward the camera, weight shifting with each step. The hem moves naturally. Full-length garment silhouette is clearly visible from shoulder to floor." },
    ];
    return poses[Math.floor(Math.random() * poses.length)]!;
  }

  // Coats, jackets, blazers — outerwear
  if (category === "outerwear" || sub.includes("coat") || sub.includes("jacket") || sub.includes("blazer")) {
    const poses: PoseOption[] = [
      { name: "Hands in pockets", direction: "Model stands confidently with hands in jacket/coat pockets. Coat slightly open to show the garment beneath. Relaxed, effortless commercial pose. Weight shifted to one side." },
      { name: "Walking forward", direction: "Model strides forward with natural confidence. Coat or jacket slightly open, moving naturally with the stride. Purposeful fashion editorial energy." },
      { name: "Looking sideways", direction: "Model stands facing slightly away from camera, head turned to look elegantly sideways. Coat collar and construction are clearly visible. Thoughtful, editorial pose." },
    ];
    return poses[Math.floor(Math.random() * poses.length)]!;
  }

  // Casual shirts, blouses, tops
  if (category === "tops") {
    const poses: PoseOption[] = [
      { name: "Relaxed effortless stance", direction: "Model stands with a natural, relaxed stance and slight hip shift. Weight on one leg. Arms loosely at sides or one hand in pocket. Approachable, modern ecommerce energy." },
      { name: "Movement — hand through hair", direction: "Model captured with hand running through hair in a candid, editorial movement. Eyes looking slightly off-camera. Natural, lifestyle energy." },
      { name: "Crossed arms with confidence", direction: "Model stands with arms loosely crossed, confident and composed. Direct eye contact with camera. Modern ecommerce pose that showcases the top's fit and construction." },
    ];
    return poses[Math.floor(Math.random() * poses.length)]!;
  }

  // Trousers, jeans, skirts, shorts — bottoms
  if (category === "bottoms") {
    const poses: PoseOption[] = [
      { name: "Walking stride", direction: "Model mid-stride, walking naturally. One leg forward, weight shifting. The full length of the trouser/skirt from waistband to hem is clearly visible. Street editorial energy." },
      { name: "Standing with slight hip lean", direction: "Model stands with weight shifted to one hip, creating a natural S-curve silhouette. One hand rests casually at the waistband. The full garment length is clearly visible." },
      { name: "Sitting on edge", direction: "Model sits on the edge of a surface (step, ledge, or stool), legs at a natural angle. The trouser/skirt drape and length are clearly visible from waist to hem." },
    ];
    return poses[Math.floor(Math.random() * poses.length)]!;
  }

  // One-pieces, jumpsuits, rompers
  if (category === "one-pieces") {
    const poses: PoseOption[] = [
      { name: "Confident standing pose", direction: "Model stands tall with confident posture, slight hip shift. One hand on hip, the other at side. Full-body garment is completely visible from neckline to hem." },
      { name: "Walking editorial", direction: "Model walks forward with energy and purpose. The one-piece silhouette is fully visible in motion. Editorial fashion energy." },
    ];
    return poses[Math.floor(Math.random() * poses.length)]!;
  }

  // Default — universally appropriate
  const defaultPoses: PoseOption[] = [
    { name: "Confident standing", direction: "Model stands with natural confidence, slight hip shift, weight balanced. Direct eye contact with camera. Clean ecommerce pose that showcases the garment fully." },
    { name: "Three-quarter turn walk", direction: "Model walks forward at a slight angle to the camera. Natural stride, effortless movement. Full garment visible." },
  ];
  return defaultPoses[Math.floor(Math.random() * defaultPoses.length)]!;
}

function buildPoseBrief(profile: GarmentProfile): CreativeBrief {
  const pose = selectPose(profile);

  const instruction = `REFINEMENT MODE — POSE DIRECTION.

Reference Image 3 is the exact current state of the image. You are changing the model's pose ONLY to better showcase the uploaded garment.

THE REQUESTED CHANGE: Apply a professionally directed fashion pose that improves garment presentation.

StudioLayer Creative Director has selected this pose:

SELECTED POSE: ${pose.name}
POSE DIRECTION: ${pose.direction}

The pose must improve the commercial presentation of the garment. Maximum garment visibility is required — no part of the uploaded garment should be obscured by the pose change.

WHAT MUST CHANGE:
✓ Model body position, stance, and limb placement
✓ Weight distribution and overall pose energy
✓ Facial expression may adjust naturally to match the new pose energy
✓ Lighting and shadows may adjust naturally to the new body position

WHAT IS COMPLETELY FROZEN — DO NOT CHANGE UNDER ANY CIRCUMSTANCES:
✗ Model identity — face, skin tone, hair colour, and hairstyle must remain recognisably the same person
✗ The uploaded garment (Reference Image 1) — every structural detail: neckline, straps, collar, sleeves, hem length, silhouette, colour, fabric, texture, print — must be identical
✗ All complementary outfit items (shoes, trousers, accessories) must remain the same
✗ Camera angle and framing — composition stays the same
✗ Background environment and setting

OUTPUT REQUIREMENT: The output must look like the same model wearing the same garment in a new, professionally directed pose. If the garment has changed, you have failed.`;

  return {
    actionType: "improve_pose",
    instruction,
    creativeConcept: `Pose → ${pose.name}`,
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
): CreativeBrief {
  const actionType = classifyAction(refinementPrompt);

  switch (actionType) {
    case "change_background": return buildBackgroundBrief(profile);
    case "change_camera":     return buildCameraBrief(profile);
    case "improve_pose":      return buildPoseBrief(profile);
    case "improve_styling":   return buildStylingBrief(profile);
    default:                  return buildCustomBrief(refinementPrompt);
  }
}

// ---------------------------------------------------------------------------
// Editorial shot diversity — generates 4 genuinely different shot briefs
// ---------------------------------------------------------------------------

/**
 * Generate four distinct editorial shot prompts for a Campaign/Editorial
 * multi-image request.
 *
 * Each shot receives a unique camera direction, pose, and framing brief
 * appended to the base creative prompt.  The garment and outfit context
 * from the base prompt are preserved — only the photographic direction varies.
 *
 * @param basePrompt  The initial creative prompt from the Intelligence Engine.
 * @param profile     GarmentProfile used to select garment-appropriate shots.
 * @returns           Array of four complete shot prompts (index 0–3).
 */
export function buildEditorialShotPrompts(
  basePrompt: string,
  profile: GarmentProfile,
): [string, string, string, string] {
  const { category, subcategory } = profile;
  const sub = subcategory.toLowerCase();
  const isLongGarment = sub.includes("gown") || sub.includes("maxi") || sub.includes("full length");
  const isOuterwear = category === "outerwear";

  // Shot 0 — Hero front: direct, confident, eye contact
  const shot0 = `${basePrompt}

SHOT DIRECTION — HERO FRONT:
Camera position: Eye level, directly facing the model. Full-body framing from head to feet.
Pose: Model stands tall and confident, shoulders squared to camera. Slight, natural weight shift. Direct eye contact with the lens.
Energy: Premium commercial ecommerce hero shot. Strong, confident presence.
Composition: Model centred with equal space on both sides. Clean, uncluttered framing.`;

  // Shot 1 — Walking three-quarter: movement, dynamic, street editorial
  const shot1 = `${basePrompt}

SHOT DIRECTION — WALKING THREE-QUARTER:
Camera position: Three-quarter angle, 45 degrees to the model. Full-body framing.
Pose: Model walks confidently forward and slightly toward the camera. Natural mid-stride energy. Hair has slight natural movement.${isLongGarment ? " Skirt or hem flows with movement." : ""}
Energy: Fashion street editorial. Dynamic, purposeful movement. Aspirational lifestyle energy.
Composition: Slightly asymmetric framing, model entering from one side. Background leads the eye.`;

  // Shot 2 — Side profile: silhouette, architectural, elegant
  const shot2 = `${basePrompt}

SHOT DIRECTION — SIDE PROFILE:
Camera position: Pure side profile at 90 degrees to the model. Full-body or three-quarter body framing.
Pose: Model stands elegantly sideways, chin slightly lifted, gaze directed away from camera.${isOuterwear ? " Coat or jacket collar clearly visible." : ""}${isLongGarment ? " Full garment silhouette from shoulder to hem visible." : ""}
Energy: Architectural, high fashion editorial. Emphasises garment silhouette, drape, and line.
Composition: Model placed on the left or right third of the frame. Strong negative space on the opposite side.`;

  // Shot 3 — Magazine close crop: intimate, editorial, artistic
  const shot3 = `${basePrompt}

SHOT DIRECTION — MAGAZINE CLOSE CROP:
Camera position: Slightly high angle, three-quarter body crop from mid-thigh upward. Editorial composition.
Pose: Model gazes slightly off-camera — upward and to the right or left — with a thoughtful, editorial expression. One hand may rest on collar, waist, or be in pocket.
Energy: High fashion magazine cover. Artistic, intimate, premium editorial quality.
Composition: Face and upper garment fill the frame. Background is soft and atmospheric. Strong fashion editorial lighting.`;

  return [shot0, shot1, shot2, shot3];
}
