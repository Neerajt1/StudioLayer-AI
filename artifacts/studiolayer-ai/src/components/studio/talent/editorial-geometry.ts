// ---------------------------------------------------------------------------
// Editorial Geometry — re-exports talent-layout-spec for Casting Studio
// ---------------------------------------------------------------------------

export {
  ALL_LAYOUT_TALENT_CODES as ALL_PLACED_MODEL_IDS,
  TALENT_LAYOUT as EDITORIAL_SPREADS,
  TALENT_SEQUENCE as MODEL_SEQUENCE,
  buildTalentCatalog as buildSpreadCatalog,
  type TalentCatalogEntry,
  type TalentLayoutSlot,
  type TalentLayoutSpread,
} from './talent-layout-spec';

/** @deprecated Use TalentLayoutSlot from talent-layout-spec */
export type EditorialModelPlacement = import('./talent-layout-spec').TalentLayoutSlot & {
  /** @deprecated Use talentCode */
  id: string;
};

/** @deprecated Use TalentLayoutSpread from talent-layout-spec */
export type EditorialSpreadGeometry = import('./talent-layout-spec').TalentLayoutSpread & {
  id: number;
  models: readonly EditorialModelPlacement[];
};
