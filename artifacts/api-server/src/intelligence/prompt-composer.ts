// ---------------------------------------------------------------------------
// StudioLayer AI — Prompt Composer (SL-014)
//
// Converts an OutfitRecommendation + GarmentProfile into a natural language
// render prompt. The prompt is used for developer logging and future
// text-to-image model integrations.
//
// The prompt is NOT sent to fal-ai/fashn/tryon/v1.6 — that API does not
// support a prompt parameter (confirmed SL-011A audit). The prompt captures
// the intelligence decision as a human-readable artefact.
//
// Architecture principle:
//   The PromptComposer only reads the recommendation — it never calls
//   external APIs, has no side effects, and is always synchronous.
// ---------------------------------------------------------------------------

import type { GarmentProfile, OutfitRecommendation } from "./types";
import { buildGarmentIntelligencePrompt } from "./garment-intelligence";
import { buildFootwearStylingPrompt } from "./footwear-intelligence";
import type { LookDirection } from "./look-direction";
import { resolveLookDirection } from "./look-direction";

// ---------------------------------------------------------------------------
// Human-readable field formatters
// ---------------------------------------------------------------------------

function humanGender(gender: string): string {
  if (gender === "mens")   return "male";
  if (gender === "womens") return "female";
  if (gender === "kids")   return "child";
  return "model";
}

function humanAge(ageGroup: string): string {
  const map: Record<string, string> = {
    young_adult:       "young adult",
    classic_mid_age:   "mid-age adult",
    mature_executive:  "mature",
    teen_youth:        "teenage",
    young_child:       "child",
  };
  return map[ageGroup] ?? "adult";
}

// ---------------------------------------------------------------------------
// PromptComposer
// ---------------------------------------------------------------------------

export interface PromptComposerParams {
  profile: GarmentProfile;
  recommendation: OutfitRecommendation;
  /** Override gender from the selected model identity (optional). */
  modelGender?: string | null;
  /** Override age group from the selected model identity (optional). */
  modelAgeGroup?: string | null;
  /** Context-aware accessory guidance appended to the prompt. */
  accessoryGuidance?: string;
  /** Complete the Look selection — informs footwear look direction. */
  outfitStyle?: string | null;
  /** Pre-resolved look direction (optional; resolved from profile + outfitStyle if omitted). */
  lookDirection?: LookDirection;
  /** User garment placement — Top Wear / Bottom Wear / Full Outfit. */
  garmentPlacement?: string | null;
}

/**
 * Composes a natural-language catalog photography prompt from the
 * intelligence engine's outfit recommendation and garment profile.
 *
 * A/B VARIANT: overlapping garment-protection prose removed — garment authority
 * lives in GARMENT_AUTHORITY_SOT (primary). Outfit composition and photography
 * requirements remain.
 */
export function composeRenderPrompt(params: PromptComposerParams): string {
  const {
    profile,
    recommendation,
    modelGender,
    modelAgeGroup,
    accessoryGuidance,
    outfitStyle,
    lookDirection: lookDirectionParam,
    garmentPlacement,
  } = params;
  const { recommendedOutfit } = recommendation;

  // Model descriptor — prefer identity override over detected profile
  const gender  = humanGender(modelGender  ?? profile.gender);
  const age     = humanAge(modelAgeGroup   ?? profile.ageGroup);

  // Hero garment description
  const colours    = profile.colour.filter(Boolean).slice(0, 2).join(" ");
  const heroStr    = `${colours} ${profile.subcategory}`.trim();

  // Complementary items — ordered by visual layer (inner → outer → feet)
  const companions: string[] = [];
  if (recommendedOutfit.innerLayer)                    companions.push(recommendedOutfit.innerLayer);
  if (recommendedOutfit.top)                           companions.push(recommendedOutfit.top);
  if (recommendedOutfit.bottom)                        companions.push(recommendedOutfit.bottom);
  if (recommendedOutfit.outerwear)                     companions.push(recommendedOutfit.outerwear);
  // Footwear as styling companion only when clothing hero (not footwear evidence)
  if (profile.category !== "footwear" && recommendedOutfit.footwear) {
    companions.push(recommendedOutfit.footwear);
  }
  if (recommendedOutfit.accessories?.length)           companions.push(...recommendedOutfit.accessories.slice(0, 2));

  const companionClause = companions.length
    ? `, paired with ${companions.join(", ")}`
    : "";

  const specifiedInnerLayer = recommendedOutfit.innerLayer?.trim() || undefined;

  // ── Prompt sections ───────────────────────────────────────────────────────

  const opening = `A full-body studio fashion photograph of a ${age} ${gender}`;

  const hero = `wearing the uploaded ${heroStr} as the hero product${companionClause}.`;

  // Part 5 — composition rules
  const composition = [
    "The uploaded garment is the primary visual focal point.",
    "Complementary items are neutral, secondary, and must not distract from the hero garment.",
    "Avoid oversized accessories or brightly patterned supporting garments.",
  ];

  if (specifiedInnerLayer) {
    composition.push(
      `INNER LAYER — MANDATORY RENDER: The specified base layer (${specifiedInnerLayer}) MUST be rendered beneath the uploaded garment. The uploaded garment must be worn OVER that base layer. The base layer must be visibly present where it would naturally show (neckline, opening/placket, cuff, or hem as appropriate). Do not render the uploaded garment directly against bare skin when an innerLayer is specified. The specified innerLayer is authoritative — do not omit, replace, or invent a different underlayer.`,
      "Anti-filler rules apply only to OPTIONAL / UNSPECIFIED complementary garments — they must never override a specifically selected innerLayer.",
    );
  } else {
    composition.push(
      "Never use a plain grey T-shirt, plain white undershirt, or generic filler clothing as an OPTIONAL complementary item when no specific companion is specified — choose intentional, fashion-forward pieces that create a cohesive, commercially presentable look.",
      "Do not add any inner layer beneath the uploaded top or shirt unless the creative brief explicitly specifies an innerLayer.",
    );
  }

  if (garmentPlacement === "upper_body") {
    const innerLayerMust = specifiedInnerLayer
      ? ` the specified base layer (${specifiedInnerLayer}) worn under the uploaded garment,`
      : "";
    composition.push(
      `OUTFIT COMPLETION MODE — TOP WEAR: The uploaded garment is the upper product only. You MUST complete a full commercial look by dressing the model in${innerLayerMust} an appropriate complementary lower garment (trousers, jeans, chinos, palazzo, churidar, salwar, skirt, or similar — fitting the look direction) plus the established footwear. Do not leave the look incomplete. Do not copy bottoms or shoes from the talent / model reference.`,
    );
  } else if (garmentPlacement === "full_body") {
    composition.push(
      "OUTFIT COMPLETION MODE — FULL OUTFIT: The uploaded garment is the complete product being presented. Do NOT invent additional garments (no extra trousers, pants, skirts, jackets, or layers) beyond the uploaded product and established footwear/accessories. Do not copy clothing from the talent / model reference.",
    );
  } else if (garmentPlacement === "lower_body") {
    composition.push(
      "OUTFIT COMPLETION MODE — BOTTOM WEAR: The uploaded garment is the lower product only. Complete the look with an appropriate complementary upper garment plus established footwear. Do not copy clothing from the talent / model reference.",
    );
  }

  const compositionText = composition.join(" ");

  // Part 6 — pose-default stubs only (neutralized when Pose Master is authoritative).
  // Shared photography is PHOTOGRAPHY_AUTHORITY_SOT — do not restate it here.
  const photography = [
    "Natural standing pose, balanced posture, neutral expression.",
    "Full body visible head to foot.",
  ].join(" ");

  const accessoryClause = accessoryGuidance
    ? accessoryGuidance
    : "Accessories must enhance styling without obscuring the hero garment.";

  const garmentIntelligence = buildGarmentIntelligencePrompt(profile);
  const lookDirection =
    lookDirectionParam ?? resolveLookDirection(profile, outfitStyle);
  const footwearStyling = buildFootwearStylingPrompt(profile, recommendedOutfit, {
    outfitStyle,
    lookDirection,
  });

  return [opening, hero, compositionText, garmentIntelligence, footwearStyling, accessoryClause, photography].join(" ");
}
