import type { GarmentPlacement } from '@/lib/studio-workflow';
import { StudioCompactSelect } from '@/components/studio/studio-compact-select';

export const GARMENT_CATEGORY_OPTIONS = [
  {
    value: 'upper_body' as const,
    label: 'Topwear',
    description: 'Shirts · T-Shirts · Jackets · Knitwear',
  },
  {
    value: 'lower_body' as const,
    label: 'Bottomwear',
    description: 'Jeans · Trousers · Shorts · Skirts',
  },
  {
    value: 'full_body' as const,
    label: 'Full Outfit',
    description: 'Dresses · Jumpsuits · Co-ords · Suits',
  },
] as const;

type GarmentCategoryValue = Exclude<GarmentPlacement, ''>;

interface GarmentCategorySelectorProps {
  value: GarmentPlacement;
  disabled?: boolean;
  onChange: (value: GarmentCategoryValue) => void;
}

export function GarmentCategorySelector({
  value,
  disabled = false,
  onChange,
}: GarmentCategorySelectorProps) {
  const selectedOption = GARMENT_CATEGORY_OPTIONS.find((opt) => opt.value === value);

  return (
    <StudioCompactSelect<GarmentPlacement>
      label="Garment Category"
      value={value}
      triggerLabel={selectedOption?.label ?? 'Select category'}
      disabled={disabled}
      aria-label="Garment Category"
      onChange={(next) => {
        if (next === '') return;
        onChange(next);
      }}
      options={GARMENT_CATEGORY_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        description: opt.description,
        testId: `garment-category-${opt.value}`,
      }))}
    />
  );
}
