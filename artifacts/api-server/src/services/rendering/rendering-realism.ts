// ---------------------------------------------------------------------------
// StudioLayer AI — Rendering Realism Engine (Batch 19)
//
// Strengthens OpenRouter instructions so garments appear physically worn,
// not composited. Rendering quality only — no UI, billing, pose, or
// Garment Intelligence changes.
//
// Principle: every output should look like a professional model genuinely
// wearing the uploaded garment — never like AI placed a garment on a person.
// ---------------------------------------------------------------------------

/**
 * Campaign-quality realism block appended to the authoritative garment
 * instruction on every OpenRouter generation request.
 */
export const RENDERING_REALISM_INSTRUCTION = `
CAMPAIGN QUALITY — WEARABILITY & REALISM (NON-NEGOTIABLE):

The garment must appear physically worn by the model — never pasted, composited, or floating.
Treat Reference Image 1 as the real product being sold, not as creative inspiration.
The model must look like they are genuinely wearing the uploaded garment during a professional fashion photoshoot.

NEVER ALLOW THESE AI ARTIFACTS:
- Garment pasted onto the model or flat texture mapped over the body
- Floating garments, hems, sleeves, straps, or collars detached from the body
- Clothing disconnected from the body or missing contact with skin/fabric beneath
- Fake, floating, or disconnected contact shadows
- Unrealistic draping that ignores gravity or body anatomy
- Warped, twisted, or misaligned straps
- Twisted, collapsed, or floating collars
- Floating, misaligned, or broken sleeves
- Broken, floating, or misaligned waistlines
- Distorted, uneven, or floating hemlines
- Impossible fabric intersections or fabric penetrating limbs or torso
- Missing garment tension — fabric that hangs without responding to the body
- Garments penetrating or clipping through the body

GARMENT WEARABILITY — THE GARMENT MUST FEEL PHYSICALLY ATTACHED:
- Natural body fit conforming to anatomy — chest, waist, hips, shoulders
- Proper gravity on all fabric panels
- Natural folds at joints (elbows, knees, waist, hips) — not artificially smooth
- Realistic fabric tension where the garment is pulled across the body
- Realistic compression at fitted areas (waist, bust, hips, upper arm)
- Natural shoulder placement and shoulder-seam contact
- Proper sleeve behaviour — sleeves follow arm angle with believable tension
- Correct neckline placement resting naturally on the collarbone or shoulders
- Natural waist placement with believable fabric gathering or tension

FABRIC REALISM:
- Respect fabric weight, thickness, and texture from Reference Image 1
- Render natural wrinkles and micro-folds where gravity and body contact demand them
- Maintain seam continuity and stitch continuity across the entire garment
- Realistic edge definition at hems, cuffs, collars, and plackets
- Proper garment volume — the fabric must have physical depth, not appear paper-thin or inflated
- Avoid overly smooth, plastic, waxy, or airbrushed fabric unless the upload genuinely has that finish

MATERIAL FIDELITY — PRESERVE ORIGINAL FABRIC OPTICS:
Preserve the uploaded garment's original material properties exactly as shown in Reference Image 1.
Maintain matte or glossy finish, natural sheen, weave structure, surface reflectivity, and all fabric-specific optical characteristics.
Never reinterpret the material into a different fabric appearance — silk must not become satin, cotton must not become polyester, denim must not become smooth nylon, matte must not become artificially glossy, and glossy must not become flat or dull.
The material must read as the same fabric photographed in a studio — not an AI's stylistic reinterpretation.

PRESERVE CONSTRUCTION — DO NOT REINTERPRET:
- Stitch lines, topstitching, and seam paths exactly as photographed
- Neckline construction, sleeve construction, and strap construction
- Button, zip, and pocket placement
- Hemline, cuffs, and collar geometry
- All hardware and trim attachment points

CONTACT & GRAVITY:
Allow: natural draping, fabric resting on the body, realistic folds around joints.
Never: floating hems or sleeves, fabric detached from shoulders, fabric intersecting limbs, impossible hanging angles.

BODY INTEGRATION:
- Natural shoulder contact and chest fit
- Natural waist fit and hip transition
- Proper armhole behaviour — fabric follows the armhole seam naturally
- Proper sleeve tension following arm pose
- The garment must wrap around the model's body volume — never appear as a flat overlay

BATCH REALISM CONSISTENCY:
Across every image in this generation, maintain identical garment construction, stitching, fabric behaviour, material appearance, garment thickness, and surface texture.
Only pose, camera angle, lighting, composition, and expression may vary.
The garment itself must remain physically identical in every shot.

FINAL QUALITY BAR:
The output must not create the impression that an AI placed a garment on a person.
It must create the impression that a professional model is genuinely wearing the uploaded garment in a real fashion photoshoot.`;
