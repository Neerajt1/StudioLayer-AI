/** Temporary layout modes for Direct Shoot contact-sheet comparison. */
export type DirectShootLayoutMode = 'pdf-master' | 'uniform-grid-experiment';

/** Uniform grid experiment disabled — PDF master is the only active layout. */
export const DIRECT_SHOOT_UNIFORM_GRID_EXPERIMENT_ENABLED = false;

const VALID_MODES: readonly DirectShootLayoutMode[] = [
  'pdf-master',
  'uniform-grid-experiment',
];

function parseLayoutMode(value: string | undefined): DirectShootLayoutMode | null {
  if (value === 'pdf-master' || value === 'uniform-grid' || value === 'uniform-grid-experiment') {
    return value === 'pdf-master' ? 'pdf-master' : 'uniform-grid-experiment';
  }
  return null;
}

/** Resolve active layout mode. Always returns PDF master while experiment is disabled. */
export function getDirectShootLayoutMode(): DirectShootLayoutMode {
  if (!DIRECT_SHOOT_UNIFORM_GRID_EXPERIMENT_ENABLED) {
    return 'pdf-master';
  }

  const fromEnv = parseLayoutMode(import.meta.env.VITE_DIRECT_SHOOT_LAYOUT_MODE);
  if (fromEnv) {
    return fromEnv;
  }
  return 'pdf-master';
}

export function isUniformGridExperimentMode(mode: DirectShootLayoutMode): boolean {
  if (!DIRECT_SHOOT_UNIFORM_GRID_EXPERIMENT_ENABLED) {
    return false;
  }
  return mode === 'uniform-grid-experiment';
}

export function getDirectShootLayoutModeLabel(mode: DirectShootLayoutMode): string {
  return mode === 'uniform-grid-experiment' ? 'Uniform grid (experiment)' : 'PDF master map';
}

export function getAlternateDirectShootLayoutMode(
  mode: DirectShootLayoutMode,
): DirectShootLayoutMode {
  return mode === 'pdf-master' ? 'uniform-grid-experiment' : 'pdf-master';
}

export function isValidDirectShootLayoutMode(value: string): value is DirectShootLayoutMode {
  return VALID_MODES.includes(value as DirectShootLayoutMode);
}
