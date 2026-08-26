// ---------------------------------------------------------------------------
// StudioLayer AI — FLUX.2 Max request helpers (DORMANT)
//
// NOT an active production Create engine.
// Production Create uses OR_RENDER_ENGINE=flash | nano_pro only.
// isFluxMaxEngine() is always false — these helpers are retained for
// experimental / historical reference and unit tests of the request shape.
// ---------------------------------------------------------------------------
//
// OpenRouter Images API (live capability for black-forest-labs/flux.2-max):
//   POST /api/v1/images
//   Supported: aspect_ratio, output_format, n, input_references, seed
//   First fidelity QA: aspect_ratio "3:4" (advertised portrait; not 4:5).
//   Do NOT send size / width / height (not in live capability response).
//
// Does NOT reuse Nano Regular chat prompt stack or Nano Pro authority assembler.
// ---------------------------------------------------------------------------

/**
 * Verified OpenRouter model slug (Images API discovery / llms.txt, Aug 2026).
 */
export const FLUX_MAX_OPENROUTER_MODEL = "black-forest-labs/flux.2-max" as const;

/**
 * OpenRouter-advertised portrait aspect for first fidelity QA.
 * Live enum includes 3:4; does NOT include 4:5.
 */
export const FLUX_MAX_OPENROUTER_ASPECT_RATIO = "3:4" as const;

export type FluxMaxResolutionMapping = {
  studioUiResolution: "2K" | "4K";
  aspect_ratio: typeof FLUX_MAX_OPENROUTER_ASPECT_RATIO;
  /** Not sent — unsupported on live OpenRouter flux.2-max capability. */
  size: null;
  note: string;
};

/**
 * Map StudioLayer UI resolution → FLUX OpenRouter fields for fidelity QA.
 * UI 2K/4K unchanged; OpenRouter request uses advertised aspect_ratio only.
 */
export function mapStudioResolutionToFluxMax(
  studioUiResolution: "2K" | "4K",
): FluxMaxResolutionMapping {
  return {
    studioUiResolution,
    aspect_ratio: FLUX_MAX_OPENROUTER_ASPECT_RATIO,
    size: null,
    note:
      "Fidelity-only OpenRouter QA: aspect_ratio 3:4 (live capability). " +
      "size/width/height omitted (unsupported). Exact 4:5 deferred. " +
      "Studio UI resolution options unchanged.",
  };
}

/**
 * Explicit reference-role mapping for FLUX.2 Max (1-indexed OpenRouter refs).
 * Standard Create: GARMENT → TALENT → POSE_MASTER.
 */
export function buildFluxMaxReferenceRoleMapping(params: {
  garmentImageCount: number;
  talentImageCount: number;
  hasPoseReference: boolean;
}): string {
  const garmentCount = Math.max(1, params.garmentImageCount);
  const talentCount = Math.max(1, params.talentImageCount);
  const lines: string[] = ["REFERENCE IMAGE ROLES:"];

  for (let i = 0; i < garmentCount; i++) {
    const n = i + 1;
    lines.push(
      i === 0
        ? `Reference Image ${n} = GARMENT SOURCE.`
        : `Reference Image ${n} = GARMENT SOURCE (additional garment evidence).`,
    );
  }

  const talentStart = garmentCount + 1;
  for (let i = 0; i < talentCount; i++) {
    const n = talentStart + i;
    lines.push(
      i === 0
        ? `Reference Image ${n} = STUDIO TALENT / SUBJECT IDENTITY.`
        : `Reference Image ${n} = STUDIO TALENT / SUBJECT IDENTITY (same person).`,
    );
  }

  if (params.hasPoseReference) {
    const poseN = garmentCount + talentCount + 1;
    lines.push(
      `Reference Image ${poseN} = POSE MASTER / BODY POSE AND ACTION GEOMETRY.`,
    );
  }

  return lines.join("\n");
}

function buildFluxMaxEnvironmentLine(
  locationEnvironment?: string | null,
): string {
  const key = (locationEnvironment ?? "photo_studio").trim() || "photo_studio";
  if (key === "white_studio") {
    return "ENVIRONMENT: Pure white seamless studio background. No lifestyle scenery.";
  }
  if (key === "grey_gradient_studio") {
    return "ENVIRONMENT: Neutral grey gradient studio background. No lifestyle scenery.";
  }
  if (key === "photo_studio") {
    return "ENVIRONMENT: Controlled professional fashion photo studio.";
  }
  return `ENVIRONMENT: Follow StudioLayer location context "${key}" when compatible with commercial fashion photography; do not invent unrelated scenes.`;
}

/**
 * Concise FLUX-native Create prompt — not Nano Regular / Nano Pro stacks.
 */
export function assembleFluxMaxImagesApiPrompt(params: {
  garmentImageCount: number;
  talentImageCount: number;
  hasPoseReference: boolean;
  locationEnvironment?: string | null;
  /** Per-shot creative brief from the normal Create pipeline (optional). */
  creativeShotPrompt?: string;
}): string {
  const roleMap = buildFluxMaxReferenceRoleMapping({
    garmentImageCount: params.garmentImageCount,
    talentImageCount: params.talentImageCount,
    hasPoseReference: params.hasPoseReference,
  });

  const contract = `TASK — StudioLayer fashion Create:
The Studio Talent (Reference Image for STUDIO TALENT) is the sole identity authority — preserve face identity, skin tone, hair, and body proportions.
The garment reference is the sole garment-product authority — reproduce construction, colour, material character, and as-worn state exactly. Ignore hanger/background in the garment reference.
${params.hasPoseReference
    ? "Pose Master controls pose / body action / geometry only. Do not copy identity, facial features, garment design, furniture design, or illustration style from the Pose Master."
    : "Use a natural commercial fashion pose consistent with the shoot direction."}
Produce professional commercial / e-commerce fashion photography with natural anatomy, believable drape, and clean studio presentation.
Do not invent logos, embroidery, pockets, or construction absent from the garment reference.`;

  const env = buildFluxMaxEnvironmentLine(params.locationEnvironment);
  const creative = params.creativeShotPrompt?.trim();

  return [
    roleMap,
    contract,
    env,
    creative
      ? `STUDIO LAYER SHOOT DIRECTION:\n${creative}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type FluxMaxImagesApiRequestBody = {
  model: typeof FLUX_MAX_OPENROUTER_MODEL | string;
  prompt: string;
  n: 1;
  aspect_ratio: typeof FLUX_MAX_OPENROUTER_ASPECT_RATIO;
  output_format: "jpeg";
  input_references: Array<{
    type: "image_url";
    image_url: { url: string };
  }>;
};

/**
 * Map chat-style image parts → FLUX Images API input_references.
 * Schema: `{ type, image_url: { url } }` only — no `detail`, no roles/weights.
 */
export function mapImagePartsToFluxMaxInputReferences(
  imageContent: ReadonlyArray<{
    type: "image_url";
    image_url: { url: string; detail?: string };
  }>,
): FluxMaxImagesApiRequestBody["input_references"] {
  return imageContent.map((part) => ({
    type: "image_url" as const,
    image_url: { url: part.image_url.url },
  }));
}

/**
 * Build the OpenRouter Images API body for FLUX.2 Max Create (fidelity QA).
 * Sends aspect_ratio 3:4 only. Omits size / width / height / resolution.
 */
export function buildFluxMaxImagesApiRequestBody(params: {
  model?: string;
  prompt: string;
  input_references: FluxMaxImagesApiRequestBody["input_references"];
  studioUiResolution?: "2K" | "4K";
}): {
  body: FluxMaxImagesApiRequestBody;
  resolutionMapping: FluxMaxResolutionMapping;
  api: "POST /api/v1/images";
  endpointPath: "/images";
} {
  const resolutionMapping = mapStudioResolutionToFluxMax(
    params.studioUiResolution ?? "2K",
  );
  return {
    api: "POST /api/v1/images",
    endpointPath: "/images",
    resolutionMapping,
    body: {
      model: params.model ?? FLUX_MAX_OPENROUTER_MODEL,
      prompt: params.prompt,
      n: 1,
      aspect_ratio: resolutionMapping.aspect_ratio,
      output_format: "jpeg",
      input_references: params.input_references,
    },
  };
}

/** Reference-order labels for forensics / tests (standard Create). */
export const FLUX_MAX_STANDARD_REFERENCE_ORDER = [
  "GARMENT",
  "TALENT",
  "POSE_MASTER",
] as const;
