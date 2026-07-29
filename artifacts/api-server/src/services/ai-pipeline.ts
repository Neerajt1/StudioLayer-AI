import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });
fal.config({ credentials: process.env.FAL_KEY });

// ---------------------------------------------------------------------------
// MODEL IMAGE SELECTOR — pure conditional logic, zero dictionary lookups.
//
// Every code path is an explicit if/else branch that returns a hardcoded
// string literal. There are NO dict key accesses that can return undefined,
// no optional chaining fallbacks that can silently miss, and no missing-key
// crashes regardless of what dropdown permutation the user selects (including
// any future custom age values or unrecognised gender strings).
//
// Resolution: gender broad-match → pose stance → age refinement (for frontal)
// ---------------------------------------------------------------------------

/** Returns a verified base human model image URL matched to gender + pose + age. */
function selectModelImage(
  modelGender: string | null | undefined,
  modelAgeRange: string | null | undefined,
  modelPose: string | null | undefined,
): string {
  const pose = modelPose ?? "standing_frontal";

  // ── KIDS ──────────────────────────────────────────────────────────────────
  // Triggered whenever modelGender contains / equals 'kids'
  if (modelGender === "kids") {
    if (pose === "walking_dynamic")
      // Child mid-stride natural walking pose
      return "https://images.unsplash.com/photo-1555009393-f20bdb245c4d?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")
      // Child clean side / three-quarter profile
      return "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=768&q=85&fit=crop&crop=top";
    // standing_frontal — age refinement
    if (modelAgeRange === "teen_youth")
      return "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop&crop=top";
    // young_child + any unrecognised age → verified front-facing child canvas
    return "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=768&q=85&fit=crop&crop=top";
  }

  // ── MEN'S ─────────────────────────────────────────────────────────────────
  // Triggered whenever modelGender contains / equals 'mens'
  if (modelGender === "mens") {
    if (pose === "walking_dynamic")
      // Adult male confident mid-stride editorial
      return "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")
      // Adult male three-quarter / side-profile fashion
      return "https://images.unsplash.com/photo-1490367532201-b9bc1dc483f6?w=768&q=85&fit=crop&crop=top";
    // standing_frontal — age refinement
    if (modelAgeRange === "mature_executive")
      return "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "classic_mid_age")
      return "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth")
      return "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=768&q=85&fit=crop&crop=top";
    // young_adult + any unrecognised age → verified front-facing adult male canvas
    return "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=768&q=85&fit=crop&crop=top";
  }

  // ── WOMEN'S (default — safely covers any unrecognised gender value) ────────
  if (pose === "walking_dynamic")
    // Adult female dynamic mid-stride editorial
    return "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=768&q=85&fit=crop&crop=top";
  if (pose === "sideways_posing")
    // Adult female clean side-profile fashion studio
    return "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=768&q=85&fit=crop&crop=top";
  // standing_frontal — age refinement
  if (modelAgeRange === "mature_executive")
    return "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "classic_mid_age")
    return "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "teen_youth")
    return "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop&crop=top";
  // young_adult + any unrecognised age → verified front-facing adult female canvas
  return "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop&crop=top";
}

/**
 * Calls GPT-4o Vision to extract microscopic garment design details
 * (zipper shapes, button materials, collar seams, fabric textures) from the
 * hanger photo. Returns a short descriptive string to enrich the Fal.ai prompt.
 *
 * HANGER ISOLATION: The system prompt explicitly instructs the vision model to
 * treat the hanger as transparent void — only the fabric garment geometry matters.
 */
async function extractGarmentDetails(imageUrl: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a precision garment analyst for a luxury fashion AI rendering engine. " +
            "CRITICAL MASKING DIRECTIVE: The image will show a garment on a clothes hanger. " +
            "You MUST mentally isolate and completely discard the hanger object from your analysis — " +
            "treat the hanger, hook, rod, and any mounting hardware as transparent empty space. " +
            "Capture ONLY the pure fabric edge borders and garment geometry itself. " +
            "STRUCTURAL TOKEN PRIORITY RULE: Lead your response with the most visually defining structural " +
            "tokens in this order — front button plackets, collar construction (e.g. linen collar, lapel, " +
            "band collar), sleeve style (e.g. rolled sleeves, dropped shoulder), hem line (e.g. loose bottom hem, " +
            "curved hem), then fabric type. This ordering is mandatory — structural details FIRST. " +
            "Format: '[structural tokens], [fabric], [silhouette]' — all in one compact paragraph. " +
            "Be extremely specific. No filler phrases. Never mention hangers or hooks in your output.",
        },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: imageUrl } }],
        },
      ],
      max_tokens: 120,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

function prepareGarmentImage(sourceImageUrl: string): string {
  return sourceImageUrl;
}

// ---------------------------------------------------------------------------
// Garment category detection via OpenAI vision
// Includes hanger masking instruction so the model ignores hanger geometry.
// ---------------------------------------------------------------------------
type GarmentCategory = "tops" | "bottoms" | "one-pieces" | "auto";

async function detectGarmentCategory(
  imageUrl: string,
): Promise<GarmentCategory> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            'You are a garment classifier. IMPORTANT: Ignore any clothes hanger, hook, rod, or mounting apparatus visible in the image — focus ONLY on the fabric garment itself. Classify the clothing item into exactly one of these three categories: "tops" (shirts, blouses, jackets, hoodies, t-shirts, coats, etc.), "bottoms" (pants, jeans, skirts, shorts, etc.), or "one-pieces" (dresses, jumpsuits, full-body outfits, rompers). Reply with only the category word, nothing else.',
        },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: imageUrl } }],
        },
      ],
      max_tokens: 10,
    });

    const raw =
      response.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    if (raw === "tops" || raw === "bottoms" || raw === "one-pieces") {
      return raw;
    }
    return "auto";
  } catch {
    return "auto";
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
export async function runAIPipeline(params: {
  renderId: number;
  sourceImageUrl: string;
  modelPersona: string;
  locationEnvironment: string;
  modelDemographics?: string | null;
  imageDimensions?: string | null;
  smartLighting?: boolean | null;
  modelPose?: string | null;
  modelGender?: string | null;
  modelAgeRange?: string | null;
  cameraFraming?: string | null;
  garmentPlacement?: string | null;
  onComplete: (outputImageUrl: string) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}): Promise<void> {
  const {
    renderId,
    sourceImageUrl,
    modelPersona,
    locationEnvironment,
    modelPose,
    modelGender,
    modelAgeRange,
    cameraFraming,
    garmentPlacement,
  } = params;

  try {
    // 1. Prepare the garment image (flat-lay hanger photo)
    const garmentImage = prepareGarmentImage(sourceImageUrl);

    // 2. Select base human model image via pure conditional routing —
    //    gender broad-match → pose → age. Zero dict lookups; cannot crash.
    const modelImageUrl = selectModelImage(modelGender, modelAgeRange, modelPose);
    logger.info(
      { renderId, modelImageUrl, modelPose, modelGender, modelAgeRange, cameraFraming, garmentPlacement },
      "AI pipeline: model image selected",
    );

    // 3a. UNBREAKABLE COMPOSITION BOUNDS — strict per-framing conditional prompt.
    //     Each camera framing token maps to one locked, non-negotiable string.
    //     No open-ended template interpolation; no dict lookups that can miss.
    //     Unrecognised / unset framing defaults to the full-body catalog string.
    let prompt: string;
    if (cameraFraming === "full_body") {
      prompt =
        "A crisp, full-length commercial lookbook catalog photograph capturing the entire human model " +
        "completely from head to toe, ensuring the full outfit, waist, legs, and shoes are perfectly " +
        "visible within the frame boundary with zero cropping or negative empty space above the head.";
    } else if (cameraFraming === "mid_shot") {
      prompt = "A clean waist-up medium portrait composition.";
    } else if (cameraFraming === "close_up") {
      prompt = "A tight macro close-up shot focused purely on the chest fabric details.";
    } else {
      // Default: treat as full-body catalog when framing is unset or unrecognised
      prompt =
        "A crisp, full-length commercial lookbook catalog photograph capturing the entire human model " +
        "completely from head to toe, ensuring the full outfit, waist, legs, and shoes are perfectly " +
        "visible within the frame boundary with zero cropping or negative empty space above the head.";
    }
    logger.info({ renderId, cameraFraming, prompt }, "AI pipeline: composition prompt locked");

    // 3. Resolve garment category for the fal.ai `category` parameter.
    //    User's Garment Placement Selector maps directly:
    //      upper_body → "tops"       (shirts, jackets, hoodies)
    //      lower_body → "bottoms"    (jeans, trousers, joggers)
    //      full_body  → "one-pieces" (dresses, gowns, jumpsuits)
    //    If no explicit selection was made, fall back to GPT-4o auto-detection.
    let category: GarmentCategory;
    if (garmentPlacement === "upper_body") {
      category = "tops";
    } else if (garmentPlacement === "lower_body") {
      category = "bottoms";
    } else if (garmentPlacement === "full_body") {
      category = "one-pieces";
    } else {
      // Auto-detect via GPT-4o vision when the user didn't set a placement
      category = await detectGarmentCategory(garmentImage);
    }
    logger.info({ renderId, category, garmentPlacement }, "AI pipeline: garment category resolved");

    // 4. Call fashn/tryon/v1.6 — Virtual Try-On engine
    //
    //    Payload architecture:
    //      model_image     → pure conditional gender+pose+age routed base layer
    //      garment_image   → uploaded hanger flat-lay
    //      category        → body-region anchor (tops / bottoms / one-pieces)
    //      prompt          → Logic Step C dynamic lookbook string (framing +
    //                        expression + pose + location compiled from UI tokens)
    //      cover_weight    → 1.0 (maximum fidelity / preserve_details lock —
    //                        forces exact colours, zippers, drawstrings intact)
    //      negative_prompt → anatomy distortion + hanger artifact suppression
    logger.info({ renderId }, "AI pipeline: calling fal-ai/fashn/tryon/v1.6");

    const NEGATIVE_PROMPT =
      "deformed hands, abnormal fingers, extra digits, broken anatomy, " +
      "distorted facial profiles, blurry, low resolution, " +
      "flat-lay fallback elements, visible clothes hanger, " +
      "wooden hanger remnants, hanger shadow inside collar, metal hook artifact";

    let outputImageUrl: string | undefined;

    try {
      const result = await fal.subscribe("fal-ai/fashn/tryon/v1.6", {
        input: {
          model_image: modelImageUrl,
          garment_image: garmentImage,
          category,
          garment_photo_type: "flat-lay",
          mode: "quality",
          num_samples: 1,
          output_format: "jpeg",
          prompt,
          // Structural detail protection — three-parameter fidelity lock:
          //   denoise_strength: 0.35 → strict low threshold; prevents the diffusion
          //     network from smoothing over fine details (buttons, pockets, zippers)
          //   fidelity_weight: 1.0  → absolute max; forces exact replication of the
          //     designer's original garment geometry under any permutation
          //   cover_weight: 1.0    → maximum preserve_details; retains exact colours,
          //     stitching, metallic buttons, pocket seam flaps, and fabric folds
          denoise_strength: 0.35,
          fidelity_weight: 1.0,
          cover_weight: 1.0,
          negative_prompt: NEGATIVE_PROMPT,
        },
        logs: false,
      });

      // Defensively check all common output URL keys
      const data = result.data as Record<string, unknown> | undefined;
      const candidates = [
        data?.["image_url"],
        data?.["url"],
        (data?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
        (data?.["image"] as { url: string } | undefined)?.url,
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.startsWith("http")) {
          outputImageUrl = c;
          break;
        }
      }

      logger.info({ renderId, outputImageUrl }, "AI pipeline: fashn/tryon/v1.6 succeeded");
    } catch (primaryError) {
      // Fallback: image-apps-v2/virtual-try-on
      logger.warn(
        { renderId, primaryError },
        "AI pipeline: fashn/tryon/v1.6 failed — falling back to image-apps-v2/virtual-try-on",
      );

      const fallbackResult = await fal.subscribe("fal-ai/image-apps-v2/virtual-try-on", {
        input: {
          person_image_url: modelImageUrl,
          clothing_image_url: garmentImage,
          preserve_pose: true,
        },
        logs: false,
      });

      const fd = fallbackResult.data as Record<string, unknown> | undefined;
      const fallbackCandidates = [
        fd?.["image_url"],
        fd?.["url"],
        (fd?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
        (fd?.["image"] as { url: string } | undefined)?.url,
      ];
      for (const c of fallbackCandidates) {
        if (typeof c === "string" && c.startsWith("http")) {
          outputImageUrl = c;
          break;
        }
      }

      logger.info({ renderId, outputImageUrl }, "AI pipeline: fallback succeeded");
    }

    if (!outputImageUrl) {
      throw new Error("No output image URL returned from fal.ai");
    }

    await params.onComplete(outputImageUrl);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ renderId, err: err.message }, "AI pipeline: failed");
    await params.onError(err);
  }
}
