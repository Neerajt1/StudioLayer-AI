import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger";
import { findIdentityById } from "../data/identity-library";

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
  /** Optional Identity Library ID (e.g. "W001"). When supplied and resolved,
   *  its imageUrl is used as model_image instead of selectModelImage(). */
  modelIdentityId?: string | null;
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
    modelIdentityId,
  } = params;

  try {
    // 1. Prepare the garment image (flat-lay hanger photo)
    const garmentImage = prepareGarmentImage(sourceImageUrl);

    // 2. Select base human model image.
    //
    //    IDENTITY LIBRARY GUARD (SL-001):
    //    If a modelIdentityId was supplied, attempt to resolve it against the
    //    Identity Library first. If found, use that identity's imageUrl directly
    //    — this is the locked-model fast path for future catalog consistency.
    //    If the ID is not found (typo, deleted entry, etc.), fall through to
    //    selectModelImage() so existing rendering is never broken.
    //
    //    If no modelIdentityId was supplied (current default for all renders),
    //    selectModelImage() runs exactly as before — zero behaviour change.
    let modelImageUrl: string;
    if (modelIdentityId) {
      const identity = findIdentityById(modelIdentityId);
      if (identity) {
        modelImageUrl = identity.imageUrl;
        logger.info(
          { renderId, modelIdentityId, identityName: identity.displayName, modelImageUrl },
          "AI pipeline: model image resolved from Identity Library",
        );
      } else {
        logger.warn(
          { renderId, modelIdentityId },
          "AI pipeline: modelIdentityId not found in library — falling back to attribute routing",
        );
        modelImageUrl = selectModelImage(modelGender, modelAgeRange, modelPose);
      }
    } else {
      // Default path — attribute-based routing, unchanged from original behaviour
      modelImageUrl = selectModelImage(modelGender, modelAgeRange, modelPose);
    }

    // SL-009 — Resolve local identity image paths to absolute URLs.
    //
    // Identity Library imageUrls are stored as root-relative paths
    // (e.g. "/identities/F-IN-01.png") so the frontend can render them
    // directly as <img src>. fal.ai requires a publicly reachable absolute URL.
    //
    // The Vite frontend artifact is mounted at the root path ("/"), so:
    //   /identities/F-IN-01.png → https://<REPLIT_DEV_DOMAIN>/identities/F-IN-01.png
    //
    // REPLIT_DEV_DOMAIN is injected by the Replit platform into every service
    // process. If absent (local dev without Replit), fall back to localhost on
    // the frontend's default PORT (25562 matches the studiolayer-ai service).
    if (modelImageUrl.startsWith("/")) {
      const domain = process.env.REPLIT_DEV_DOMAIN;
      if (domain) {
        modelImageUrl = `https://${domain}${modelImageUrl}`;
      } else {
        const frontendPort = 25562;
        modelImageUrl = `http://localhost:${frontendPort}${modelImageUrl}`;
      }
      logger.info(
        { renderId, resolvedModelImageUrl: modelImageUrl },
        "AI pipeline: resolved relative identity imageUrl to absolute URL",
      );
    }

    logger.info(
      { renderId, modelImageUrl, modelIdentityId, modelPose, modelGender, modelAgeRange, cameraFraming, garmentPlacement },
      "AI pipeline: model image selected",
    );

    // ── PROMPT COMPOSER (SL-006) ────────────────────────────────────────────
    //
    //  Modular architecture — three independent sections composed into one
    //  final prompt string sent to fal.ai:
    //
    //    Section A  Camera Framing  (required — drives composition)
    //    Section B  Expression      (optional — re-activates modelPersona)
    //    Section C  Location        (optional — re-activates locationEnvironment)
    //
    //  Each section is a self-contained string. Only non-null sections are
    //  joined. Order is A → B → C. No section duplicates another's content.
    //  Backwards compatible: renders without B or C receive Section A only,
    //  identical to the previous cameraFraming-only behaviour.
    // ────────────────────────────────────────────────────────────────────────

    // ── Section A: Camera Framing (required) ─────────────────────────────
    // Full body strings are reinforced with repeated explicit constraints
    // (SL-004) because fashn/tryon defaults to 3/4 crops and resists a single
    // "head to toe" mention.
    const FULL_BODY_FRAMING =
      "Full body commercial lookbook photograph. CRITICAL FRAMING REQUIREMENT: " +
      "The entire human model must be captured completely from the very top of the head " +
      "down to both feet. Both feet and ankles must be FULLY VISIBLE and completely inside " +
      "the frame — absolutely no cropping at or below the ankle, knee, or thigh. " +
      "The complete outfit must be visible from collar to hemline to shoe sole. " +
      "Subject must be entirely contained within the frame with neutral space above the head. " +
      "Preserve the original garment proportions from neckline to full hem length. " +
      "Do NOT crop the body. Do NOT zoom in. Show the complete full-length figure.";

    let cameraSection: string;
    if (cameraFraming === "full_body") {
      cameraSection = FULL_BODY_FRAMING;
    } else if (cameraFraming === "mid_shot") {
      cameraSection = "A clean waist-up medium portrait composition showing the model from the waist to the top of the head.";
    } else if (cameraFraming === "close_up") {
      cameraSection = "A tight macro close-up shot focused purely on the chest and upper torso fabric details.";
    } else {
      cameraSection = FULL_BODY_FRAMING; // default when unset or unrecognised
    }

    // ── Section B: Expression / Model Persona (optional) ─────────────────
    // Maps each modelPersona enum value to a concise expression instruction.
    // Legacy enum aliases (casual/high_fashion/athletic/minimalist) are
    // included alongside the current values so old renders remain consistent.
    const EXPRESSION_MAP: Record<string, string> = {
      high_fashion_editorial: "The model holds an intense, serious high-fashion editorial expression.",
      natural_smile:          "The model wears a warm, natural smile.",
      confident_commercial:   "The model projects a confident, direct commercial look.",
      // Legacy aliases kept for backwards compatibility
      high_fashion:           "The model holds an intense, serious high-fashion editorial expression.",
      casual:                 "The model wears a relaxed, natural smile.",
      athletic:               "The model projects a confident, athletic commercial stance.",
      minimalist:             "The model holds a clean, understated neutral expression.",
    };
    const expressionSection: string | null =
      EXPRESSION_MAP[modelPersona ?? ""] ?? null;

    // ── Section C: Location Environment (optional) ────────────────────────
    // Maps each locationEnvironment enum value to a concise scene description.
    const LOCATION_MAP: Record<string, string> = {
      photo_studio:    "Set against a clean, professional studio backdrop with soft, even lighting.",
      urban_street:    "Set against a softly blurred urban street backdrop.",
      luxury_interior: "Set inside a beautifully blurred luxurious interior space.",
      nature:          "Set against a softly blurred natural outdoor landscape.",
    };
    const locationSection: string | null =
      LOCATION_MAP[locationEnvironment ?? ""] ?? null;

    // ── Compose final prompt ───────────────────────────────────────────────
    const promptParts: string[] = [cameraSection];
    if (expressionSection) promptParts.push(expressionSection);
    if (locationSection)   promptParts.push(locationSection);
    const prompt = promptParts.join(" ");

    logger.info(
      {
        renderId,
        cameraFraming,
        modelPersona,
        locationEnvironment,
        sections: {
          camera:     cameraSection.slice(0, 60) + "…",
          expression: expressionSection,
          location:   locationSection,
        },
        finalPrompt: prompt,
      },
      "AI pipeline: prompt composer assembled",
    );

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
    // SL-004 — Full payload debug log: every field that reaches fal.ai visible in one entry.
    logger.info(
      {
        renderId,
        debug_payload: {
          modelIdentityId:    modelIdentityId ?? null,
          resolvedModelImage: modelImageUrl,
          cameraFraming:      cameraFraming ?? null,
          compositionPrompt:  prompt,
          garmentPlacement:   garmentPlacement ?? null,
          resolvedCategory:   category,
          garmentImage:       garmentImage,
          denoise_strength:   0.35,
          fidelity_weight:    1.0,
          cover_weight:       1.0,
        },
      },
      "AI pipeline: fal.ai payload summary",
    );
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
