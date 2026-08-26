import { StudioCompactSelect } from '@/components/studio/studio-compact-select';

export type StudioLocationEnvironment =
  | 'white_studio'
  | 'grey_gradient_studio'
  | 'photo_studio'
  | 'luxury_interior'
  | 'urban_street'
  | 'nature';

interface EnvironmentSelectorProps {
  value: StudioLocationEnvironment;
  disabled?: boolean;
  onChange: (value: StudioLocationEnvironment) => void;
}

const OPTIONS: ReadonlyArray<{
  value: StudioLocationEnvironment;
  label: string;
  description: string;
}> = [
  { value: 'white_studio', label: 'White Studio', description: 'Seamless white' },
  { value: 'grey_gradient_studio', label: 'Grey Gradient', description: 'Soft grey' },
  { value: 'photo_studio', label: 'Studio', description: 'Fashion studio' },
  { value: 'luxury_interior', label: 'Interior', description: 'Luxury interior' },
  { value: 'urban_street', label: 'Street', description: 'Urban exterior' },
  { value: 'nature', label: 'Nature', description: 'Outdoor editorial' },
];

export function EnvironmentSelector({
  value,
  disabled = false,
  onChange,
}: EnvironmentSelectorProps) {
  const selected = value || 'photo_studio';
  const selectedOption = OPTIONS.find((opt) => opt.value === selected) ?? OPTIONS[2];

  return (
    <StudioCompactSelect
      label="Environment"
      value={selected}
      triggerLabel={selectedOption.label}
      disabled={disabled}
      onChange={onChange}
      options={OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        description: opt.description,
        testId: `environment-${opt.value}`,
      }))}
    />
  );
}
