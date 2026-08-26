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

/** Structural preservation — profile-specific locks only (Pass E).
 * Generic garment fidelity is owned by GARMENT_AUTHORITY_SOT. */
export function buildGarmentPreservationPrompt(profile: GarmentProfile): string {
  const lengthLabel = formatGarmentLengthLabel(profile.garmentLength);
  const locks: string[] = [];

  if (lengthLabel) {
    locks.push(`Maintain exact garment length: ${lengthLabel}.`);
  }
  if (profile.silhouette) {
    locks.push(`Preserve silhouette: ${profile.silhouette}.`);
  }
  if (profile.neckline) {
    locks.push(`Preserve exact neckline: ${profile.neckline}.`);
  }
  if (profile.sleeveLength || profile.sleeveType) {
    locks.push(
      `Preserve sleeve construction: ${[profile.sleeveLength, profile.sleeveType].filter(Boolean).join(" ")}.`,
    );
  }
  if (profile.garmentStructure) {
    locks.push(`Garment structure: ${profile.garmentStructure}.`);
  }
  if (profile.fit) {
    locks.push(`Preserve fit: ${profile.fit}.`);
  }

  if (locks.length === 0) return "";

  return ["GARMENT INTELLIGENCE — profile locks:", ...locks].join(" ");
}

/**
 * Pass E — batch garment consistency is owned by primary garmentInstruction
 * BATCH CONSISTENCY + GARMENT_AUTHORITY_SOT. Kept as empty for call-site stability.
 */
export function buildGarmentConsistencyRules(): string {
  return "";
}

function formatDetectedGarmentColours(profile: GarmentProfile): string {
  const colours = profile.colour.filter(Boolean);
  if (colours.length === 0) return "the exact colours shown in Reference Image 1";
  return colours.join(" and ");
}

/**
 * Profile-specific colour identity — detected colour name only (Pass E).
 * General colour fidelity is owned by GARMENT_AUTHORITY_SOT.
 */
export function buildGarmentColourIdentityPrompt(profile: GarmentProfile): string {
  const detected = formatDetectedGarmentColours(profile);
  return `GARMENT COLOUR IDENTITY: detected product colour is ${detected}. Keep this colour identity across the batch; do not reinterpret into adjacent palette families.`;
}

/** Combined garment intelligence prompt block for Prompt Composer. */
export function buildGarmentIntelligencePrompt(profile: GarmentProfile): string {
  return [
    buildGarmentPreservationPrompt(profile),
    buildGarmentColourIdentityPrompt(profile),
    buildFabricBehaviourRules(profile),
  ]
    .filter((block) => block.trim().length > 0)
    .join(" ");
}
