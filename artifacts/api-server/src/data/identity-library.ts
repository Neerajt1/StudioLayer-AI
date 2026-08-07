// ---------------------------------------------------------------------------
// IDENTITY LIBRARY — SL-009
//
// The StudioLayer AI Global Identity Library.
// Each entry maps a stable ID to a production-approved local model image.
//
// Image files live in:
//   artifacts/studiolayer-ai/public/identities/
// They are served by the Vite frontend at the root path, so imageUrl values
// are root-relative paths such as "/identities/F-IN-01.png".
//
// PIPELINE RESOLUTION:
//   The OpenRouter pipeline loads identity imageUrl paths from disk and sends
//   them to the provider as base64 data URIs (see preprocessing.ts).
//
// BACKWARD COMPATIBILITY:
//   Legacy IDs (W001, M001, K001, K002) are no longer present in this array.
//   Any stored render referencing those IDs will safely fall through to the
//   selectModelImage() attribute-routing function — this is the existing
//   documented fallback and requires no migration.
//
// DO NOT:
//   - Rename or move image files (filenames are the stable key).
//   - Reuse a retired ID.
//   - Add external CDN URLs — all imageUrls must be local root-relative paths.
// ---------------------------------------------------------------------------

export interface Identity {
  /** Stable unique identifier matching the image filename prefix. Never reuse. */
  id: string;
  /** Human-readable name shown in the UI picker. */
  displayName: string;
  /** Broad gender category — used by the pipeline for garment routing. */
  gender: "womens" | "mens" | "kids";
  /** Model ethnicity — for catalog diversity filtering. */
  ethnicity:
    | "south_asian"
    | "east_asian"
    | "afro_caribbean"
    | "caucasian"
    | "hispanic_latino"
    | "middle_eastern"
    | "mixed";
  /** Age group descriptor — informational; does not drive routing logic. */
  ageGroup:
    | "young_adult"
    | "classic_mid_age"
    | "mature_executive"
    | "teen_youth"
    | "young_child";
  /** Body type descriptor — for garment fit reference. */
  bodyType: "slim" | "athletic" | "standard" | "plus" | "petite" | "tall";
  /** Approximate model height in centimetres — for garment length calibration. */
  heightCm: number;
  /**
   * Root-relative path to the local model image in the frontend public folder.
   * Format: "/identities/<filename>.png"
   * Loaded on the API server as base64 for OpenRouter — never exposed as a URL.
   */
  imageUrl: string;
}

// ---------------------------------------------------------------------------
// Global Identity Library — 26 production-approved studio assets (+ Gen2 benchmarks)
// ---------------------------------------------------------------------------
// All images share the same studio standard:
//   ✓ Pure white / light grey seamless studio background
//   ✓ Full body visible head to feet, standing upright
//   ✓ Frontal neutral pose, arms away from torso
//   ✓ Soft, even studio lighting — no harsh shadows
//   ✓ Plain grey fitted t-shirt + shorts — no accessories, no branding
//   ✓ Barefoot — full leg length visible
//   ✓ Verified local file, production-approved 2026-07-30
// ---------------------------------------------------------------------------

export const IDENTITIES: Identity[] = [
  // ── WOMEN'S ──────────────────────────────────────────────────────────────

  {
    id: "F-IN-01",
    displayName: "Aarohi",
    gender: "womens",
    ethnicity: "south_asian",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 165,
    imageUrl: "/identities/F-IN-01.png",
  },
  {
    id: "F-CA-01",
    displayName: "Emma",
    gender: "womens",
    ethnicity: "caucasian",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 170,
    imageUrl: "/identities/F-CA-01.png",
  },
  {
    id: "F-AF-01",
    displayName: "Amina",
    gender: "womens",
    ethnicity: "afro_caribbean",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 168,
    imageUrl: "/identities/F-AF-01.png",
  },
  {
    id: "F-EA-01",
    displayName: "Yuna",
    gender: "womens",
    ethnicity: "east_asian",
    ageGroup: "young_adult",
    bodyType: "petite",
    heightCm: 162,
    imageUrl: "/identities/F-EA-01.png",
  },
  {
    id: "F-ME-01",
    displayName: "Layla",
    gender: "womens",
    ethnicity: "middle_eastern",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 165,
    imageUrl: "/identities/F-ME-01.png",
  },
  {
    id: "F-IN-02",
    displayName: "Ishani",
    gender: "womens",
    ethnicity: "south_asian",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 166,
    imageUrl: "/identities/F-IN-02.png",
  },
  {
    id: "F-AF-02",
    displayName: "Naomi",
    gender: "womens",
    ethnicity: "afro_caribbean",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 169,
    imageUrl: "/identities/F-AF-02.png",
  },
  {
    id: "F-CA-02",
    displayName: "Clara",
    gender: "womens",
    ethnicity: "caucasian",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 171,
    imageUrl: "/identities/F-CA-02.png",
  },
  {
    id: "F-ME-02",
    displayName: "Leila",
    gender: "womens",
    ethnicity: "middle_eastern",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 164,
    imageUrl: "/identities/F-ME-02.png",
  },
  {
    id: "F-EA-02",
    displayName: "Hana",
    gender: "womens",
    ethnicity: "east_asian",
    ageGroup: "young_adult",
    bodyType: "petite",
    heightCm: 161,
    imageUrl: "/identities/F-EA-02.png",
  },

  // ── MEN'S ────────────────────────────────────────────────────────────────

  {
    id: "M-IN-01",
    displayName: "Arjun",
    gender: "mens",
    ethnicity: "south_asian",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 178,
    imageUrl: "/identities/M-IN-01.png",
  },
  {
    id: "M-CA-01",
    displayName: "Liam",
    gender: "mens",
    ethnicity: "caucasian",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 182,
    imageUrl: "/identities/M-CA-01.png",
  },
  {
    id: "M-AF-01",
    displayName: "Kwame",
    gender: "mens",
    ethnicity: "afro_caribbean",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 185,
    imageUrl: "/identities/M-AF-01.png",
  },
  {
    id: "M-EA-01",
    displayName: "Kenji",
    gender: "mens",
    ethnicity: "east_asian",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 176,
    imageUrl: "/identities/M-EA-01.png",
  },
  {
    id: "M-ME-01",
    displayName: "Omar",
    gender: "mens",
    ethnicity: "middle_eastern",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 180,
    imageUrl: "/identities/M-ME-01.png",
  },
  {
    id: "M-IN-02",
    displayName: "Rohan",
    gender: "mens",
    ethnicity: "south_asian",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 179,
    imageUrl: "/identities/M-IN-02.png",
  },
  {
    id: "M-AF-02",
    displayName: "Marcus",
    gender: "mens",
    ethnicity: "afro_caribbean",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 186,
    imageUrl: "/identities/M-AF-02.png",
  },
  {
    id: "M-CA-02",
    displayName: "Noah",
    gender: "mens",
    ethnicity: "caucasian",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 183,
    imageUrl: "/identities/M-CA-02.png",
  },
  {
    id: "M-ME-02",
    displayName: "Amir",
    gender: "mens",
    ethnicity: "middle_eastern",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 181,
    imageUrl: "/identities/M-ME-02.png",
  },
  {
    id: "M-EA-02",
    displayName: "Ren",
    gender: "mens",
    ethnicity: "east_asian",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 177,
    imageUrl: "/identities/M-EA-02.png",
  },

  // ── GENERATION 2 BENCHMARKS ──────────────────────────────────────────────

  {
    id: "F-TEST-02",
    displayName: "Emma Base (Gen2)",
    gender: "womens",
    ethnicity: "caucasian",
    ageGroup: "young_adult",
    bodyType: "slim",
    heightCm: 170,
    imageUrl: "/identities/F-Test-02.png",
  },
  {
    id: "M-TEST-02",
    displayName: "Liam Base (Gen2)",
    gender: "mens",
    ethnicity: "caucasian",
    ageGroup: "young_adult",
    bodyType: "athletic",
    heightCm: 182,
    imageUrl: "/identities/M-Test-02.png",
  },

  // ── KIDS' ────────────────────────────────────────────────────────────────

  {
    id: "K-B-01",
    displayName: "Ethan",
    gender: "kids",
    ethnicity: "south_asian",
    ageGroup: "young_child",
    bodyType: "standard",
    heightCm: 128,
    imageUrl: "/identities/K-B-01.png",
  },
  {
    id: "K-G-01",
    displayName: "Mia",
    gender: "kids",
    ethnicity: "south_asian",
    ageGroup: "young_child",
    bodyType: "slim",
    heightCm: 118,
    imageUrl: "/identities/K-G-01.png",
  },
  {
    id: "K-B-02",
    displayName: "Leo",
    gender: "kids",
    ethnicity: "south_asian",
    ageGroup: "young_child",
    bodyType: "standard",
    heightCm: 130,
    imageUrl: "/identities/K-B-02.png",
  },
  {
    id: "K-G-02",
    displayName: "Lily",
    gender: "kids",
    ethnicity: "south_asian",
    ageGroup: "young_child",
    bodyType: "slim",
    heightCm: 120,
    imageUrl: "/identities/K-G-02.png",
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the Identity matching the given id, or null if not found.
 * Case-sensitive match against the id field.
 * Unknown / legacy IDs return null — callers should fall back to
 * attribute-based routing (selectModelImage) when null is returned.
 */
export function findIdentityById(id: string): Identity | null {
  return IDENTITIES.find((identity) => identity.id === id) ?? null;
}
