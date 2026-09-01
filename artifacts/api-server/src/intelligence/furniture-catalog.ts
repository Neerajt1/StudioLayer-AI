// ---------------------------------------------------------------------------
// StudioLayer — Editorial Furniture Catalog (application-level assets)
//
// Premium means MATERIAL QUALITY + CRAFTSMANSHIP + REFINED PROPORTIONS.
// It does NOT mean ornamentation, bulk, or darkness.
//
// Quality is declared on two independent axes (craftQuality and
// silhouetteRefinement) so "well made" and "restrained" can be reasoned about
// separately. Physical scale is descriptive only and never earns points.
//
// Excel / Pose Master PNGs untouched. No runtime image attachment.
// ---------------------------------------------------------------------------

import type { FurnitureSeatProfile } from "./furniture-support";

export type FurnitureCategory = "chair" | "stool" | "block";

export type FurnitureFamily =
  | "wingback_tufted_leather"
  | "ornate_carved_armchair"
  | "dark_wood_slat_armchair"
  | "velvet_tufted_wingback"
  | "antique_openwork_armchair"
  | "cognac_rolled_leather"
  | "substantial_dark_stool"
  | "substantial_bar_stool"
  // Premium solid-timber editorial families — material-led, minimal silhouettes.
  | "solid_walnut_editorial"
  | "solid_oak_editorial"
  | "smoked_timber_editorial"
  | "blackened_wood_editorial"
  | "solid_hardwood_lounge"
  | "natural_oak_editorial"
  | "warm_timber_editorial";

/**
 * Physical/visual proportion of the piece. Descriptive only.
 *
 * This is deliberately NOT a quality signal. It never earns a positive score —
 * `generous` only ever attracts a penalty, and only when the pose does not call
 * for a lounge-scaled piece. Bulk is not premium.
 */
export type FurnitureScale = "compact" | "standard" | "generous";

/** What the piece is actually made of — drives a small material bonus. */
export type FurnitureMaterialClass =
  | "solid_timber"
  | "timber_with_leather"
  | "timber_with_textile";

/**
 * Timber tone. `warm_medium` is a first-class premium house direction, not a
 * concession — rich natural walnut and warm hardwood belong here, and `dark`
 * is reserved for genuinely dark finishes (espresso, blackened, smoked).
 */
export type FurnitureWoodTone = "light_natural" | "warm_medium" | "dark";

/**
 * Seat/upholstery tonal class, independent of frame tone.
 *
 * `light_neutral` is a legitimate premium direction. It is never a violation
 * and never implies a cheap piece.
 */
export type FurnitureSeatTreatment =
  | "bare_timber"
  | "light_neutral"
  | "warm_mid"
  | "dark";

/** Declared decoration level — a real runtime selection property. */
export type FurnitureOrnamentation = "none" | "minimal" | "decorative";

export interface FurnitureAsset {
  /** Stable application-level asset ID (not a pose ID). */
  id: string;
  label: string;
  category: FurnitureCategory;
  family: FurnitureFamily;

  /** Seat semantics for pose compatibility. */
  seatProfile: FurnitureSeatProfile;

  /** Proportion. Never a positive quality signal — see FurnitureScale. */
  scale: FurnitureScale;

  materialClass: FurnitureMaterialClass;
  woodTone: FurnitureWoodTone;
  seatTreatment: FurnitureSeatTreatment;

  /**
   * Material quality and construction (1–5).
   *
   * 5 = premium hardwood, exemplary joinery, honest construction
   * 4 = strong material and making, one minor compromise
   * 3 = sound but unremarkable — the floor for the active selection pool
   * 2 = styling carrying the piece instead of construction
   * 1 = pastiche
   */
  craftQuality: 1 | 2 | 3 | 4 | 5;

  /**
   * Restraint, proportion and elegance of the silhouette (1–5).
   *
   * Independent of craftQuality: a beautifully made piece can still be visually
   * noisy, and this axis is what lets the selector prefer the quiet one.
   */
  silhouetteRefinement: 1 | 2 | 3 | 4 | 5;

  /**
   * Decoration level.
   * `decorative` assets are excluded from the active selection pool outright —
   * ornamentation is never a route to a premium score.
   */
  ornamentation: FurnitureOrnamentation;

  /** Prompt-only. Never read by scoring. */
  silhouette: string;
  /** Prompt-only. Never read by scoring. */
  materialSummary: string;
  /** Prompt-ready description — material-led, never scale-led. */
  promptDescription: string;

  /**
   * Retired from NEW selection while remaining resolvable by id.
   *
   * Deprecated entries stay in FURNITURE_CATALOG and FURNITURE_CATALOG_BY_ID so
   * historical renders, Gallery records, usage events and forensic lookups keep
   * working. They are filtered out of the selection pool only.
   */
  deprecated?: boolean;
}

/**
 * Curated premium catalog.
 *
 * Legacy ornate/carved/tufted/antique pieces are retained by id for historical
 * resolution but are deprecated out of the active pool.
 */
export const FURNITURE_CATALOG: readonly FurnitureAsset[] = [
  {
    id: "furn_chair_wingback_cognac_leather",
    label: "Cognac Tufted Wingback Armchair",
    category: "chair",
    family: "wingback_tufted_leather",
    seatProfile: "deep_lounge",
    scale: "generous",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 2,
    ornamentation: "decorative",
    silhouette: "high wingback with rolled arms",
    materialSummary: "dark cognac leather, deep button tufting, espresso wood legs, nailhead trim",
    promptDescription:
      "Dark cognac leather wingback with button tufting, rolled arms and espresso legs — full adult scale.",
    // Tufting and wingback scale are decoration, not craftsmanship.
    deprecated: true,
  },
  {
    id: "furn_chair_wingback_amber_velvet",
    label: "Deep Walnut Velvet Wingback",
    category: "chair",
    family: "velvet_tufted_wingback",
    seatProfile: "deep_lounge",
    scale: "generous",
    materialClass: "timber_with_textile",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 2,
    ornamentation: "decorative",
    silhouette: "tufted wingback with carved dark-wood frame",
    materialSummary: "deep chocolate velvet tufting on dark walnut carved frame",
    promptDescription:
      "Dark chocolate velvet wingback on a carved walnut frame — heavy editorial presence, full adult scale.",
    deprecated: true,
  },
  {
    id: "furn_chair_ornate_green_leather",
    label: "Ornate Dark-Wood Green Leather Armchair",
    category: "chair",
    family: "ornate_carved_armchair",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 2,
    ornamentation: "decorative",
    silhouette: "ornate carved armchair with tufted back",
    materialSummary: "espresso carved wood, forest-green leather, nailhead trim, cabriole legs",
    promptDescription:
      "Ornate espresso-wood armchair with a forest-green leather seat and back — firm dark seat with a clear usable edge.",
    deprecated: true,
  },
  {
    id: "furn_chair_ornate_dark_leather",
    label: "Ornate Espresso Dark-Leather Armchair",
    category: "chair",
    family: "ornate_carved_armchair",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 2,
    ornamentation: "decorative",
    silhouette: "high carved back with dark leather seat",
    materialSummary: "dark espresso carved wood, chocolate leather upholstery",
    promptDescription:
      "Traditional armchair with a carved espresso wood frame and chocolate leather seat — firm dark seat edge, full editorial scale.",
    deprecated: true,
  },
  {
    id: "furn_chair_dark_wood_slat",
    label: "Dark Walnut Slat-Back Armchair",
    category: "chair",
    family: "dark_wood_slat_armchair",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 4,
    silhouetteRefinement: 3,
    // Brass leg inlay is a single restrained detail, not carving.
    ornamentation: "minimal",
    silhouette: "curved dark-wood arms with vertical slat back",
    materialSummary: "deep walnut wood, dark chocolate leather seat, brass leg inlay",
    promptDescription:
      "Dark walnut slat-back armchair with a chocolate leather seat and brass leg inlay — solid editorial scale, firm usable seat edge.",
  },
  {
    id: "furn_chair_dark_wood_slat_alt",
    label: "Espresso Slat Armchair with Dark Leather Seat",
    category: "chair",
    family: "dark_wood_slat_armchair",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 3,
    ornamentation: "none",
    silhouette: "low-profile dark-wood armchair with slat back",
    materialSummary: "espresso wood grain, dark espresso leather seat",
    promptDescription:
      "Espresso-stained wooden armchair with vertical back slats and a dark espresso leather seat — grounded, firm seat edge.",
  },
  {
    id: "furn_chair_antique_openwork",
    label: "Antique Dark Openwork Armchair",
    category: "chair",
    family: "antique_openwork_armchair",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 1,
    ornamentation: "decorative",
    silhouette: "tall openwork carved back with scrolled arms",
    materialSummary: "dark rosewood carved openwork, dark chocolate leather seat, nailhead trim",
    promptDescription:
      "Antique-style dark rosewood armchair with an openwork carved back and dark chocolate leather seat — firm seat edge.",
    deprecated: true,
  },
  {
    id: "furn_chair_antique_openwork_alt",
    label: "Baroque Dark Carved Armchair",
    category: "chair",
    family: "antique_openwork_armchair",
    seatProfile: "deep_lounge",
    scale: "generous",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 2,
    silhouetteRefinement: 1,
    ornamentation: "decorative",
    silhouette: "baroque carved armchair with deep seat",
    materialSummary: "chocolate carved wood, dark marbled leather seat",
    promptDescription:
      "Baroque dark-chocolate carved wood armchair with a deep dark leather seat.",
    // Most theatrical entry in the catalog — heritage pastiche, not craftsmanship.
    deprecated: true,
  },
  {
    id: "furn_chair_sheesham_rolled",
    label: "Sheesham Rolled-Arm Armchair",
    category: "chair",
    family: "cognac_rolled_leather",
    seatProfile: "deep_lounge",
    scale: "generous",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 2,
    ornamentation: "decorative",
    silhouette: "deep rolled-arm lounge chair",
    materialSummary: "dark sheesham wood frame, deep brown leather cushions",
    promptDescription:
      "Dark sheesham wood armchair with deep rolled arms and thick dark-brown leather cushions — full adult scale.",
    deprecated: true,
  },
  {
    id: "furn_chair_teak_club",
    label: "Dark Teak Club Armchair",
    category: "chair",
    family: "cognac_rolled_leather",
    seatProfile: "deep_lounge",
    scale: "generous",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 3,
    silhouetteRefinement: 2,
    ornamentation: "decorative",
    silhouette: "club armchair with padded arms",
    materialSummary: "dark teak frame, chocolate leather upholstery",
    promptDescription:
      "Dark teak club armchair with a padded chocolate leather seat and arms — solid editorial proportions.",
    deprecated: true,
  },
  {
    id: "furn_stool_dark_wood_substantial",
    label: "Solid Walnut Studio Stool",
    category: "stool",
    family: "substantial_dark_stool",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "warm_medium",
    seatTreatment: "bare_timber",
    craftQuality: 5,
    silhouetteRefinement: 4,
    ornamentation: "none",
    silhouette: "medium-height solid wood stool",
    materialSummary: "solid walnut round seat, thick turned legs",
    promptDescription:
      "Solid walnut studio stool with a round seat and thick turned legs, matte grain — stable, full adult scale.",
  },
  {
    id: "furn_stool_espresso_block",
    label: "Espresso Block Studio Stool",
    category: "stool",
    family: "substantial_dark_stool",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "dark",
    seatTreatment: "bare_timber",
    craftQuality: 3,
    silhouetteRefinement: 3,
    ornamentation: "none",
    silhouette: "squat solid wood stool",
    materialSummary: "espresso solid wood, wide seat",
    promptDescription:
      "Espresso solid-wood studio stool with a wide seat and thick legs — visually weighted and stable.",
  },
  {
    id: "furn_stool_sheesham_bar",
    label: "Sheesham Bar-Height Stool",
    category: "stool",
    family: "substantial_bar_stool",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "dark",
    seatTreatment: "bare_timber",
    craftQuality: 4,
    silhouetteRefinement: 3,
    ornamentation: "none",
    silhouette: "taller dark wood bar stool with footrest",
    materialSummary: "dark sheesham seat and legs, metal footrest ring",
    promptDescription:
      "Dark sheesham bar-height stool with a solid seat, sturdy legs and a footrest ring — editorial scale.",
  },
  {
    id: "furn_stool_rosewood_bar",
    label: "Rosewood Tall Studio Stool",
    category: "stool",
    family: "substantial_bar_stool",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "dark",
    seatTreatment: "bare_timber",
    craftQuality: 3,
    silhouetteRefinement: 3,
    ornamentation: "none",
    silhouette: "tall rosewood stool",
    materialSummary: "dark rosewood, reinforced stretchers",
    promptDescription:
      "Dark rosewood tall studio stool with reinforced stretchers and a solid seat — stable.",
  },
  {
    id: "furn_block_dark_wood_accent",
    label: "Dark Wood Accent Support Block",
    category: "block",
    family: "substantial_dark_stool",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "dark",
    seatTreatment: "bare_timber",
    craftQuality: 3,
    silhouetteRefinement: 3,
    ornamentation: "none",
    silhouette: "low dark wood seating block",
    materialSummary: "espresso solid wood cube/block",
    promptDescription:
      "Espresso solid-wood accent seating block — low, wide and stable for adult posing.",
  },

  // -------------------------------------------------------------------------
  // Premium solid-timber editorial pieces.
  //
  // Material-led and minimal rather than carved/ornate.
  // -------------------------------------------------------------------------
  {
    id: "furn_chair_solid_walnut_editorial",
    label: "Solid Walnut Editorial Chair",
    category: "chair",
    family: "solid_walnut_editorial",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "warm_medium",
    seatTreatment: "bare_timber",
    craftQuality: 5,
    silhouetteRefinement: 5,
    ornamentation: "none",
    silhouette: "clean solid-walnut frame with flat sculpted seat",
    materialSummary: "rich solid walnut, matte hand-finished grain, sculpted seat",
    promptDescription:
      "Rich solid-walnut chair with a clean frame and sculpted seat, matte hand-finished grain. Full adult proportions, quietly made.",
  },
  {
    id: "furn_chair_dark_oak_editorial",
    label: "Dark Solid Oak Editorial Chair",
    category: "chair",
    family: "solid_oak_editorial",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    // Light seat deliberately: this is the dark-frame contrast piece.
    seatTreatment: "light_neutral",
    craftQuality: 5,
    silhouetteRefinement: 4,
    ornamentation: "none",
    silhouette: "squared solid-oak frame with low leather seat pad",
    materialSummary: "dark solid oak, restrained oatmeal leather seat pad",
    promptDescription:
      "Dark solid-oak chair with a squared frame and a restrained oatmeal leather seat pad, matte finish — full adult proportions.",
  },
  {
    id: "furn_chair_smoked_timber_lounge",
    label: "Smoked Timber Lounge Chair",
    category: "chair",
    family: "smoked_timber_editorial",
    seatProfile: "deep_lounge",
    scale: "generous",
    materialClass: "timber_with_leather",
    woodTone: "dark",
    seatTreatment: "dark",
    craftQuality: 4,
    silhouetteRefinement: 3,
    ornamentation: "none",
    silhouette: "low smoked-timber lounge frame with deep leather cushion",
    materialSummary: "smoked dark timber frame, deep chocolate leather cushion",
    promptDescription:
      "Smoked dark-timber lounge chair with a deep chocolate leather cushion and subtle grain — quiet editorial presence, full adult scale.",
    // Dark-on-dark, cushioned and lounge-scaled — the direction the catalogue
    // is moving away from. Retired in favour of the exposed-frame lounges.
    deprecated: true,
  },
  {
    id: "furn_chair_blackened_wood_editorial",
    label: "Blackened Wood Editorial Chair",
    category: "chair",
    family: "blackened_wood_editorial",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "dark",
    seatTreatment: "bare_timber",
    // One strong dark option, deliberately not a catalogue-defining maximum.
    craftQuality: 4,
    silhouetteRefinement: 4,
    ornamentation: "none",
    silhouette: "architectural blackened-wood frame with solid seat",
    materialSummary: "blackened solid hardwood, open grain visible under matte finish",
    promptDescription:
      "Blackened solid-hardwood chair with an architectural frame and solid seat, open grain under a matte finish — never glossy.",
  },
  {
    id: "furn_stool_solid_walnut_editorial",
    label: "Solid Walnut Editorial Stool",
    category: "stool",
    family: "solid_walnut_editorial",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "warm_medium",
    seatTreatment: "bare_timber",
    craftQuality: 5,
    silhouetteRefinement: 5,
    ornamentation: "none",
    silhouette: "solid-walnut stool with thick sculpted seat",
    materialSummary: "rich solid walnut, thick sculpted seat, matte grain",
    promptDescription:
      "Rich solid-walnut studio stool with a thick sculpted seat and matte grain — stable, minimal, quietly made.",
  },
  {
    id: "furn_stool_blackened_oak_bar",
    label: "Blackened Oak Bar Stool",
    category: "stool",
    family: "blackened_wood_editorial",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "dark",
    seatTreatment: "bare_timber",
    craftQuality: 4,
    silhouetteRefinement: 4,
    ornamentation: "none",
    silhouette: "tall blackened-oak stool with solid seat and footrest",
    materialSummary: "blackened solid oak, solid seat, integrated footrest",
    promptDescription:
      "Tall blackened solid-oak bar stool with a solid seat and integrated footrest, matte finish — stable.",
  },
  {
    id: "furn_chair_walnut_frame_lounge",
    label: "Solid Walnut Frame Lounge Chair",
    category: "chair",
    family: "solid_hardwood_lounge",
    seatProfile: "deep_lounge",
    // Exposed frame and open arm rails keep the visual mass low despite the
    // lounge geometry — this is not a bulky piece.
    scale: "standard",
    materialClass: "timber_with_leather",
    woodTone: "warm_medium",
    seatTreatment: "light_neutral",
    craftQuality: 5,
    silhouetteRefinement: 5,
    ornamentation: "none",
    silhouette: "low open-frame lounge chair with exposed solid-walnut structure",
    materialSummary: "solid walnut frame, low bone-toned leather seat and back panel",
    promptDescription:
      "Solid-walnut lounge chair with an exposed frame, open arm rails and a low bone-toned leather seat — matte grain, full adult proportions.",
  },

  // -------------------------------------------------------------------------
  // Natural and warm timber — a first-class premium direction, not a fallback.
  // These restore tonal balance so the catalogue is not dark by default.
  // -------------------------------------------------------------------------
  {
    id: "furn_chair_natural_oak_editorial",
    label: "Natural Oak Editorial Chair",
    category: "chair",
    family: "natural_oak_editorial",
    seatProfile: "edge_capable",
    scale: "standard",
    materialClass: "timber_with_textile",
    woodTone: "light_natural",
    seatTreatment: "light_neutral",
    craftQuality: 5,
    silhouetteRefinement: 5,
    ornamentation: "none",
    silhouette: "clean natural-oak frame with a low upholstered seat pad",
    materialSummary: "pale solid oak, oatmeal linen seat pad",
    promptDescription:
      "Natural solid-oak chair with a clean frame and an oatmeal linen seat pad, matte open grain — full adult proportions, quietly made.",
  },
  {
    id: "furn_chair_warm_timber_editorial",
    label: "Warm Timber Editorial Chair",
    category: "chair",
    family: "warm_timber_editorial",
    seatProfile: "edge_capable",
    scale: "compact",
    materialClass: "solid_timber",
    woodTone: "warm_medium",
    seatTreatment: "bare_timber",
    craftQuality: 5,
    silhouetteRefinement: 5,
    ornamentation: "none",
    silhouette: "compact warm-timber frame with a shaped solid seat",
    materialSummary: "warm solid hardwood, shaped seat, matte oiled grain",
    promptDescription:
      "Warm solid-timber chair with a slim frame and shaped solid seat, matte oiled grain — compact adult proportions, quietly made.",
  },
  {
    id: "furn_chair_natural_oak_lounge",
    label: "Natural Oak Frame Lounge Chair",
    category: "chair",
    family: "solid_hardwood_lounge",
    seatProfile: "deep_lounge",
    scale: "standard",
    materialClass: "timber_with_textile",
    woodTone: "light_natural",
    seatTreatment: "light_neutral",
    craftQuality: 4,
    silhouetteRefinement: 5,
    ornamentation: "none",
    silhouette: "low natural-oak frame with a light upholstered cushion",
    materialSummary: "pale solid oak frame, oatmeal linen cushion",
    promptDescription:
      "Natural solid-oak lounge chair with an exposed low frame and an oatmeal linen cushion — matte open grain, full adult proportions.",
  },
  {
    id: "furn_stool_natural_oak_editorial",
    label: "Natural Oak Editorial Stool",
    category: "stool",
    family: "natural_oak_editorial",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "light_natural",
    seatTreatment: "bare_timber",
    craftQuality: 5,
    silhouetteRefinement: 5,
    ornamentation: "none",
    silhouette: "natural-oak stool with a shaped solid seat",
    materialSummary: "pale solid oak, shaped seat, matte open grain",
    promptDescription:
      "Natural solid-oak studio stool with a shaped solid seat and matte open grain — stable, minimal, quietly made.",
  },
  {
    id: "furn_block_warm_timber_accent",
    label: "Warm Timber Accent Block",
    category: "block",
    family: "warm_timber_editorial",
    seatProfile: "standard",
    scale: "standard",
    materialClass: "solid_timber",
    woodTone: "warm_medium",
    seatTreatment: "bare_timber",
    craftQuality: 4,
    silhouetteRefinement: 4,
    ornamentation: "none",
    silhouette: "low warm-timber seating block",
    materialSummary: "warm solid hardwood block, matte oiled grain",
    promptDescription:
      "Warm solid-timber accent seating block — low, wide and stable for adult posing, matte oiled grain.",
  },
] as const;

export const FURNITURE_CATALOG_BY_ID: Readonly<Record<string, FurnitureAsset>> =
  Object.fromEntries(FURNITURE_CATALOG.map((asset) => [asset.id, asset]));

export const FURNITURE_USER_COOLDOWN = 100;

/**
 * Minimum construction quality for the active selection pool.
 *
 * Cheap furniture is rejected because it is badly made, NOT because it is
 * physically small. A compact, beautifully made chair is entirely valid.
 */
export const FURNITURE_CRAFT_QUALITY_FLOOR = 3;

/** True when the asset is retired from new selection. */
export function isFurnitureDeprecated(asset: FurnitureAsset): boolean {
  return asset.deprecated === true;
}

/** Dark frame AND dark seat — allowed, but never structurally privileged. */
export function isDarkOnDark(asset: FurnitureAsset): boolean {
  return asset.woodTone === "dark" && asset.seatTreatment === "dark";
}

/**
 * Eligible for NEW selection.
 *
 * These three conditions are quality guarantees, not preferences — no fallback
 * path may relax them.
 */
export function isSelectableFurniture(asset: FurnitureAsset): boolean {
  return (
    !isFurnitureDeprecated(asset) &&
    asset.ornamentation !== "decorative" &&
    asset.craftQuality >= FURNITURE_CRAFT_QUALITY_FLOOR
  );
}

/** Selection pool for a category — deprecated/decorative/low-craft never offered. */
export function listFurnitureForCategory(
  category: FurnitureCategory,
): FurnitureAsset[] {
  return FURNITURE_CATALOG.filter(
    (asset) => asset.category === category && isSelectableFurniture(asset),
  );
}

/** Resolves ANY historical id, including deprecated assets. Never narrow this. */
export function getFurnitureAsset(id: string): FurnitureAsset | undefined {
  return FURNITURE_CATALOG_BY_ID[id];
}

export function propToFurnitureCategory(
  prop: string | null | undefined,
): FurnitureCategory | null {
  if (prop === "chair") return "chair";
  if (prop === "stool") return "stool";
  if (prop === "step") return "block";
  return null;
}
