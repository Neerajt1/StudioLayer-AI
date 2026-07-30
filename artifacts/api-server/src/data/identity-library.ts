// ---------------------------------------------------------------------------
// IDENTITY LIBRARY — SL-001
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
  ageGroup: "young_adult" | "classic_mid_age" | "mature_executive" | "teen_youth" | "young_child";
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

const IDENTITIES: Identity[] = [
  {
    id: "W001",
    displayName: "Sofia — Women's, Young Adult",
    gender: "womens",
    ageGroup: "young_adult",
    imageUrl: "https://placeholder.studiolayerai.com/identities/W001.jpg",
  },
  {
    id: "M001",
    displayName: "Marcus — Men's, Young Adult",
    gender: "mens",
    ageGroup: "young_adult",
    imageUrl: "https://placeholder.studiolayerai.com/identities/M001.jpg",
  },
  {
    id: "K001",
    displayName: "Riley — Kids', Teen Youth",
    gender: "kids",
    ageGroup: "teen_youth",
    imageUrl: "https://placeholder.studiolayerai.com/identities/K001.jpg",
  },
  {
    id: "K002",
    displayName: "Alex — Kids', Young Child",
    gender: "kids",
    ageGroup: "young_child",
    imageUrl: "https://placeholder.studiolayerai.com/identities/K002.jpg",
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
