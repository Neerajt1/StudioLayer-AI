// ---------------------------------------------------------------------------
// Talent Layout Spec — Models Placement.pdf + Model names.xlsx
//
// Authoritative Casting Studio layout. Identity assignment is by talent code
// only — never by image comparison, filename order, gender, or ethnicity.
//
// PDF defines spread sequence, slot positions, spacing, and left-to-right order.
// Model names.xlsx defines the 24 talent codes assigned sequentially across
// PDF pages 1–10 (left-to-right within each page).
//
// To change the library: move talentCode entries between slots — do not swap
// image files manually.
// ---------------------------------------------------------------------------

export interface TalentSlotGeometry {
  left: string;
  top: string;
  width: string;
  height: string;
}

export interface TalentLayoutSlot extends TalentSlotGeometry {
  /** Stable talent code — keys cards and resolves identity-library entries */
  talentCode: string;
}

export interface TalentLayoutSpread {
  spreadId: number;
  /** Models Placement.pdf page (1-indexed) */
  pdfPage: number;
  slots: readonly TalentLayoutSlot[];
}

/**
 * Model names.xlsx — approved production sequence (24 entries).
 * Assigned to PDF spreads in reading order, left-to-right per page.
 */
export const TALENT_SEQUENCE: readonly string[] = [
  'F-CA-01',
  'M-CA-01',
  'F-IN-01',
  'M-IN-01',
  'F-AF-01',
  'M-AF-01',
  'F-EA-01',
  'M-EA-01',
  'F-ME-01',
  'M-ME-01',
  'K-G-01',
  'K-B-01',
  'F-CA-02',
  'M-CA-02',
  'F-IN-02',
  'M-IN-02',
  'F-AF-02',
  'M-AF-02',
  'F-EA-02',
  'M-EA-02',
  'F-ME-02',
  'M-ME-02',
  'K-G-02',
  'K-B-02',
] as const;

/**
 * Models Placement.pdf — 10 art-directed spreads.
 * Slot geometry measured from PDF figure bounds (Sprint 3.4 layout pass).
 */
export const TALENT_LAYOUT: readonly TalentLayoutSpread[] = [
  {
    spreadId: 1,
    pdfPage: 1,
    slots: [
      { talentCode: 'F-IN-01', left: '57.5%', top: '19.0%', width: '25.5%', height: '89svh' },
    ],
  },
  {
    spreadId: 2,
    pdfPage: 2,
    slots: [
      { talentCode: 'M-EA-01', left: '4.5%', top: '27.0%', width: '25.5%', height: '77.5svh' },
      { talentCode: 'F-CA-02', left: '30.5%', top: '29.5%', width: '21.0%', height: '74.5svh' },
      { talentCode: 'M-IN-01', left: '52.5%', top: '25.0%', width: '24.5%', height: '81svh' },
    ],
  },
  {
    spreadId: 3,
    pdfPage: 3,
    slots: [
      { talentCode: 'F-AF-01', left: '5.5%', top: '28.0%', width: '19.5%', height: '71.5svh' },
      { talentCode: 'M-CA-01', left: '26.5%', top: '24.0%', width: '24.5%', height: '77svh' },
      { talentCode: 'F-ME-02', left: '51.0%', top: '27.5%', width: '20.5%', height: '71.5svh' },
      { talentCode: 'F-IN-02', left: '72.5%', top: '27.0%', width: '22.5%', height: '72.5svh' },
    ],
  },
  {
    spreadId: 4,
    pdfPage: 4,
    slots: [
      { talentCode: 'M-AF-02', left: '34.5%', top: '34.0%', width: '26.0%', height: '86.5svh' },
      { talentCode: 'M-IN-02', left: '62.0%', top: '37.5%', width: '22.5%', height: '81.5svh' },
    ],
  },
  {
    spreadId: 5,
    pdfPage: 5,
    slots: [
      { talentCode: 'F-EA-01', left: '17.5%', top: '28.5%', width: '25.0%', height: '83.5svh' },
    ],
  },
  {
    spreadId: 6,
    pdfPage: 6,
    slots: [
      { talentCode: 'F-AF-02', left: '11.5%', top: '24.0%', width: '22.0%', height: '77svh' },
      { talentCode: 'M-ME-01', left: '36.5%', top: '19.5%', width: '30.0%', height: '89svh' },
      { talentCode: 'F-EA-02', left: '67.5%', top: '24.0%', width: '22.0%', height: '81.5svh' },
    ],
  },
  {
    spreadId: 7,
    pdfPage: 7,
    slots: [
      { talentCode: 'F-ME-01', left: '8.5%', top: '9.0%', width: '22.5%', height: '87.5svh' },
      { talentCode: 'M-ME-02', left: '34.0%', top: '6.5%', width: '28.0%', height: '92svh' },
    ],
  },
  {
    spreadId: 8,
    pdfPage: 8,
    slots: [
      { talentCode: 'M-CA-02', left: '35.5%', top: '18.5%', width: '29.0%', height: '93.5svh' },
    ],
  },
  {
    spreadId: 9,
    pdfPage: 9,
    slots: [
      { talentCode: 'M-AF-01', left: '3.5%', top: '10.5%', width: '35.5%', height: '96svh' },
      { talentCode: 'F-CA-01', left: '38.0%', top: '15.5%', width: '27.5%', height: '88svh' },
      { talentCode: 'M-EA-02', left: '64.5%', top: '10.5%', width: '32.5%', height: '95.5svh' },
    ],
  },
  {
    spreadId: 10,
    pdfPage: 10,
    slots: [
      { talentCode: 'K-G-01', left: '10.5%', top: '38.0%', width: '16.5%', height: '54.5svh' },
      { talentCode: 'K-G-02', left: '29.0%', top: '29.0%', width: '19.5%', height: '68svh' },
      { talentCode: 'K-B-01', left: '50.5%', top: '36.0%', width: '17.5%', height: '54.8svh' },
      { talentCode: 'K-B-02', left: '70.5%', top: '25.5%', width: '19.5%', height: '68.7svh' },
    ],
  },
];

export const ALL_LAYOUT_TALENT_CODES: readonly string[] = TALENT_LAYOUT.flatMap(
  (spread) => spread.slots.map((slot) => slot.talentCode),
);

if (process.env.NODE_ENV === 'development') {
  const layoutMatchesSequence =
    ALL_LAYOUT_TALENT_CODES.length === TALENT_SEQUENCE.length
    && ALL_LAYOUT_TALENT_CODES.every((code, index) => code === TALENT_SEQUENCE[index]);

  if (!layoutMatchesSequence) {
    console.error(
      '[TalentLayout] TALENT_LAYOUT slot codes must match TALENT_SEQUENCE (Model names.xlsx) in PDF order.',
    );
  }
}

export interface TalentCatalogEntry<T extends { id: string }> {
  spread: TalentLayoutSpread;
  placements: Array<{ talent: T; slot: TalentLayoutSlot }>;
}

/**
 * Resolve identities into the PDF layout by talent code only.
 * Order follows TALENT_LAYOUT — never API response order.
 */
export function buildTalentCatalog<T extends { id: string }>(
  identities: T[],
): TalentCatalogEntry<T>[] {
  const byTalentCode = new Map(identities.map((identity) => [identity.id, identity]));

  return TALENT_LAYOUT.map((spread) => ({
    spread,
    placements: spread.slots.flatMap((slot) => {
      const talent = byTalentCode.get(slot.talentCode);
      return talent ? [{ talent, slot }] : [];
    }),
  }));
}
