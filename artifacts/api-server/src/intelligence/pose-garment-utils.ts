// ---------------------------------------------------------------------------
// Shared garment + gender utilities for pose selection and planning.
// ---------------------------------------------------------------------------

import type { GarmentProfile } from "./types";

export type ModelGender = "womens" | "mens" | "kids" | "unisex";

export const POSE_SELECTION_TUNING = {
  compatMin: 0.5,
  compatMax: 1.5,
  varietyMin: 0.65,
  recencyPenalty: 0.72,
  inBatchStancePenalty: 0.85,
  inBatchCameraPenalty: 0.92,
  inBatchOrientationPenalty: 0.92,
} as const;

export const GENERIC_GARMENT_TAGS = new Set([
  "catalog", "ecommerce", "hero", "minimal", "luxury", "campaign", "editorial",
  "magazine", "high_fashion", "movement", "lifestyle", "commercial",
  "no_pocket_alternative", "pocket", "three_quarter", "statement", "feminine",
  "everyday", "street", "formal", "silhouette",
]);

export function buildPoseProfileKey(profile: GarmentProfile): string {
  return `${profile.category}:${profile.subcategory.toLowerCase().trim()}`;
}

export function resolveModelGender(
  modelGender: string | null | undefined,
  profileGender: ModelGender,
): ModelGender {
  const raw = (modelGender ?? profileGender).toLowerCase();
  if (raw === "mens" || raw === "male") return "mens";
  if (raw === "kids" || raw === "kid" || raw === "child") return "kids";
  if (raw === "unisex") return "unisex";
  return "womens";
}

export function garmentHasUsablePockets(profile: GarmentProfile): boolean {
  if (profile.hasPockets === true) return true;
  if (profile.hasPockets === false) return false;

  const sub = profile.subcategory.toLowerCase();
  const { category } = profile;

  if (category === "bottoms") {
    if (
      sub.includes("jean") ||
      sub.includes("denim") ||
      sub.includes("trouser") ||
      sub.includes("pant") ||
      sub.includes("short") ||
      sub.includes("cargo")
    ) {
      return !sub.includes("legging") && !sub.includes("tight");
    }
    return false;
  }

  if (category === "outerwear") {
    if (
      sub.includes("jacket") ||
      sub.includes("blazer") ||
      sub.includes("coat") ||
      sub.includes("hoodie") ||
      sub.includes("cargo")
    ) {
      return true;
    }
    return false;
  }

  if (category === "one-pieces") {
    return sub.includes("cargo") || sub.includes("utility");
  }

  return false;
}

export function inferGarmentTags(profile: GarmentProfile): Set<string> {
  const tags = new Set<string>();
  const sub = profile.subcategory.toLowerCase();
  const occ = profile.occasion.map((o) => o.toLowerCase());
  const { category, fit, fabric } = profile;

  if (category === "one-pieces") {
    tags.add("dress");
    if (sub.includes("gown") || sub.includes("maxi") || sub.includes("evening")) {
      tags.add("gown");
      tags.add("formal_dress");
    }
    if (sub.includes("saree") || sub.includes("sari")) {
      tags.add("saree");
    }
    if (
      sub.includes("dupatta") ||
      sub.includes("lehenga") ||
      sub.includes("salwar") ||
      sub.includes("anarkali") ||
      sub.includes("sharara")
    ) {
      tags.add("dupatta");
    }
  }
  if (category === "bottoms") {
    if (sub.includes("jean") || sub.includes("denim")) tags.add("jeans");
    else if (sub.includes("trouser") || sub.includes("pant")) tags.add("trousers");
    else if (sub.includes("short")) tags.add("shorts");
  }
  if (category === "outerwear" || sub.includes("blazer") || sub.includes("jacket") || sub.includes("coat")) {
    tags.add("blazer");
    tags.add("jacket");
  }
  if (sub.includes("suit")) tags.add("business");
  if (sub.includes("blazer")) tags.add("blazer");
  if (sub.includes("saree") || sub.includes("sari")) tags.add("saree");
  if (
    sub.includes("dupatta") ||
    sub.includes("lehenga") ||
    sub.includes("salwar") ||
    sub.includes("anarkali") ||
    sub.includes("sharara")
  ) {
    tags.add("dupatta");
  }

  if (
    profile.isFlowingGarment === true ||
    sub.includes("maxi") ||
    sub.includes("gown") ||
    sub.includes("flow") ||
    sub.includes("cape") ||
    sub.includes("skirt") ||
    fabric.toLowerCase().includes("silk") ||
    fabric.toLowerCase().includes("chiffon") ||
    fabric.toLowerCase().includes("satin")
  ) {
    tags.add("flowing");
  }

  if (profile.garmentLength === "maxi" || profile.garmentLength === "full-length") {
    tags.add("full_length");
    tags.add("flowing");
  }

  if (occ.some((o) => o.includes("sport") || o.includes("athletic") || o.includes("gym"))) {
    tags.add("sportswear");
  }
  if (occ.some((o) => o.includes("formal") || o.includes("evening") || o.includes("office") || o.includes("business"))) {
    tags.add("formal");
    if (occ.some((o) => o.includes("office") || o.includes("business"))) tags.add("business");
  }
  if (occ.some((o) => o.includes("casual") || o.includes("street"))) tags.add("casual");

  if (profile.gender === "kids") tags.add("kidswear");
  if (fit.toLowerCase().includes("structured")) tags.add("structured");

  if (garmentHasUsablePockets(profile)) tags.add("pocket");
  else tags.add("no_pocket");

  if (category === "tops" && !sub.includes("dress")) tags.add("everyday");
  if (sub.includes("shirt") && !sub.includes("t-shirt")) tags.add("shirt");

  return tags;
}
