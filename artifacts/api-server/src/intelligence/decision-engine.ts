// ---------------------------------------------------------------------------
// StudioLayer AI — Decision Engine (SL-013A / SL-014)
//
// Orchestrates the full intelligence pipeline:
//   1. GarmentAnalyzer     → GarmentProfile
//   2. StyleEngine         → StyleMode
//   3. WardrobeCompletion  → which slots to fill
//   4. Rule Engine         → FashionKnowledgeBase match (deterministic, first)
//   5. GPT Fallback        → only when confidence < 0.45 or no rule matched
//   6. Hard Fallback       → DEFAULT_FALLBACK_OUTFITS (if GPT also fails)
//   7. PromptComposer      → natural language render prompt
//   8. Part 7/8 logging
//
// Architecture principle:
//   Rendering MUST NEVER decide styling.
//   Styling MUST NEVER decide rendering.
//   This engine returns IntelligenceResult — the rendering pipeline consumes
//   the profile (for FASHN category) and the prompt (for developer logging).
//   The recommended outfit is recorded but does not alter fal.ai parameters.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { logger } from "../lib/logger";
import { analyzeGarment } from "./garment-analyzer";
import { FashionKnowledgeBase } from "./fashion-knowledge-base";
import { selectStyleMode, describeStyleMode } from "./style-engine";
import { getCompletionPlan, filterRecommendationsToSlots } from "./wardrobe-completion";
import { composeRenderPrompt } from "./prompt-composer";
import type {
  GarmentCategory,
  GarmentProfile,
  OutfitRecommendation,
  RecommendedOutfit,
  StyleMode,
} from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });

// ---------------------------------------------------------------------------
// Confidence threshold — below this, GPT is invoked as fallback
// ---------------------------------------------------------------------------
const RULE_ENGINE_CONFIDENCE_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Hard fallback outfit — used when both rule engine and GPT fail.
// Category-specific defaults ensure rendering never stalls on styling.
// ---------------------------------------------------------------------------
const DEFAULT_FALLBACK_OUTFITS: Record<GarmentCategory, RecommendedOutfit> = {
  tops: {
    bottom:      "Dark Blue Slim Jeans",
    footwear:    "White Leather Sneakers",
    accessories: ["Leather Belt"],
  },
  bottoms: {
    top:         "White Crew Neck T-Shirt",
    footwear:    "White Leather Sneakers",
    accessories: ["Simple Watch"],
  },
  "one-pieces": {
    footwear:    "White Leather Sneakers",
    accessories: ["Minimal Gold Jewellery"],
  },
  outerwear: {
    innerLayer:  "White Crew Neck T-Shirt",
    bottom:      "Dark Slim Jeans",
    footwear:    "Chelsea Boots",
  },
  footwear: {
    top:         "White Crew Neck T-Shirt",
    bottom:      "Dark Blue Slim Jeans",
    accessories: ["Simple Watch"],
  },
  accessories: {
    top:         "White Crew Neck T-Shirt",
    bottom:      "Dark Blue Slim Jeans",
    footwear:    "White Leather Sneakers",
  },
};

// ---------------------------------------------------------------------------
// IntelligenceResult — returned to the rendering pipeline
// ---------------------------------------------------------------------------

export interface IntelligenceResult {
  /** The analysed garment profile (category used for fal.ai payload). */
  profile: GarmentProfile;
  /** The outfit recommendation from the decision engine. */
  recommendation: OutfitRecommendation;
  /** Natural language render prompt (logging only — not sent to fal.ai). */
  prompt: string;
  /** Wall-clock time for the full intelligence pipeline in milliseconds. */
  durationMs: number;
  /** True if the hard fallback (DEFAULT_FALLBACK_OUTFITS) was used. */
  usedHardFallback: boolean;
}

// ---------------------------------------------------------------------------
// GPT fallback — builds outfit when no KB rule scores above threshold
// ---------------------------------------------------------------------------

async function gptFallbackOutfit(
  profile: GarmentProfile,
  styleMode: StyleMode,
): Promise<{ outfit: RecommendedOutfit; confidence: number }> {
  try {
    const prompt = `You are a professional fashion stylist for an e-commerce catalog.

A customer has uploaded this garment:
- Category: ${profile.category}
- Type: ${profile.subcategory}
- Gender: ${profile.gender}
- Colour: ${profile.colour.join(", ")}
- Fabric: ${profile.fabric}
- Fit: ${profile.fit}
- Pattern: ${profile.pattern}
- Occasion: ${profile.occasion.join(", ")}
- Season: ${profile.season.join(", ")}

Style mode: ${styleMode}

Return a JSON object with ONLY these keys (all optional, use null if not needed):
{
  "top": string | null,
  "bottom": string | null,
  "innerLayer": string | null,
  "outerwear": string | null,
  "footwear": string | null,
  "accessories": string[] | null
}

Rules:
- NEVER recommend another ${profile.category} garment.
- The uploaded garment is the hero product — all recommendations must be neutral and secondary.
- Avoid highly patterned or brightly coloured complementary items.
- Use specific, product-style descriptions (e.g. "White Slim Chinos" not "pants").
- Respond with ONLY valid JSON.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Generate the complementary outfit." },
      ],
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<RecommendedOutfit>;

    const outfit: RecommendedOutfit = {};
    if (typeof parsed.top        === "string")  outfit.top        = parsed.top;
    if (typeof parsed.bottom     === "string")  outfit.bottom     = parsed.bottom;
    if (typeof parsed.innerLayer === "string")  outfit.innerLayer = parsed.innerLayer;
    if (typeof parsed.outerwear  === "string")  outfit.outerwear  = parsed.outerwear;
    if (typeof parsed.footwear   === "string")  outfit.footwear   = parsed.footwear;
    if (Array.isArray(parsed.accessories))      outfit.accessories = parsed.accessories;

    return { outfit, confidence: 0.72 };
  } catch {
    // Return empty — caller will apply hard fallback
    return { outfit: {}, confidence: 0.0 };
  }
}

// ---------------------------------------------------------------------------
// Rule engine — deterministic KB matching
// ---------------------------------------------------------------------------

function ruleEngineOutfit(
  profile: GarmentProfile,
  styleMode: StyleMode,
  kb: FashionKnowledgeBase,
): { outfit: RecommendedOutfit; confidence: number; ruleId: string } | null {
  const best = kb.bestMatch(profile, styleMode);
  if (!best || best.score < RULE_ENGINE_CONFIDENCE_THRESHOLD) return null;

  const plan    = getCompletionPlan(profile.category);
  const slotted = filterRecommendationsToSlots(best.rule.recommendations, plan);

  const outfit: RecommendedOutfit = {};
  if (slotted.top?.length)         outfit.top        = slotted.top[0];
  if (slotted.bottom?.length)      outfit.bottom     = slotted.bottom[0];
  if (slotted.innerLayer?.length)  outfit.innerLayer = slotted.innerLayer[0];
  if (slotted.outerwear?.length)   outfit.outerwear  = slotted.outerwear[0];
  if (slotted.footwear?.length)    outfit.footwear   = slotted.footwear[0];
  if (slotted.accessories?.length) outfit.accessories = slotted.accessories;

  return { outfit, confidence: best.score, ruleId: best.rule.id };
}

// ---------------------------------------------------------------------------
// Main export — runIntelligenceAnalysis
// ---------------------------------------------------------------------------

export interface IntelligenceParams {
  renderId: number;
  garmentImageUrl: string;
  garmentPlacement?: string | null;
  modelGender?: string | null;
  modelAgeRange?: string | null;
  region?: string;
}

/**
 * Runs the full intelligence pipeline for a render request.
 *
 * Returns IntelligenceResult — the rendering pipeline consumes:
 *   - profile.category → mapped to fal.ai `category` parameter
 *   - prompt           → logged in Part 8 (not sent to fal.ai)
 *   - recommendation   → logged and available for future features
 *
 * Never throws — all errors fall back to DEFAULT_FALLBACK_OUTFITS.
 */
export async function runIntelligenceAnalysis(
  params: IntelligenceParams,
): Promise<IntelligenceResult> {
  const {
    renderId,
    garmentImageUrl,
    garmentPlacement,
    modelGender,
    modelAgeRange,
    region = "default",
  } = params;

  const startMs = Date.now();
  let usedHardFallback = false;

  // 1. Analyse garment ───────────────────────────────────────────────────────
  const profile: GarmentProfile = await analyzeGarment({
    imageUrl: garmentImageUrl,
    garmentPlacement,
  });

  // 2. Select style mode ─────────────────────────────────────────────────────
  const styleMode: StyleMode = selectStyleMode(profile);

  // 3. Wardrobe completion plan ──────────────────────────────────────────────
  const completionPlan = getCompletionPlan(profile.category);

  // 4. Rule engine (deterministic, first) ───────────────────────────────────
  const kb         = new FashionKnowledgeBase(region);
  const ruleResult = ruleEngineOutfit(profile, styleMode, kb);

  let outfit: RecommendedOutfit;
  let confidence: number;
  let decisionSource: OutfitRecommendation["decisionSource"];
  let ruleId: string | undefined;

  if (ruleResult) {
    outfit         = ruleResult.outfit;
    confidence     = ruleResult.confidence;
    decisionSource = "rule_engine";
    ruleId         = ruleResult.ruleId;
  } else {
    // 5. GPT fallback ─────────────────────────────────────────────────────
    const gptResult = await gptFallbackOutfit(profile, styleMode);

    if (gptResult.confidence > 0) {
      outfit         = gptResult.outfit;
      confidence     = gptResult.confidence;
      decisionSource = "gpt";
    } else {
      // 6. Hard fallback — DEFAULT_FALLBACK_OUTFITS ─────────────────────
      outfit            = DEFAULT_FALLBACK_OUTFITS[profile.category] ?? DEFAULT_FALLBACK_OUTFITS["tops"];
      confidence        = 0.30;
      decisionSource    = "rule_engine";   // default outfit is deterministic
      usedHardFallback  = true;
    }
  }

  const recommendation: OutfitRecommendation = {
    styleMode,
    uploadedGarment: {
      category:    profile.category,
      subcategory: profile.subcategory,
    },
    recommendedOutfit: outfit,
    confidence,
    decisionSource,
    ...(ruleId ? { ruleId } : {}),
  };

  // 7. Compose render prompt ─────────────────────────────────────────────────
  const prompt = composeRenderPrompt({
    profile,
    recommendation,
    modelGender,
    modelAgeGroup: modelAgeRange,
  });

  const durationMs = Date.now() - startMs;

  // 8. Part 7 / Part 8 — Developer logging ──────────────────────────────────
  logger.info(
    {
      renderId,
      intelligence: {
        detectedGarment: {
          category:      profile.category,
          subcategory:   profile.subcategory,
          gender:        profile.gender,
          colour:        profile.colour,
          fabric:        profile.fabric,
          fit:           profile.fit,
          pattern:       profile.pattern,
          occasion:      profile.occasion,
          season:        profile.season,
        },
        detectedStyle:      describeStyleMode(styleMode),
        selectedStyleMode:  styleMode,
        completionPlan:     completionPlan.rationale,
        recommendedOutfit:  outfit,
        generatedPrompt:    prompt,
        confidenceScore:    Math.round(confidence * 100) / 100,
        decisionSource,
        ...(ruleId          ? { matchedRuleId: ruleId }        : {}),
        ...(usedHardFallback ? { fallbackUsed: "hard_default" } : {}),
        durationMs,
      },
    },
    "StudioLayer Intelligence: outfit analysis complete",
  );

  return { profile, recommendation, prompt, durationMs, usedHardFallback };
}
