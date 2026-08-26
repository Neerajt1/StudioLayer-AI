import type { ImageCount } from '@workspace/studio-credit-engine';

export type PresetShootTypeOption = {
  value: ImageCount;
  label: string;
  sub: string;
};

/**
 * Workspace preset shoot types — imageCount is the generation payload.
 * V1 UI exposes Create (single image) only. Full list retained for V3 recovery.
 */
export const PRESET_SHOOT_TYPE_OPTIONS: readonly PresetShootTypeOption[] = [
  { value: 1, label: 'Hero Shot', sub: '1 Editorial Image' },
  { value: 2, label: 'Editorial Portraits', sub: '2 Editorial Images' },
  { value: 4, label: 'Campaign Collections', sub: '4 Editorial Images' },
] as const;

export const PRESET_SHOOT_TYPE_LABEL: Record<ImageCount, string> = {
  1: 'Hero Shot',
  2: 'Editorial Portraits',
  4: 'Campaign Collections',
};

/** V1 user-facing Create option — single image only. */
export const V1_CREATE_SHOOT_TYPE_OPTION: PresetShootTypeOption = {
  value: 1,
  label: 'Create',
  sub: '1 image',
};

export const CUSTOM_CAMPAIGN_LABEL = 'Custom Campaign';
export const CUSTOM_CAMPAIGN_SUBTITLE = 'Choose 4–20 images';
