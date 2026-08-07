// ---------------------------------------------------------------------------
// Refinement type definitions — shared by engine and preservation contract
// ---------------------------------------------------------------------------

export type RefinementType =
  | "remove_background"
  | "enhance_model_face"
  | "enhance_garment";

export const V1_REFINEMENT_TYPES: readonly RefinementType[] = [
  "remove_background",
  "enhance_model_face",
  "enhance_garment",
] as const;

export function isRefinementType(value: unknown): value is RefinementType {
  return (
    value === "remove_background"
    || value === "enhance_model_face"
    || value === "enhance_garment"
  );
}
