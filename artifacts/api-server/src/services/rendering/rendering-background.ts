// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Background Standard (Batch 20)
//
// Standardizes visual presentation: pure white studio background for every
// generated image (Hero, Campaign, Editorial). Rendering quality only.
//
// Principle: luxury comes from photography — not backgrounds.
// The garment is the product; everything else quietly supports it.
//
// Future modules (not active in V1):
//   transparent_png | luxury_editorial | lifestyle | ai_scene
// ---------------------------------------------------------------------------

/** Active background modes — only pure_white_studio is used in V1 generation. */
export type StudioBackgroundMode =
  | "pure_white_studio"
  | "transparent_png"
  | "luxury_editorial"
  | "lifestyle"
  | "ai_scene";

/** V1 default and only active generation background. */
export const V1_STUDIO_BACKGROUND_MODE: StudioBackgroundMode = "pure_white_studio";

const PURE_WHITE_STUDIO_INSTRUCTION = `
STUDIO BACKGROUND STANDARD — PURE WHITE (NON-NEGOTIABLE):

Every output must use a pure white seamless studio background — immediately usable for fashion brands, e-commerce, catalogues, lookbooks, marketplaces, and social media.
The uploaded garment remains the visual hero. Luxury must come from photography — not from backgrounds.

BACKGROUND REQUIREMENTS:
- Pure white (#FFFFFF) seamless studio background — clean, uniform, neutral, studio quality
- No visible texture, grain, paper, fabric, or cyclorama seams
- No gradients, vignettes, colour casts, or tinted backdrops
- No environmental elements of any kind

NEVER GENERATE LIFESTYLE OR ENVIRONMENTAL BACKGROUNDS:
Do not generate streets, cafés, buildings, homes, bedrooms, parks, beaches, mountains, offices, decorative studios, furniture, props, or interior environments.
The background must never compete with or distract from the garment.
Ignore any pose or styling direction that implies an environmental setting — the background is always pure white.

LUXURY THROUGH PHOTOGRAPHY — NOT DECORATION:
Premium quality must come from professional pose, professional lighting, natural expression, premium styling, composition, and camera angle.
The image must resemble a luxury fashion studio photoshoot — not a lifestyle editorial on location.

PROFESSIONAL STUDIO LIGHTING:
Require: soft studio lighting, balanced exposure, natural skin tones, high garment visibility, accurate garment colours, controlled highlights, controlled shadows.
Avoid: harsh lighting, coloured lighting, dramatic cinematic lighting, sunset lighting, neon lighting, or coloured gels.

GROUND CONTACT:
The model must naturally stand on an invisible studio floor with natural foot placement and realistic floor contact.
Require a soft, subtle, realistic grounding shadow beneath the feet — never harsh or disconnected.
Avoid: floating models, floating garments, missing floor contact, or absent grounding shadows.

BACKGROUND CONSISTENCY ACROSS BATCH:
Every image in this generation must share identical white background, identical lighting style, identical studio environment, and consistent exposure.
Only pose, camera angle, expression, and composition may vary — never the background or studio lighting setup.

COLOUR ACCURACY:
Preserve accurate garment colours against the neutral white background — no colour contamination from tinted environments or dramatic colour grading.

FINAL PRESENTATION BAR:
Do not impress with dramatic backgrounds — impress with how professionally the garment is photographed.
Pure white seamless studio background. Professional fashion photography studio. Clean commercial catalogue presentation.
No environmental objects. No lifestyle scenery. Luxury through lighting and styling only.`;

/**
 * Resolves the background instruction block for a generation request.
 *
 * V1: all modes resolve to pure white studio — future modules plug in here
 * without changing the OpenRouter provider or rendering engine entry point.
 */
export function resolveRenderingBackgroundInstruction(
  mode: StudioBackgroundMode = V1_STUDIO_BACKGROUND_MODE,
): string {
  switch (mode) {
    case "pure_white_studio":
      return PURE_WHITE_STUDIO_INSTRUCTION;
    case "transparent_png":
    case "luxury_editorial":
    case "lifestyle":
    case "ai_scene":
      // V1 fallback — future background modules activate per-mode instructions here
      return PURE_WHITE_STUDIO_INSTRUCTION;
    default:
      return PURE_WHITE_STUDIO_INSTRUCTION;
  }
}

/** Authoritative V1 background block appended to every OpenRouter generation. */
export const RENDERING_BACKGROUND_INSTRUCTION = resolveRenderingBackgroundInstruction(
  V1_STUDIO_BACKGROUND_MODE,
);
