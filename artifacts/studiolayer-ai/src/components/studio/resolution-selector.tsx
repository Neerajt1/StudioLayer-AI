import {
  DEFAULT_OUTPUT_RESOLUTION,
  creditCostPerImageAtResolution,
  formatStudioCredits,
  type OutputResolution,
} from '@workspace/studio-credit-engine';
import { StudioCompactSelect } from '@/components/studio/studio-compact-select';

interface ResolutionSelectorProps {
  value: OutputResolution;
  disabled?: boolean;
  /** When true, option looks unavailable but remains clickable (parent shows gating UX). */
  isOptionUnavailable?: (value: OutputResolution) => boolean;
  onChange: (value: OutputResolution) => void;
}

const OPTIONS: ReadonlyArray<OutputResolution> = ['2K', '4K'];

function resolutionCreditPrice(resolution: OutputResolution): string {
  return formatStudioCredits(creditCostPerImageAtResolution(resolution));
}

function resolutionCreditDetail(resolution: OutputResolution): string {
  return `${resolutionCreditPrice(resolution)} per image`;
}

function resolutionTriggerLabel(resolution: OutputResolution): string {
  return `${resolution} · ${resolutionCreditPrice(resolution)}`;
}

export function ResolutionSelector({
  value,
  disabled = false,
  isOptionUnavailable,
  onChange,
}: ResolutionSelectorProps) {
  const selected = value || DEFAULT_OUTPUT_RESOLUTION;

  return (
    <StudioCompactSelect
      label="Resolution"
      value={selected}
      triggerLabel={resolutionTriggerLabel(selected)}
      disabled={disabled}
      onChange={onChange}
      options={OPTIONS.map((resolution) => ({
        value: resolution,
        label: resolution,
        description: resolutionCreditDetail(resolution),
        unavailable: isOptionUnavailable?.(resolution) ?? false,
        testId: `resolution-${resolution.toLowerCase()}`,
      }))}
    />
  );
}
