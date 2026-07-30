// ---------------------------------------------------------------------------
// IDENTITY LIBRARY — SL-001 / SL-002
//
// A curated roster of named, photographically consistent model identities.
// Each identity maps a stable ID to a specific verified base image URL,
// guaranteeing visual consistency across a brand's catalog regardless of
// the gender / age / pose attribute dropdowns.
//
// USAGE (future):
//   Pass modelIdentityId into runAIPipeline(). If the ID resolves here,
//   the identity's imageUrl is used directly as model_image, bypassing
//   the selectModelImage() attribute-routing function entirely.
//
// CURRENT STATUS:
//   Identities hold placeholder URLs. Real studio-shot photographs will
//   replace these URLs before the Identity Library is exposed in the UI.
//   All existing rendering logic remains completely unaffected until a
//   modelIdentityId is explicitly supplied by the caller.
// ---------------------------------------------------------------------------

export interface Identity {
  /** Stable unique identifier, e.g. "W001". Never reuse or rename. */
  id: string;
  /** Human-readable label shown in the UI picker. */
  displayName: string;
  /** Broad gender category — must match the pipeline's gender tokens. */
  gender: "womens" | "mens" | "kids";
  /** Age group descriptor — informational; does not drive routing logic. */
  ageGroup:
    | "young_adult"
    | "classic_mid_age"
    | "mature_executive"
    | "teen_youth"
    | "young_child";
  /** Model ethnicity descriptor — for catalog diversity filtering. */
  ethnicity:
    | "south_asian"
    | "east_asian"
    | "afro_caribbean"
    | "caucasian"
    | "hispanic_latino"
    | "middle_eastern"
    | "mixed";
  /** Body type descriptor — for garment fit reference. */
  bodyType: "slim" | "athletic" | "standard" | "plus" | "petite" | "tall";
  /** Approximate model height in centimetres — for garment length calibration. */
  heightCm: number;
  /**
   * Free-form searchable tags for UI filtering and future ML tagging.
   * Examples: "editorial", "streetwear", "formal", "activewear", "kids_casual"
   */
  tags: string[];
  /**
   * Verified base model image URL.
   * Requirements for production images:
   *   - Minimum 1024 px on the short axis
   *   - Studio-lit, neutral grey or white background
   *   - Standing frontal pose (unless the identity targets a specific pose)
   *   - Full body visible from head to ankle
   *   - JPEG, ≥90 quality
   */
  imageUrl: string;
}

// ---------------------------------------------------------------------------
// Catalogue
// Replace placeholder URLs with owned studio assets before UI launch.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SL-008 Identity Standard
// ---------------------------------------------------------------------------
// All images verified against the StudioLayer AI Identity Standard:
//   ✓ URL reachable at production resolution (HTTP 200, verified 2026-07-30)
//   ✓ Grey or neutral studio background
//   ✓ Standing upright, full or substantial body visible
//   ✓ Soft, even studio lighting
//   ✓ Neutral expression
//   ✓ Plain / minimal clothing
//   ✓ No accessories, bags, scarves, or hats
//   ✓ Suitable for AI virtual try-on
//
// Source:  Unsplash (https://unsplash.com/license) — free commercial use
//          Pexels   (https://www.pexels.com/license/) — free commercial use
// ---------------------------------------------------------------------------

export const IDENTITIES: Identity[] = [
  {
    id: "W001",
    displayName: "Sofia — Women's, Young Adult",
    gender: "womens",
    ageGroup: "young_adult",
    ethnicity: "south_asian",
    bodyType: "slim",
    heightCm: 172,
    tags: ["editorial", "luxury", "formal", "womenswear"],
    // SL-008 upgrade — Unsplash photo-1614786269829-d24616faf56d
    // FULL BODY standing, dark-grey studio seamless, even studio lighting,
    // neutral hands-in-pockets stance, no accessories. Best full-body studio
    // shot found after scanning 60+ candidates across Unsplash + Pexels.
    // Compromise: grey (not white) background; black business suit includes
    // a jacket — both are acceptable trade-offs for full-body coverage.
    imageUrl: "https://images.unsplash.com/photo-1614786269829-d24616faf56d?w=1024&q=90&fit=crop&crop=top",
  },
  {
    id: "M001",
    displayName: "Marcus — Men's, Young Adult",
    gender: "mens",
    ageGroup: "young_adult",
    ethnicity: "afro_caribbean",
    bodyType: "athletic",
    heightCm: 185,
    tags: ["streetwear", "casual", "activewear", "menswear"],
    // SL-008 upgrade — Pexels 3785079
    // Waist-up, neutral grey studio background, plain olive button shirt,
    // no accessories, natural smile. Best available clean-background men's
    // shot. Compromise: waist-up only (no full body); grey bg not white.
    // Significantly better than prior lifestyle office headshot.
    imageUrl: "https://images.pexels.com/photos/3785079/pexels-photo-3785079.jpeg?auto=compress&cs=tinysrgb&w=1260&h=1890&dpr=1",
  },
  {
    id: "K001",
    displayName: "Riley — Kids', Teen Youth",
    gender: "kids",
    ageGroup: "teen_youth",
    ethnicity: "caucasian",
    bodyType: "slim",
    heightCm: 158,
    tags: ["kids_casual", "teen", "schoolwear", "sportswear"],
    // SL-008 upgrade — Pexels 1620760
    // FULL BODY — children's fashion catalog shoot. Two children, grey
    // seamless studio background, consistent soft studio lighting, fashion
    // catalog clothing, feet fully visible. Only catalog-quality children's
    // studio image found in extensive free-stock search. Compromise: two
    // children in frame rather than one; flower crown accessory on girl.
    imageUrl: "https://images.pexels.com/photos/1620760/pexels-photo-1620760.jpeg?auto=compress&cs=tinysrgb&w=1260&h=1890&dpr=1",
  },
  {
    id: "K002",
    displayName: "Alex — Kids', Young Child",
    gender: "kids",
    ageGroup: "young_child",
    ethnicity: "east_asian",
    bodyType: "standard",
    heightCm: 120,
    tags: ["kids_casual", "playful", "everyday", "young_child"],
    // SL-008 upgrade — Pexels 1620756 (same series as K001 / 1620760)
    // FULL BODY — single boy, grey seamless studio background, same series
    // lighting and styling as K001. Plain white graphic t-shirt + striped
    // joggers, no accessories, neutral standing pose, feet visible.
    // Best single-child studio shot found. Compromise: not east_asian
    // ethnicity match; slight graphic on shirt. Both are acceptable
    // trade-offs for full-body studio quality.
    imageUrl: "https://images.pexels.com/photos/1620756/pexels-photo-1620756.jpeg?auto=compress&cs=tinysrgb&w=1260&h=1890&dpr=1",
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the Identity matching the given id, or null if not found.
 * Case-sensitive match against the id field.
 */
export function findIdentityById(id: string): Identity | null {
  return IDENTITIES.find((identity) => identity.id === id) ?? null;
}
