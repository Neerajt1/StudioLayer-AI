/** Native output resolution selected before generation. */
export type OutputResolution = '2K' | '4K';

export const DEFAULT_OUTPUT_RESOLUTION: OutputResolution = '2K';

/** Every selectable resolution, for pricing sweeps such as the cheapest shoot. */
export const OUTPUT_RESOLUTIONS: readonly OutputResolution[] = ['2K', '4K'];

/** Studio Credits consumed per successful image at this resolution. */
export function resolutionCreditMultiplier(
  resolution: OutputResolution = DEFAULT_OUTPUT_RESOLUTION,
): number {
  return resolution === '4K' ? 2 : 1;
}

export function normalizeOutputResolution(value: unknown): OutputResolution {
  return value === '4K' ? '4K' : '2K';
}
