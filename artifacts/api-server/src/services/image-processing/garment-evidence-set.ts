// ---------------------------------------------------------------------------
// StudioLayer AI — Garment Evidence Mode (A/B experiment)
//
// GARMENT_EVIDENCE_MODE=sheet|separate (default: sheet)
//
// sheet    — Front remains primary Ref 1; composed multi-view sheet is
//            supplemental when Back/Detail are present
// separate — Front / Back / Detail as independent image_url parts when
//            Back and/or Detail are supplied; Front-only unchanged
// ---------------------------------------------------------------------------

export type GarmentEvidenceMode = "sheet" | "separate";

/** Default production behaviour — sheet packaging when Back/Detail present. */
export const DEFAULT_GARMENT_EVIDENCE_MODE: GarmentEvidenceMode = "sheet";

/**
 * Resolves the garment evidence packaging mode from env.
 * Unknown / missing values fall back to sheet.
 */
export function resolveGarmentEvidenceMode(
  raw: string | undefined = process.env["GARMENT_EVIDENCE_MODE"],
): GarmentEvidenceMode {
  const normalized = raw?.trim().toLowerCase();
  return normalized === "separate" ? "separate" : "sheet";
}

export type GarmentEvidenceSetRoles = {
  hasBack: boolean;
  hasDetail: boolean;
  hasPose: boolean;
  /** Sheet packaging with Front primary + supplemental composed sheet. */
  hasSupplementalSheet?: boolean;
};

export type GarmentEvidenceSetLayout = {
  /** 1-based OpenRouter reference indices matching image array order. */
  frontRef: number;
  /** Supplemental multi-view sheet (after Front) when Front remains primary. */
  sheetRef?: number;
  backRef?: number;
  detailRef?: number;
  talentRef: number;
  poseRef?: number;
  /** Compact mapping block for dynamic Ref numbering. */
  mappingInstruction: string;
};

/**
 * Builds dynamic Reference Image numbering for garment evidence paths.
 * Image order:
 *   sheet+supplemental: Front → Sheet → Talent → Pose?
 *   separate: Front → Back? → Detail? → Talent → Pose?
 */
export function buildGarmentEvidenceSetLayout(
  roles: GarmentEvidenceSetRoles,
): GarmentEvidenceSetLayout {
  let next = 1;
  const frontRef = next++;
  const sheetRef = roles.hasSupplementalSheet ? next++ : undefined;
  const backRef =
    !roles.hasSupplementalSheet && roles.hasBack ? next++ : undefined;
  const detailRef =
    !roles.hasSupplementalSheet && roles.hasDetail ? next++ : undefined;
  const talentRef = next++;
  const poseRef = roles.hasPose ? next++ : undefined;

  const lines: string[] = [
    "GARMENT EVIDENCE SET:",
    `Reference Image ${frontRef} = Garment Front (PRIMARY visual/construction authority for the uploaded garment).`,
  ];
  if (sheetRef != null) {
    lines.push(
      `Reference Image ${sheetRef} = Supplemental multi-view garment sheet (Back/Detail panels) — supports Front; must never replace Reference Image ${frontRef} for front construction.`,
    );
  }
  if (backRef != null) {
    lines.push(
      `Reference Image ${backRef} = Garment Back (authoritative evidence for the Back surface).`,
    );
  }
  if (detailRef != null) {
    lines.push(
      `Reference Image ${detailRef} = Garment Detail (authoritative evidence for the supplied detail).`,
    );
  }
  lines.push(
    `Reference Image ${talentRef} = Talent (identity/body context only — NOT garment construction or decoration evidence).`,
  );
  if (poseRef != null) {
    lines.push(
      `Reference Image ${poseRef} = Pose Master visual reference (pose/action direction only).`,
    );
  }
  lines.push(
    "All supplied garment references represent the SAME physical garment.",
    "Use each garment reference for the surface or view it actually represents.",
    "Do not transfer a feature from one observed surface to another merely because it appears elsewhere.",
    "Do not redesign or substitute garment construction based on a common or popular category interpretation — reproduce only what the uploaded garment evidence shows.",
  );

  return {
    frontRef,
    sheetRef,
    backRef,
    detailRef,
    talentRef,
    poseRef,
    mappingInstruction: lines.join(" "),
  };
}

/**
 * Retargets hardcoded "Reference Image 2 = model" language in the garment
 * fidelity contract when Talent is not Ref 2 (extra garment evidence precedes Talent).
 * Does not rewrite the fidelity body — only renumbers the human-model references.
 */
export function retargetGarmentInstructionTalentReferences(
  garmentInstruction: string,
  talentReferenceImageNumber: number,
): string {
  if (talentReferenceImageNumber === 2) {
    return garmentInstruction;
  }
  const talentLabel = `Reference Image ${talentReferenceImageNumber}`;
  return garmentInstruction
    .replaceAll(
      "Reference Image 2 is the human model.",
      `${talentLabel} is the human model.`,
    )
    .replaceAll(
      "dress the person shown in Reference Image 2 using the exact garment shown in Reference Image 1",
      `dress the person shown in ${talentLabel} using the exact garment shown in Reference Image 1`,
    );
}

/**
 * Remaps creative / pose briefs that assume Ref2=Talent and Ref3=Pose
 * onto the dynamic layout used when extra garment evidence precedes Talent.
 * Replace Pose (3) before Talent (2) to avoid double substitution.
 */
export function remapCreativePromptReferenceNumbers(
  prompt: string,
  layout: Pick<GarmentEvidenceSetLayout, "talentRef" | "poseRef">,
): string {
  if (layout.talentRef === 2 && (layout.poseRef == null || layout.poseRef === 3)) {
    return prompt;
  }
  let next = prompt;
  if (layout.poseRef != null && layout.poseRef !== 3) {
    next = next.replaceAll("Reference Image 3", `Reference Image ${layout.poseRef}`);
  }
  if (layout.talentRef !== 2) {
    next = next.replaceAll("Reference Image 2", `Reference Image ${layout.talentRef}`);
  }
  return next;
}
