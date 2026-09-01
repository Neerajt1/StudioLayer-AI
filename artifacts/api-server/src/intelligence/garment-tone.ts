// ---------------------------------------------------------------------------
// Garment tone — deterministic, pure classification of GarmentProfile.colour.
//
// This is the ONLY colour semantics in the codebase. It consumes the existing
// garment-analysis signal exactly as it is; it does not extend, re-run or
// re-interpret garment analysis.
//
// Deliberately conservative: an unrecognised or self-contradicting colour set
// yields "unknown", which carries ZERO furniture-selection influence. Garment
// analysis itself is a non-deterministic GPT-4o call, so uncertainty must not
// be amplified into confident furniture decisions.
//
// No LLM call. No network. No image processing. No database. No persistence.
// ---------------------------------------------------------------------------

import type { GarmentProfile } from "./types";

/** How light or dark the garment reads. Primary furniture-contrast signal. */
export type GarmentToneDepth = "light" | "mid" | "dark" | "unknown";

/** Warm/cool family. Secondary refinement only — never the primary signal. */
export type GarmentToneTemperature = "warm" | "cool" | "neutral" | "unknown";

/**
 * Canonical garment tone.
 *
 * Depth and temperature are independent because real colours belong to several
 * families at once (beige is light AND warm; navy is dark AND cool; charcoal is
 * dark AND neutral). Collapsing them into one enum would force false choices.
 */
export interface GarmentTone {
  depth: GarmentToneDepth;
  temperature: GarmentToneTemperature;
}

/** No usable signal — furniture scoring must treat this as zero influence. */
export const UNKNOWN_GARMENT_TONE: GarmentTone = {
  depth: "unknown",
  temperature: "unknown",
};

/** True when the tone carries no usable information in either dimension. */
export function isUnknownGarmentTone(tone: GarmentTone | null | undefined): boolean {
  return (
    !tone || (tone.depth === "unknown" && tone.temperature === "unknown")
  );
}

interface ColourClassification {
  depth: Exclude<GarmentToneDepth, "unknown"> | null;
  temperature: Exclude<GarmentToneTemperature, "unknown"> | null;
}

/**
 * Conservative colour lexicon. Deliberately NOT exhaustive — fashion colour
 * naming is unbounded, and guessing produces unstable furniture selection.
 * Anything absent here classifies as unknown, which is the safe outcome.
 *
 * Multi-word entries are matched before their single-word constituents so
 * "dark brown" never degrades into "brown".
 */
const COLOUR_LEXICON: Readonly<Record<string, ColourClassification>> = {
  // Dark
  black: { depth: "dark", temperature: "neutral" },
  charcoal: { depth: "dark", temperature: "neutral" },
  "dark grey": { depth: "dark", temperature: "neutral" },
  "dark gray": { depth: "dark", temperature: "neutral" },
  navy: { depth: "dark", temperature: "cool" },
  midnight: { depth: "dark", temperature: "cool" },
  indigo: { depth: "dark", temperature: "cool" },
  espresso: { depth: "dark", temperature: "warm" },
  "dark brown": { depth: "dark", temperature: "warm" },
  "deep brown": { depth: "dark", temperature: "warm" },
  burgundy: { depth: "dark", temperature: "warm" },
  maroon: { depth: "dark", temperature: "warm" },
  wine: { depth: "dark", temperature: "warm" },

  // Light
  white: { depth: "light", temperature: "neutral" },
  "off white": { depth: "light", temperature: "neutral" },
  "off-white": { depth: "light", temperature: "neutral" },
  ivory: { depth: "light", temperature: "neutral" },
  ecru: { depth: "light", temperature: "neutral" },
  oatmeal: { depth: "light", temperature: "neutral" },
  bone: { depth: "light", temperature: "neutral" },
  "light grey": { depth: "light", temperature: "neutral" },
  "light gray": { depth: "light", temperature: "neutral" },
  cream: { depth: "light", temperature: "warm" },
  beige: { depth: "light", temperature: "warm" },
  sand: { depth: "light", temperature: "warm" },
  peach: { depth: "light", temperature: "warm" },
  lavender: { depth: "light", temperature: "cool" },
  lilac: { depth: "light", temperature: "cool" },
  // "pale" qualifies lightness without naming a hue.
  pale: { depth: "light", temperature: null },

  // Mid — warm
  red: { depth: "mid", temperature: "warm" },
  rust: { depth: "mid", temperature: "warm" },
  terracotta: { depth: "mid", temperature: "warm" },
  orange: { depth: "mid", temperature: "warm" },
  coral: { depth: "mid", temperature: "warm" },
  camel: { depth: "mid", temperature: "warm" },
  tan: { depth: "mid", temperature: "warm" },
  brown: { depth: "mid", temperature: "warm" },
  olive: { depth: "mid", temperature: "warm" },
  khaki: { depth: "mid", temperature: "warm" },
  mustard: { depth: "mid", temperature: "warm" },
  yellow: { depth: "mid", temperature: "warm" },
  gold: { depth: "mid", temperature: "warm" },

  // Mid — cool
  blue: { depth: "mid", temperature: "cool" },
  cyan: { depth: "mid", temperature: "cool" },
  teal: { depth: "mid", temperature: "cool" },
  turquoise: { depth: "mid", temperature: "cool" },
  aqua: { depth: "mid", temperature: "cool" },
  purple: { depth: "mid", temperature: "cool" },
  violet: { depth: "mid", temperature: "cool" },
  "cool grey": { depth: "mid", temperature: "cool" },
  "cool gray": { depth: "mid", temperature: "cool" },

  // Mid — neutral
  grey: { depth: "mid", temperature: "neutral" },
  gray: { depth: "mid", temperature: "neutral" },
  taupe: { depth: "mid", temperature: "neutral" },
  stone: { depth: "mid", temperature: "neutral" },
};

/** Longest phrases first so qualifiers win over their base colour word. */
const LEXICON_PHRASES: readonly string[] = Object.keys(COLOUR_LEXICON)
  .filter((key) => key.includes(" ") || key.includes("-"))
  .sort((a, b) => b.length - a.length || a.localeCompare(b));

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Classify one colour string.
 *
 * English colour names put the qualifier first ("dark brown", "light grey"), so
 * the first lexicon hit scanning left to right is the intended reading. Phrases
 * are tested ahead of single words at every position.
 */
function classifyColour(raw: string): ColourClassification | null {
  const text = normalise(raw);
  if (!text) return null;

  for (const phrase of LEXICON_PHRASES) {
    if (text.includes(phrase)) return COLOUR_LEXICON[phrase]!;
  }

  for (const word of text.split(" ")) {
    const hit = COLOUR_LEXICON[word];
    if (hit) return hit;
  }
  return null;
}

/**
 * Strongest consistent signal wins. A tie is a genuine conflict
 * (["black", "cream"]) and resolves to unknown rather than a coin flip.
 */
function resolveDimension<T extends string>(votes: T[]): T | "unknown" {
  if (votes.length === 0) return "unknown";
  const counts = new Map<T, number>();
  for (const vote of votes) counts.set(vote, (counts.get(vote) ?? 0) + 1);

  let best: T | null = null;
  let bestCount = 0;
  let tied = false;
  // Iterate the sorted key list so the outcome cannot depend on insertion order.
  for (const key of [...counts.keys()].sort()) {
    const count = counts.get(key)!;
    if (count > bestCount) {
      best = key;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }
  return tied || !best ? "unknown" : best;
}

/**
 * Derive garment tone from the existing analysed profile.
 *
 * Pure and deterministic: identical `profile.colour` always yields an identical
 * result. This does NOT make garment analysis itself deterministic — the
 * upstream GPT-4o call can still describe the same garment differently between
 * requests, which is exactly why conflicts resolve to zero-influence unknown.
 */
export function deriveGarmentTone(
  profile: Pick<GarmentProfile, "colour"> | null | undefined,
): GarmentTone {
  const colours = profile?.colour;
  if (!Array.isArray(colours) || colours.length === 0) {
    return UNKNOWN_GARMENT_TONE;
  }

  const depthVotes: Array<Exclude<GarmentToneDepth, "unknown">> = [];
  const temperatureVotes: Array<Exclude<GarmentToneTemperature, "unknown">> = [];

  for (const colour of colours) {
    if (typeof colour !== "string") continue;
    const hit = classifyColour(colour);
    if (!hit) continue;
    if (hit.depth) depthVotes.push(hit.depth);
    if (hit.temperature) temperatureVotes.push(hit.temperature);
  }

  return {
    depth: resolveDimension(depthVotes),
    temperature: resolveDimension(temperatureVotes),
  };
}
