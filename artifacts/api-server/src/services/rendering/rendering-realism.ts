// ---------------------------------------------------------------------------
// StudioLayer AI — Rendering Realism (Batch 19 → Pass D)
//
// Preserves genuine garment wearability / physics rules required for rendering.
// Material, construction, and colour identity are owned by GARMENT_AUTHORITY_SOT.
// Studio background / lighting / colour-cast are owned by PHOTOGRAPHY_AUTHORITY_SOT.
// ---------------------------------------------------------------------------

/**
 * Condensed wearability/physics + unique material-optics protection (Pass D restore).
 * Primary garment authority remains GARMENT_AUTHORITY_SOT — do not restate it here.
 */
export const RENDERING_REALISM_INSTRUCTION = `
WEARABILITY:
The garment must appear physically worn — never pasted, composited, or floating.
Natural body fit, gravity, fabric tension, folds at joints, and believable contact with skin/body.
No floating hems/sleeves/straps/collars, fabric penetrating limbs, missing contact shadows, or impossible intersections.
Respect fabric weight and volume from Reference Image 1; avoid plastic/waxy/airbrushed fabric unless the upload genuinely has that finish.
Across this generation, keep garment construction and fabric behaviour identical — only pose, camera, lighting, composition, and expression may vary.

MATERIAL OPTICS:
Preserve the garment's real material surface and optical character from Reference Image 1 — visible weave/grain and natural surface variation must remain readable.
Do not reinterpret textured fabric as smooth plastic/nylon or a generic flat surface.
Preserve stitch/topstitch and seam continuity together with other visible construction details.`;
