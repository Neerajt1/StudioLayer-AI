// ---------------------------------------------------------------------------
// StudioLayer AI — Garment Intelligence Engine (Batch 18)
//
// Interprets the uploaded garment before prompt generation.
// Defines what must be preserved; Pose Intelligence defines presentation.
//
// Pipeline position:
//   Upload → Garment Analysis → Garment Intelligence → Pose Intelligence → Prompt
// ---------------------------------------------------------------------------

import type { GarmentProfile } from "./types";

/** User-facing length selection from Studio UI (Full Outfit only). */
export type GarmentLengthSelection =
  | "auto"
  | "mini"
  | "above_knee"
  | "knee"
  | "midi"
  | "mid_calf"
  | "maxi"
  | "floor";

export type FabricBehaviourClass =
  | "maxi"
  | "midi_knee"
  | "mini"
  | "blazer"
  | "suit"
  | "flowing_dress"
  | "default";

const LENGTH_SELECTION_TO_PROFILE: Record<
  Exclude<GarmentLengthSelection, "auto">,
  string
> = {
  mini: "mini",
  above_knee: "above-knee",
  knee: "knee",
  midi: "midi",
  mid_calf: "mid-calf",
  maxi: "maxi",
  floor: "full-length",
};

/** Map UI / GPT length tokens to a human label for prompts. */
export function formatGarmentLengthLabel(length?: string): string | undefined {
  if (!length) return undefined;
  const map: Record<string, string> = {
    mini: "mini length",
    "above-knee": "above-knee length",
    knee: "knee length",
    midi: "midi length",
    "mid-calf": "mid-calf length",
    maxi: "maxi length",
    "full-length": "floor length",
    floor: "floor length",
    cropped: "cropped length",
    hip: "hip length",
  };
  return map[length.toLowerCase()] ?? length;
}

function inferSilhouette(profile: GarmentProfile): string {
  if (profile.silhouette) return profile.silhouette;

  const fit = profile.fit.toLowerCase();
  const sub = profile.subcategory.toLowerCase();

  if (fit.includes("oversized") || fit.includes("boxy")) return "boxy";
  if (fit.includes("slim") || fit.includes("fitted") || fit.includes("tailored")) {
    return sub.includes("blazer") || sub.includes("suit") ? "structured" : "fitted";
  }
  if (fit.includes("relaxed") || fit.includes("loose")) return "relaxed";
  if (profile.isFlowingGarment || sub.includes("gown") || sub.includes("maxi")) {
    return "flowing";
  }
  if (sub.includes("dress") || sub.includes("skirt")) return "A-line";
  return "standard";
}

function inferFabricBehaviour(profile: GarmentProfile): string {
  if (profile.fabricBehaviour) return profile.fabricBehaviour;

  const sub = profile.subcategory.toLowerCase();
  const fabric = profile.fabric.toLowerCase();

  if (sub.includes("blazer") || sub.includes("suit") || sub.includes("denim")) {
    return "structured";
  }
  if (
    profile.isFlowingGarment ||
    fabric.includes("silk") ||
    fabric.includes("chiffon") ||
    fabric.includes("satin") ||
    fabric.includes("crepe")
  ) {
    return "flowing";
  }
  if (fabric.includes("knit") || fabric.includes("jersey") || fabric.includes("stretch")) {
    return "stretch";
  }
  if (fabric.includes("linen") || fabric.includes("cotton") || fabric.includes("poplin")) {
    return "crisp";
  }
  return "natural drape";
}

function inferFabricMovementPotential(
  profile: GarmentProfile,
): GarmentProfile["fabricMovementPotential"] {
  if (profile.fabricMovementPotential) return profile.fabricMovementPotential;

  const behaviourClass = resolveFabricBehaviourClass(profile);
  if (behaviourClass === "blazer" || behaviourClass === "suit") return "minimal";
  if (behaviourClass === "mini") return "moderate";
  if (behaviourClass === "maxi" || behaviourClass === "flowing_dress") return "high";
  if (behaviourClass === "midi_knee") return "moderate";
  return "moderate";
}

function inferGarmentStructure(profile: GarmentProfile): string {
  if (profile.garmentStructure) return profile.garmentStructure;

  const parts: string[] = [];
  if (profile.neckline) parts.push(`${profile.neckline} neckline`);
  if (profile.sleeveType || profile.sleeveLength) {
    parts.push(
      [profile.sleeveLength, profile.sleeveType].filter(Boolean).join(" ") + " sleeves",
    );
  }
  if (profile.collar && profile.collar !== "none") parts.push(`${profile.collar} collar`);
  if (profile.garmentLength) {
    parts.push(`${formatGarmentLengthLabel(profile.garmentLength)} hemline`);
  }
  if (parts.length === 0) return "preserve original garment construction exactly as photographed";
  return parts.join(", ");
}

/** Enrich GPT profile with inferred intelligence fields. */
export function enrichGarmentProfile(profile: GarmentProfile): GarmentProfile {
  return {
    ...profile,
    silhouette: inferSilhouette(profile),
    fabricBehaviour: inferFabricBehaviour(profile),
    fabricMovementPotential: inferFabricMovementPotential(profile),
    garmentStructure: inferGarmentStructure(profile),
  };
}

/** Apply user length override when Full Outfit + manual selection. */
export function applyGarmentLengthSelection(
  profile: GarmentProfile,
  selection: GarmentLengthSelection | null | undefined,
): GarmentProfile {
  if (!selection || selection === "auto") return profile;

  const mapped = LENGTH_SELECTION_TO_PROFILE[selection];
  return {
    ...profile,
    garmentLength: mapped,
    ...(selection === "maxi" || selection === "floor"
      ? { isFlowingGarment: true }
      : {}),
  };
}

/** Full garment intelligence pass after vision analysis. */
export function applyGarmentIntelligence(
  profile: GarmentProfile,
  options?: {
    garmentLengthSelection?: GarmentLengthSelection | null;
    garmentPlacement?: string | null;
  },
): GarmentProfile {
  let enriched = profile;

  if (options?.garmentPlacement === "full_body") {
    enriched = applyGarmentLengthSelection(
      enriched,
      options.garmentLengthSelection ?? "auto",
    );
  }

  return enrichGarmentProfile(enriched);
}

export function resolveFabricBehaviourClass(profile: GarmentProfile): FabricBehaviourClass {
  const sub = profile.subcategory.toLowerCase();
  const length = (profile.garmentLength ?? "").toLowerCase();

  if (sub.includes("blazer") || (sub.includes("jacket") && profile.category === "outerwear")) {
    return "blazer";
  }
  if (sub.includes("suit")) return "suit";

  if (
    profile.isFlowingGarment ||
    (profile.category === "one-pieces" &&
      (sub.includes("dress") || sub.includes("gown")) &&
      !length.includes("mini"))
  ) {
    if (length.includes("maxi") || length.includes("full") || length.includes("floor")) {
      return "maxi";
    }
    return "flowing_dress";
  }

  if (length.includes("maxi") || length.includes("full") || length.includes("floor")) {
    return "maxi";
  }
  if (length.includes("midi") || length.includes("knee") || length.includes("mid-calf")) {
    return "midi_knee";
  }
  if (length.includes("mini") || length.includes("cropped") || length.includes("above")) {
    return "mini";
  }

  return "default";
}

function buildFabricBehaviourRules(profile: GarmentProfile): string {
  const cls = resolveFabricBehaviourClass(profile);

  const rules: Record<FabricBehaviourClass, { allow: string[]; avoid: string[] }> = {
    maxi: {
      allow: [
        "natural walking flow",
        "soft fabric movement",
        "elegant draping",
      ],
      avoid: [
        "excessive lifting of the hem",
        "unrealistic wind effects",
        "over-dramatic movement",
      ],
    },
    midi_knee: {
      allow: ["moderate movement", "natural walking motion"],
      avoid: ["excessive fabric spread", "dramatic wind effects"],
    },
    mini: {
      allow: ["standing", "walking", "light movement"],
      avoid: ["large flowing motion", "excessive fabric spread"],
    },
    blazer: {
      allow: ["structured stance", "jacket adjustment", "business posture"],
      avoid: ["twirling", "fabric flow effects", "wind effects"],
    },
    suit: {
      allow: ["structured poses", "professional posture", "minimal fabric movement"],
      avoid: ["dramatic movement", "flowing effects", "wind effects"],
    },
    flowing_dress: {
      allow: ["controlled movement", "elegant walking", "natural draping"],
      avoid: ["extreme wind", "unrealistic floating fabric", "excessive spread"],
    },
    default: {
      allow: ["natural standing", "natural walking", "subtle fabric drape"],
      avoid: ["unrealistic wind", "invented garment movement"],
    },
  };

  const rule = rules[cls];
  return [
    "FABRIC BEHAVIOUR — respect the garment type:",
    `Allow: ${rule.allow.join(", ")}.`,
    `Avoid: ${rule.avoid.join(", ")}.`,
  ].join(" ");
}

/** Structural preservation block injected into every generation prompt. */
export function buildGarmentPreservationPrompt(profile: GarmentProfile): string {
  const lengthLabel = formatGarmentLengthLabel(profile.garmentLength);
  const structural: string[] = [
    "GARMENT INTELLIGENCE — preserve the uploaded garment exactly:",
    "The garment must retain identical proportions and dimensions across every generated image.",
    "Do not shorten the garment. Do not lengthen the garment. Do not change garment proportions.",
    "Never reinterpret the garment's dimensions — reproduce the exact scale, fit, and relative measurements from the upload.",
    "Respect natural fabric behaviour. Preserve original garment structure.",
    "Only pose, camera angle, lighting, and complementary styling may change — never the garment itself.",
  ];

  if (lengthLabel) {
    structural.push(`Maintain exact garment length: ${lengthLabel} — identical across every image in this batch.`);
  }
  if (profile.silhouette) {
    structural.push(`Preserve silhouette: ${profile.silhouette}.`);
  }
  if (profile.neckline) {
    structural.push(`Preserve exact neckline: ${profile.neckline}.`);
  }
  if (profile.sleeveLength || profile.sleeveType) {
    structural.push(
      `Preserve sleeve construction: ${[profile.sleeveLength, profile.sleeveType].filter(Boolean).join(" ")}.`,
    );
  }
  if (profile.garmentStructure) {
    structural.push(`Garment structure: ${profile.garmentStructure}.`);
  }
  if (profile.fit) {
    structural.push(`Preserve fit: ${profile.fit} — same waist position and overall proportions.`);
  }

  structural.push(
    "Natural fabric drape must follow the original garment — never invent a different length, silhouette, or hemline.",
  );

  return structural.join(" ");
}

/** Batch consistency — same garment across all shots in one generation. */
export function buildGarmentConsistencyRules(): string {
  return [
    "GARMENT CONSISTENCY — mandatory across this entire generation batch:",
    "Every image must show the SAME garment length, SAME silhouette, SAME neckline,",
    "SAME sleeve length, SAME waist position, SAME hemline, SAME proportions, SAME fit, and SAME dimensions.",
    "Every image must show the SAME garment colour, SAME hue, SAME saturation, SAME brightness, SAME print, SAME pattern, and SAME fabric appearance as Reference Image 1.",
    "Garment proportions must be pixel-faithful to the upload — identical in every shot of this batch.",
    "Never generate one knee-length, one midi, and one maxi version of the same uploaded garment.",
    "Never reinterpret, recolour, or rescale the garment between images.",
    "The AI may change only pose, camera angle, and lighting — never garment dimensions, construction, colour, or footwear styling.",
    "The uploaded garment is the hero — every image is the same garment in a different professional pose.",
  ].join(" ");
}

function formatDetectedGarmentColours(profile: GarmentProfile): string {
  const colours = profile.colour.filter(Boolean);
  if (colours.length === 0) return "the exact colours shown in Reference Image 1";
  return colours.join(" and ");
}

/**
 * Profile-specific colour identity lock — uses garment intelligence output.
 * Prevents the model from reinterpreting detected colours into adjacent families.
 */
export function buildGarmentColourIdentityPrompt(profile: GarmentProfile): string {
  const detected = formatDetectedGarmentColours(profile);
  return [
    "GARMENT COLOUR IDENTITY — hard lock (non-negotiable):",
    `The uploaded garment's colour identity is ${detected}. Treat this as a fixed product attribute — not a stylistic suggestion.`,
    "Reproduce this exact colour in every image. Natural lighting shadows and highlights may vary; perceptible hue, value, or saturation shifts that change how the colour reads are forbidden.",
    "Do NOT reinterpret named colours into adjacent palette families — e.g. ivory must stay ivory (not white, cream, beige, or grey); navy must stay navy (not black or royal blue); burgundy must stay burgundy (not red or brown).",
    "Preserve material finish, texture, print/pattern registration, and construction alongside colour — only pose, camera, and neutral studio lighting may change.",
  ].join(" ");
}

/** Combined garment intelligence prompt block for Prompt Composer. */
export function buildGarmentIntelligencePrompt(profile: GarmentProfile): string {
  return [
    buildGarmentPreservationPrompt(profile),
    buildGarmentColourIdentityPrompt(profile),
    buildFabricBehaviourRules(profile),
    buildGarmentConsistencyRules(),
  ].join(" ");
}
