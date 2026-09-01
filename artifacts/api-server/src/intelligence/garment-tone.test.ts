// ---------------------------------------------------------------------------
// Garment tone — deterministic colour classification.
//
// The upstream analyser is a non-deterministic GPT-4o call, so the contract
// here is narrow: identical colour input yields identical tone, and anything
// uncertain resolves to unknown (which carries zero furniture influence).
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveGarmentTone,
  isUnknownGarmentTone,
  UNKNOWN_GARMENT_TONE,
} from "./garment-tone";
import type { GarmentProfile } from "./types";

const withColours = (colour: string[]): Pick<GarmentProfile, "colour"> => ({
  colour,
});

describe("deriveGarmentTone — single colours", () => {
  it("black is dark and neutral", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["black"])), {
      depth: "dark",
      temperature: "neutral",
    });
  });

  it("white is light and neutral", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["white"])), {
      depth: "light",
      temperature: "neutral",
    });
  });

  it("navy is dark and cool", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["navy"])), {
      depth: "dark",
      temperature: "cool",
    });
  });

  it("camel is mid and warm", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["camel"])), {
      depth: "mid",
      temperature: "warm",
    });
  });

  it("beige is light and warm", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["beige"])), {
      depth: "light",
      temperature: "warm",
    });
  });

  it("burgundy is dark and warm", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["burgundy"])), {
      depth: "dark",
      temperature: "warm",
    });
  });

  it("charcoal is dark and neutral", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["charcoal"])), {
      depth: "dark",
      temperature: "neutral",
    });
  });
});

describe("deriveGarmentTone — qualifiers beat base colour words", () => {
  it("reads 'dark brown' as dark, not mid brown", () => {
    assert.equal(deriveGarmentTone(withColours(["dark brown"])).depth, "dark");
    assert.equal(deriveGarmentTone(withColours(["brown"])).depth, "mid");
  });

  it("reads 'light grey' as light and 'dark grey' as dark", () => {
    assert.equal(deriveGarmentTone(withColours(["light grey"])).depth, "light");
    assert.equal(deriveGarmentTone(withColours(["dark grey"])).depth, "dark");
    assert.equal(deriveGarmentTone(withColours(["grey"])).depth, "mid");
  });

  it("handles off-white in both spellings", () => {
    for (const value of ["off white", "off-white", "Off-White"]) {
      assert.equal(deriveGarmentTone(withColours([value])).depth, "light", value);
    }
  });

  it("normalizes case and punctuation", () => {
    assert.deepEqual(
      deriveGarmentTone(withColours(["  NAVY.  "])),
      { depth: "dark", temperature: "cool" },
    );
  });
});

describe("deriveGarmentTone — multiple colours", () => {
  it("consistent colours reinforce a single signal", () => {
    assert.deepEqual(deriveGarmentTone(withColours(["cream", "beige"])), {
      depth: "light",
      temperature: "warm",
    });
  });

  it("uses every colour, not just the first", () => {
    // "black" alone would be dark; the two light values outvote it.
    assert.equal(
      deriveGarmentTone(withColours(["black", "cream", "ivory"])).depth,
      "light",
    );
  });

  it("conflicting colours resolve to unknown depth rather than guessing", () => {
    const tone = deriveGarmentTone(withColours(["black", "cream"]));
    assert.equal(tone.depth, "unknown");
  });

  it("resolves the dimensions independently", () => {
    // navy (dark, cool) + charcoal (dark, neutral): depth agrees, temperature ties.
    const tone = deriveGarmentTone(withColours(["navy", "charcoal"]));
    assert.equal(tone.depth, "dark");
    assert.equal(tone.temperature, "unknown");
  });

  it("ignores unrecognised colours instead of letting them vote", () => {
    const tone = deriveGarmentTone(withColours(["navy", "chartreuse"]));
    assert.deepEqual(tone, { depth: "dark", temperature: "cool" });
  });
});

describe("deriveGarmentTone — unknown and degenerate input", () => {
  it("an unrecognised colour is unknown in both dimensions", () => {
    const tone = deriveGarmentTone(withColours(["chartreuse"]));
    assert.deepEqual(tone, UNKNOWN_GARMENT_TONE);
    assert.equal(isUnknownGarmentTone(tone), true);
  });

  it("an empty colour list is unknown", () => {
    assert.deepEqual(deriveGarmentTone(withColours([])), UNKNOWN_GARMENT_TONE);
  });

  it("missing or malformed input is unknown, never a throw", () => {
    assert.deepEqual(deriveGarmentTone(null), UNKNOWN_GARMENT_TONE);
    assert.deepEqual(deriveGarmentTone(undefined), UNKNOWN_GARMENT_TONE);
    assert.deepEqual(
      deriveGarmentTone({ colour: [null, 42, ""] as unknown as string[] }),
      UNKNOWN_GARMENT_TONE,
    );
  });

  it("the analyser fallback profile colour is unknown, not a false signal", () => {
    // garment-analyzer falls back to ["neutral"], which is not a colour word.
    assert.deepEqual(deriveGarmentTone(withColours(["neutral"])), UNKNOWN_GARMENT_TONE);
  });

  it("isUnknownGarmentTone only reports true when both dimensions are unknown", () => {
    assert.equal(isUnknownGarmentTone({ depth: "dark", temperature: "unknown" }), false);
    assert.equal(isUnknownGarmentTone({ depth: "unknown", temperature: "warm" }), false);
    assert.equal(isUnknownGarmentTone(null), true);
  });
});

describe("deriveGarmentTone — determinism", () => {
  it("identical input always yields an identical result", () => {
    const inputs = [
      ["black"],
      ["navy", "cream"],
      ["camel", "olive", "rust"],
      ["chartreuse"],
      [],
    ];
    for (const colours of inputs) {
      const first = deriveGarmentTone(withColours(colours));
      for (let i = 0; i < 25; i++) {
        assert.deepEqual(deriveGarmentTone(withColours(colours)), first);
      }
    }
  });

  it("colour order does not change the outcome", () => {
    assert.deepEqual(
      deriveGarmentTone(withColours(["camel", "olive", "rust"])),
      deriveGarmentTone(withColours(["rust", "camel", "olive"])),
    );
  });
});
