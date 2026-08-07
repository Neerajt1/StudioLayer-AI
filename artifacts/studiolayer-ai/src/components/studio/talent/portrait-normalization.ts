// ---------------------------------------------------------------------------
// Portrait Normalization — Sprint 3.3
//
// Detected person bounds within transparent PNG masters (alpha channel).
// Used to scale by human body height, not PNG canvas size.
// Generated from public/identities/*.png — do not modify portraits.
// ---------------------------------------------------------------------------

export interface PersonBounds {
  /** Normalized top of subject (0–1 from image top) */
  personTop: number;
  /** Normalized bottom of subject (feet) */
  personBottom: number;
  /** personBottom − personTop */
  personHeight: number;
}

export const PORTRAIT_PERSON_BOUNDS: Record<string, PersonBounds> = {
  'F-CA-01': { personTop: 0.0104, personBottom: 0.9629, personHeight: 0.9525 },
  'M-CA-01': { personTop: 0.01, personBottom: 0.9553, personHeight: 0.9453 },
  'F-IN-01': { personTop: 0.0202, personBottom: 0.918, personHeight: 0.8978 },
  'M-IN-01': { personTop: 0.0091, personBottom: 0.9642, personHeight: 0.9551 },
  'F-AF-01': { personTop: 0.0182, personBottom: 0.9629, personHeight: 0.9447 },
  'M-AF-01': { personTop: 0.0098, personBottom: 0.9694, personHeight: 0.9596 },
  'F-EA-01': { personTop: 0.0169, personBottom: 0.9082, personHeight: 0.8913 },
  'M-EA-01': { personTop: 0.0293, personBottom: 0.9753, personHeight: 0.946 },
  'F-ME-01': { personTop: 0.0352, personBottom: 0.9452, personHeight: 0.91 },
  'M-ME-01': { personTop: 0.0462, personBottom: 0.9681, personHeight: 0.9219 },
  'K-G-01': { personTop: 0.0312, personBottom: 0.9714, personHeight: 0.9401 },
  'K-B-01': { personTop: 0.0208, personBottom: 0.9727, personHeight: 0.9518 },
  'F-CA-02': { personTop: 0.0228, personBottom: 0.9714, personHeight: 0.9486 },
  'M-CA-02': { personTop: 0.0212, personBottom: 0.9571, personHeight: 0.9359 },
  'F-IN-02': { personTop: 0.0273, personBottom: 0.972, personHeight: 0.9447 },
  'M-IN-02': { personTop: 0.0135, personBottom: 0.9641, personHeight: 0.9506 },
  'F-AF-02': { personTop: 0.0135, personBottom: 0.96, personHeight: 0.9465 },
  'M-AF-02': { personTop: 0.0218, personBottom: 0.9641, personHeight: 0.9424 },
  'F-EA-02': { personTop: 0.0176, personBottom: 0.9837, personHeight: 0.9661 },
  'M-EA-02': { personTop: 0.0171, personBottom: 0.9553, personHeight: 0.9382 },
  'F-ME-02': { personTop: 0.0111, personBottom: 0.9837, personHeight: 0.9727 },
  'M-ME-02': { personTop: 0.0241, personBottom: 0.9565, personHeight: 0.9324 },
  'K-G-02': { personTop: 0.0208, personBottom: 0.9824, personHeight: 0.9616 },
  'K-B-02': { personTop: 0.0218, personBottom: 0.9635, personHeight: 0.9417 },
};

/** Adults target full slot body height; kids intentionally smaller. */
export const ADULT_BODY_SLOT_FILL = 1;
export const KID_BODY_SLOT_FILL = 0.78;

export function getPersonBounds(id: string): PersonBounds {
  return PORTRAIT_PERSON_BOUNDS[id] ?? {
    personTop: 0.02,
    personBottom: 0.96,
    personHeight: 0.94,
  };
}

export function bodySlotFillForId(id: string): number {
  return id.startsWith('K-') ? KID_BODY_SLOT_FILL : ADULT_BODY_SLOT_FILL;
}
