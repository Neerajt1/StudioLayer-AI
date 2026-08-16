// ---------------------------------------------------------------------------
// BiRefNet operating_resolution selection (fal-ai/birefnet v1)
//
// v1 supports 1024x1024 and 2048x2048. Prefer the highest tier that does
// not exceed the source's longest edge — capped at 2048 for this endpoint.
// ---------------------------------------------------------------------------

export type BirefNetOperatingResolution = "1024x1024" | "2048x2048";

export function resolveBirefNetOperatingResolution(
  width: number,
  height: number,
): BirefNetOperatingResolution {
  const maxDim = Math.max(width, height);
  if (maxDim <= 1024) {
    return "1024x1024";
  }
  return "2048x2048";
}
