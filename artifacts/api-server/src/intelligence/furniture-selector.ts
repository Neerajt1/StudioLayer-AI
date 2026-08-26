// ---------------------------------------------------------------------------
// Global furniture selector — appearance source + pose-compatible filtering.
// Dark frame + light upholstery is NOT dark furniture.
// Furniture never becomes Pose Master / pose / viewpoint authority.
// ---------------------------------------------------------------------------

import {
  FURNITURE_CATALOG,
  FURNITURE_USER_COOLDOWN,
  getFurnitureAsset,
  isFullyDarkFurniture,
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
  textImpliesLightUpholstery,
  type SupportContactClass,
  type SupportSpatialRelation,
} from "./furniture-support";
import type { PoseDefinition } from "./pose-vocabulary-types";

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

/** Score band width for controlled editorial variation among top premium assets. */
export const FURNITURE_TOP_BAND = 18;

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

/** Soft-penalize recently used exact assets (within a short window) for rotation. */
function recentAssetPenalty(
  assetId: string,
  history: FurnitureUsageRecord[],
): number {
  let penalty = 0;
  for (const row of history.slice(0, 8)) {
    if (row.furnitureAssetId !== assetId) continue;
    // Most recent exact reuse is heavily discouraged when alternatives exist.
    if (row.index <= 2) penalty += 55;
    else if (row.index <= 5) penalty += 28;
    else penalty += 12;
  }
  return penalty;
}

/** Asset fails dark aesthetic if metadata or prompt text implies light seat. */
export function assetViolatesDarkAesthetic(asset: FurnitureAsset): boolean {
  if (asset.isLightUpholstery || asset.isLightBrown) return true;
  if (!asset.isDarkPreferred) return true;
  const blob = `${asset.label} ${asset.materialSummary} ${asset.promptDescription}`;
  return textImpliesLightUpholstery(blob);
}

function scoreAsset(
  asset: FurnitureAsset,
  input: {
    cooledOutIds: Set<string>;
    batchExcludeIds: Set<string>;
    batchExcludeFamilies: Set<string>;
    recentFamilies: Map<string, number>;
    supportClass: SupportContactClass | null;
    userHistory: FurnitureUsageRecord[];
  },
): number {
  if (asset.isLightweightOutdoor) return -1e9;
  if (input.cooledOutIds.has(asset.id)) return -1e9;
  if (input.batchExcludeIds.has(asset.id)) return -1e9;

  let score = 100;
  if (asset.visualWeight === "substantial") score += 40;
  else if (asset.visualWeight === "medium") score += 10;
  else score -= 80;

  // Fully dark (frame + seat) preferred; light upholstery hard-penalized.
  if (isFullyDarkFurniture(asset) && !assetViolatesDarkAesthetic(asset)) {
    score += 50;
  } else if (assetViolatesDarkAesthetic(asset)) {
    score -= 120;
  } else if (asset.isDarkPreferred) {
    score += 10;
  }

  if (asset.isLightBrown) score -= 60;
  if (asset.isLightUpholstery) score -= 100;

  // Premium editorial furniture should win over mediocre compatible assets.
  const luxury = asset.editorialLuxuryScore ?? 3;
  score += luxury * 12;
  if (luxury <= 2) score -= 20;
  else if (luxury === 3) score -= 4;

  score += seatProfileCompatibilityScore(asset.seatProfile, input.supportClass);

  if (
    requiresEdgeCapableSeat(input.supportClass) &&
    asset.seatProfile === "deep_lounge"
  ) {
    score -= 40;
  }

  const familyRecent = input.recentFamilies.get(asset.family) ?? 0;
  score -= familyRecent * 18;

  if (input.batchExcludeFamilies.has(asset.family)) score -= 25;

  score -= recentAssetPenalty(asset.id, input.userHistory);

  return score;
}

/**
 * Select furniture for a furniture-bearing shot.
 * Primary: edge-compatible + substantial + dark (frame AND seat) + luxury.
 * Secondary: family diversity + cooldown + controlled rotation.
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

  const pool = listFurnitureForCategory(category);
  const scoreOpts = {
    cooledOutIds,
    batchExcludeIds,
    batchExcludeFamilies,
    recentFamilies,
    supportClass,
    userHistory: history,
  };

  let scored = pool
    .map((asset) => ({
      asset,
      score: scoreAsset(asset, scoreOpts),
    }))
    .filter((row) => row.score > -1e8)
    .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));

  // Prefer edge-capable + dark when required.
  if (requiresEdgeCapableSeat(supportClass)) {
    const edgeDark = scored.filter(
      (row) =>
        row.asset.seatProfile !== "deep_lounge" &&
        !assetViolatesDarkAesthetic(row.asset),
    );
    if (edgeDark.length > 0) {
      scored = edgeDark;
    } else {
      const edgeAny = scored.filter(
        (row) => row.asset.seatProfile !== "deep_lounge",
      );
      if (edgeAny.length > 0) scored = edgeAny;
    }
  } else {
    const darkPool = scored.filter(
      (row) => !assetViolatesDarkAesthetic(row.asset),
    );
    if (darkPool.length > 0) scored = darkPool;
  }

  const effective =
    scored.length > 0
      ? scored
      : pool
          .filter(
            (asset) =>
              !asset.isLightweightOutdoor &&
              !batchExcludeIds.has(asset.id) &&
              asset.visualWeight !== "lightweight" &&
              !assetViolatesDarkAesthetic(asset),
          )
          .map((asset) => ({
            asset,
            score: scoreAsset(asset, {
              ...scoreOpts,
              cooledOutIds: new Set(),
            }),
          }))
          .sort((a, b) => b.score - a.score);

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
    reason: `category=${category}; support=${supportClass ?? "none"}; zone=${resolvedSpatial?.contactZone ?? "n/a"}; seatProfile=${pick.asset.seatProfile}; upholstery=${pick.asset.upholsteryTone}; luxury=${pick.asset.editorialLuxuryScore}; darkFull=${isFullyDarkFurniture(pick.asset)}; score=${pick.score}`,
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
 * Restores the proven premium wood quality floor (HEAD semantics) and exposes
 * the selected asset's existing promptDescription so catalog choice reaches Gemini.
 * Does not restate garment priority or Pose Master geometry essays.
 */
const FURNITURE_QUALITY_FLOOR = `Prefer: solid natural wood, premium hardwood, refined dark or warm wood, substantial sculptural editorial furniture with refined proportions and high-quality craftsmanship.
Strictly avoid: plastic, molded plastic, cheap-looking furniture, cafeteria furniture, office chairs, generic mass-market furniture.
Do not copy furniture design from the Pose Master — Pose Master controls body pose and the body-to-support relationship only; furniture appearance follows this instruction.`;

export function buildFurniturePromptLayer(
  asset: FurnitureAsset,
  _supportClass?: SupportContactClass | null,
  _spatialRelation?: SupportSpatialRelation | null,
  poseId?: string | null,
): string {
  const description = asset.promptDescription.trim();
  const selectedLine = description
    ? `Selected piece: ${description}`
    : null;

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

  const typeLabel =
    asset.category === "block" ? "block/step" : asset.category;

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

export function assertFurnitureCatalogQualityInvariants(): void {
  for (const asset of FURNITURE_CATALOG) {
    if (asset.isLightweightOutdoor) {
      throw new Error(`Catalog must not include lightweight outdoor asset: ${asset.id}`);
    }
    if (asset.visualWeight === "lightweight") {
      throw new Error(`Catalog must not include lightweight visual weight: ${asset.id}`);
    }
    if (!asset.seatProfile) {
      throw new Error(`Catalog asset missing seatProfile: ${asset.id}`);
    }
    if (asset.isLightUpholstery) {
      throw new Error(`Catalog must not include light-upholstery asset: ${asset.id}`);
    }
    if (assetViolatesDarkAesthetic(asset)) {
      throw new Error(
        `Catalog asset contradicts dark aesthetic (frame/seat/prompt): ${asset.id}`,
      );
    }
    if (!isFullyDarkFurniture(asset)) {
      throw new Error(`Catalog asset is not fully dark: ${asset.id}`);
    }
    if (
      asset.editorialLuxuryScore == null ||
      asset.editorialLuxuryScore < 1 ||
      asset.editorialLuxuryScore > 5
    ) {
      throw new Error(`Catalog asset missing editorialLuxuryScore 1–5: ${asset.id}`);
    }
  }
  if (!getFurnitureAsset("furn_chair_wingback_cognac_leather")) {
    throw new Error("Expected wingback reference-informed asset missing");
  }
  const edgeDark = FURNITURE_CATALOG.filter(
    (a) =>
      a.category === "chair" &&
      a.seatProfile === "edge_capable" &&
      !assetViolatesDarkAesthetic(a),
  );
  if (edgeDark.length < 3) {
    throw new Error(
      `Need multiple dark edge_capable chairs (found ${edgeDark.length})`,
    );
  }
}

export type { FurnitureCategory, SupportContactClass, SupportSpatialRelation };
