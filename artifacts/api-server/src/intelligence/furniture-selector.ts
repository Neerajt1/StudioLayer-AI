// ---------------------------------------------------------------------------
// Global furniture selector — appearance source + pose-compatible filtering.
//
// Quality is a function of material, craftsmanship and refined proportion.
// It is NEVER a function of bulk, and dark upholstery is not a prerequisite.
// Furniture never becomes Pose Master / pose / viewpoint authority.
// ---------------------------------------------------------------------------

import {
  FURNITURE_CATALOG,
  FURNITURE_USER_COOLDOWN,
  getFurnitureAsset,
  isDarkOnDark,
  isFurnitureDeprecated,
  isSelectableFurniture,
  listFurnitureForCategory,
  propToFurnitureCategory,
  type FurnitureAsset,
  type FurnitureCategory,
  type FurnitureFamily,
} from "./furniture-catalog";
import {
  deriveSupportContactClass,
  deriveSupportSpatialRelation,
  requiresEdgeCapableSeat,
  seatProfileCompatibilityScore,
  supportClassPromptLabel,
  type SupportContactClass,
  type SupportSpatialRelation,
} from "./furniture-support";
import {
  isUnknownGarmentTone,
  type GarmentTone,
} from "./garment-tone";
import type { PoseDefinition } from "./pose-vocabulary-types";
import { hasFurnitureReferenceImage } from "../rendering/furniture-reference-backend.js";
import { FURNITURE_REFERENCE_DEFERRED_APPEARANCE_LINE } from "../rendering/furniture-reference-appearance-authority.js";

export interface FurnitureUsageRecord {
  furnitureAssetId: string;
  furnitureFamily: FurnitureFamily | string;
  /** Sequence among successful furniture-bearing generations (0 = most recent). */
  index: number;
}

export interface SelectFurnitureInput {
  prop: string | null | undefined;
  /** Pose definition (or subset) for support-contact class derivation. */
  pose?: Pick<
    PoseDefinition,
    "prop" | "bodyState" | "bodyGeometry" | "description"
  > | null;
  /** Explicit support class override (tests). */
  supportClass?: SupportContactClass | null;
  /**
   * Optional tonal complement signal derived from the analysed garment.
   * Absent / unknown reproduces pre-garment-aware behaviour exactly.
   */
  garmentTone?: GarmentTone | null;
  /** Successful furniture-bearing history for THIS user (most recent first). */
  userHistory?: FurnitureUsageRecord[];
  /** Exact asset IDs already chosen in this batch. */
  excludeAssetIdsInBatch?: string[];
  /** Soft family diversity within this batch. */
  excludeFamiliesInBatch?: string[];
  /**
   * Deterministic diversity salt (pose id + slot + history length, etc.).
   * Must NOT permanently bind one pose ID to one asset when alternatives exist.
   */
  seed?: number;
  /** Cooldown window — default 100. */
  cooldown?: number;
}

export interface FurnitureSelectionResult {
  asset: FurnitureAsset;
  supportClass: SupportContactClass | null;
  spatialRelation: SupportSpatialRelation | null;
  reason: string;
}

/** Soft upper bound for furniture prompt layer length (chars). */
export const FURNITURE_PROMPT_MAX_CHARS = 900;

/**
 * Score band width for controlled editorial variation among top assets.
 * Sized for the 0–87 earned-score model below.
 */
export const FURNITURE_TOP_BAND = 6;

function hashSeed(seed: number | string | undefined): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? "furniture");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Controlled diversity seed — pose-compatible, not pose-locked.
 * Incorporates history length so consecutive generations of the same pose
 * rotate among premium assets when alternatives exist.
 */
export function furnitureDiversitySeed(input: {
  poseIdOrName?: string;
  slotIndex?: number;
  historyLength?: number;
  extraSalt?: number;
}): number {
  const pose = String(input.poseIdOrName ?? "furniture");
  let poseHash = 0;
  for (let i = 0; i < pose.length; i++) {
    poseHash = (poseHash + pose.charCodeAt(i) * (i + 1)) % 9973;
  }
  const slot = input.slotIndex ?? 0;
  const hist = input.historyLength ?? 0;
  const extra = input.extraSalt ?? 0;
  return poseHash + slot * 31 + hist * 17 + extra * 13;
}

function recentFamilyCounts(
  history: FurnitureUsageRecord[],
  window: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of history.slice(0, window)) {
    counts.set(row.furnitureFamily, (counts.get(row.furnitureFamily) ?? 0) + 1);
  }
  return counts;
}

/**
 * Soft-penalize recently used exact assets (within a short window) for rotation.
 * Same window and tiering as before, rescaled for the 0–87 quality range so
 * history can refine the choice without outranking furniture quality.
 */
function recentAssetPenalty(
  assetId: string,
  history: FurnitureUsageRecord[],
): number {
  let penalty = 0;
  for (const row of history.slice(0, 8)) {
    if (row.furnitureAssetId !== assetId) continue;
    if (row.index <= 2) penalty += 20;
    else if (row.index <= 5) penalty += 12;
    else penalty += 5;
  }
  return penalty;
}

// ---------------------------------------------------------------------------
// Quality components. Each returns a bounded, independently readable value.
// ---------------------------------------------------------------------------

/**
 * Pose/support suitability (roughly -31..25).
 *
 * furniture-support.ts owns the semantics; this only rescales its established
 * -55..45 range onto the new model. Ordering and relative weight are unchanged.
 */
export function supportSuitabilityScore(
  asset: FurnitureAsset,
  supportClass: SupportContactClass | null,
): number {
  const raw = seatProfileCompatibilityScore(asset.seatProfile, supportClass);
  let score = Math.round(raw * (25 / 45));
  if (requiresEdgeCapableSeat(supportClass) && asset.seatProfile === "deep_lounge") {
    score -= 22;
  }
  return score;
}

/** Material and construction (15..30 for pool-eligible assets). */
export function materialCraftScore(asset: FurnitureAsset): number {
  const materialBonus =
    asset.materialClass === "solid_timber"
      ? 5
      : asset.materialClass === "timber_with_leather"
        ? 3
        : 2;
  return asset.craftQuality * 5 + materialBonus;
}

/** Restraint and proportion of the silhouette (4..20). */
export function silhouetteRefinementScore(asset: FurnitureAsset): number {
  return asset.silhouetteRefinement * 4;
}

/**
 * Scale (-12..0). Never positive.
 *
 * `generous` is only free when the pose genuinely calls for a lounge-scaled
 * piece. Nothing here rewards bulk.
 */
export function scaleScore(
  asset: FurnitureAsset,
  supportClass: SupportContactClass | null,
): number {
  if (asset.scale !== "generous") return 0;
  const loungeAppropriate =
    asset.seatProfile === "deep_lounge" &&
    (supportClass === "deep_seated" || supportClass === "reclined_seated");
  return loungeAppropriate ? 0 : -12;
}

/**
 * Tonal pairing (2..12), derived from woodTone x seatTreatment.
 *
 * Bare timber and light-neutral seats are the preferred house directions.
 * Dark-on-dark remains allowed and positive — it is simply no longer the
 * structural precondition for a premium score.
 */
export function tonalPairingScore(asset: FurnitureAsset): number {
  switch (asset.seatTreatment) {
    case "bare_timber":
      return 12;
    case "light_neutral":
      return 12;
    case "warm_mid":
      return asset.woodTone === "dark" ? 5 : 8;
    case "dark":
      return asset.woodTone === "dark" ? 2 : 6;
  }
}

/** Decoration penalty (-8..0). `decorative` is filtered out before scoring. */
export function ornamentationScore(asset: FurnitureAsset): number {
  return asset.ornamentation === "minimal" ? -8 : 0;
}

/** Hard ceiling on how far garment tone may move a decision. */
export const MAX_GARMENT_TONE_SCORE = 8;

/**
 * Tonal COMPLEMENT between the garment and the furniture (0..8).
 *
 * This is deliberately not colour matching. Rich warm timber is the strongest
 * answer to both dark and light garments, because the goal is a balanced
 * editorial image rather than a furniture piece that agrees with the clothing.
 * Nothing here is negative: furniture is never punished for failing to match a
 * colour, only rewarded for complementing it.
 *
 * Depth is the primary signal. Temperature refines it, and stands in as a
 * weaker fallback when depth could not be established.
 */
export function garmentToneScore(
  asset: FurnitureAsset,
  tone: GarmentTone | null | undefined,
): number {
  if (!tone || isUnknownGarmentTone(tone)) return 0;

  const { woodTone: wood, seatTreatment: seat } = asset;
  let score = 0;

  if (tone.depth === "dark") {
    // Warm timber and light seats lift a dark garment off the frame.
    if (wood === "warm_medium") {
      score = seat === "light_neutral" ? 8 : seat === "bare_timber" ? 7 : seat === "warm_mid" ? 5 : 3;
    } else if (wood === "light_natural") {
      score = seat === "dark" ? 3 : seat === "warm_mid" ? 4 : 5;
    } else {
      score = seat === "light_neutral" ? 5 : seat === "dark" ? 1 : 3;
    }
  } else if (tone.depth === "light") {
    // Rich timber grounds a light garment; pale-on-pale is not rewarded.
    if (wood === "warm_medium") {
      score = seat === "bare_timber" ? 8 : seat === "dark" ? 5 : 6;
    } else if (wood === "dark") {
      score = seat === "light_neutral" ? 7 : seat === "dark" ? 2 : 5;
    } else {
      score = seat === "dark" ? 3 : 4;
    }
  } else if (tone.depth === "mid") {
    // No aggressive contrast requirement — reward balance.
    if (wood === "warm_medium") {
      score = seat === "dark" ? 4 : seat === "warm_mid" ? 6 : 7;
    } else if (wood === "dark") {
      score = seat === "light_neutral" ? 6 : seat === "dark" ? 2 : 4;
    } else {
      score = seat === "dark" ? 3 : seat === "warm_mid" ? 4 : 5;
    }
  } else if (tone.temperature === "warm") {
    score = wood === "warm_medium" ? 4 : wood === "light_natural" ? 3 : 1;
  } else if (tone.temperature === "cool") {
    // Warm timber against a cool garment is a deliberate complement, not a clash.
    score = wood === "warm_medium" ? 4 : wood === "light_natural" ? 3 : 2;
  } else if (tone.temperature === "neutral") {
    score =
      wood === "dark" ? (seat === "light_neutral" ? 3 : 1) : 3;
  }

  // Secondary refinement: a cool garment gains a little more from warm timber.
  if (
    tone.depth !== "unknown" &&
    tone.temperature === "cool" &&
    (wood === "warm_medium" || wood === "light_natural")
  ) {
    score += 1;
  }

  return Math.max(0, Math.min(MAX_GARMENT_TONE_SCORE, score));
}

function scoreAsset(
  asset: FurnitureAsset,
  input: {
    batchExcludeFamilies: Set<string>;
    garmentTone: GarmentTone | null;
    recentFamilies: Map<string, number>;
    supportClass: SupportContactClass | null;
    userHistory: FurnitureUsageRecord[];
  },
): number {
  // Earned quality — the whole ranking, in the intended priority order.
  // Garment tone sits BELOW material, refinement and support on purpose: it
  // resolves close decisions between good pieces, it never promotes a weaker one.
  let score =
    supportSuitabilityScore(asset, input.supportClass) +
    materialCraftScore(asset) +
    silhouetteRefinementScore(asset) +
    scaleScore(asset, input.supportClass) +
    tonalPairingScore(asset) +
    ornamentationScore(asset) +
    garmentToneScore(asset, input.garmentTone);

  // History / diversity — subtractive only, and deliberately weaker than quality.
  score -= (input.recentFamilies.get(asset.family) ?? 0) * 6;
  if (input.batchExcludeFamilies.has(asset.family)) score -= 10;
  score -= recentAssetPenalty(asset.id, input.userHistory);

  return score;
}

/**
 * Select furniture for a furniture-bearing shot.
 * Primary: pose suitability + material/craftsmanship + refined silhouette.
 * Secondary: appropriate scale, tonal balance, family diversity, cooldown.
 */
export function selectFurnitureAsset(
  input: SelectFurnitureInput,
): FurnitureSelectionResult | null {
  const category = propToFurnitureCategory(input.prop);
  if (!category) return null;

  const supportClass =
    input.supportClass !== undefined
      ? input.supportClass
      : input.pose
        ? deriveSupportContactClass(input.pose)
        : null;

  const spatialRelation = input.pose
    ? deriveSupportSpatialRelation(input.pose)
    : null;

  const cooldown = input.cooldown ?? FURNITURE_USER_COOLDOWN;
  const history = input.userHistory ?? [];
  const cooledOutIds = new Set(
    history.slice(0, cooldown).map((row) => row.furnitureAssetId),
  );
  const batchExcludeIds = new Set(input.excludeAssetIdsInBatch ?? []);
  const batchExcludeFamilies = new Set(input.excludeFamiliesInBatch ?? []);
  const recentFamilies = recentFamilyCounts(history, Math.min(12, cooldown));

  // Pool is already free of deprecated / decorative / sub-floor-craft assets.
  // Reference-backed only: selectable assets without a loadable product reference
  // are excluded globally — text-only furniture is not an acceptable substitute.
  const pool = listFurnitureForCategory(category).filter((asset) =>
    hasFurnitureReferenceImage(asset.id),
  );
  const scoreOpts = {
    batchExcludeFamilies,
    garmentTone: input.garmentTone ?? null,
    recentFamilies,
    supportClass,
    userHistory: history,
  };

  const rank = (assets: FurnitureAsset[]) =>
    assets
      .map((asset) => ({ asset, score: scoreAsset(asset, scoreOpts) }))
      .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));

  let scored = rank(
    pool.filter(
      (asset) => !cooledOutIds.has(asset.id) && !batchExcludeIds.has(asset.id),
    ),
  );

  // Support narrowing only. There is deliberately no tonal narrowing here —
  // tone is expressed as a score, never as a gate.
  if (requiresEdgeCapableSeat(supportClass)) {
    const edgeCapable = scored.filter(
      (row) => row.asset.seatProfile !== "deep_lounge",
    );
    if (edgeCapable.length > 0) scored = edgeCapable;
  }

  // Fallback relaxes the cooldown ONLY. Deprecation, ornamentation and the
  // craft floor are quality guarantees and are never relaxed.
  const effective =
    scored.length > 0
      ? scored
      : rank(pool.filter((asset) => !batchExcludeIds.has(asset.id)));

  if (effective.length === 0) return null;

  const topScore = effective[0]!.score;
  const topBand = effective.filter(
    (row) => row.score >= topScore - FURNITURE_TOP_BAND,
  );
  const pick = topBand[hashSeed(input.seed) % topBand.length]!;

  const resolvedSpatial =
    spatialRelation ??
    (supportClass
      ? {
          contactClass: supportClass,
          contactZone: "as_demonstrated" as const,
          bodyAxis: "unspecified" as const,
          requiresFrontEdgeLoad: false,
          promptHint: supportClassPromptLabel(supportClass),
        }
      : null);

  return {
    asset: pick.asset,
    supportClass,
    spatialRelation: resolvedSpatial,
    reason: `category=${category}; support=${supportClass ?? "none"}; zone=${resolvedSpatial?.contactZone ?? "n/a"}; seatProfile=${pick.asset.seatProfile}; scale=${pick.asset.scale}; wood=${pick.asset.woodTone}; seat=${pick.asset.seatTreatment}; craft=${pick.asset.craftQuality}; refinement=${pick.asset.silhouetteRefinement}; ornament=${pick.asset.ornamentation}; garmentTone=${input.garmentTone ? `${input.garmentTone.depth}/${input.garmentTone.temperature}` : "none"}; score=${pick.score}`,
  };
}

/** Whether a pose prop requires furniture selection. */
export function poseRequiresFurnitureSelection(
  prop: string | null | undefined,
): boolean {
  return propToFurnitureCategory(prop) != null;
}

/**
 * Furniture prompt contract for prop-bearing poses.
 * Selection / scoring / cooldown / diversity stay upstream.
 *
 * Describes furniture through material, construction and finish — never
 * through bulk. The word "Substantial" is deliberately absent.
 */
const FURNITURE_QUALITY_FLOOR = `Real furniture, honestly made: solid hardwood — walnut, natural or dark oak, warm timber — with refined proportions and a matte to low-satin finish showing true grain. No gloss or CGI sheen.
Restrained and understated. No carving, tufting, baroque or antique styling, no rustic farmhouse, no office or cafeteria furniture, no plastic or moulded forms.
Do not copy furniture design from the Pose Master — Pose Master controls body pose and the body-to-support relationship only; furniture appearance follows this instruction.`;

/**
 * `supportClass` and `spatialRelation` are accepted but intentionally NOT
 * composed into the layer.
 *
 * Pose Master isolation: this layer carries furniture appearance only and must
 * never restate pose geometry, contact zones or body axis — furniture-support's
 * promptHint is pose authority and belongs to the pose layer. The parameters
 * remain in the signature because call sites outside this module (including the
 * frozen identity trial) pass them positionally.
 */
export function buildFurniturePromptLayer(
  asset: FurnitureAsset,
  _supportClass?: SupportContactClass | null,
  _spatialRelation?: SupportSpatialRelation | null,
  poseId?: string | null,
): string {
  const typeLabel = asset.category === "block" ? "block/step" : asset.category;

  // Reference-backed production path: appearance lives in the multimodal
  // furniture reference + FURNITURE REFERENCE AUTHORITY — not catalogue prose.
  if (hasFurnitureReferenceImage(asset.id)) {
    return [
      "FURNITURE:",
      `A ${typeLabel} must be present as required by this pose.`,
      FURNITURE_REFERENCE_DEFERRED_APPEARANCE_LINE,
      "Preserve the pose's body-to-support relationship.",
    ].join("\n");
  }

  const description = asset.promptDescription.trim();
  const selectedLine = description ? `Selected piece: ${description}` : null;

  if (poseId === "Pose68") {
    return [
      "FURNITURE:",
      "A tall stool must be present and must physically support the body lean required by this pose.",
      "Do not omit the stool or convert this into a freestanding profile.",
      selectedLine,
      FURNITURE_QUALITY_FLOOR,
      "Preserve the pose's body-to-support relationship.",
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }

  return [
    "FURNITURE:",
    `A ${typeLabel} must be present as required by this pose.`,
    selectedLine,
    FURNITURE_QUALITY_FLOOR,
    "Preserve the pose's body-to-support relationship.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/**
 * Global garment-fidelity closer — short pointer to primary GARMENT AUTHORITY SoT.
 * A/B VARIANT: full FINAL GARMENT FIDELITY prose consolidated into GARMENT_AUTHORITY_SOT.
 */
export function buildGarmentFidelityCloser(): string {
  return `GARMENT AUTHORITY REMINDER:
Apply GARMENT AUTHORITY — REFERENCE IMAGE 1 from the primary instruction. Ref1 remains binding for construction, as-worn state, material character, and colour. Pose-induced folds are additive only — do not redesign, smooth, or genericize the garment.`;
}

/**
 * Decoration-led styling vocabulary.
 *
 * AUTHORING GUARD ONLY — this regex is never the runtime selection mechanism.
 * Runtime behaviour depends solely on the declared `ornamentation` field; the
 * pattern exists to catch an asset whose text describes carving/tufting while
 * claiming `ornamentation: "none"`.
 */
export const ORNAMENT_LED_PATTERN =
  /\b(ornate|carved|carving|openwork|baroque|antique|tufted|tufting|nailhead|cabriole|scrolled|rolled arms|wingback|club armchair)\b/i;

export function assetIsOrnamentLed(asset: FurnitureAsset): boolean {
  return ORNAMENT_LED_PATTERN.test(
    `${asset.label} ${asset.silhouette} ${asset.materialSummary} ${asset.promptDescription}`,
  );
}

/** Maximum share of ACTIVE assets in a category that may be dark-on-dark. */
export const MAX_DARK_ON_DARK_SHARE = 0.5;

export function assertFurnitureCatalogQualityInvariants(): void {
  for (const asset of FURNITURE_CATALOG) {
    if (!asset.seatProfile) {
      throw new Error(`Catalog asset missing seatProfile: ${asset.id}`);
    }
    if (
      asset.craftQuality == null ||
      asset.craftQuality < 1 ||
      asset.craftQuality > 5
    ) {
      throw new Error(`Catalog asset missing craftQuality 1–5: ${asset.id}`);
    }
    if (
      asset.silhouetteRefinement == null ||
      asset.silhouetteRefinement < 1 ||
      asset.silhouetteRefinement > 5
    ) {
      throw new Error(
        `Catalog asset missing silhouetteRefinement 1–5: ${asset.id}`,
      );
    }
    // Bulk is never a quality claim, so no description may lead with it.
    if (/substantial/i.test(asset.promptDescription)) {
      throw new Error(
        `Catalog promptDescription must not describe the piece as substantial: ${asset.id}`,
      );
    }
    // Authoring guard — declared ornamentation must match the described piece.
    if (assetIsOrnamentLed(asset) && asset.ornamentation === "none") {
      throw new Error(
        `Asset text describes ornamentation but declares ornamentation "none": ${asset.id}`,
      );
    }
    if (isSelectableFurniture(asset) && asset.ornamentation === "decorative") {
      throw new Error(`Decorative asset must not be selectable: ${asset.id}`);
    }
  }

  // Historical ids must keep resolving forever, including deprecated ones.
  if (!getFurnitureAsset("furn_chair_wingback_cognac_leather")) {
    throw new Error("Expected historical wingback asset missing from catalog");
  }

  const activeChairs = listFurnitureForCategory("chair");
  const edgeCapable = activeChairs.filter(
    (a) => a.seatProfile === "edge_capable",
  );
  if (edgeCapable.length < 3) {
    throw new Error(
      `Need multiple active edge_capable chairs (found ${edgeCapable.length})`,
    );
  }
  // Deep-lounge poses must keep more than one live option so deprecation
  // passes can never collapse them onto a single fixed asset.
  const activeDeepLounge = activeChairs.filter(
    (a) => a.seatProfile === "deep_lounge",
  );
  if (activeDeepLounge.length < 2) {
    throw new Error(
      `Need at least 2 active deep_lounge chairs (found ${activeDeepLounge.length})`,
    );
  }

  // Dark-on-dark is allowed but must never dominate a category. This is a
  // curation guarantee, not a runtime scoring rule.
  for (const category of ["chair", "stool", "block"] as const) {
    const active = listFurnitureForCategory(category);
    if (active.length === 0) {
      throw new Error(`Category has no active furniture: ${category}`);
    }
    const darkOnDark = active.filter(isDarkOnDark).length;
    if (darkOnDark > active.length * MAX_DARK_ON_DARK_SHARE) {
      throw new Error(
        `Category ${category} is ${darkOnDark}/${active.length} dark-on-dark — exceeds ${MAX_DARK_ON_DARK_SHARE * 100}%`,
      );
    }
  }
}

export { isFurnitureDeprecated };
export type { FurnitureCategory, SupportContactClass, SupportSpatialRelation };
