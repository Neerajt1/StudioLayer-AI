// ---------------------------------------------------------------------------
// V1 reliable refine types (Batch 21)
// ---------------------------------------------------------------------------

export type RefinementType =
  | 'remove_background'
  | 'enhance_model_face'
  | 'enhance_garment';

export const AI_REFINEMENT_OPTIONS: ReadonlyArray<{
  type: RefinementType;
  label: string;
  description: string;
  creditCost: 1;
}> = [
  {
    type: 'remove_background',
    label: 'Remove Background',
    description: 'Transparent PNG — garment and model preserved',
    creditCost: 1,
  },
  {
    type: 'enhance_model_face',
    label: 'Enhance Model Face',
    description: 'Sharper facial detail — same person',
    creditCost: 1,
  },
  {
    type: 'enhance_garment',
    label: 'Enhance Garment',
    description: 'Richer fabric detail — same garment',
    creditCost: 1,
  },
];
