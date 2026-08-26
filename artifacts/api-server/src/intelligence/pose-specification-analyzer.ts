// ---------------------------------------------------------------------------
// StudioLayer AI — Pose Specification Analyzer (precompute experiment)
//
// Reuses the GPT-4o vision pattern from garment-analyzer.ts.
// Geometry/action only. NOT wired into OpenRouter/Gemini generation.
// ---------------------------------------------------------------------------

import OpenAI from "openai";
import type { PoseSpecification } from "./pose-specification-types.js";
import {
  isPersistablePoseSpecification,
  validatePoseSpecification,
  type PoseSpecificationValidationResult,
} from "./pose-specification-validator.js";

export const POSE_SPECIFICATION_MODEL = "gpt-4o";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });
  }
  return openaiClient;
}

const SYSTEM_PROMPT = `You analyse ONE fashion Pose Master illustration and return a COMPACT JSON pose specification.

GOAL: Capture only the body geometry and action needed to reproduce the pose.
This is structural reinforcement for a separate visual PNG — NOT a long pose essay.

Return ONLY this JSON shape (no markdown):
{
  "action": string | null,
  "bodyOrientation": string | null,
  "headDirection": string | null,
  "gazeDirection": string | null,
  "torso": string | null,
  "pelvis": string | null,
  "leftArm": string | null,
  "rightArm": string | null,
  "leftHand": string | null,
  "rightHand": string | null,
  "leftLeg": string | null,
  "rightLeg": string | null,
  "leftFoot": string | null,
  "rightFoot": string | null,
  "weightDistribution": string | null,
  "supportObject": {
    "required": boolean,
    "type": string | null,
    "bodySupportRelationship": string | null
  } | null,
  "criticalPoseGeometry": string[] | null
}

RULES:
- Compact phrases only. Prefer under ~12 words per field.
- criticalPoseGeometry: at most 4 short anchors.
- Describe SUBJECT'S left/right from the model's own perspective.
- If a field is unclear, set null. Do NOT invent.
- If support/contact is unclear, set supportObject to null OR set bodySupportRelationship null.
- supportObject.type: generic only (chair, stool, wall, floor, railing). Never describe furniture design, material, style, or appearance.
- bodySupportRelationship: physical contact geometry only (e.g. "perched on upper/back portion of chair; pelvis above normal seat plane").
- DO NOT describe: identity, face, hair, skin, clothing, garment design, accessories, illustration style, background, furniture appearance.
- If no prop/support is required, supportObject = { "required": false, "type": null, "bodySupportRelationship": null } or null.
- Respond with ONLY valid JSON.`;

export type AnalyzePoseSpecificationResult = {
  poseId: string;
  validation: PoseSpecificationValidationResult;
  persistable: boolean;
  specification: PoseSpecification | null;
  rawContent: string;
  reviewFlags: string[];
};

function collectReviewFlags(
  poseId: string,
  spec: PoseSpecification | null,
  rawContent: string,
): string[] {
  const flags: string[] = [];
  const lower = rawContent.toLowerCase();

  if (
    /uncertain|unclear|cannot tell|hard to (see|tell)|possibly|maybe|appears to/i.test(
      rawContent,
    )
  ) {
    flags.push("language_suggests_uncertainty");
  }

  if (spec?.supportObject?.required && !spec.supportObject.bodySupportRelationship) {
    flags.push("support_required_but_relationship_null");
  }

  if (
    poseId === "Pose7"
    && spec?.supportObject?.bodySupportRelationship
    && /sit(ting)? (in|on) (the )?seat|ordinary sit|fully seated|deep sit/i.test(
      spec.supportObject.bodySupportRelationship,
    )
    && !/perch|half|upper|back/i.test(spec.supportObject.bodySupportRelationship)
  ) {
    flags.push("pose7_may_collapse_to_ordinary_sit");
  }

  // Contradiction: required false but relationship present (validator also catches)
  if (
    spec?.supportObject
    && spec.supportObject.required === false
    && spec.supportObject.bodySupportRelationship
  ) {
    flags.push("contradiction_support_not_required_but_relationship_set");
  }

  // Clothing/style leakage heuristics
  if (
    /\b(dress|jeans|blouse|skirt|hair|blonde|brunette|illustration|cartoon|drawn)\b/i.test(
      lower,
    )
  ) {
    flags.push("possible_appearance_or_clothing_leakage");
  }

  return flags;
}

/**
 * Analyse a Pose Master image (URL or data URI) into a compact PoseSpecification.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : String(err);
  return status === 429 || /rate limit/i.test(message);
}

export async function analyzePoseSpecification(params: {
  poseId: string;
  imageUrl: string;
  /** Retries on 429 (default 4). */
  maxRetries?: number;
}): Promise<AnalyzePoseSpecificationResult> {
  const { poseId, imageUrl, maxRetries = 4 } = params;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await getOpenAI().chat.completions.create({
        model: POSE_SPECIFICATION_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Pose ID: ${poseId}. Analyse body pose geometry/action only. Return compact JSON.`,
              },
              {
                type: "image_url",
                image_url: { url: imageUrl, detail: "high" },
              },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices[0]?.message?.content ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        return {
          poseId,
          validation: {
            ok: false,
            errors: ["JSON parse failed"],
            warnings: [],
            specification: null,
            nullFields: [],
          },
          persistable: false,
          specification: null,
          rawContent,
          reviewFlags: ["json_parse_failed"],
        };
      }

      const validation = validatePoseSpecification(poseId, parsed);
      const persistable = isPersistablePoseSpecification(validation);
      const reviewFlags = collectReviewFlags(
        poseId,
        validation.specification,
        rawContent,
      );

      return {
        poseId,
        validation,
        persistable,
        specification: persistable ? validation.specification : null,
        rawContent,
        reviewFlags,
      };
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === maxRetries) break;
      const backoffMs = 1500 * (attempt + 1);
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
