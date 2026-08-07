// ---------------------------------------------------------------------------
// Casting Studio — portrait sizing tokens (Sprint 3.2)
//
// Adults dominate the viewport (75–85% height). Children and teens are always
// smaller than adults. Pure #FFFFFF canvas — no shadows or gradients.
// ---------------------------------------------------------------------------

/** Pure studio canvas — identical white across every portrait. */
export const STUDIO_CANVAS_WHITE = '#FFFFFF';

/** Studio Workspace summary cap — unchanged. */
export const TALENT_PORTRAIT_HEIGHT = '38svh';
export const TALENT_SLOT_WIDTH = 'min(42%, 10.5rem)';
export const SUMMARY_PORTRAIT_HEIGHT = '28svh';

/** Casting Studio — explicit editorial size tiers. */
export const PORTRAIT_SIZE_ADULT_HERO = '84svh';
export const PORTRAIT_SIZE_ADULT_STANDARD = '80svh';
export const PORTRAIT_SIZE_TEEN = '62svh';
export const PORTRAIT_SIZE_CHILD = '52svh';

export type PortraitSizeTier =
  | 'adult-hero'
  | 'adult-standard'
  | 'teen'
  | 'child';

const PORTRAIT_HEIGHT_BY_TIER: Record<PortraitSizeTier, string> = {
  'adult-hero': PORTRAIT_SIZE_ADULT_HERO,
  'adult-standard': PORTRAIT_SIZE_ADULT_STANDARD,
  teen: PORTRAIT_SIZE_TEEN,
  child: PORTRAIT_SIZE_CHILD,
};

export function portraitHeightForTier(tier: PortraitSizeTier): string {
  return PORTRAIT_HEIGHT_BY_TIER[tier];
}

/** Default kid tier — K-*-02 reads taller (teen) on editorial spreads. */
export function defaultKidTier(id: string): PortraitSizeTier {
  return id.endsWith('-02') ? 'teen' : 'child';
}

/** Casting spread cell width — photography-first. */
export const CASTING_STUDIO_SLOT_WIDTH = '100%';

/** Motion — matches existing StudioLayer AI duration-200 / ease-out language. */
export const TALENT_MOTION =
  'transition-all duration-200 ease-out motion-reduce:transition-none';

export const TALENT_MOTION_TRANSFORM =
  'transition-transform duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none';
