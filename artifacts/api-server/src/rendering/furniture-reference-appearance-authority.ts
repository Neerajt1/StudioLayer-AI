/**
 * Global furniture-reference appearance authority for multimodal generation.
 *
 * When a furniture reference image is attached, this block is the sole source
 * of furniture appearance instructions — generic catalogue prose and quality
 * floors elsewhere must defer to it.
 */

/**
 * Compact early pointer for the primary instruction (before images).
 * Mirrors GARMENT_AUTHORITY_SOT placement — establishes furniture material
 * fidelity before photography polish language is read.
 */
export function buildFurnitureReferencePrimaryPointer(
  furnitureReferenceImageNumber: number,
): string {
  const ref = furnitureReferenceImageNumber;
  return `FURNITURE REFERENCE — REFERENCE IMAGE ${ref}
Reference Image ${ref} is the sole source of truth for furniture identity, silhouette, geometry, proportions, construction, wood grain character, material, finish, surface texture, upholstery/cane, and every visible product detail.
Reproduce that exact furniture piece faithfully in the photograph — integrate it as a real physical object, not a flat overlay.
Scene lighting, contact shadows, placement, perspective, and occlusion may adapt for integration; physical furniture scale and proportions must remain locked to Reference Image ${ref} and realistic human-scale — do not enlarge or shrink the furniture relative to the model.
Do not redesign, restyle, smooth, beautify, add gloss or artificial specular highlights, or resynthesize furniture materials away from Reference Image ${ref}.
Full FURNITURE REFERENCE AUTHORITY follows in the shot brief.`;
}

/**
 * Authoritative furniture appearance contract when Reference Image N is the
 * real product photograph supplied by the furniture-reference pipeline.
 */
export function buildFurnitureReferenceAuthorityLayer(
  furnitureReferenceImageNumber: number,
): string {
  const ref = furnitureReferenceImageNumber;
  return `FURNITURE REFERENCE AUTHORITY — REFERENCE IMAGE ${ref}

Reference Image ${ref} is the SELECTED STUDIO FURNITURE PRODUCT REFERENCE — the sole authority for furniture identity, overall silhouette, geometry, proportions, construction, armrest/backrest/leg design, wood grain, wood tone, upholstery/cushion material, cane/weave pattern, craftsmanship, finish, surface texture, and every visible product-specific characteristic shown there.

Reproduce this exact furniture piece in the final image.
Do not substitute a similar, generic, simplified, or redesigned chair, stool, or block.
Do not invent new geometry, materials, hardware, or decorative details absent from Reference Image ${ref}.
Do not smooth, CGI-polish, beautify, or genericize the surface into an AI-looking interpretation.
Premium studio quality means lighting and photographic finish only — never permission to redesign the furniture.

MATERIAL & SURFACE FIDELITY (authoritative):
Preserve the exact wood grain pattern, grain direction, pore character, tone variation, and natural imperfection visible in Reference Image ${ref} — do not regenerate, simplify, or smooth grain into plastic or waxy wood.
Preserve the exact finish level from Reference Image ${ref} — matte stays matte, low-satin stays low-satin; do not add artificial gloss, lacquer sheen, CGI specular highlights, or wet-looking polish absent from the reference.
Preserve upholstery, cane, leather, fabric weave, stitching, and hardware exactly as shown — do not reinterpret, upgrade, or invent surface detail.
Scene lighting may change how light falls on the furniture and how contact shadows read — that is permitted integration — but must not change what the material is, how grain reads, or what finish/specularity level the product has.

Replace the furniture drawn in the Pose Master with the piece shown in Reference Image ${ref}. Do NOT copy the Pose Master's furniture design, material, grain, or styling.

The Pose Master remains authoritative for body pose, limb placement, weight distribution, and the body-to-furniture contact/support relationship — preserve that relationship exactly on this furniture.

PHYSICAL SCALE & PROPORTION (authoritative):
Reference Image ${ref} defines the furniture's true physical dimensions and internal proportions — seat height, back height, arm height, leg height, depth, width, and silhouette ratios must match the reference product at realistic full-scale adult furniture size.
The furniture must remain naturally proportioned to the Studio Talent's body and this pose. Do not arbitrarily enlarge, shrink, bulk up, or miniaturize the piece relative to the human figure.
Infer scale from the reference product's real-world proportions together with the human body's known scale — the furniture must look like the same real-world product placed with the model, not a resized or hero-scaled version of the reference.
You MAY adapt placement, camera perspective, occlusion by the model or garment, contact shadows, and scene lighting so Reference Image ${ref} sits believably in the photograph.
Perspective foreshortening may change apparent size on camera, but must not change true physical dimensions relative to the model.
Do not resize the furniture to match the Pose Master's drawn furniture silhouette — satisfy the body-to-support contact relationship using the reference piece at its correct physical scale.

SCENE INTEGRATION (permitted adaptation only):
Do NOT take body pose, camera angle, framing, composition, or environment from Reference Image ${ref}.
Reference Image ${ref} is a product appearance source — integrate its appearance into the shot; do not paste it as a flat overlay.

This block supersedes any earlier generic FURNITURE appearance description, any pose-definition language suggesting furniture appearance may be new or redesigned, and any photography or shot-direction language (premium, polished, editorial, controlled highlights) that would respecularize, beautify, or resynthesize furniture materials away from Reference Image ${ref}.`;
}

/** Short deferral used in the creative brief when a reference image will be attached. */
export const FURNITURE_REFERENCE_DEFERRED_APPEARANCE_LINE =
  "Furniture appearance is governed solely by the attached furniture reference image — see FURNITURE REFERENCE AUTHORITY below. Do not synthesize, redesign, or genericize furniture appearance in this layer.";
