// ---------------------------------------------------------------------------
// StudioLayer AI — Decision Engine (SL-013A)
//
// Orchestrates the full intelligence pipeline:
//   1. GarmentAnalyzer     → GarmentProfile
//   2. StyleEngine         → StyleMode
//   3. WardrobeCompletion  → which slots to fill
//   4. Rule Engine         → FashionKnowledgeBase match (deterministic, first)
//   5. GPT Fallback        → only when rule engine confidence is low (< 0.45)
//                            or no rule matched at all
//   6. Part 7 logging
//
// Architecture principle:
//   Rendering MUST NEVER decide styling.
//   Styling MUST NEVER decide rendering.
//   This engine returns one OutfitRecommendation — the renderer ignores it
//   until the integration is wired in a future sprint.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import { logger } from "../lib/logger";
import { analyzeGarment } from "./garment-analyzer";
import { FashionKnowledgeBase } from "./fashion-knowledge-base";
import { selectStyleMode, describeStyleMode } from "./style-engine";
import { getCompletionPlan, filterRecommendationsToSlots } from "./wardrobe-completion";
import type {
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
- The outfit must be commercially presentable for a catalog shoot.
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
    // Hard fallback — return empty outfit rather than crash
    return {
      outfit: { accessories: [] },
      confidence: 0.0,
    };
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

  const plan = getCompletionPlan(profile.category);
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
  region?: string;
}

/**
 * Runs the full intelligence pipeline for a render request.
 *
 * Does NOT affect rendering parameters. The OutfitRecommendation is
 * currently used only for developer logging (Part 7 — SL-013A).
 * Full rendering integration is a future sprint.
 */
export async function runIntelligenceAnalysis(
  params: IntelligenceParams,
): Promise<OutfitRecommendation> {
  const { renderId, garmentImageUrl, garmentPlacement, region = "default" } = params;

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
  const kb = new FashionKnowledgeBase(region);
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
    // 5. GPT fallback ──────────────────────────────────────────────────────
    const gptResult = await gptFallbackOutfit(profile, styleMode);
    outfit         = gptResult.outfit;
    confidence     = gptResult.confidence;
    decisionSource = "gpt";
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

  // 6. Part 7 — Developer logging ────────────────────────────────────────────
  logger.info(
    {
      renderId,
      intelligence: {
        detectedGarment: {
          category:    profile.category,
          subcategory: profile.subcategory,
          gender:      profile.gender,
          colour:      profile.colour,
          fabric:      profile.fabric,
          fit:         profile.fit,
          pattern:     profile.pattern,
          occasion:    profile.occasion,
          season:      profile.season,
        },
        detectedStyle:      describeStyleMode(styleMode),
        selectedStyleMode:  styleMode,
        completionPlan:     completionPlan.rationale,
        recommendedOutfit:  outfit,
        confidenceScore:    Math.round(confidence * 100) / 100,
        decisionSource,
        ...(ruleId ? { matchedRuleId: ruleId } : {}),
      },
    },
    "StudioLayer Intelligence: outfit analysis complete",
  );

  return recommendation;
}
