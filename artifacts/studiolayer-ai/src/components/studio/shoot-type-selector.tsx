import type { ImageCount } from '@workspace/studio-credit-engine';
import {
  PRESET_SHOOT_TYPE_LABEL,
  type PresetShootTypeOption,
} from '@/lib/shoot-type-mapping';
import { StudioCompactSelect } from '@/components/studio/studio-compact-select';

interface ShootTypeSelectorProps {
  options: readonly PresetShootTypeOption[];
  imageCount: ImageCount;
  isPremiumLocked: (value: ImageCount) => boolean;
  disabled: boolean;
  onSelect: (value: ImageCount) => void;
}

export function ShootTypeSelector({
  options,
  imageCount,
  isPremiumLocked,
  disabled,
  onSelect,
}: ShootTypeSelectorProps) {
  return (
    <StudioCompactSelect
      label="Shoot Type"
      value={imageCount}
      triggerLabel={PRESET_SHOOT_TYPE_LABEL[imageCount]}
      options={options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        description: opt.sub,
        unavailable: isPremiumLocked(opt.value),
        testId: `shoot-type-${opt.value}`,
      }))}
      disabled={disabled}
      onChange={onSelect}
    />
  );
}
