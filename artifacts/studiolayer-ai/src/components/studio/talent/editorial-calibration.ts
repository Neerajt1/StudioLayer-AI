// ---------------------------------------------------------------------------
// Editorial Portrait Calibration — Sprint 3.4
//
// Per-identity visual adjustments for Casting Studio only.
// Applied on top of body normalization — does not affect Production Studio.
// ---------------------------------------------------------------------------

export interface EditorialPortraitCalibration {
  /** Multiplier on perceived body height within slot */
  scale: number;
  /** Vertical shift in px (negative = upward) */
  yOffset: number;
  /** Foot baseline shift in px from slot bottom */
  baseline: number;
}

const DEFAULT_CALIBRATION: EditorialPortraitCalibration = {
  scale: 1,
  yOffset: 0,
  baseline: 0,
};

/**
 * Per-identity editorial calibration.
 * Tuned against Models Placement.pdf — perceived human height & asymmetry.
 */
export const EDITORIAL_PORTRAIT_CALIBRATION: Record<string, EditorialPortraitCalibration> = {
  // ── Spread 1 — Emma, single right ───────────────────────────────────────
  'F-CA-01': { scale: 1.06, yOffset: -6, baseline: 0 },

  // ── Spread 2 — Liam · Aarohi · Arjun ───────────────────────────────────
  'M-CA-01': { scale: 1.00, yOffset: -8, baseline: 0 },
  'F-IN-01': { scale: 0.95, yOffset: 10, baseline: 2 },
  'M-IN-01': { scale: 1.03, yOffset: -12, baseline: 0 },

  // ── Spread 3 — Amina · Kwame · Yuna · Kenji ─────────────────────────────
  'F-AF-01': { scale: 0.97, yOffset: 8, baseline: 0 },
  'M-AF-01': { scale: 1.04, yOffset: -14, baseline: 0 },
  'F-EA-01': { scale: 0.95, yOffset: 10, baseline: 0 },
  'M-EA-01': { scale: 0.99, yOffset: -6, baseline: 0 },

  // ── Spread 4 — Layla · Omar (female shorter) ────────────────────────────
  'F-ME-01': { scale: 0.95, yOffset: 12, baseline: 2 },
  'M-ME-01': { scale: 1.03, yOffset: -10, baseline: 0 },

  // ── Spread 5 — Mia, single left child ───────────────────────────────────
  'K-G-01': { scale: 1.04, yOffset: -4, baseline: 0 },

  // ── Spread 6 — Ethan · Clara · Noah ───────────────────────────────────────
  'K-B-01': { scale: 0.98, yOffset: 6, baseline: 0 },
  'F-CA-02': { scale: 0.98, yOffset: 10, baseline: 0 },
  'M-CA-02': { scale: 1.03, yOffset: -12, baseline: 0 },

  // ── Spread 7 — Ishani · Rohan (female shorter) ──────────────────────────
  'F-IN-02': { scale: 0.93, yOffset: 14, baseline: 2 },
  'M-IN-02': { scale: 1.04, yOffset: -14, baseline: 0 },

  // ── Spread 8 — Naomi, single center ───────────────────────────────────────
  'F-AF-02': { scale: 1.04, yOffset: -8, baseline: 0 },

  // ── Spread 9 — Marcus · Hana · Ren (Hana shorter centre) ────────────────
  'M-AF-02': { scale: 1.01, yOffset: -10, baseline: 0 },
  'F-EA-02': { scale: 0.91, yOffset: 16, baseline: 4 },
  'M-EA-02': { scale: 1.01, yOffset: -8, baseline: 0 },

  // ── Spread 10 — Leila · Amir · Lily · Leo (height rhythm) ───────────────
  'F-ME-02': { scale: 0.97, yOffset: 8, baseline: 0 },
  'M-ME-02': { scale: 0.99, yOffset: -4, baseline: 0 },
  'K-G-02': { scale: 1.06, yOffset: -6, baseline: 0 },
  'K-B-02': { scale: 0.96, yOffset: 4, baseline: 0 },
};

export function getEditorialCalibration(id: string): EditorialPortraitCalibration {
  return EDITORIAL_PORTRAIT_CALIBRATION[id] ?? DEFAULT_CALIBRATION;
}
