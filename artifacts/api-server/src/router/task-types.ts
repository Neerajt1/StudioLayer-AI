// ---------------------------------------------------------------------------
// StudioLayer AI — AI Router — Task Types
//
// Defines the canonical task taxonomy used by the AI Router to classify
// every rendering request and route it to the appropriate provider.
//
// ARCHITECTURE PRINCIPLE:
//   The frontend never knows which provider executes a task.
//   The router is the only layer that knows about provider capabilities.
//   Adding a new provider in future requires only changes in this file
//   and ai-router.ts — no frontend changes required.
//
// CURRENT STATE (sprint SL-021):
//   All tasks route to OpenRouter (google/gemini-3.1-flash-image).
//   The routing architecture is in place for future multi-provider support.
//
// FUTURE ROUTING EXAMPLES:
//   fashion_generation  → OpenRouter (Gemini image) or dedicated fashion model
//   image_refinement    → OpenRouter or inpainting-specialised model
//   background_removal  → Dedicated segmentation pipeline (e.g. BirefNet API)
//   upscaling           → Dedicated upscaling model (e.g. Real-ESRGAN)
//   face_restoration    → Dedicated face restoration model (e.g. CodeFormer)
//   transparent_png     → Background removal → alpha channel composition
// ---------------------------------------------------------------------------

/**
 * Canonical task types recognised by the StudioLayer AI Router.
 *
 * Each task type represents a distinct rendering capability that may
 * in future be routed to a specialised provider optimised for that task.
 */
export type TaskType =
  | "fashion_generation"    // Initial render: garment → model → fashion photo
  | "image_refinement"      // Edit an existing render (background/camera/pose/styling)
  | "background_removal"    // Remove background → transparent PNG (future)
  | "segmentation"          // Semantic segmentation of garment regions (future)
  | "upscaling"             // Super-resolution upscaling of a render (future)
  | "face_restoration";     // Face detail enhancement on a render (future)

/**
 * Provider identifiers.
 * Currently only openrouter is implemented; others are reserved for future routing.
 */
export type ProviderId =
  | "openrouter"            // OpenRouter API (current default for all tasks)
  | "birefnet"              // BirefNet background removal (future)
  | "real_esrgan"           // Real-ESRGAN upscaling (future)
  | "codeformer";           // CodeFormer face restoration (future)

/**
 * The routing decision returned by the AI Router for a given task.
 */
export interface RouteDecision {
  /** The classified task type. */
  taskType: TaskType;
  /** The selected provider for this task. */
  provider: ProviderId;
  /**
   * Optional model override within the provider.
   * When undefined, the provider uses its configured default model.
   */
  modelOverride?: string;
  /**
   * Whether this task type supports per-shot prompt diversity.
   * True for fashion_generation with shots > 1 (Editorial).
   */
  supportsPerShotPrompts: boolean;
}

/**
 * Download format options — prepared for future transparent PNG support.
 * Currently only jpeg and png are delivered; transparent_png requires the
 * background_removal pipeline which is architecturally prepared but not yet active.
 */
export type DownloadFormat = "jpeg" | "png" | "transparent_png";
