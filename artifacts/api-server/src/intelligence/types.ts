// ---------------------------------------------------------------------------
// StudioLayer AI — Intelligence Layer Types (SL-013A)
//
// All types shared across the intelligence modules.
// Completely independent from the rendering pipeline.
// ---------------------------------------------------------------------------

// ── Garment Profile ──────────────────────────────────────────────────────────

export type GarmentCategory =
  | "tops"
  | "bottoms"
  | "one-pieces"
  | "outerwear"
  | "footwear"
  | "accessories";

export interface GarmentProfile {
  /** V1.6-aligned category. */
  category: GarmentCategory;
  /** Specific garment type, e.g. "blouse", "jeans", "trench coat". */
  subcategory: string;
  gender: "womens" | "mens" | "kids" | "unisex";
  ageGroup: "young_child" | "teen_youth" | "young_adult" | "classic_mid_age" | "mature_executive";
  /** Detected primary colours, e.g. ["camel", "beige"]. */
  colour: string[];
  /** Cut/silhouette, e.g. "slim", "relaxed", "oversized", "fitted". */
  fit: string;
  /** Primary fabric, e.g. "satin", "denim", "cotton", "linen". */
  fabric: string;
  /** e.g. "short", "long", "sleeveless". Undefined for non-sleeve garments. */
  sleeveType?: string;
  /** e.g. "full", "half", "three-quarter". */
  sleeveLength?: string;
  /** e.g. "crew", "v-neck", "square", "turtleneck". */
  neckline?: string;
  /** e.g. "spread", "button-down", "band", "none". */
  collar?: string;
  /** e.g. "cropped", "hip", "knee", "midi", "maxi", "full-length". */
  garmentLength?: string;
  /** e.g. "solid", "stripe", "floral", "check", "plaid", "geometric". */
  pattern: string;
  /** e.g. "smooth", "textured", "knit", "woven". */
  texture: string;
  /** e.g. ["spring", "autumn", "summer", "winter"]. */
  season: string[];
  /** e.g. ["office", "casual", "evening", "sport"]. */
  occasion: string[];
}

// ── Style Modes ───────────────────────────────────────────────────────────────

export type StyleMode =
  | "ecommerce_catalog"    // ← active in UI
  | "casual"
  | "smart_casual"
  | "business_casual"
  | "luxury"
  | "minimal"
  | "streetwear"
  | "old_money"
  | "editorial"
  | "athleisure"
  | "kids_casual";

// ── Outfit Recommendation ─────────────────────────────────────────────────────

export interface RecommendedOutfit {
  top?: string;
  bottom?: string;
  innerLayer?: string;
  outerwear?: string;
  footwear?: string;
  accessories?: string[];
  // Future accessory categories — ready but unused:
  // belt?: string;
  // watch?: string;
  // handbag?: string;
  // jewellery?: string;
  // cap?: string;
  // eyewear?: string;
  // scarf?: string;
}

export interface OutfitRecommendation {
  styleMode: StyleMode;
  uploadedGarment: {
    category: GarmentCategory;
    subcategory: string;
  };
  recommendedOutfit: RecommendedOutfit;
  /** 0–1 confidence in this recommendation. */
  confidence: number;
  /** Which engine produced this recommendation. */
  decisionSource: "rule_engine" | "gpt" | "rule_engine_gpt_enhanced";
  /** The KB rule ID that matched, if rule engine was used. */
  ruleId?: string;
}

// ── Knowledge Base JSON Schema ─────────────────────────────────────────────────

export interface KBRuleMatch {
  category?: GarmentCategory | GarmentCategory[];
  subcategory?: string | string[];
  gender?: string | string[];
  fabric?: string | string[];
  fit?: string | string[];
  colour?: string | string[];
  pattern?: string | string[];
  occasion?: string | string[];
}

export interface KBRule {
  id: string;
  name: string;
  match: KBRuleMatch;
  recommendations: {
    tops?: string[];
    bottoms?: string[];
    innerLayer?: string[];
    outerwear?: string[];
    footwear?: string[];
    accessories?: string[];
  };
  /** Rule-level base confidence, 0–1. Combined with match score at runtime. */
  confidence: number;
  tags?: string[];
}

export interface KBStyleMode {
  description: string;
  rules: KBRule[];
}

export interface KnowledgeBase {
  version: string;
  region: string;
  description: string;
  styleModes: Partial<Record<StyleMode, KBStyleMode>>;
}
