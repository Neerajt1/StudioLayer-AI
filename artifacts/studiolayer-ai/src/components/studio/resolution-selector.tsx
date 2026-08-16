import { cn } from '@/lib/utils';
import {
  DEFAULT_OUTPUT_RESOLUTION,
  type OutputResolution,
} from '@workspace/studio-credit-engine';
import { StudioToggleOption } from '@/components/studio/studio-workspace-controls';

interface ResolutionSelectorProps {
  value: OutputResolution;
  disabled?: boolean;
  /** When true, option looks unavailable but remains clickable (parent shows gating UX). */
  isOptionUnavailable?: (value: OutputResolution) => boolean;
  onChange: (value: OutputResolution) => void;
}

const OPTIONS: ReadonlyArray<{
  value: OutputResolution;
  label: string;
  description: string;
}> = [
  { value: '2K', label: '2K', description: '1 Studio Credit per image' },
  { value: '4K', label: '4K', description: '4K = 2 Studio Credits' },
];

export function ResolutionSelector({
  value,
  disabled = false,
  isOptionUnavailable,
  onChange,
}: ResolutionSelectorProps) {
  const selected = value || DEFAULT_OUTPUT_RESOLUTION;

  return (
    <div className="sl-resolution-selector" role="group" aria-label="Output resolution">
      <p className="sl-resolution-selector-label">Resolution</p>
      <div className="sl-resolution-selector-grid">
        {OPTIONS.map((opt) => {
          const unavailable = isOptionUnavailable?.(opt.value) ?? false;
          return (
            <StudioToggleOption
              key={opt.value}
              selected={selected === opt.value}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                'sl-resolution-option',
                selected === opt.value && 'sl-resolution-option--selected',
                unavailable && 'cursor-pointer opacity-50',
              )}
              data-testid={`resolution-${opt.value.toLowerCase()}`}
            >
              <span className="sl-resolution-option-label">{opt.label}</span>
              <span className="sl-resolution-option-desc">{opt.description}</span>
            </StudioToggleOption>
          );
        })}
      </div>
    </div>
  );
}
