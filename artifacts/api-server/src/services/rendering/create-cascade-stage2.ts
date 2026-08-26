// ---------------------------------------------------------------------------
// Production Create — Stage-2 (Nano Regular) face-identity packaging
//
// NOT Enhance Model Face. NOT a separate Create / credit transaction.
//
// Stage-1 image = finished photograph to edit in place (master image)
// Studio Talent  = facial identity authority only
// No garment refs, Pose Master, furniture, or Environment on Stage 2.
// ---------------------------------------------------------------------------

export const CREATE_CASCADE_STAGE2_REFERENCE_ORDER = [
  "STAGE1_OUTPUT",
  "TALENT",
] as const;

/**
 * Stage-2 image parts for production Create cascade.
 * Order is binding for assembleCreateStage2FaceIdentityInstruction.
 */
export function buildCreateStage2ImageParts(params: {
  stage1ImageUrl: string;
  talentImageUrl: string;
}): Array<{
  type: "image_url";
  image_url: { url: string; detail: "high" };
}> {
  const toPart = (url: string) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  });

  return [
    toPart(params.stage1ImageUrl),
    toPart(params.talentImageUrl),
  ];
}

/**
 * Stage-2 in-place identity correction instruction.
 * Reference Image 1 = Stage-1 master photograph; Reference Image 2 = Talent face only.
 */
export function assembleCreateStage2FaceIdentityInstruction(): string {
  return [
    "CREATE STAGE 2 — MINIMUM FACE IDENTITY CORRECTION (NOT REGENERATION).",
    "",
    "REFERENCE ROLE ORDER — DO NOT CONFUSE THESE ROLES:",
    "Reference Image 1 = STAGE-1 FINISHED PHOTOGRAPH — the exact master image to edit in place.",
    "Reference Image 1 is sole authority for garment, colour, print/pattern, construction, sleeves, collar, buttons, proportions, length, drape, pose, body, hands, legs, footwear, furniture, furniture placement, lighting, composition, camera framing, and background/scene.",
    "Reference Image 2 = ORIGINAL STUDIO TALENT — sole authority for facial identity only.",
    "",
    "EDIT MODE — TARGETED IN-PLACE CORRECTION ONLY:",
    "You are editing Reference Image 1 in place — like a professional retoucher using Photoshop.",
    "This is NOT a new fashion photograph.",
    "This is NOT a garment try-on.",
    "This is NOT a new pose.",
    "This is NOT a scene re-render.",
    "Preserve the Stage-1 photograph and make only the minimum facial identity adjustment necessary to match Studio Talent.",
    "",
    "IDENTITY (Reference Image 2 — facial authority only):",
    "Match facial identity, facial geometry, skin tone, and recognizable identity characteristics from Reference Image 2.",
    "Do NOT reinterpret ethnicity or nationality.",
    "Do NOT replace the person with a different person.",
    "Do NOT beautify, stylize, or smooth/retouch the face excessively.",
    "Do NOT change age appearance.",
    "Do NOT reconstruct the hairstyle unless absolutely necessary for identity matching.",
    "Do NOT redesign the person.",
    "Do NOT alter body proportions.",
    "",
    "PRESERVE FROM REFERENCE IMAGE 1 — PIXEL-IDENTICAL EXCEPT MINIMUM FACE IDENTITY:",
    "Garment exactly as rendered — colour, print/pattern, construction, sleeves, collar, buttons, proportions, length, and drape.",
    "Pose, body, hands, legs, and footwear.",
    "Furniture and furniture placement.",
    "Lighting, composition, camera framing, and background/scene.",
    "",
    "CRITICAL CONSTRAINTS:",
    "Do NOT attach or invent a Pose Master.",
    "Do NOT select new furniture.",
    "Do NOT copy furniture from any pose illustration.",
    "Do NOT improve or change the pose.",
    "Do NOT redesign clothing.",
    "Do NOT change composition or environment.",
    "Do NOT use any garment reference — garment fidelity comes only from Reference Image 1.",
    "Use Reference Image 1 as the visual master.",
    "Use Reference Image 2 only as facial identity authority.",
  ].join("\n");
}

/** Semantic roles for Stage-2 evidence (no URLs / bytes). */
export function resolveCreateStage2ImagePartRoles(): Array<
  "STAGE1_OUTPUT" | "TALENT"
> {
  return ["STAGE1_OUTPUT", "TALENT"];
}
