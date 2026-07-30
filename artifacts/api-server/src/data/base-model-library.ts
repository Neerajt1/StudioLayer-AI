// ---------------------------------------------------------------------------
// BASE MODEL LIBRARY — SL-016
//
// Pre-Styled Base Model Library for StudioLayer AI.
//
// Each BaseModel record is a curated model image pre-styled with complementary
// clothing for a specific garment category. FASHN V1.6 preserves all visible
// clothing on the model image that is NOT in the uploaded garment's category
// slot — so selecting a model image that already wears correct complementary
// items directly improves output quality without any API changes.
//
// SELECTION PRIORITY (ai-pipeline.ts):
//   1. User-selected modelIdentityId → Identity Library (always wins)
//   2. No identity selected → BaseModelSelector (this library)
//   3. BaseModelSelector returns null → selectModelImage() (legacy fallback)
//
// IMAGE URLS:
//   All imageUrls in this version are Unsplash placeholders, proven compatible
//   with FASHN V1.6. These will be replaced by AI-generated, purpose-built
//   base model images in SL-017 (FLUX integration sprint).
//
// FUTURE EXTENSIBILITY (Part 10):
//   Optional fields are defined but not yet used in selection logic.
//   Add values and extend selectBaseModel() as each dimension is activated.
//   No schema changes are needed — just populate the optional fields and
//   add filter clauses to selectBaseModel().
//
// DO NOT:
//   - Remove or rename existing IDs (renders may reference them in logs).
//   - Use external CDN URLs other than Unsplash placeholders (security policy).
//   - Add imageUrls for local /identities/... paths — those belong in identity-library.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Visual styling register for the base model image.
 * Determines the complementary garments visible on the model.
 *
 * minimal    — Clean, neutral items; white studio; commercial catalog.
 * casual     — Relaxed, everyday styling; sneakers; approachable.
 * business   — Formal/professional; tailored trousers; Oxford shoes.
 * luxury     — High-end editorial; premium fabrics; architectural styling.
 * street     — Urban streetwear; layering; relaxed silhouettes.
 * editorial  — Fashion-forward; magazine aesthetic; bold complementary items.
 */
export type StyleTemplate =
  | "minimal"
  | "casual"
  | "business"
  | "luxury"
  | "street"
  | "editorial";

export type BaseModelGender = "womens" | "mens" | "kids";

/**
 * Maps directly to fal-ai/fashn/tryon/v1.6 category values.
 * The model image must show a model where the target category slot is
 * occupied by a placeholder garment that FASHN will replace with the upload.
 */
export type BaseModelCategory = "tops" | "bottoms" | "one-pieces";

export interface BaseModel {
  /** Stable unique identifier. Format: BASE-{gender_prefix}-{category_prefix}-{seq}. Never reuse. */
  id: string;

  /** Broad gender category — matches FASHN gender routing. */
  gender: BaseModelGender;

  /**
   * Garment category this base model is optimised for.
   * The model wears placeholder clothing in this slot; FASHN replaces it
   * with the uploaded garment. All other visible clothing is preserved.
   */
  category: BaseModelCategory;

  /**
   * Visual styling register of the complementary items visible in the image.
   * Determines the aesthetic of the final rendered output.
   */
  styleTemplate: StyleTemplate;

  /**
   * URL of the model image. Currently Unsplash placeholders (SL-016).
   * Will be replaced by FLUX-generated purpose-built images in SL-017.
   * Must be an absolute https:// URL publicly reachable by fal.ai.
   */
  imageUrl: string;

  /**
   * Human-readable description of the complementary styling in the image.
   * Used in developer logs and for future image-generation prompt derivation.
   */
  description: string;

  /**
   * When false, this model is excluded from selection without being deleted.
   * Toggle to disable a model if its image quality is below standard.
   */
  active: boolean;

  /**
   * Lower number = higher selection priority among models matching the same
   * gender × category × styleTemplate combination.
   * Enables A/B rotation without code changes — add a second entry with
   * the same combination at a different priority.
   */
  priority: number;

  // ── Future extensibility fields (Part 10) ─────────────────────────────────
  // All optional — undefined means "any / no filter". Populate and add filter
  // clauses to selectBaseModel() as each dimension is activated in SL-017+.

  /** Season the complementary styling is appropriate for. */
  season?: "spring_summer" | "autumn_winter" | "all_season";

  /** Occasion context of the complementary styling. */
  occasion?: "everyday" | "formal" | "sport" | "occasion";

  /**
   * Regional styling market this model is optimised for.
   * Matches regional knowledge-base IDs: "india", "europe", "us", etc.
   */
  region?: string;

  /** Body type of the base model — for garment fit and length calibration. */
  bodyType?: "slim" | "athletic" | "standard" | "plus" | "petite" | "tall";

  /** Age group of the base model. */
  ageGroup?: "young_adult" | "classic_mid_age" | "mature_executive" | "teen_youth" | "young_child";

  /** Ethnicity of the base model — for catalog diversity filtering. */
  ethnicity?: string;

  /**
   * Background / scene theme of the model image.
   * white_studio is the SL-016 default. lifestyle/outdoor reserved for SL-017+.
   */
  backgroundTheme?: "white_studio" | "lifestyle" | "editorial_set" | "outdoor";

  /**
   * Fashion trend tag for trend-driven seasonal selection.
   * Free-text; to be normalised in a future sprint.
   */
  fashionTrend?: string;
}

// ---------------------------------------------------------------------------
// Base Model Library — 14 initial entries (SL-016)
//
// Image URLs: Unsplash placeholders, all proven FASHN-compatible.
//   Parameter convention: w=768, q=85, fit=crop, crop=top
//   These will be replaced by FLUX-generated purpose-built images in SL-017.
//
// Complementary styling described per entry — this is the target state.
// Current placeholder images approximate the correct gender/pose; the described
// styling will be accurate after SL-017 image generation.
// ---------------------------------------------------------------------------

export const BASE_MODELS: BaseModel[] = [

  // ── WOMEN'S — TOPS ────────────────────────────────────────────────────────
  // Model wears: placeholder top (FASHN replaces this slot).
  // Visible complementary items: neutral fitted trousers + minimal footwear.

  {
    id: "BASE-F-TOPS-01",
    gender: "womens",
    category: "tops",
    styleTemplate: "minimal",
    imageUrl:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop&crop=top",
    description:
      "Women's minimal base — neutral fitted trousers (beige/white), pointed flats, hair up, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "slim",
    ageGroup: "young_adult",
  },

  {
    id: "BASE-F-TOPS-02",
    gender: "womens",
    category: "tops",
    styleTemplate: "casual",
    imageUrl:
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=768&q=85&fit=crop&crop=top",
    description:
      "Women's casual base — relaxed straight-leg jeans, white sneakers, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "slim",
    ageGroup: "young_adult",
  },

  // ── WOMEN'S — BOTTOMS ─────────────────────────────────────────────────────
  // Model wears: placeholder bottom (FASHN replaces this slot).
  // Visible complementary items: neutral top + minimal footwear.

  {
    id: "BASE-F-BOTTOMS-01",
    gender: "womens",
    category: "bottoms",
    styleTemplate: "minimal",
    imageUrl:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop&crop=top",
    description:
      "Women's minimal base for bottoms — white scoop-neck t-shirt (no branding), white minimal sneakers, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "slim",
    ageGroup: "young_adult",
  },

  {
    id: "BASE-F-BOTTOMS-02",
    gender: "womens",
    category: "bottoms",
    styleTemplate: "casual",
    imageUrl:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop&crop=top",
    description:
      "Women's casual base for bottoms — ribbed nude-tone fitted top, strappy flat sandals, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "slim",
    ageGroup: "young_adult",
  },

  // ── WOMEN'S — ONE-PIECES ──────────────────────────────────────────────────
  // Model wears: placeholder dress/jumpsuit (FASHN replaces entire garment slot).
  // Visible complementary items: footwear only — no other garments visible.

  {
    id: "BASE-F-DRESS-01",
    gender: "womens",
    category: "one-pieces",
    styleTemplate: "minimal",
    imageUrl:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop&crop=top",
    description:
      "Women's minimal base for dresses/one-pieces — nude block heels, minimal jewellery, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "slim",
    ageGroup: "young_adult",
  },

  {
    id: "BASE-F-DRESS-02",
    gender: "womens",
    category: "one-pieces",
    styleTemplate: "casual",
    imageUrl:
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=768&q=85&fit=crop&crop=top",
    description:
      "Women's casual base for dresses/one-pieces — white low-top sneakers, no accessories, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "slim",
    ageGroup: "young_adult",
  },

  // ── MEN'S — TOPS ──────────────────────────────────────────────────────────
  // Model wears: placeholder top (FASHN replaces this slot).
  // Visible complementary items: neutral trousers + appropriate footwear.

  {
    id: "BASE-M-TOPS-01",
    gender: "mens",
    category: "tops",
    styleTemplate: "minimal",
    imageUrl:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=768&q=85&fit=crop&crop=top",
    description:
      "Men's minimal base — neutral slim-fit chinos (sand/beige), white clean leather sneakers, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "athletic",
    ageGroup: "young_adult",
  },

  {
    id: "BASE-M-TOPS-02",
    gender: "mens",
    category: "tops",
    styleTemplate: "business",
    imageUrl:
      "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=768&q=85&fit=crop&crop=top",
    description:
      "Men's business base — dark slim trousers, white Oxford shoes, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "athletic",
    ageGroup: "classic_mid_age",
  },

  // ── MEN'S — BOTTOMS ───────────────────────────────────────────────────────
  // Model wears: placeholder bottom (FASHN replaces this slot).
  // Visible complementary items: neutral top + appropriate footwear.

  {
    id: "BASE-M-BOTTOMS-01",
    gender: "mens",
    category: "bottoms",
    styleTemplate: "minimal",
    imageUrl:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop&crop=top",
    description:
      "Men's minimal base for bottoms — white crew-neck t-shirt (no branding), white clean sneakers, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "athletic",
    ageGroup: "young_adult",
  },

  {
    id: "BASE-M-BOTTOMS-02",
    gender: "mens",
    category: "bottoms",
    styleTemplate: "casual",
    imageUrl:
      "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=768&q=85&fit=crop&crop=top",
    description:
      "Men's casual base for bottoms — grey ribbed polo (no branding), white clean sneakers, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "athletic",
    ageGroup: "young_adult",
  },

  // ── MEN'S — ONE-PIECES ────────────────────────────────────────────────────
  // Model wears: placeholder suit/jumpsuit (FASHN replaces entire garment slot).
  // Visible complementary items: dress shirt + shoes — appropriate for formalwear base.

  {
    id: "BASE-M-SUIT-01",
    gender: "mens",
    category: "one-pieces",
    styleTemplate: "business",
    imageUrl:
      "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=768&q=85&fit=crop&crop=top",
    description:
      "Men's business base for suits/one-pieces — white dress shirt, black leather Oxford shoes, no tie, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "athletic",
    ageGroup: "young_adult",
  },

  // ── KIDS' — TOPS ──────────────────────────────────────────────────────────

  {
    id: "BASE-K-TOPS-01",
    gender: "kids",
    category: "tops",
    styleTemplate: "casual",
    imageUrl:
      "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=768&q=85&fit=crop&crop=top",
    description:
      "Kids' casual base for tops — neutral jogger trousers, plain white trainers, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "standard",
    ageGroup: "young_child",
  },

  // ── KIDS' — BOTTOMS ───────────────────────────────────────────────────────

  {
    id: "BASE-K-BOTTOMS-01",
    gender: "kids",
    category: "bottoms",
    styleTemplate: "casual",
    imageUrl:
      "https://images.unsplash.com/photo-1555009393-f20bdb245c4d?w=768&q=85&fit=crop&crop=top",
    description:
      "Kids' casual base for bottoms — plain white tee (no branding), plain white trainers, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "standard",
    ageGroup: "young_child",
  },

  // ── KIDS' — ONE-PIECES ────────────────────────────────────────────────────

  {
    id: "BASE-K-DRESS-01",
    gender: "kids",
    category: "one-pieces",
    styleTemplate: "minimal",
    imageUrl:
      "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=768&q=85&fit=crop&crop=top",
    description:
      "Kids' minimal base for dresses — white socks, plain mary-jane shoes, white studio. " +
      "PLACEHOLDER: Replace with FLUX-generated image in SL-017.",
    active: true,
    priority: 1,
    season: "all_season",
    backgroundTheme: "white_studio",
    bodyType: "slim",
    ageGroup: "young_child",
  },
];

// ---------------------------------------------------------------------------
// BaseModelSelector — deterministic model selection (Part 4)
//
// Selection algorithm (in priority order):
//   1. Exact match: active + gender + category + styleTemplate, sorted by priority
//   2. Style fallback: same gender + category, "minimal" template (if requested template has no entry)
//   3. Category fallback: any active model for gender + category, any template
//   4. Returns null → caller falls back to Identity Library / selectModelImage()
//
// The function is deterministic for a given input combination. It never throws.
// ---------------------------------------------------------------------------

/** Normalises gender strings from the pipeline to BaseModelGender. */
function normalizeGender(gender: string | null | undefined): BaseModelGender {
  if (gender === "mens")   return "mens";
  if (gender === "kids")   return "kids";
  return "womens"; // default — covers "womens", null, undefined, unrecognised
}

/**
 * Selects the best matching active base model for the given gender, garment
 * category, and style template.
 *
 * Returns null when no suitable active model exists — the caller must fall
 * back to a different selection strategy. Rendering must never fail (Part 8).
 */
export function selectBaseModel(
  gender: string | null | undefined,
  category: BaseModelCategory,
  styleTemplate: StyleTemplate = "minimal",
): BaseModel | null {
  const g = normalizeGender(gender);
  const activeModels = BASE_MODELS.filter((m) => m.active);

  // Pass 1: exact match on gender + category + styleTemplate
  const exact = activeModels
    .filter((m) => m.gender === g && m.category === category && m.styleTemplate === styleTemplate)
    .sort((a, b) => a.priority - b.priority);
  if (exact.length > 0) return exact[0]!;

  // Pass 2: style template fallback — same gender + category, "minimal" template
  //         (only runs when the requested template has no entry)
  if (styleTemplate !== "minimal") {
    const minimalFallback = activeModels
      .filter((m) => m.gender === g && m.category === category && m.styleTemplate === "minimal")
      .sort((a, b) => a.priority - b.priority);
    if (minimalFallback.length > 0) return minimalFallback[0]!;
  }

  // Pass 3: category fallback — any active model for gender + category
  const categoryFallback = activeModels
    .filter((m) => m.gender === g && m.category === category)
    .sort((a, b) => a.priority - b.priority);
  if (categoryFallback.length > 0) return categoryFallback[0]!;

  // No match — return null; caller must handle fallback
  return null;
}

// ---------------------------------------------------------------------------
// StyleTemplate mapper — derives a StyleTemplate from the Intelligence Engine's
// styleMode string. Forward-compatible: new style modes map to "minimal" by
// default until explicitly wired up.
//
// Current Intelligence Engine always returns "ecommerce_catalog" → "minimal".
// ---------------------------------------------------------------------------

/**
 * Maps an Intelligence Engine styleMode string to a StyleTemplate.
 * All unmapped or future modes default to "minimal".
 */
export function mapStyleModeToTemplate(styleMode: string | undefined): StyleTemplate {
  const mapping: Record<string, StyleTemplate> = {
    // Current (SL-013A)
    ecommerce_catalog:      "minimal",
    // Reserved for future style modes (SL-013A types.ts)
    editorial_fashion:      "editorial",
    street_style:           "street",
    business_professional:  "business",
    luxury_brand:           "luxury",
    casual_lifestyle:       "casual",
    sport_active:           "casual",
    resort_vacation:        "casual",
    avant_garde:            "editorial",
    minimalist:             "minimal",
  };
  return mapping[styleMode ?? ""] ?? "minimal";
}
