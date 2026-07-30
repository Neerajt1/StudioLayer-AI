// ---------------------------------------------------------------------------
// StudioLayer AI — Fashion Knowledge Base (SL-013A)
//
// Loads structured outfit rules from JSON files. The knowledge base is
// editable without changing TypeScript application code — only the JSON
// files need to be updated.
//
// SUPPORTED REGIONS:
//   default, india, europe, us, middle-east, east-asia
//
// ADDING A NEW REGION:
//   1. Create src/data/fashion-kb/regional/<region>.json
//   2. Add one import + one entry to REGIONAL_KBS below
//   3. Rebuild (no other code changes required)
// ---------------------------------------------------------------------------

import defaultKB  from "../data/fashion-kb/default.json";
import indiaKB    from "../data/fashion-kb/regional/india.json";
import europeKB   from "../data/fashion-kb/regional/europe.json";
import usKB       from "../data/fashion-kb/regional/us.json";
import middleEastKB from "../data/fashion-kb/regional/middle-east.json";
import eastAsiaKB from "../data/fashion-kb/regional/east-asia.json";

import type {
  GarmentProfile,
  GarmentCategory,
  KBRule,
  KBStyleMode,
  KnowledgeBase,
  StyleMode,
} from "./types";

// ---------------------------------------------------------------------------
// Region map — single source of truth for available regional packs
// ---------------------------------------------------------------------------

const REGIONAL_KBS: Record<string, KnowledgeBase> = {
  default:     defaultKB as KnowledgeBase,
  india:       indiaKB   as KnowledgeBase,
  europe:      europeKB  as KnowledgeBase,
  us:          usKB      as KnowledgeBase,
  "middle-east": middleEastKB as KnowledgeBase,
  "east-asia": eastAsiaKB as KnowledgeBase,
};

// ---------------------------------------------------------------------------
// Match scoring helpers
// ---------------------------------------------------------------------------

/** Weights for each match field. Category must match; others are optional. */
const FIELD_WEIGHTS: Record<string, number> = {
  category:    4.0,
  subcategory: 3.0,
  gender:      2.0,
  fabric:      2.0,
  fit:         1.5,
  colour:      1.0,
  pattern:     1.0,
  occasion:    1.0,
};

/**
 * Returns true if `needle` (a profile scalar value) is matched by
 * `ruleValue` (a string or string[] from the KB rule's match object).
 */
function matchScalar(
  ruleValue: string | string[] | undefined,
  needle: string | undefined,
): boolean {
  if (ruleValue === undefined || needle === undefined) return false;
  const needleLower = needle.toLowerCase();
  if (Array.isArray(ruleValue)) {
    return ruleValue.some((v) => v.toLowerCase() === needleLower);
  }
  return ruleValue.toLowerCase() === needleLower;
}

/**
 * Returns true if any value in `needles` (a profile array field) is matched
 * by `ruleValue` (a string or string[] from the KB rule's match object).
 */
function matchArray(
  ruleValue: string | string[] | undefined,
  needles: string[] | undefined,
): boolean {
  if (ruleValue === undefined || !needles?.length) return false;
  const needlesLower = needles.map((n) => n.toLowerCase());
  if (Array.isArray(ruleValue)) {
    return ruleValue.some((v) => needlesLower.includes(v.toLowerCase()));
  }
  return needlesLower.includes(ruleValue.toLowerCase());
}

/**
 * Scores a KB rule against a garment profile.
 * Returns 0 if the category does not match (hard filter).
 * Returns a 0–1 score otherwise, weighted by which fields are specified
 * in the rule's match object and how many of them match the profile.
 */
export function scoreRule(rule: KBRule, profile: GarmentProfile): number {
  const m = rule.match;

  // Hard filter: category must match
  const categoryMatch = matchScalar(
    m.category as string | string[] | undefined,
    profile.category,
  );
  if (!categoryMatch) return 0;

  let weightedScore = FIELD_WEIGHTS.category;  // category matched
  let totalPossible = FIELD_WEIGHTS.category;

  // Helper: accumulate weight if field is specified in the rule
  const check = (
    fieldName: string,
    matches: boolean,
  ) => {
    if (FIELD_WEIGHTS[fieldName] === undefined) return;
    totalPossible += FIELD_WEIGHTS[fieldName];
    if (matches) weightedScore += FIELD_WEIGHTS[fieldName];
  };

  if (m.subcategory !== undefined)
    check("subcategory", matchScalar(m.subcategory, profile.subcategory));
  if (m.gender !== undefined)
    check("gender", matchScalar(m.gender, profile.gender));
  if (m.fabric !== undefined)
    check("fabric", matchScalar(m.fabric, profile.fabric));
  if (m.fit !== undefined)
    check("fit", matchScalar(m.fit, profile.fit));
  if (m.colour !== undefined)
    check("colour", matchArray(m.colour, profile.colour));
  if (m.pattern !== undefined)
    check("pattern", matchScalar(m.pattern, profile.pattern));
  if (m.occasion !== undefined)
    check("occasion", matchArray(m.occasion, profile.occasion));

  const normalised = totalPossible > 0 ? weightedScore / totalPossible : 0;
  return normalised * rule.confidence;
}

// ---------------------------------------------------------------------------
// FashionKnowledgeBase
// ---------------------------------------------------------------------------

export interface RuleMatch {
  rule: KBRule;
  score: number;
}

export class FashionKnowledgeBase {
  private readonly kb: KnowledgeBase;
  /** Regional pack merged on top of default (if region != "default"). */
  private readonly regionalKb: KnowledgeBase | null;

  constructor(region = "default") {
    this.kb = REGIONAL_KBS["default"];
    this.regionalKb =
      region !== "default" ? (REGIONAL_KBS[region] ?? null) : null;
  }

  /** Returns the human-readable region name. */
  get region(): string {
    return this.regionalKb?.region ?? this.kb.region;
  }

  /** Returns all rules for a given style mode, regional rules first. */
  getRules(styleMode: StyleMode): KBRule[] {
    const defaultRules =
      (this.kb.styleModes[styleMode] as KBStyleMode | undefined)?.rules ?? [];
    const regionalRules =
      (this.regionalKb?.styleModes[styleMode] as KBStyleMode | undefined)
        ?.rules ?? [];
    // Regional rules take precedence (placed first so highest-score wins)
    return [...regionalRules, ...defaultRules];
  }

  /**
   * Scores all rules against the profile and returns matches sorted
   * by score descending. Only rules with score > 0 are included.
   */
  findMatchingRules(
    profile: GarmentProfile,
    styleMode: StyleMode,
  ): RuleMatch[] {
    return this.getRules(styleMode)
      .map((rule) => ({ rule, score: scoreRule(rule, profile) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /** Returns the best-scoring rule or null if nothing matches. */
  bestMatch(
    profile: GarmentProfile,
    styleMode: StyleMode,
  ): RuleMatch | null {
    const matches = this.findMatchingRules(profile, styleMode);
    return matches[0] ?? null;
  }

  /** Returns a list of available regions. */
  static availableRegions(): string[] {
    return Object.keys(REGIONAL_KBS);
  }
}
