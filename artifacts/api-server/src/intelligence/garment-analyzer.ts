// ---------------------------------------------------------------------------
// StudioLayer AI — Garment Analyzer (SL-013A)
//
// Analyses an uploaded garment image using GPT-4o vision and returns a
// structured GarmentProfile. Falls back to a minimal heuristic profile
// derived from garmentPlacement if the vision call fails.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import type { GarmentProfile, GarmentCategory } from "./types";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });
  }
  return openaiClient;
}

// ---------------------------------------------------------------------------
// Fallback: derive a minimal profile from garmentPlacement alone
// ---------------------------------------------------------------------------

function fallbackProfile(
  garmentPlacement: string | null | undefined,
): GarmentProfile {
  let category: GarmentCategory = "tops";
  if (garmentPlacement === "lower_body")  category = "bottoms";
  if (garmentPlacement === "full_body")   category = "one-pieces";

  return {
    category,
    subcategory:     category === "tops"       ? "top"
                   : category === "bottoms"    ? "trousers"
                   : "dress",
    gender:          "womens",
    ageGroup:        "young_adult",
    colour:          ["neutral"],
    fit:             "standard",
    fabric:          "unknown",
    pattern:         "solid",
    texture:         "smooth",
    season:          ["spring", "autumn"],
    occasion:        ["casual"],
    hasPockets:      null,
    isFlowingGarment: null,
  };
}

// ---------------------------------------------------------------------------
// GPT-4o vision prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a professional fashion analyst. Analyse the garment in the image and return a JSON object with ONLY these fields:

{
  "category": "tops" | "bottoms" | "one-pieces" | "outerwear" | "footwear" | "accessories",
  "subcategory": string,         // e.g. "blouse", "jeans", "trench coat"
  "gender": "womens" | "mens" | "kids" | "unisex",
  "ageGroup": "young_child" | "teen_youth" | "young_adult" | "classic_mid_age" | "mature_executive",
  "colour": string[],            // primary colours, lowercase, e.g. ["camel", "beige"]
  "fit": string,                 // e.g. "slim", "relaxed", "oversized", "fitted"
  "fabric": string,              // primary fabric, lowercase
  "sleeveType": string | null,   // "short" | "long" | "sleeveless" | null
  "sleeveLength": string | null, // "full" | "half" | "three-quarter" | null
  "neckline": string | null,     // e.g. "crew" | "v-neck" | "turtleneck" | null
  "collar": string | null,       // e.g. "spread" | "button-down" | "band" | "none" | null
  "garmentLength": string | null,// "cropped" | "hip" | "knee" | "midi" | "maxi" | "full-length" | null
  "pattern": string,             // "solid" | "stripe" | "floral" | "check" | "plaid" | "geometric" | "graphic"
  "texture": string,             // "smooth" | "textured" | "knit" | "woven" | "sheer"
  "season": string[],            // any of: "spring" | "summer" | "autumn" | "winter"
  "occasion": string[]           // any of: "casual" | "office" | "evening" | "sport" | "formal" | "festive"
  "hasPockets": boolean | null,  // true ONLY if clearly visible usable pockets exist — for dresses/gowns/skirts default false unless unmistakable
  "isFlowingGarment": boolean | null, // true for dresses, maxi skirts, flowing capes
  "silhouette": string | null,   // e.g. "fitted" | "relaxed" | "A-line" | "structured" | "flowing" | "boxy"
  "fabricBehaviour": string | null, // e.g. "structured" | "flowing" | "crisp" | "stretch" | "natural drape"
  "fabricMovementPotential": "minimal" | "moderate" | "high" | null,
  "garmentStructure": string | null // brief construction summary: neckline, sleeves, hemline
}

RULES:
- For full-length dresses and gowns, garmentLength must reflect the visible hem (mini, knee, midi, mid-calf, maxi, full-length).
- silhouette, fabricBehaviour, and garmentStructure must describe what is visible — do not invent details.
- Focus ONLY on the garment, ignore hangers, backgrounds, mannequins.
- Respond with ONLY valid JSON, no markdown, no explanation.
- If unsure about a nullable field, set it to null.
- hasPockets: for dresses, gowns, skirts, and one-piece garments, set false unless pockets are clearly visible and usable. Never assume pockets exist.`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" } };

/**
 * Builds GPT-4o vision user content for garment analysis.
 * Front-only requests keep the historical single-image shape.
 * Optional back/detail are appended as supplementary visual inputs.
 */
export function buildGarmentAnalysisVisionContent(params: {
  frontImageUrl: string;
  backImageUrl?: string;
  detailImageUrl?: string;
  garmentPlacement?: string | null;
  garmentLengthSelection?: string | null;
}): VisionContentPart[] {
  const {
    frontImageUrl,
    backImageUrl,
    detailImageUrl,
    garmentPlacement,
    garmentLengthSelection,
  } = params;

  const placementHint = garmentPlacement
    ? `User indicated garment category placement: ${garmentPlacement.replace("_", " ")}. Use as context but verify from the image.`
    : "Analyse the garment in this image.";
  const lengthHint =
    garmentLengthSelection && garmentLengthSelection !== "auto"
      ? ` User selected garment length: ${garmentLengthSelection.replace(/_/g, " ")} — confirm or refine from the image.`
      : "";

  const content: VisionContentPart[] = [
    { type: "text", text: placementHint + lengthHint },
  ];

  const hasSupplementary = Boolean(backImageUrl || detailImageUrl);

  if (!hasSupplementary) {
    // Preserve exact front-only message shape used before multi-reference support.
    content.push({
      type: "image_url",
      image_url: { url: frontImageUrl, detail: "low" },
    });
    return content;
  }

  content.push({ type: "text", text: "Front (primary garment reference):" });
  content.push({
    type: "image_url",
    image_url: { url: frontImageUrl, detail: "low" },
  });

  if (backImageUrl) {
    content.push({ type: "text", text: "Back (supplementary visual reference):" });
    content.push({
      type: "image_url",
      image_url: { url: backImageUrl, detail: "low" },
    });
  }

  if (detailImageUrl) {
    content.push({ type: "text", text: "Detail (supplementary visual reference):" });
    content.push({
      type: "image_url",
      image_url: { url: detailImageUrl, detail: "low" },
    });
  }

  return content;
}

/**
 * Analyses a garment image URL and returns a structured GarmentProfile.
 * Optional back/detail images provide supplementary visual context only.
 * Falls back gracefully to a minimal profile if GPT-4o vision fails.
 */
export async function analyzeGarment(params: {
  /** Front garment image — required primary visual reference. */
  frontImageUrl: string;
  /** Optional back-view garment image. */
  backImageUrl?: string;
  /** Optional detail/close-up garment image. */
  detailImageUrl?: string;
  garmentPlacement?: string | null;
  garmentLengthSelection?: string | null;
}): Promise<GarmentProfile> {
  const {
    frontImageUrl,
    backImageUrl,
    detailImageUrl,
    garmentPlacement,
    garmentLengthSelection,
  } = params;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildGarmentAnalysisVisionContent({
            frontImageUrl,
            backImageUrl,
            detailImageUrl,
            garmentPlacement,
            garmentLengthSelection,
          }),
        },
      ],
      max_tokens: 400,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as Partial<GarmentProfile>;

    // Validate required fields; fall back if missing
    if (!parsed.category || !parsed.subcategory) {
      return fallbackProfile(garmentPlacement);
    }

    return {
      category:      parsed.category      ?? fallbackProfile(garmentPlacement).category,
      subcategory:   parsed.subcategory   ?? "garment",
      gender:        parsed.gender        ?? "womens",
      ageGroup:      parsed.ageGroup      ?? "young_adult",
      colour:        Array.isArray(parsed.colour) ? parsed.colour : ["neutral"],
      fit:           parsed.fit           ?? "standard",
      fabric:        parsed.fabric        ?? "unknown",
      sleeveType:    parsed.sleeveType    ?? undefined,
      sleeveLength:  parsed.sleeveLength  ?? undefined,
      neckline:      parsed.neckline      ?? undefined,
      collar:        parsed.collar        ?? undefined,
      garmentLength: parsed.garmentLength ?? undefined,
      pattern:       parsed.pattern       ?? "solid",
      texture:       parsed.texture       ?? "smooth",
      season:        Array.isArray(parsed.season)   ? parsed.season   : ["spring"],
      occasion:      Array.isArray(parsed.occasion) ? parsed.occasion : ["casual"],
      hasPockets:    parsed.hasPockets ?? null,
      isFlowingGarment: parsed.isFlowingGarment ?? null,
      silhouette:       parsed.silhouette ?? undefined,
      fabricBehaviour:  parsed.fabricBehaviour ?? undefined,
      fabricMovementPotential: parsed.fabricMovementPotential ?? undefined,
      garmentStructure: parsed.garmentStructure ?? undefined,
    };
  } catch {
    return fallbackProfile(garmentPlacement);
  }
}
