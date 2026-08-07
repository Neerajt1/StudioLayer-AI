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
}

/**
 * Composes a natural-language catalog photography prompt from the
 * intelligence engine's outfit recommendation and garment profile.
 *
 * Part 4 (garment protection) clauses are always included.
 * Part 5 (outfit composition) and Part 6 (photography) requirements are
 * always included.
 */
export function composeRenderPrompt(params: PromptComposerParams): string {
  const { profile, recommendation, modelGender, modelAgeGroup, accessoryGuidance } = params;
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
  if (recommendedOutfit.footwear)                      companions.push(recommendedOutfit.footwear);
  if (recommendedOutfit.accessories?.length)           companions.push(...recommendedOutfit.accessories.slice(0, 2));

  const companionClause = companions.length
    ? `, paired with ${companions.join(", ")}`
    : "";

  // ── Prompt sections ───────────────────────────────────────────────────────

  const opening = `A full-body studio fashion photograph of a ${age} ${gender}`;

  const hero = `wearing the uploaded ${heroStr} as the hero product${companionClause}.`;

  // Part 5 — composition rules
  const composition = [
    "The uploaded garment is the primary visual focal point.",
    "Complementary items are neutral, secondary, and must not distract from the hero garment.",
    "Avoid oversized accessories or brightly patterned supporting garments.",
    "Never use a plain grey T-shirt, plain white undershirt, or generic filler clothing as a complementary item — choose intentional, fashion-forward pieces that create a cohesive, commercially presentable look.",
    "Do not add any inner layer beneath the uploaded top or shirt unless the garment is explicitly a structured jacket, coat, or blazer that requires one.",
  ].join(" ");

  // Part 4 — garment protection
  const protection = [
    "Preserve every detail of the uploaded garment exactly as photographed:",
    "precise colour, fabric texture, stitching, logos, branding, pockets, buttons, zippers, prints, and embroidery.",
    "Preserve original material properties — matte or glossy finish, natural sheen, weave, surface reflectivity, and fabric-specific optical characteristics.",
    "Never reinterpret the material into a different fabric appearance.",
    "Complementary garments adapt around the uploaded product — never replace or obscure it.",
  ].join(" ");

  // Part 6 — commercial photography, wearability (Batch 19), white studio (Batch 20)
  const photography = [
    "Natural standing pose, balanced posture, neutral expression.",
    "Full body visible head to foot.",
    "Pure white seamless studio background — clean, uniform, no gradients, no environmental objects, no lifestyle scenery.",
    "Professional fashion photography studio with neutral white lighting, accurate white balance, natural skin tones, and faithful garment colour reproduction.",
    "Preserve the garment's original colours exactly as uploaded — prints, logos, embroidery, patterns, trims, and textures without distortion or colour shift.",
    "The white background must remain colour-neutral and must never influence garment appearance.",
    "Subtle realistic grounding shadow beneath the feet.",
    "Luxury through lighting, pose, and styling only — never through decorative backgrounds.",
    "Professional catalogue lighting, accurate garment draping, realistic footwear placement, natural shadows.",
    "The garment must appear physically worn — naturally conforming to body anatomy with realistic gravity, fabric tension, and folds.",
    "Avoid any composited or pasted appearance; preserve authentic construction, texture, and stitching.",
    "Premium fashion catalogue quality suitable for e-commerce, lookbooks, and marketplaces.",
    "Output exactly 3200 × 4000 pixels (4:5 aspect ratio) — the StudioLayer AI platform master asset standard.",
  ].join(" ");

  const accessoryClause = accessoryGuidance
    ? accessoryGuidance
    : "Accessories must enhance styling without obscuring the hero garment.";

  const garmentIntelligence = buildGarmentIntelligencePrompt(profile);

  return [opening, hero, composition, protection, garmentIntelligence, accessoryClause, photography].join(" ");
}
