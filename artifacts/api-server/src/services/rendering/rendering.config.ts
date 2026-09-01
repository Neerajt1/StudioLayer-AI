// ---------------------------------------------------------------------------
// StudioLayer AI — OpenRouter Rendering Service — Configuration
//
// Single source of truth for the OpenRouter rendering layer.
// No values are hardcoded inside the provider — everything is read from here.
//
// Environment variables:
//   OPENROUTER_API_KEY          Required. User-supplied OpenRouter API key.
//   OR_RENDER_MODEL             Override the default generation model (flash path).
//   OR_RENDER_4K_MODEL          Override the 4K flash-preview model.
//   OR_RENDER_ENGINE            "flash" (default / Nano Regular) | "nano_pro".
//                               flux_max is NOT an active production Create engine —
//                               if set, Create falls back to flash (Nano Regular).
//   OR_RENDER_TIMEOUT_MS        Override per-request timeout (ms). Default 90 000.
//   OR_RENDER_RETRY_COUNT       Override retry count. Default 1.
//   V1_CREATE_USE_HEADLESS_IDENTITY  When true, fresh Create uses the frozen
//                               Headless Mannequin two-stage Nano Pro path.
//                               Default off. Does not enable cascade or trials.
// ---------------------------------------------------------------------------

import { RENDERING_REALISM_INSTRUCTION } from "./rendering-realism.js";
import { RENDERING_COLOR_FIDELITY_INSTRUCTION } from "./rendering-color-fidelity.js";
import { RENDERING_PHOTOGRAPHY_INSTRUCTION } from "./rendering-photography.js";
import {
  PLATFORM_IMAGE_STANDARD_INSTRUCTION,
} from "../image-architecture/master-asset.js";
import { STUDIO_LAYER_PREDICTABILITY_CONTRACT } from "../predictability-contract.js";

/**
 * Compact evidence-local decoration principle for every fresh generation
 * (Front-only and multi-view). Does not replace garmentInstruction or
 * multi-view panel correspondence — interprets how garment evidence applies.
 *
 * @param talentReferenceImageNumber — OpenRouter index of the Talent image
 *   (2 for sheet / Front-only; higher when separate Back/Detail precede Talent).
 */
export function buildSurfaceComponentEvidencePrinciple(
  talentReferenceImageNumber = 2,
): string {
  return `SURFACE / COMPONENT EVIDENCE PRINCIPLE:
Decoration and construction detail on any generated garment surface or component are allowed only when evidenced on that same surface or component in the garment reference(s) — evidence is local and does not transfer across surfaces (including Back, sleeves, cuffs, hems, neckline, bottoms, or companion pieces). When a surface is visibly plain in the references, keep it plain; when it is decorated, preserve the decoration shown there; when a surface is not visible, infer only what is needed for a believable garment without borrowing decoration from another surface. Do not transfer, mirror, complete, or aesthetically balance decoration across surfaces. Companion or outfit-completion pieces must not inherit the hero garment's decoration unless a garment reference evidences that decoration. Reference Image ${talentReferenceImageNumber} provides talent identity and body context only — never use clothing visible on the talent as evidence for garment construction or decoration.`;
}

/** Default principle text (Talent = Reference Image 2) — sheet / Front-only. */
export const SURFACE_COMPONENT_EVIDENCE_PRINCIPLE =
  buildSurfaceComponentEvidencePrinciple(2);

/**
 * A/B VARIANT — single Garment Authority Source of Truth.
 * Consolidates overlapping garment-authority text formerly spread across
 * GARMENT FIDELITY, MATERIAL/SURFACE, STRUCTURAL, WHAT MUST NEVER CHANGE,
 * premium fence, FINAL closer, AUTHORITY #2 garment clause, and compose protection.
 * Supporting layers (realism, surface principle, orientation, bottoms replacement,
 * batch consistency, GI preservation/colour/fabric) remain outside this block.
 */
export const GARMENT_AUTHORITY_SOT = `GARMENT AUTHORITY — REFERENCE IMAGE 1

Ref1 is the selected product. Reproduce this exact garment.
Do not substitute a similar, generic, or redesigned garment.
Ref1 outranks category priors and analyzer text; Do not invent embroidery, prints, logos, pockets, closures, seams, hardware, or textures absent from Ref1; plain stays plain.

CONSTRUCTION:
Preserve visible construction from Ref1: silhouette, proportions, panels, seams, closures, pockets, sleeves, collar/lapel, cuffs, hem, hardware and design details.

AS-WORN STATE:
Preserve intentional as-worn states visible in Ref1 — including rolled, creased or folded cuffs/sleeves and visible hem state. Do not "correct" them into neat, default, or catalogue-normalized construction.

MATERIAL / SURFACE:
Preserve visible material character from Ref1: crinkle, wrinkles, weave/grain, surface variation, finish, natural irregularity and material-specific light response. Do not smooth, polish, flatten, clean up or genericize the surface into a digitally reconstructed fabric.

POSE ADAPTATION:
The garment may take natural pose-induced folds, compression and drape on the target body. Those folds are additive only — they must not erase source material character or as-worn construction.

COLOUR:
Preserve Ref1 colour identity.

PHOTOGRAPHY SERVES THE PRODUCT:
Premium / clean / luxury studio quality means lighting and photographic finish only — never permission to redesign, smooth or genericize the garment.`;

export const OPENROUTER_RENDERING_CONFIG = {
  /** Provider label — internal only, never surfaced in UI. */
  provider: "openrouter" as const,

  /**
   * Default image-generation model on OpenRouter.
   * google/gemini-3.1-flash-image accepts vision inputs (garment + model)
   * and returns generated images — ideal for fashion photoshoot prompts.
   * Override with OR_RENDER_MODEL if you want to test another model.
   */
  defaultModel:
    process.env["OR_RENDER_MODEL"] ?? "google/gemini-3.1-flash-image",

  /**
   * Wall-clock timeout per provider request (ms).
   * Image generation is slow — default 90 s gives headroom for busy periods.
   */
  timeoutMs: Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 90_000),

  /**
   * How many times to retry a single shot on transient failure.
   * 1 = one automatic retry, then propagate the error.
   */
  retryCount: Number(process.env["OR_RENDER_RETRY_COUNT"] ?? 1),

  /**
   * Primary instruction sent to the model as the first content part.
   *
   * Reference Image 1 = garment (sent immediately after this text).
   * Reference Image 2 = model   (sent immediately after the garment image).
   *
   * This is the authoritative instruction for virtual try-on generation.
   * Do not modify without reviewing the content-array order in callOpenRouter.
   */
  garmentInstruction: `Reference Image 1 is the garment reference.

Reference Image 2 is the human model.

Your task is to dress the person shown in Reference Image 2 using the exact garment shown in Reference Image 1.

Ignore the hanger, background and any non-garment objects present in Reference Image 1. Use only the garment itself for dressing the model.

${GARMENT_AUTHORITY_SOT}

BATCH CONSISTENCY — when multiple images are generated from the same upload, every image must show the identical garment with identical proportions, dimensions, colour, hue, saturation, print, pattern, and fabric appearance. Never vary garment length, silhouette, scale, or colour between shots.

ORIENTATION — Reproduce the garment in its exact original left/right orientation as shown in Reference Image 1. Do not flip, mirror, or horizontally reverse the garment for any reason. All asymmetric details — embroidery, prints, logos, button plackets, chest pockets, side slits, off-shoulder drops, and any embellishments — must remain on the same side as the original. If the garment has a logo on the left chest, it must appear on the left chest in the output.

COMPLETE GARMENT REPLACEMENT — CRITICAL FOR BOTTOMS:
When the uploaded garment is jeans, trousers, chinos, shorts, a skirt, or any lower-body garment, you must COMPLETELY replace the corresponding garment on the model. This means:
- The entire waistband must be replaced — no remnants of any previous waistband remain visible.
- The full trouser legs or skirt panels must be replaced from hip to hem — no previous fabric bleeds through.
- Cuffs and hems must be naturally rendered at the correct position.
- The fabric must wrap naturally around the body — it should never appear pasted, composited, or floating.
- Seams along the inner leg, outer leg, crotch, and waistband must read as continuous, natural clothing.
- If the result looks like the garment was digitally pasted onto a different pair of trousers, you have failed.

WHAT MAY VARY NATURALLY:
- Model pose and body position
- Camera angle and framing — only when the directed shot does not specify an explicit framing requirement; when preferredFraming or CAMERA/FRAMING is set (full_body, portrait, chest_up, waist_up, etc.), preserve that requested framing
- Lighting and shadows cast by the garment (within soft studio lighting)
- Complementary styling (accessories and outfit-completion pieces around the hero garment) — footwear styling is locked for the batch once established by the creative brief
- Facial expression
- Complementary clothing items (trousers, skirt) that complete the outfit around the uploaded garment — these must not cover or obscure the uploaded garment in any way
${PLATFORM_IMAGE_STANDARD_INSTRUCTION}${RENDERING_REALISM_INSTRUCTION}${RENDERING_PHOTOGRAPHY_INSTRUCTION}${RENDERING_COLOR_FIDELITY_INSTRUCTION}`,

  /**
   * Primary instruction for OpenRouter refinements (Enhance Model Face, Enhance Garment).
   *
   * Reference Image 1 = garment (colour/construction source of truth).
   * Reference Image 2 = current photograph to edit (sole visual anchor).
   *
   * Does NOT include model-identity try-on framing — refinement is an in-place edit.
   */
  refinementEditInstruction: `Reference Image 1 is the uploaded garment — colour, pattern, texture, and construction source of truth.

Reference Image 2 is the EXACT current photograph to edit. This is your sole visual anchor.

REFINEMENT MODE — TARGETED EDIT ONLY (NOT REGENERATION):
You are editing Reference Image 2 in place — like a professional retoucher using Photoshop.
Do NOT generate a new photoshoot. Do NOT reinterpret the scene. Do NOT create a new pose.

${STUDIO_LAYER_PREDICTABILITY_CONTRACT}

LOCKED — pixel-identical to Reference Image 2 unless explicitly allowed in the refinement request below:
Model identity, pose, body position, limb placement, hand position, leg position, camera angle, framing, composition, garment construction, garment colour, print, pattern, texture, footwear (type, style, colour, placement, and visibility — including intentional barefoot), and overall scene layout.

Reference Image 1 confirms garment fidelity — preserve it exactly except where the refinement explicitly permits quality improvement.`,

  /**
   * Gemini Flash Preview — required for native 4K via OpenRouter chat/completions.
   * Stable google/gemini-3.1-flash-image rejects image_size: "4K".
   */
  flashPreviewModel:
    process.env["OR_RENDER_4K_MODEL"] ?? "google/gemini-3.1-flash-image-preview",

  /**
   * Nano Banana Pro (Gemini 3 Pro Image) — used when OR_RENDER_ENGINE=nano_pro.
   * OpenRouter Images API: POST /api/v1/images
   * Verified: resolution 1K|2K|4K (Vertex: 1K|2K), aspect_ratio includes 4:5.
   */
  nanoBananaProModel:
    process.env["OR_NANO_BANANA_PRO_MODEL"] ?? "google/gemini-3-pro-image",

  /**
   * FLUX.2 Max model id — DORMANT. Not used by production Create.
   * Kept for experimental / historical flux-max-request helpers only.
   * Verified model: black-forest-labs/flux.2-max
   */
  fluxMaxModel:
    process.env["OR_FLUX_MAX_MODEL"] ?? "black-forest-labs/flux.2-max",

  /** Platform aspect ratio passed to OpenRouter image_config / Images API. */
  outputAspectRatio: "4:5" as const,

  /**
   * OpenRouter API base URL.
   * Do not change — uses the user's own OPENROUTER_API_KEY, not the
   * Replit AI Integration managed key (which does not support image generation).
   */
  baseUrl: "https://openrouter.ai/api/v1",
} as const;

export type NativeOutputResolution = "2K" | "4K";

/**
 * V1 Create engine path. When false, fresh Create uses one Nano Regular (flash)
 * generation request. Nano Pro → Nano Regular cascade code is retained for V3.
 */
export const V1_CREATE_USE_NANO_PRO_CASCADE = false;

export const V1_CREATE_USE_HEADLESS_IDENTITY_ENV =
  "V1_CREATE_USE_HEADLESS_IDENTITY" as const;

/**
 * When true, fresh production Create uses the frozen Headless Mannequin
 * two-stage Nano Pro identity path. Default OFF — no effect while unset.
 *
 * Independent of EXPERIMENTAL_NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENABLED and
 * V1_CREATE_USE_NANO_PRO_CASCADE (cascade remains hardcoded false).
 */
export function isV1CreateHeadlessIdentityEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[V1_CREATE_USE_HEADLESS_IDENTITY_ENV] ?? "";
  return (
    raw === "1" ||
    raw.toLowerCase() === "true" ||
    raw.toLowerCase() === "yes"
  );
}

/** Active production Create engines only. FLUX.2 Max is intentionally excluded. */
export type OpenRouterRenderEngine = "flash" | "nano_pro";

const FLUX_MAX_ENGINE_ALIASES = new Set([
  "flux_max",
  "flux-max",
  "fluxmax",
  "flux.2-max",
  "flux2_max",
  "flux2-max",
]);

function isFluxMaxEngineAlias(raw: string): boolean {
  return FLUX_MAX_ENGINE_ALIASES.has(raw);
}

/**
 * Production Create rendering engine.
 * Default: flash (Nano Regular / google/gemini-3.1-flash-image chat path).
 * Set OR_RENDER_ENGINE=nano_pro for Nano Banana Pro Images API.
 *
 * Per-call `engineOverride` (Create cascade Stage-1/Stage-2) wins over env.
 * When override is omitted, behaviour is unchanged.
 *
 * FLUX.2 Max is NOT an active production Create engine. If OR_RENDER_ENGINE is
 * set to a Flux alias (or any other unrecognized value), Create uses flash.
 * There is no Nano→Flux fallback and no unknown→Flux fallback.
 */
export function resolveOpenRouterRenderEngine(
  engineOverride?: OpenRouterRenderEngine | null,
): OpenRouterRenderEngine {
  if (engineOverride === "flash" || engineOverride === "nano_pro") {
    return engineOverride;
  }
  const raw = (process.env["OR_RENDER_ENGINE"] ?? "flash").trim().toLowerCase();
  if (
    raw === "nano_pro" ||
    raw === "nano-pro" ||
    raw === "nanopro" ||
    raw === "gemini-3-pro-image"
  ) {
    return "nano_pro";
  }
  if (raw === "flash" || raw === "nano" || raw === "nano_regular" || raw === "nano-regular") {
    return "flash";
  }
  if (isFluxMaxEngineAlias(raw)) {
    // Rejected: do not route production Create to FLUX.2 Max.
    console.warn(
      `[rendering] OR_RENDER_ENGINE=${raw} is not an active production Create engine; using flash (Nano Regular)`,
    );
    return "flash";
  }
  // Missing / invalid / unknown → Nano Regular (never Flux).
  if (raw.length > 0 && raw !== "flash") {
    console.warn(
      `[rendering] OR_RENDER_ENGINE=${raw} is unrecognized; using flash (Nano Regular)`,
    );
  }
  return "flash";
}

export function isNanoBananaProEngine(
  engineOverride?: OpenRouterRenderEngine | null,
): boolean {
  return resolveOpenRouterRenderEngine(engineOverride) === "nano_pro";
}

/**
 * Always false for production Create.
 * FLUX.2 Max is dormant — OpenRouterProvider retains historical Flux branch
 * code, but this gate never opens via OR_RENDER_ENGINE.
 */
export function isFluxMaxEngine(): boolean {
  return false;
}

/**
 * Select the OpenRouter model slug for the requested native resolution tier.
 * Nano Pro uses one model for both 2K and 4K — resolution is sent as Images API `resolution`.
 * Flash (Nano Regular) path keeps separate stable (2K) vs preview (4K) chat models.
 * FLUX.2 Max is never selected here.
 */
export function resolveOpenRouterModelForResolution(
  resolution: NativeOutputResolution,
  engineOverride?: OpenRouterRenderEngine | null,
): string {
  if (isNanoBananaProEngine(engineOverride)) {
    return OPENROUTER_RENDERING_CONFIG.nanoBananaProModel;
  }
  if (resolution === "4K") {
    return OPENROUTER_RENDERING_CONFIG.flashPreviewModel;
  }
  return OPENROUTER_RENDERING_CONFIG.defaultModel;
}

/**
 * Nano Pro Images API resolution parameter.
 * Sends the requested tier as-is (no silent downgrade).
 * Note: Google Vertex lists 1K|2K only; Google AI Studio lists 1K|2K|4K.
 * Native resolution validation rejects claiming 4K if a smaller image is returned.
 */
export function resolveNanoProImageResolution(
  resolution: NativeOutputResolution,
): "2K" | "4K" {
  return resolution === "4K" ? "4K" : "2K";
}

/**
 * Build the refinement instruction block appended to the garment instruction
 * when the user requests a change to an already-generated image.
 *
 * Reference Image 3 = previous generated output (provided by the caller).
 */
export function buildRefinementInstruction(refinementPrompt: string): string {
  return `
REFINEMENT MODE — TARGETED EDIT ONLY.

Reference Image 3 is the exact current state of the image. You are editing this existing image — not creating a new one. Treat this like a Photoshop layer operation: touch only the pixels that must change.

THE REQUESTED CHANGE IS: "${refinementPrompt}"

LOCKED — THESE ELEMENTS ARE COMPLETELY FROZEN AND MUST NOT CHANGE UNDER ANY CIRCUMSTANCES:
✗ Model face, skin tone, hair colour, and hairstyle
✗ Model pose, body position, limb placement
✗ Camera angle, framing, and composition
✗ The uploaded garment (Reference Image 1) — every detail: neckline, straps, collar, sleeves, hem length, silhouette, colour, fabric, texture, print, embroidery, buttons, and construction
✗ All complementary outfit items not mentioned in the request
✗ Background (unless the request explicitly asks to change the background)
✗ Overall lighting direction and quality (unless the request explicitly asks to change lighting)
✗ Expression and gaze direction

CHANGE ONLY:
Apply the minimum change necessary to fulfil the request. If ambiguous, choose the most conservative interpretation.

EXAMPLES OF CORRECT BEHAVIOUR:
• Request "Change Background" → only background pixels change; model, garment, pose, lighting are untouched
• Request "Replace Shoes" → only footwear changes; everything else is pixel-identical to Reference Image 3
• Request "Change Lighting" → only light direction/quality changes; garment and model are untouched
• Request "Add Accessories" → add only accessories; nothing else changes
• Request "Replace Shirt" → only the complementary shirt (not the uploaded garment) changes

IMPORTANT: The output must look like Reference Image 3 with one specific element swapped. If the output looks like a new generation, you have failed. The model's face must be recognisably identical to Reference Image 3.`;
}
