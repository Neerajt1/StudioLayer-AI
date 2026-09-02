// ---------------------------------------------------------------------------
// Headless Create — Stage 1 authority contract (production adapter only)
//
// Maps Flash-era shot briefs onto the Headless Stage-1 layout:
//   Ref 1 = GARMENT, Ref 2 = POSE_MASTER, Ref 3 = FURNITURE (when attached)
//
// Never claims a reference image exists unless buildHeadlessStage1Request attaches it.
// ---------------------------------------------------------------------------

import type { FurnitureAsset } from "../../intelligence/furniture-catalog.js";
import {
  buildFurnitureReferenceAuthorityLayer,
  buildFurnitureReferencePrimaryPointer,
  FURNITURE_REFERENCE_DEFERRED_APPEARANCE_LINE,
} from "../../rendering/furniture-reference-appearance-authority.js";
import {
  GARMENT_AUTHORITY_SOT,
  OPENROUTER_RENDERING_CONFIG,
} from "./rendering.config.js";
import { STUDIO_BACKGROUND_AUTHORITY_SOT, STUDIO_BACKGROUND_PIXEL_PRECISION_CLOSER } from "./rendering-studio-background-authority.js";

/** Headless Stage-1 garment reference index. */
export const HEADLESS_STAGE1_GARMENT_REF = 1 as const;

/** Headless Stage-1 pose reference index (face-neutral Pose Master). */
export const HEADLESS_STAGE1_POSE_REF = 2 as const;

/** Headless Stage-1 furniture reference index when a product PNG is attached. */
export const HEADLESS_STAGE1_FURNITURE_REF = 3 as const;

/** Binding Stage-1 reference contract aligned with attached images. */
export function buildHeadlessStage1ReferenceContract(
  hasFurnitureReference: boolean,
): string {
  const lines = [
    "HEADLESS STAGE 1 — REFERENCE IMAGE CONTRACT (BINDING):",
    `Reference Image ${HEADLESS_STAGE1_GARMENT_REF} = GARMENT — clothing construction, colour, texture, print, and product identity ONLY.`,
    `Reference Image ${HEADLESS_STAGE1_POSE_REF} = POSE MASTER — body pose, limb placement, gesture, weight distribution, and pose-related framing ONLY.`,
  ];

  if (hasFurnitureReference) {
    lines.push(
      `Reference Image ${HEADLESS_STAGE1_FURNITURE_REF} = FURNITURE — selected StudioLayer furniture product. Sole authority for furniture identity, silhouette, geometry, proportions, construction, wood grain, wood tone, upholstery, material, finish, surface texture, and every visible product-specific detail.`,
      `Exactly three reference images are attached.`,
      `Reference Image ${HEADLESS_STAGE1_POSE_REF} is NOT authoritative for furniture design or material when Reference Image ${HEADLESS_STAGE1_FURNITURE_REF} is attached — preserve only body-to-furniture contact/support from Reference Image ${HEADLESS_STAGE1_POSE_REF}.`,
    );
  } else {
    lines.push(
      "Exactly two reference images are attached. No Reference Image 3 exists in this request.",
    );
  }

  lines.push(
    "No Studio Talent reference is attached in Stage 1.",
    `Reference Image ${HEADLESS_STAGE1_POSE_REF} is NOT authoritative for garment appearance, model identity, facial features, hair, skin tone, illustration style, or background colour — pose geometry and body-to-support relationship only.`,
    `Do not copy garment or identity from Reference Image ${HEADLESS_STAGE1_POSE_REF}.`,
  );

  if (!hasFurnitureReference) {
    lines.push(
      `Do not copy furniture design or material from Reference Image ${HEADLESS_STAGE1_POSE_REF}.`,
    );
  }

  return lines.join("\n");
}

/** Surface/component principle when no Talent image is attached in Stage 1. */
export function buildHeadlessSurfaceComponentEvidencePrinciple(): string {
  return `SURFACE / COMPONENT EVIDENCE PRINCIPLE:
Decoration and construction detail on any generated garment surface or component are allowed only when evidenced on that same surface or component in Reference Image ${HEADLESS_STAGE1_GARMENT_REF} — evidence is local and does not transfer across surfaces (including Back, sleeves, cuffs, hems, neckline, bottoms, or companion pieces). When a surface is visibly plain in the garment reference, keep it plain; when it is decorated, preserve the decoration shown there; when a surface is not visible, infer only what is needed for a believable garment without borrowing decoration from another surface. Do not transfer, mirror, complete, or aesthetically balance decoration across surfaces. No Studio Talent garment reference is attached in this Stage-1 request.`;
}

/**
 * Garment authority for Headless Stage 1 — inlined GARMENT_AUTHORITY_SOT plus
 * non-Talent clauses from the Flash primary instruction.
 */
export function buildHeadlessGarmentAuthorityBlock(): string {
  const garmentOnlyTail = OPENROUTER_RENDERING_CONFIG.garmentInstruction
    .split("\n\n")
    .filter(
      (block) =>
        !block.includes("Reference Image 2 is the human model") &&
        !block.startsWith("Reference Image 1 is the garment reference.") &&
        !block.startsWith("Your task is to dress the person"),
    )
    .join("\n\n");

  return [GARMENT_AUTHORITY_SOT, buildHeadlessSurfaceComponentEvidencePrinciple(), garmentOnlyTail]
    .filter(Boolean)
    .join("\n\n");
}

/** Headless-safe garment fidelity closer — points to inlined authority, not Flash primary. */
export function buildHeadlessGarmentFidelityCloser(): string {
  return `GARMENT AUTHORITY REMINDER:
Apply GARMENT AUTHORITY — REFERENCE IMAGE ${HEADLESS_STAGE1_GARMENT_REF} from the garment authority block above. Ref${HEADLESS_STAGE1_GARMENT_REF} remains binding for construction, as-worn state, material character, and colour. Pose-induced folds are additive only — do not redesign, smooth, or genericize the garment.`;
}

export type HeadlessGarmentSupplementalEvidenceParams = {
  garmentReferenceCorrespondenceInstruction?: string;
  garmentEvidenceSetMappingInstruction?: string;
  garmentEvidenceHasBack?: boolean;
  garmentEvidenceHasDetail?: boolean;
  garmentReferenceMode?: string;
};

/**
 * Preserve upstream garment sheet/back/detail context as explicit text when
 * supplemental garment images are not attached (Ref budget stops at furniture).
 */
export function buildHeadlessGarmentSupplementalEvidenceLayer(
  params: HeadlessGarmentSupplementalEvidenceParams,
): string | undefined {
  const parts: string[] = [];

  const correspondence = params.garmentReferenceCorrespondenceInstruction?.trim();
  const evidenceMapping = params.garmentEvidenceSetMappingInstruction?.trim();

  if (correspondence) {
    parts.push(
      [
        "SUPPLEMENTAL GARMENT EVIDENCE (TEXTUAL — NO ADDITIONAL GARMENT IMAGES ATTACHED):",
        `Only Reference Image ${HEADLESS_STAGE1_GARMENT_REF} (Garment Front) is attached as a garment image in this Headless Stage-1 request.`,
        "The correspondence below describes supplemental Back/Detail panels composed upstream. Apply it when the camera shows those surfaces — without replacing Reference Image 1 front construction authority.",
        correspondence,
      ].join("\n"),
    );
  } else if (evidenceMapping) {
    parts.push(
      [
        "SUPPLEMENTAL GARMENT EVIDENCE (TEXTUAL — NO ADDITIONAL GARMENT IMAGES ATTACHED):",
        `Only Reference Image ${HEADLESS_STAGE1_GARMENT_REF} (Garment Front) is attached as a garment image in this Headless Stage-1 request.`,
        "Separate Back/Detail views were supplied upstream. Use the mapping below for surface correspondence — Reference Image 1 remains primary for front construction.",
        rewriteFlashGarmentEvidenceMappingForHeadless(evidenceMapping),
      ].join("\n"),
    );
  } else if (params.garmentEvidenceHasBack || params.garmentEvidenceHasDetail) {
    const surfaces: string[] = [];
    if (params.garmentEvidenceHasBack) surfaces.push("Back");
    if (params.garmentEvidenceHasDetail) surfaces.push("Detail");
    parts.push(
      [
        "SUPPLEMENTAL GARMENT EVIDENCE (TEXTUAL):",
        `Only Reference Image ${HEADLESS_STAGE1_GARMENT_REF} is attached. Additional ${surfaces.join(" and ")} view(s) were supplied upstream — preserve their surface characteristics when those surfaces are visible without redesigning front construction from Reference Image 1.`,
        params.garmentReferenceMode
          ? `Garment reference mode: ${params.garmentReferenceMode}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function rewriteFlashGarmentEvidenceMappingForHeadless(mapping: string): string {
  return mapping
    .replaceAll(/Reference Image \d+ = Talent[^\n.]*/gi, "")
    .replaceAll(/Reference Image \d+ = Pose Master[^\n.]*/gi, "")
    .replaceAll(/Reference Image \d+ = Supplemental[^\n.]*/gi, "")
    .replaceAll(/Reference Image \d+ = Garment Back[^\n.]*/gi, "Back surface evidence (textual — not attached as a separate image).")
    .replaceAll(/Reference Image \d+ = Garment Detail[^\n.]*/gi, "Detail surface evidence (textual — not attached as a separate image).")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}

/**
 * Binding human-geometry authority for Stage 1.
 * Pose Master controls body geometry — not furniture, garment, background, or identity.
 */
export function buildHeadlessHumanPoseGeometryAuthorityLayer(): string {
  return `HUMAN POSE GEOMETRY AUTHORITY — REFERENCE IMAGE ${HEADLESS_STAGE1_POSE_REF} (BINDING):
Reference Image ${HEADLESS_STAGE1_POSE_REF} is the sole Stage-1 authority for HUMAN body geometry: body position, limb placement, hand and arm placement, leg arrangement, torso orientation, weight distribution, gesture, and pose-related framing / camera relationship.
The human geometry demonstrated in Reference Image ${HEADLESS_STAGE1_POSE_REF} is binding — reproduce that distinctive body geometry and body-to-support contact relationship. Do not substitute a generic standing, walking, sitting, or freestanding catalogue pose.
Reference Image ${HEADLESS_STAGE1_POSE_REF} is NOT authoritative for: furniture appearance or material; garment appearance, print, colour, or construction; clothing worn by the illustrated figure; background or environment colour; illustration style; face, hair, skin tone, or identity.
No Studio Talent identity reference is attached in Stage 1 — render an ordinary invented head/face suitable for later identity injection; do not attempt to depict any specific real person.`;
}

/** Reinforces Pose Master isolation; furniture override when Ref 3 is attached. */
export function buildHeadlessPoseMasterIsolationLayer(
  hasFurnitureReference: boolean,
): string {
  const furnitureLine = hasFurnitureReference
    ? `Replace any furniture drawn in Reference Image ${HEADLESS_STAGE1_POSE_REF} with Reference Image ${HEADLESS_STAGE1_FURNITURE_REF}. Reference Image ${HEADLESS_STAGE1_FURNITURE_REF} outranks Pose Master furniture appearance. Pose Master furniture is non-authoritative.`
    : `Do not copy furniture design or material from Reference Image ${HEADLESS_STAGE1_POSE_REF}. Pose Master furniture is non-authoritative.`;

  return `POSE MASTER ISOLATION — REFERENCE IMAGE ${HEADLESS_STAGE1_POSE_REF}:
Use Reference Image ${HEADLESS_STAGE1_POSE_REF} for body pose, limb placement, gesture, weight distribution, torso orientation, and pose-related framing only.
Do not derive garment construction, colour, print, clothing worn by the illustrated figure, background tone, model identity, face, hair, or illustration styling from Reference Image ${HEADLESS_STAGE1_POSE_REF}.
${furnitureLine}`;
}

/**
 * Garment-photo scenery and accessories are non-authoritative; proportions/length are locked.
 * Prevents lifestyle environment leakage and crop-top → long-shirt drift.
 */
export function buildHeadlessGarmentPhotoNonAuthorityLayer(): string {
  return `GARMENT PHOTO NON-AUTHORITY / PROPORTION LOCK — REFERENCE IMAGE ${HEADLESS_STAGE1_GARMENT_REF}:
Reference Image ${HEADLESS_STAGE1_GARMENT_REF} is authoritative for garment identity, silhouette, fabric, print/pattern, border, construction, proportions, and length ONLY.
NON-AUTHORITATIVE in Reference Image ${HEADLESS_STAGE1_GARMENT_REF}: background, walls, floor, furniture, flowers, plants, props, hangers, pedestals, lifestyle scenery, room environment, and any necklace, jewellery, or accessory draped on hangers that is not part of the garment construction itself.
Do not copy the garment-photo environment into the studio scene — BACKGROUND AUTHORITY (pure white #FFFFFF) outranks Reference Image ${HEADLESS_STAGE1_GARMENT_REF} scenery.
Preserve exact garment proportions and length from Reference Image ${HEADLESS_STAGE1_GARMENT_REF}. If an upper garment is cropped or short relative to a companion lower garment, keep it cropped/short — do not lengthen it to the seat, lap, hip, or thigh. Do not convert a cropped top into a tunic, long shirt, or dress. Do not invent additional garment layers absent from Reference Image ${HEADLESS_STAGE1_GARMENT_REF}.`;
}

const FLASH_FURNITURE_PRIMARY_POINTER_RE =
  /FURNITURE REFERENCE — REFERENCE IMAGE \d+[\s\S]*?(?=\n\n[A-Z]|\n\n$|$)/g;

const FLASH_FURNITURE_AUTHORITY_RE =
  /FURNITURE REFERENCE AUTHORITY — REFERENCE IMAGE \d+[\s\S]*?(?=\n\n[A-Z]|\n\n$|$)/g;

const FLASH_GARMENT_EVIDENCE_SET_RE =
  /GARMENT EVIDENCE SET:[\s\S]*?(?=\n\n[A-Z]|\n\n$|$)/g;

const FLASH_GARMENT_AUTHORITY_REMINDER_RE =
  /GARMENT AUTHORITY REMINDER:[\s\S]*?(?=\n\n[A-Z]|\n\n$|$)/g;

const HEADLESS_TEXT_ONLY_FURNITURE_RE =
  /FURNITURE — HEADLESS STAGE 1 \(TEXT-ONLY APPEARANCE CONTRACT\):[\s\S]*?(?=\n\n[A-Z]|\n\n$|$)/g;

const FLASH_TALENT_REF_LINE_RE =
  /Reference Image \d+ = Talent[^\n]*/gi;

/**
 * Strip Flash multimodal reference assumptions and remap pose authority to Ref 2.
 */
export function adaptFlashShotPromptForHeadlessStage1(flashShotPrompt: string): string {
  let next = flashShotPrompt.trim();
  if (!next) return "";

  next = next.replace(FLASH_FURNITURE_PRIMARY_POINTER_RE, "");
  next = next.replace(FLASH_FURNITURE_AUTHORITY_RE, "");
  next = next.replace(FLASH_GARMENT_EVIDENCE_SET_RE, "");
  next = next.replace(FLASH_GARMENT_AUTHORITY_REMINDER_RE, "");
  next = next.replace(HEADLESS_TEXT_ONLY_FURNITURE_RE, "");
  next = next.replaceAll(FURNITURE_REFERENCE_DEFERRED_APPEARANCE_LINE, "");
  next = next.replace(FLASH_TALENT_REF_LINE_RE, "");

  next = next.replaceAll(
    /Reference Image [3-9] is the Pose Master visual geometry/g,
    `Reference Image ${HEADLESS_STAGE1_POSE_REF} is the Pose Master visual geometry`,
  );
  next = next.replaceAll(
    /demonstrated in Reference Image [3-9]/g,
    `demonstrated in Reference Image ${HEADLESS_STAGE1_POSE_REF}`,
  );
  next = next.replaceAll(
    /Reference Image [4-9] is the Pose Master/g,
    `Reference Image ${HEADLESS_STAGE1_POSE_REF} is the Pose Master`,
  );

  next = next
    .split("\n")
    .filter((line) => !/Reference Image [4-9] =/.test(line))
    .join("\n");

  return next.replace(/\n{3,}/g, "\n\n").trim();
}

/** Reference-backed furniture authority when Ref 3 PNG is attached. */
export function buildHeadlessFurnitureReferenceAuthorityLayers(): string {
  return [
    buildFurnitureReferencePrimaryPointer(HEADLESS_STAGE1_FURNITURE_REF),
    buildFurnitureReferenceAuthorityLayer(HEADLESS_STAGE1_FURNITURE_REF),
  ].join("\n\n");
}

/** Returns true when prompt claims unattached references. */
export function headlessPromptClaimsUnattachedReference(
  prompt: string,
  hasFurnitureReference: boolean,
): boolean {
  if (/from the primary instruction/.test(prompt)) {
    return true;
  }
  if (/governed solely by the attached furniture reference image/.test(prompt)) {
    // Valid only when furniture ref is actually attached.
    return !hasFurnitureReference;
  }
  if (!hasFurnitureReference) {
    if (/FURNITURE REFERENCE AUTHORITY — REFERENCE IMAGE 3/.test(prompt)) {
      return true;
    }
    if (/FURNITURE REFERENCE — REFERENCE IMAGE 3/.test(prompt)) {
      return true;
    }
    if (/TEXT-ONLY APPEARANCE CONTRACT/.test(prompt)) {
      return true;
    }
    if (/Exactly three reference images are attached/.test(prompt)) {
      return true;
    }
  }
  return false;
}

export type AssembleHeadlessStage1CreativePromptParams = {
  shotPrompt: string;
  garmentReferenceCorrespondenceInstruction?: string;
  garmentEvidenceSetMappingInstruction?: string;
  garmentEvidenceHasBack?: boolean;
  garmentEvidenceHasDetail?: boolean;
  garmentReferenceMode?: string;
  furnitureReferenceImageUrl?: string | null;
  furnitureAsset?: FurnitureAsset | null;
};

/** Assemble the full Headless Stage-1 creative brief for production Create. */
export function assembleHeadlessCreateStage1CreativePrompt(
  params: AssembleHeadlessStage1CreativePromptParams,
): string {
  const hasFurnitureReference = Boolean(
    params.furnitureReferenceImageUrl?.trim(),
  );

  const parts: string[] = [
    STUDIO_BACKGROUND_AUTHORITY_SOT,
    buildHeadlessStage1ReferenceContract(hasFurnitureReference),
    buildHeadlessGarmentAuthorityBlock(),
    buildHeadlessGarmentPhotoNonAuthorityLayer(),
  ];

  const supplemental = buildHeadlessGarmentSupplementalEvidenceLayer({
    garmentReferenceCorrespondenceInstruction:
      params.garmentReferenceCorrespondenceInstruction,
    garmentEvidenceSetMappingInstruction:
      params.garmentEvidenceSetMappingInstruction,
    garmentEvidenceHasBack: params.garmentEvidenceHasBack,
    garmentEvidenceHasDetail: params.garmentEvidenceHasDetail,
    garmentReferenceMode: params.garmentReferenceMode,
  });
  if (supplemental) parts.push(supplemental);

  parts.push(buildHeadlessHumanPoseGeometryAuthorityLayer());
  parts.push(buildHeadlessPoseMasterIsolationLayer(hasFurnitureReference));

  // Adapted shot brief carries pose structured definition / photography layers
  // remapped to Headless Ref 2 — not a wholesale Flash Create prompt.
  const adaptedShot = adaptFlashShotPromptForHeadlessStage1(params.shotPrompt);
  if (adaptedShot) parts.push(adaptedShot);

  parts.push(buildHeadlessGarmentFidelityCloser());

  if (hasFurnitureReference) {
    parts.push(buildHeadlessFurnitureReferenceAuthorityLayers());
  }

  // Last-word reinforcement — models often weight the end of long Stage-1 briefs.
  parts.push(STUDIO_BACKGROUND_PIXEL_PRECISION_CLOSER);

  return parts.join("\n\n");
}

/** Guardrail helper for tests — pose authority must name Ref 2. */
export function headlessPromptUsesPoseRef2(prompt: string): boolean {
  return (
    prompt.includes(
      `Reference Image ${HEADLESS_STAGE1_POSE_REF} is the Pose Master visual geometry`,
    ) || !/Reference Image [4-9] is the Pose Master/.test(prompt)
  );
}

/** Guardrail helper — no phantom/unattached reference claims. */
export function headlessPromptAvoidsPhantomImageRefs(
  prompt: string,
  hasFurnitureReference: boolean,
): boolean {
  return !headlessPromptClaimsUnattachedReference(prompt, hasFurnitureReference);
}
