// ---------------------------------------------------------------------------
// StudioLayer — Editorial Furniture Catalog (application-level assets)
//
// Dark frame alone is NOT dark furniture — seat/upholstery must also be dark.
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
  | "substantial_bar_stool";

export type FurnitureFinishTone =
  | "espresso"
  | "walnut"
  | "rosewood"
  | "sheesham"
  | "chocolate"
  | "dark_teak"
  | "cognac_dark"
  | "forest_dark";

/** Seat / upholstery colour class — independent of frame finish. */
export type FurnitureUpholsteryTone =
  | "dark_leather"
  | "dark_velvet"
  | "dark_wood"
  | "chocolate"
  | "forest_dark"
  | "none"; // solid wood seat with no light fabric

export type FurnitureVisualWeight = "substantial" | "medium" | "lightweight";

export interface FurnitureAsset {
  /** Stable application-level asset ID (not a pose ID). */
  id: string;
  label: string;
  category: FurnitureCategory;
  family: FurnitureFamily;
  finishTone: FurnitureFinishTone;
  /** true = preferred dark editorial FRAME / wood palette */
  isDarkPreferred: boolean;
  /** true = light/honey/blonde FRAME — strongly deprioritized */
  isLightBrown: boolean;
  /** Seat/cushion/upholstery colour class */
  upholsteryTone: FurnitureUpholsteryTone;
  /**
   * true = cream/ivory/beige/caramel/amber/honey/tan/blonde seat.
   * Dark frame + light cushion must set this true — not fully dark furniture.
   */
  isLightUpholstery: boolean;
  visualWeight: FurnitureVisualWeight;
  /** true = balcony/patio/bistro/café class — excluded for editorial seating */
  isLightweightOutdoor: boolean;
  /**
   * Seat semantics for pose compatibility.
   * Does NOT make furniture flimsy — all assets remain substantial + dark.
   */
  seatProfile: FurnitureSeatProfile;
  silhouette: string;
  materialSummary: string;
  /** Concise prompt-ready description — must never contradict dark aesthetic. */
  promptDescription: string;
  /**
   * Editorial luxury weight (1–5). Selection preference only — never pose authority.
   * Higher = stronger fashion-editorial / craftsmanship presence.
   */
  editorialLuxuryScore: 1 | 2 | 3 | 4 | 5;
}

/**
 * Catalog: dark wood / leather / velvet, substantial, editorial.
 * Edge-capable chairs use DARK seats (not cream/amber cushions).
 */
export const FURNITURE_CATALOG: readonly FurnitureAsset[] = [
  {
    id: "furn_chair_wingback_cognac_leather",
    label: "Cognac Tufted Wingback Armchair",
    category: "chair",
    family: "wingback_tufted_leather",
    finishTone: "cognac_dark",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_leather",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "deep_lounge",
    silhouette: "high wingback with rolled arms",
    materialSummary: "dark cognac leather, deep button tufting, espresso wood legs, nailhead trim",
    promptDescription:
      "Substantial dark cognac leather wingback with button tufting, rolled arms, espresso legs — full adult scale.",
    editorialLuxuryScore: 5,
  },
  {
    id: "furn_chair_wingback_amber_velvet",
    label: "Deep Walnut Velvet Wingback",
    category: "chair",
    family: "velvet_tufted_wingback",
    finishTone: "walnut",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_velvet",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "deep_lounge",
    silhouette: "tufted wingback with carved dark-wood frame",
    materialSummary: "deep chocolate velvet tufting on dark walnut carved frame",
    promptDescription:
      "Substantial dark chocolate velvet wingback on carved walnut frame — heavy editorial presence, full adult scale.",
    editorialLuxuryScore: 5,
  },
  {
    id: "furn_chair_ornate_green_leather",
    label: "Ornate Dark-Wood Green Leather Armchair",
    category: "chair",
    family: "ornate_carved_armchair",
    finishTone: "espresso",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "forest_dark",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "edge_capable",
    silhouette: "ornate carved armchair with tufted back",
    materialSummary: "espresso carved wood, forest-green leather, nailhead trim, cabriole legs",
    promptDescription:
      "Substantial ornate espresso-wood armchair with forest-green leather seat and back — firm dark seat with a clear usable edge.",
    editorialLuxuryScore: 5,
  },
  {
    id: "furn_chair_ornate_dark_leather",
    label: "Ornate Espresso Dark-Leather Armchair",
    category: "chair",
    family: "ornate_carved_armchair",
    finishTone: "espresso",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_leather",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "edge_capable",
    silhouette: "high carved back with dark leather seat",
    materialSummary: "dark espresso carved wood, chocolate leather upholstery",
    promptDescription:
      "Substantial traditional armchair with carved espresso wood frame and chocolate leather seat — firm dark seat edge, full editorial scale.",
    editorialLuxuryScore: 5,
  },
  {
    id: "furn_chair_dark_wood_slat",
    label: "Dark Walnut Slat-Back Armchair",
    category: "chair",
    family: "dark_wood_slat_armchair",
    finishTone: "walnut",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_leather",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "edge_capable",
    silhouette: "curved dark-wood arms with vertical slat back",
    materialSummary: "deep walnut wood, dark chocolate leather seat, brass leg inlay",
    promptDescription:
      "Substantial dark walnut slat-back armchair with dark chocolate leather seat — solid editorial scale, firm usable seat edge.",
    editorialLuxuryScore: 4,
  },
  {
    id: "furn_chair_dark_wood_slat_alt",
    label: "Espresso Slat Armchair with Dark Leather Seat",
    category: "chair",
    family: "dark_wood_slat_armchair",
    finishTone: "espresso",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_leather",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "edge_capable",
    silhouette: "low-profile dark-wood armchair with slat back",
    materialSummary: "espresso wood grain, dark espresso leather seat",
    promptDescription:
      "Substantial espresso-stained wooden armchair with vertical back slats and dark espresso leather seat — grounded, firm seat edge.",
    editorialLuxuryScore: 3,
  },
  {
    id: "furn_chair_antique_openwork",
    label: "Antique Dark Openwork Armchair",
    category: "chair",
    family: "antique_openwork_armchair",
    finishTone: "rosewood",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_leather",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "edge_capable",
    silhouette: "tall openwork carved back with scrolled arms",
    materialSummary: "dark rosewood carved openwork, dark chocolate leather seat, nailhead trim",
    promptDescription:
      "Substantial antique-style dark rosewood armchair with openwork carved back and dark chocolate leather seat — firm seat edge.",
    editorialLuxuryScore: 5,
  },
  {
    id: "furn_chair_antique_openwork_alt",
    label: "Baroque Dark Carved Armchair",
    category: "chair",
    family: "antique_openwork_armchair",
    finishTone: "chocolate",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_leather",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "deep_lounge",
    silhouette: "baroque carved armchair with deep seat",
    materialSummary: "chocolate carved wood, dark marbled leather seat",
    promptDescription:
      "Substantial baroque dark-chocolate carved wood armchair with deep dark leather seat — premium campaign furniture.",
    editorialLuxuryScore: 4,
  },
  {
    id: "furn_chair_sheesham_rolled",
    label: "Sheesham Rolled-Arm Armchair",
    category: "chair",
    family: "cognac_rolled_leather",
    finishTone: "sheesham",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_leather",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "deep_lounge",
    silhouette: "deep rolled-arm lounge chair",
    materialSummary: "dark sheesham wood frame, deep brown leather cushions",
    promptDescription:
      "Substantial dark sheesham wood armchair with deep rolled arms and thick dark-brown leather cushions — full adult scale.",
    editorialLuxuryScore: 3,
  },
  {
    id: "furn_chair_teak_club",
    label: "Dark Teak Club Armchair",
    category: "chair",
    family: "cognac_rolled_leather",
    finishTone: "dark_teak",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "chocolate",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "deep_lounge",
    silhouette: "club armchair with padded arms",
    materialSummary: "dark teak frame, chocolate leather upholstery",
    promptDescription:
      "Substantial dark teak club armchair with padded chocolate leather seat and arms — solid editorial proportions.",
    editorialLuxuryScore: 3,
  },
  {
    id: "furn_stool_dark_wood_substantial",
    label: "Substantial Dark Wood Studio Stool",
    category: "stool",
    family: "substantial_dark_stool",
    finishTone: "walnut",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_wood",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "standard",
    silhouette: "medium-height solid wood stool",
    materialSummary: "dark walnut round seat, thick turned legs",
    promptDescription:
      "Substantial dark walnut wooden studio stool with solid round seat and thick turned legs — full-scale, stable.",
    editorialLuxuryScore: 4,
  },
  {
    id: "furn_stool_espresso_block",
    label: "Espresso Block Studio Stool",
    category: "stool",
    family: "substantial_dark_stool",
    finishTone: "espresso",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_wood",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "standard",
    silhouette: "squat solid wood stool",
    materialSummary: "espresso solid wood, wide seat",
    promptDescription:
      "Substantial espresso solid-wood studio stool with wide seat and thick legs — visually weighted and stable.",
    editorialLuxuryScore: 4,
  },
  {
    id: "furn_stool_sheesham_bar",
    label: "Sheesham Bar-Height Stool",
    category: "stool",
    family: "substantial_bar_stool",
    finishTone: "sheesham",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_wood",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "standard",
    silhouette: "taller dark wood bar stool with footrest",
    materialSummary: "dark sheesham seat and legs, metal footrest ring",
    promptDescription:
      "Substantial dark sheesham bar-height stool with solid seat, sturdy legs, and footrest ring — editorial scale.",
    editorialLuxuryScore: 5,
  },
  {
    id: "furn_stool_rosewood_bar",
    label: "Rosewood Tall Studio Stool",
    category: "stool",
    family: "substantial_bar_stool",
    finishTone: "rosewood",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_wood",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "standard",
    silhouette: "tall rosewood stool",
    materialSummary: "dark rosewood, reinforced stretchers",
    promptDescription:
      "Substantial dark rosewood tall studio stool with reinforced stretchers and solid seat — premium, stable.",
    editorialLuxuryScore: 5,
  },
  {
    id: "furn_block_dark_wood_accent",
    label: "Dark Wood Accent Support Block",
    category: "block",
    family: "substantial_dark_stool",
    finishTone: "espresso",
    isDarkPreferred: true,
    isLightBrown: false,
    upholsteryTone: "dark_wood",
    isLightUpholstery: false,
    visualWeight: "substantial",
    isLightweightOutdoor: false,
    seatProfile: "standard",
    silhouette: "low dark wood seating block",
    materialSummary: "espresso solid wood cube/block",
    promptDescription:
      "Substantial dark espresso solid-wood accent seating block — low, wide, and stable for adult posing.",
    editorialLuxuryScore: 3,
  },
] as const;

export const FURNITURE_CATALOG_BY_ID: Readonly<Record<string, FurnitureAsset>> =
  Object.fromEntries(FURNITURE_CATALOG.map((asset) => [asset.id, asset]));

export const FURNITURE_USER_COOLDOWN = 100;

/** True only when frame AND seat/upholstery are dark editorial. */
export function isFullyDarkFurniture(asset: FurnitureAsset): boolean {
  return (
    asset.isDarkPreferred &&
    !asset.isLightBrown &&
    !asset.isLightUpholstery &&
    asset.upholsteryTone !== undefined
  );
}

export function listFurnitureForCategory(
  category: FurnitureCategory,
): FurnitureAsset[] {
  return FURNITURE_CATALOG.filter((asset) => asset.category === category);
}

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
