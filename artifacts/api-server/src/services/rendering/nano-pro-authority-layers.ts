// ---------------------------------------------------------------------------
// Nano Banana Pro — modular authority layers (production Create path)
//
// Kept separate for predictability / debugging. Composed into the Images API
// prompt when OR_RENDER_ENGINE=nano_pro. Does not replace garmentInstruction
// or the creative shot prompt — layers alongside them.
//
// Identity rule (this pass):
//   Studio Talent = sole identity authority
//   Pose Master   = pose/action geometry only
//   Garment image = garment authority
// ---------------------------------------------------------------------------

import {
  STUDIO_BACKGROUND_ENVIRONMENT_SUMMARY,
} from "./rendering-studio-background-authority.js";

export type StudioLocationEnvironment =
  | "white_studio"
  | "grey_gradient_studio"
  | "photo_studio"
  | "luxury_interior"
  | "urban_street"
  | "nature"
  | string;

/** V1 Create — fixed white studio; user Environment choice deferred to V3. */
export const V1_CREATE_LOCATION_ENVIRONMENT: StudioLocationEnvironment = "white_studio";

/** Normalize any incoming value to V1 white studio for Create generation. */
export function resolveV1CreateLocationEnvironment(
  _locationEnvironment?: StudioLocationEnvironment | null,
): typeof V1_CREATE_LOCATION_ENVIRONMENT {
  return V1_CREATE_LOCATION_ENVIRONMENT;
}

export type NanoProAuthorityLayerInput = {
  /** True when a Pose Master image is attached for this shot. */
  hasPoseReference: boolean;
  /** Number of Talent identity images attached (same person). */
  talentIdentityImageCount: number;
  /**
   * @deprecated V1 — Environment deferred to V3. Ignored by composeNanoProAuthorityLayers.
   * Kept optional so older call sites / experiments still type-check.
   */
  locationEnvironment?: StudioLocationEnvironment | null;
  /**
   * True when the pose requires support furniture (chair/stool/step).
   * Drives furniture authority only — never Environment.
   */
  furnitureRequired?: boolean;
};

/** Controlled studio backdrops — background only, no invented environment. */
const CONTROLLED_STUDIO_BACKGROUNDS = new Set([
  "white_studio",
  "grey_gradient_studio",
]);

const ENVIRONMENT_COPY: Record<string, string> = {
  white_studio: STUDIO_BACKGROUND_ENVIRONMENT_SUMMARY,
  grey_gradient_studio:
    "Premium soft grey gradient studio background. Controlled studio lighting. Minimal or no visible environment — background plane only.",
  photo_studio:
    "Controlled professional fashion studio environment. Subtle studio depth and lighting may be present; no distracting environmental setting, street, landscape, or lifestyle room.",
  luxury_interior:
    "Refined luxury / editorial interior environment. Soft ambient light suited to high fashion. Architectural, not cluttered lifestyle clutter.",
  urban_street:
    "Contemporary urban street / city exterior, editorial fashion location. Natural outdoor light with premium commercial finish.",
  nature:
    "Tasteful outdoor / natural editorial environment. Natural light with premium fashion-photography finish.",
};

/**
 * Sole identity authority for Nano Pro.
 * Facial / appearance features are listed here only — other modules must not
 * redefine the subject or compete with Talent identity.
 */
export function buildTalentIdentityAuthorityLayer(
  talentIdentityImageCount: number,
): string {
  const multi =
    talentIdentityImageCount > 1
      ? `All ${talentIdentityImageCount} Studio Talent reference images represent the SAME person and are the sole authority for identity.`
      : `The Studio Talent reference image is the sole authority for the subject's identity.`;

  return `TALENT IDENTITY AUTHORITY:
${multi}
Preserve facial identity, facial structure, eyes, nose, lips, jawline, hair, skin tone, and recognizable physical appearance from the Studio Talent reference only.
Do not derive face, facial structure, hair, skin tone, identity, or physical appearance from the Pose Master or any other reference.
Do not create a generic look-alike. Do not beautify or reshape the face. Prefer natural skin texture over artificial perfection.`;
}

export function buildPoseAuthorityLayer(hasPoseReference: boolean): string {
  if (hasPoseReference) {
    return `POSE AUTHORITY:
The Pose Master is a visual reference for body geometry and action only — pose, body position, movement, limb placement, gesture, weight distribution, torso orientation, and pose-related framing.
The person or figure depicted in the Pose Master is NOT the identity reference.
Do not derive face, facial structure, hair, skin tone, identity, or physical appearance from the Pose Master.
Do not copy clothing, footwear, accessories, furniture, or environment from the Pose Master.`;
  }

  return `POSE AUTHORITY:
No Pose Master image is attached for this shot. Use natural editorial posing consistent with the creative brief.`;
}

export function buildGarmentTextureAuthorityLayer(): string {
  return `GARMENT TEXTURE AUTHORITY:
Preserve fine fabric texture, weave, surface character, natural wrinkles, creases and subtle irregularities from the garment reference.
Do not simplify, smooth, airbrush or replace textured fabric with a generic smooth surface.
Garment recognition must remain exact; texture fidelity remains a priority.`;
}

export function buildLowerWardrobeAuthorityLayer(): string {
  return `LOWER WARDROBE AUTHORITY:
Do not copy lower-body clothing or footwear from the pose reference.
Independently style complementary lower garments and footwear based on the hero garment, fashion context, talent, gender, pose and environment.
Allow appropriate editorial variation across generations — do not mechanically repeat the same denim and sneakers combination.
If the user explicitly provides or requests a lower garment or footwear, respect that request.`;
}

export function buildEnvironmentAuthorityLayer(
  locationEnvironment?: StudioLocationEnvironment | null,
): string {
  // V3-ready helper — retained for future Environment product.
  // V1 Create does NOT compose this into Nano Pro prompts (see composeNanoProAuthorityLayers).
  const key = (locationEnvironment ?? "photo_studio").trim() || "photo_studio";
  const description =
    ENVIRONMENT_COPY[key] ??
    `Editorial fashion environment consistent with "${key}".`;

  const controlledBackdrop = CONTROLLED_STUDIO_BACKGROUNDS.has(key)
    ? `
This selection is a controlled studio background only.
Do not invent rooms, furniture, landscapes, windows, props, sets, or environmental objects.
Do not treat this as authority for pose, talent identity, garment identity, garment texture, lower wardrobe, or footwear.`
    : `
Environment controls background and setting only.
Do not treat this as authority for pose, talent identity, garment identity, garment texture, lower wardrobe, or footwear.`;

  return `ENVIRONMENT AUTHORITY:
The selected StudioLayer environment is authoritative for the final background/environment: ${description}${controlledBackdrop}
Do not let the pose reference automatically determine the final environment, room, street, studio backdrop or background.
Pose-illustration backgrounds are non-authoritative unless StudioLayer explicitly selects them.
Do not substitute grey, gray, cream, beige, off-white, tinted, or gradient backgrounds for the mandatory white studio.`;
}

export function buildFurnitureAuthorityLayer(
  furnitureRequired?: boolean,
): string {
  // V1: furniture authority is pose/furniture-system only — never Environment-driven.
  //
  // The pose illustration stays authoritative for pose, body geometry, composition
  // and camera relationship. Furniture drawn inside it is incidental scaffolding,
  // never the requested piece — that distinction has to be explicit, because a
  // blanket "ignore the reference" would cost pose fidelity.
  if (furnitureRequired) {
    return `FURNITURE AUTHORITY:
This pose requires a support furniture piece. Follow the creative FURNITURE instruction for the selected studio piece only.
The pose reference remains authoritative for pose, body geometry, composition and camera relationship. Any furniture visible in it is incidental and is NOT the requested furniture — do not copy, reproduce or treat it as the selected piece.
Do not invent additional furniture, props, or environmental objects beyond that required support.`;
  }

  return `FURNITURE AUTHORITY:
The pose reference remains authoritative for pose, body geometry, composition and camera relationship. Any furniture visible in it is incidental and must NOT be copied or reproduced.
Do not invent chairs, stools, blocks, tables, bags, plants, books, cups, lamps, decorative objects, or lifestyle furniture.
Include a support object only when the creative FURNITURE instruction requires it.`;
}

/**
 * Compose Nano Pro authority modules (order fixed for debugging).
 * Separated from garmentInstruction and creative shot prompts.
 *
 * V1: fixed white-studio ENVIRONMENT AUTHORITY — user Environment deferred to V3.
 */
export function composeNanoProAuthorityLayers(
  input: NanoProAuthorityLayerInput,
): string {
  return [
    buildTalentIdentityAuthorityLayer(input.talentIdentityImageCount),
    buildGarmentTextureAuthorityLayer(),
    buildPoseAuthorityLayer(input.hasPoseReference),
    buildEnvironmentAuthorityLayer(V1_CREATE_LOCATION_ENVIRONMENT),
    buildFurnitureAuthorityLayer(input.furnitureRequired),
    buildLowerWardrobeAuthorityLayer(),
  ].join("\n\n");
}

/**
 * Concise Ref1/Ref2 role map — placed at the start of the Nano Pro Images API
 * prompt so multimodal grounding mirrors Flash's "text then images" binding.
 * Does not replace TALENT IDENTITY AUTHORITY (kept after this block).
 */
export function buildNanoProReferenceRoleMapping(
  talentReferenceImageNumber = 2,
): string {
  const talentRef = talentReferenceImageNumber;
  return `REFERENCE IMAGE ROLES:
Reference Image 1 = GARMENT SOURCE.
Reference Image ${talentRef} = STUDIO TALENT / SUBJECT IDENTITY.

The Studio Talent in Reference Image ${talentRef} is the person who must appear in the final image.`;
}

/**
 * Align primary garment try-on wording with Talent identity authority for Nano Pro.
 * Does not expand facial-feature lists (those live only in TALENT IDENTITY AUTHORITY).
 */
export function clarifyNanoProTalentIdentityInPrimaryInstruction(
  primaryInstruction: string,
  talentReferenceImageNumber = 2,
): string {
  const ref = talentReferenceImageNumber;
  return primaryInstruction
    .replace(
      new RegExp(
        `Reference Image ${ref} is the human model\\.`,
        "g",
      ),
      `Reference Image ${ref} is the Studio Talent — sole identity authority.`,
    )
    .replace(
      new RegExp(
        `dress the person shown in Reference Image ${ref}`,
        "g",
      ),
      `dress the Studio Talent shown in Reference Image ${ref}`,
    );
}

/**
 * Map chat-style image parts to OpenRouter Images API `input_references`.
 *
 * Schema (project-verified): each reference is `{ type, image_url: { url } }` only.
 * Chat Completions `detail: "high"` is NOT supported on this Images API shape —
 * do not invent or forward `detail`.
 */
export function mapImagePartsToNanoProInputReferences(
  imageContent: ReadonlyArray<{
    type: "image_url";
    image_url: { url: string; detail?: string };
  }>,
): Array<{ type: "image_url"; image_url: { url: string } }> {
  return imageContent.map((part) => ({
    type: "image_url" as const,
    image_url: { url: part.image_url.url },
  }));
}

/**
 * Final Nano Pro Images API prompt assembly (authority + primary + creative shot).
 * Exported for forensic / contract tests — keep in sync with OpenRouterProvider.
 *
 * V1: `locationEnvironment` is accepted for call-site compatibility but IGNORED —
 * Create always composes fixed white-studio ENVIRONMENT AUTHORITY.
 */
export function assembleNanoProImagesApiPrompt(params: {
  talentIdentityImageCount: number;
  hasPoseReference: boolean;
  /** @deprecated V1 — ignored; Create always uses white_studio. */
  locationEnvironment?: StudioLocationEnvironment | null;
  primaryInstruction: string;
  creativeShotPrompt?: string;
  talentReferenceImageNumber?: number;
  /** When true, creative FURNITURE instruction is allowed by furniture authority. */
  furnitureRequired?: boolean;
}): string {
  const talentRef = params.talentReferenceImageNumber ?? 2;
  const primary = clarifyNanoProTalentIdentityInPrimaryInstruction(
    params.primaryInstruction,
    talentRef,
  );
  return [
    buildNanoProReferenceRoleMapping(talentRef),
    composeNanoProAuthorityLayers({
      hasPoseReference: params.hasPoseReference,
      talentIdentityImageCount: params.talentIdentityImageCount,
      furnitureRequired: params.furnitureRequired,
    }),
    primary,
    params.creativeShotPrompt?.trim() ? params.creativeShotPrompt.trim() : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
