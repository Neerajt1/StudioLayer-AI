// ---------------------------------------------------------------------------
// StudioLayer AI — Predictability Contract (Fix #4)
//
// Platform principle: variation is allowed only where StudioLayer explicitly
// asks for variation. Everything else must remain predictable and preserved.
// ---------------------------------------------------------------------------

export const STUDIO_LAYER_PREDICTABILITY_CONTRACT = `
STUDIO LAYER PREDICTABILITY CONTRACT — MANDATORY:

1. The uploaded garment is the source of truth.
2. Never invent garment features (pockets, buttons, zippers, seams, openings, accessories, or details not visible in the upload).
3. Never use a pose that requires an unconfirmed garment feature.
4. Controlled pose variation is allowed only through the approved StudioLayer pose system during generation — never during refinement.
5. Refinement is an edit, NOT a regeneration.
6. Refinement must preserve the selected image's pose, composition, and framing.
7. Garment colour, pattern, texture, and construction must remain stable across every output in a batch.
8. Variation is allowed only where explicitly requested by the workflow.
9. When uncertain about a garment feature, preserve the source rather than inventing one.
10. Predictability is more important than creative variation.
11. Footwear is part of styling identity — preserve footwear across images of the same shoot and during refinement.
12. Bare feet are not the neutral default for commercial fashion photography.
13. Barefoot is allowed only when garment category, styling context, or creative direction supports it.
14. Do not independently invent, remove, or switch footwear between images in the same Campaign/Editorial batch.`;
