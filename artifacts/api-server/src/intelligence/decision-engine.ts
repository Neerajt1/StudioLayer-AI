// ---------------------------------------------------------------------------
// StudioLayer AI — Decision Engine (SL-013A / SL-014)
//
// Orchestrates the full intelligence pipeline:
//   1. GarmentAnalyzer     → GarmentProfile
//   1b. GarmentIntelligence → length override, silhouette, fabric behaviour
//   2. StyleEngine         → StyleMode
//   3. WardrobeCompletion  → which slots to fill
//   4. Rule Engine         → FashionKnowledgeBase match (deterministic, first)
//   5. GPT Fallback        → only when confidence < 0.45 or no rule matched
//   6. Hard Fallback       → direction-aware buildHardFallbackOutfit (if GPT also fails)
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
import { applyGarmentIntelligence } from "./garment-intelligence";
import type { GarmentLengthSelection } from "./garment-intelligence";
import { FashionKnowledgeBase } from "./fashion-knowledge-base";
import { selectStyleMode, describeStyleMode } from "./style-engine";
import {
  filterRecommendationsToSlots,
  resolveWardrobeCompletionPlan,
} from "./wardrobe-completion";
import { composeRenderPrompt } from "./prompt-composer";
import { resolveOutfitOverride } from "./outfit-style-override";
import {
  applyContextAwareAccessories,
  accessoryPromptGuidance,
} from "./accessory-intelligence";
import {
  buildHardFallbackOutfit,
  knowledgeBaseForLookDirection,
  applyPlacementOutfitGuards,
  defaultBottomForLookDirection,
  defaultFootwearForLookDirection,
  describeLookDirection,
  resolveLookDirection,
  selectFootwearForLookDirection,
  type LookDirection,
} from "./look-direction";
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
  /** True if the hard fallback (direction-aware outfit defaults) was used. */
  usedHardFallback: boolean;
}

// ---------------------------------------------------------------------------
// GPT fallback — builds outfit when no KB rule scores above threshold
// ---------------------------------------------------------------------------

async function gptFallbackOutfit(
  profile: GarmentProfile,
  styleMode: StyleMode,
  lookDirection: LookDirection,
  garmentPlacement?: string | null,
): Promise<{ outfit: RecommendedOutfit; confidence: number }> {
  try {
    const directionLabel = describeLookDirection(lookDirection);
    const placementNote =
      garmentPlacement === "upper_body"
        ? "User selected Top Wear — recommend a complementary bottom."
        : garmentPlacement === "full_body"
          ? "User selected Full Outfit — do NOT invent an additional bottom or top."
          : "";
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
Look direction (overall fashion direction of the completed look): ${directionLabel}
${placementNote ? `Placement: ${placementNote}` : ""}

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
- Accessories MUST match model gender (${profile.gender}) and age (${profile.ageGroup}). Never recommend feminine jewellery for male models or mature luxury accessories for child models.
- FOOTWEAR must fit the look direction (${directionLabel}). Sneakers remain a legitimate option when they genuinely fit this look (especially contemporary casual, streetwear, and western). Prefer ethnic footwear for traditional / ethnic looks when appropriate, and formal footwear for formal / evening — but do not ban sneakers categorically.
- Do NOT use talent/model footwear as a styling reference — you have no access to talent shoes; choose from look direction only.
- When the user selected Top Wear (upper garment only), you MUST recommend an appropriate complementary bottom (trousers, jeans, palazzo, churidar, skirt, etc.) fitting the look direction — never leave the lower half incomplete.
- When the user selected Full Outfit, do NOT invent an extra bottom or top beyond the uploaded complete product.
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

    // If GPT omitted footwear, fill with direction-aware default (not universal sneakers).
    if (!outfit.footwear && profile.category !== "footwear") {
      outfit.footwear = defaultFootwearForLookDirection(lookDirection, profile.gender);
    }
    // Top Wear must always receive a complementary bottom.
    if (garmentPlacement === "upper_body" && !outfit.bottom) {
      outfit.bottom = defaultBottomForLookDirection(lookDirection, profile.gender);
    }
    // Full Outfit must not invent bottoms.
    if (garmentPlacement === "full_body") {
      delete outfit.bottom;
      delete outfit.top;
      delete outfit.innerLayer;
      delete outfit.outerwear;
    }

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
  lookDirection: LookDirection,
  completionPlan: ReturnType<typeof resolveWardrobeCompletionPlan>,
  matchingProfile: GarmentProfile,
): { outfit: RecommendedOutfit; confidence: number; ruleId: string } | null {
  const best = kb.bestMatch(matchingProfile, styleMode);
  if (!best || best.score < RULE_ENGINE_CONFIDENCE_THRESHOLD) return null;

  const slotted = filterRecommendationsToSlots(
    best.rule.recommendations,
    completionPlan,
  );

  const outfit: RecommendedOutfit = {};
  if (slotted.top?.length)         outfit.top        = slotted.top[0];
  if (slotted.bottom?.length)      outfit.bottom     = slotted.bottom[0];
  if (slotted.innerLayer?.length)  outfit.innerLayer = slotted.innerLayer[0];
  if (slotted.outerwear?.length)   outfit.outerwear  = slotted.outerwear[0];
  if (slotted.footwear?.length) {
    outfit.footwear = selectFootwearForLookDirection(
      slotted.footwear,
      lookDirection,
    );
  }
  if (slotted.accessories?.length) outfit.accessories = slotted.accessories;

  return { outfit, confidence: best.score, ruleId: best.rule.id };
}

/**
 * When Top Wear is selected but vision classified the garment as one-pieces,
 * match KB rules as tops so complementary bottoms can be found.
 */
function profileForOutfitMatching(
  profile: GarmentProfile,
  garmentPlacement?: string | null,
): GarmentProfile {
  if (
    garmentPlacement === "upper_body" &&
    (profile.category === "one-pieces" || profile.category === "accessories")
  ) {
    return { ...profile, category: "tops" };
  }
  if (garmentPlacement === "lower_body" && profile.category === "one-pieces") {
    return { ...profile, category: "bottoms" };
  }
  return profile;
}

function accessoryContextShots(
  shots: number,
  generationType?: IntelligenceParams["generationType"],
): 1 | 2 | 4 | 8 {
  if (generationType === "hero") return 1;
  if (generationType === "editorial") return 2;
  if (generationType === "campaign") return 4;
  if (shots === 1 || shots === 2 || shots === 4 || shots === 8) return shots;
  return shots >= 4 ? 4 : shots >= 2 ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Main export — runIntelligenceAnalysis
// ---------------------------------------------------------------------------

export interface IntelligenceParams {
  renderId: number;
  garmentImageUrl: string;
  /** Optional back-view garment image — analyzer supplementary input only. */
  backImageUrl?: string;
  /** Optional detail/close-up garment image — analyzer supplementary input only. */
  detailImageUrl?: string;
  garmentPlacement?: string | null;
  /** Full Outfit length selection — "auto" uses vision detection; manual values override. */
  garmentLengthSelection?: GarmentLengthSelection | null;
  modelGender?: string | null;
  modelAgeRange?: string | null;
  region?: string;
  /**
   * Complete the Look style selection forwarded from the rendering request (SL-018B).
   * When set and not "none", the PromptComposer receives an outfit override
   * from the Outfit Style Override module instead of using the Intelligence
   * Engine's own KB / GPT / hard-fallback recommendation.
   * "none" means: let the Intelligence Engine decide (no override applied).
   */
  outfitStyle?: string | null;
  /** Number of images being generated — used for context-aware accessories. */
  shots?: number;
  /** When set, drives accessory context for Custom Campaign batches. */
  generationType?: "hero" | "campaign" | "editorial";
}

/**
 * Runs the full intelligence pipeline for a render request.
 *
 * Returns IntelligenceResult — the rendering pipeline consumes:
 *   - profile.category → mapped to fal.ai `category` parameter
 *   - prompt           → logged in Part 8 (not sent to fal.ai)
 *   - recommendation   → logged and available for future features
 *
 * Never throws — all errors fall back to direction-aware hard-fallback outfits.
 */
export async function runIntelligenceAnalysis(
  params: IntelligenceParams,
): Promise<IntelligenceResult> {
  const {
    renderId,
    garmentImageUrl,
    backImageUrl,
    detailImageUrl,
    garmentPlacement,
    garmentLengthSelection,
    modelGender,
    modelAgeRange,
    outfitStyle,
    shots = 1,
    generationType,
    region: _region = "default",
  } = params;

  const accessoryShots = accessoryContextShots(shots, generationType);

  const startMs = Date.now();
  let usedHardFallback = false;

  // 1. Analyse garment ───────────────────────────────────────────────────────
  const rawProfile: GarmentProfile = await analyzeGarment({
    frontImageUrl: garmentImageUrl,
    backImageUrl,
    detailImageUrl,
    garmentPlacement,
    garmentLengthSelection,
  });

  // 1b. Garment Intelligence — length override, silhouette, fabric behaviour
  const profile = applyGarmentIntelligence(rawProfile, {
    garmentLengthSelection: garmentLengthSelection ?? "auto",
    garmentPlacement,
  });

  // 2. Select style mode ─────────────────────────────────────────────────────
  const styleMode: StyleMode = selectStyleMode(profile);

  // 2b. Look direction — footwear / styling context for the completed look
  const lookDirection = resolveLookDirection(profile, outfitStyle);

  // 3. Wardrobe completion — honour Top Wear / Full Outfit placement semantics
  const completionPlan = resolveWardrobeCompletionPlan(
    profile.category,
    garmentPlacement,
  );
  const matchingProfile = profileForOutfitMatching(profile, garmentPlacement);

  // 4. Rule engine (deterministic, first) ───────────────────────────────────
  // traditional_ethnic includes India regional rules in the candidate set
  // (not a user geo region — look-direction activation only).
  const kb         = knowledgeBaseForLookDirection(lookDirection);
  const ruleResult = ruleEngineOutfit(
    profile,
    styleMode,
    kb,
    lookDirection,
    completionPlan,
    matchingProfile,
  );

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
    const gptResult = await gptFallbackOutfit(
      matchingProfile,
      styleMode,
      lookDirection,
      garmentPlacement,
    );

    if (gptResult.confidence > 0) {
      outfit         = gptResult.outfit;
      confidence     = gptResult.confidence;
      decisionSource = "gpt";
    } else {
      // 6. Hard fallback — direction-aware footwear + placement bottoms ─
      outfit            = buildHardFallbackOutfit(
        matchingProfile.category,
        lookDirection,
        profile.gender,
        garmentPlacement,
      );
      confidence        = 0.30;
      decisionSource    = "rule_engine";
      usedHardFallback  = true;
    }
  }

  outfit = applyPlacementOutfitGuards(
    outfit,
    lookDirection,
    profile.gender,
    garmentPlacement,
    completionPlan.requiredSlots,
  );

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

  // 7. Complete the Look override (SL-018B) ────────────────────────────────────
  // If the user selected a style other than "none", replace the Intelligence
  // Engine's recommendation with the Outfit Style Override module output.
  // The override is applied here — after garment analysis (so we know the
  // detected category) but before PromptComposer (so the prompt uses the
  // user's chosen outfit items).
  let outfitOverrideApplied = false;
  const outfitOverride = resolveOutfitOverride(
    matchingProfile.category,
    modelGender,
    outfitStyle,
  );

  if (outfitOverride) {
    logger.info(
      {
        renderId,
        outfitStyle,
        appliedOverride: outfitOverride,
        replacedOutfit:  outfit,
      },
      "Intelligence: Complete the Look override applied — outfit replaced with user selection",
    );
    outfit                         = outfitOverride;
    recommendation.recommendedOutfit = outfitOverride;
    outfitOverrideApplied          = true;
  }

  // 7b. Context-aware accessories (Batch 3.2) ───────────────────────────────
  outfit = applyContextAwareAccessories(outfit, profile, modelGender, accessoryShots);
  outfit = applyPlacementOutfitGuards(
    outfit,
    lookDirection,
    profile.gender,
    garmentPlacement,
    completionPlan.requiredSlots,
  );
  recommendation.recommendedOutfit = outfit;

  // 8. Compose render prompt ─────────────────────────────────────────────────
  const prompt = composeRenderPrompt({
    profile,
    recommendation,
    modelGender,
    modelAgeGroup: modelAgeRange,
    accessoryGuidance: accessoryPromptGuidance(profile, modelGender, accessoryShots),
    outfitStyle,
    lookDirection,
    garmentPlacement,
  });

  const durationMs = Date.now() - startMs;

  // 9. Part 7 / Part 8 — Developer logging ──────────────────────────────────
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
          garmentLength: profile.garmentLength,
          silhouette:    profile.silhouette,
          fabricBehaviour: profile.fabricBehaviour,
          fabricMovementPotential: profile.fabricMovementPotential,
          garmentStructure: profile.garmentStructure,
        },
        detectedStyle:      describeStyleMode(styleMode),
        selectedStyleMode:  styleMode,
        lookDirection,
        completionPlan:     completionPlan.rationale,
        recommendedOutfit:  outfit,
        generatedPrompt:    prompt,
        confidenceScore:    Math.round(confidence * 100) / 100,
        decisionSource,
        ...(ruleId              ? { matchedRuleId: ruleId }           : {}),
        ...(usedHardFallback    ? { fallbackUsed: "hard_default" }    : {}),
        ...(outfitOverrideApplied ? {
          completeTheLookStyle: outfitStyle,
          outfitOverrideApplied: true,
        } : {}),
        durationMs,
      },
    },
    "StudioLayer Intelligence: outfit analysis complete",
  );

  return { profile, recommendation, prompt, durationMs, usedHardFallback };
}
