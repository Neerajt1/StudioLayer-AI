import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CUSTOM_CAMPAIGN_MAX,
  CUSTOM_CAMPAIGN_MIN,
} from '@workspace/studio-credit-engine';
import { StudioToggleOption } from '@/components/studio/studio-workspace-controls';

interface CustomCampaignControlProps {
  selected: boolean;
  imageCount: number;
  premiumLocked: boolean;
  disabled: boolean;
  onSelect: () => void;
  onImageCountChange: (count: number) => void;
}

export function CustomCampaignControl({
  selected,
  imageCount,
  premiumLocked,
  disabled,
  onSelect,
  onImageCountChange,
}: CustomCampaignControlProps) {
  const clampCount = (value: number) =>
    Math.min(CUSTOM_CAMPAIGN_MAX, Math.max(CUSTOM_CAMPAIGN_MIN, value));

  const step = (delta: number) => {
    onImageCountChange(clampCount(imageCount + delta));
  };

  return (
    <div className="sl-custom-campaign-option">
      <StudioToggleOption
        selected={selected && !premiumLocked}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          'sl-shoot-type-option sl-custom-campaign-toggle flex h-full w-full flex-col items-center justify-center gap-1 px-2.5 py-2 sm:min-h-[3.125rem] sm:gap-0.5 sm:px-2 sm:py-2',
          premiumLocked && 'opacity-50 cursor-pointer',
        )}
      >
        <p
          className={cn(
            'sl-shoot-type-option-label font-semibold',
            selected && !premiumLocked ? 'text-inherit' : 'text-muted-foreground',
          )}
        >
          Custom Campaign
        </p>
        <p
          className={cn(
            'sl-shoot-type-option-sub font-mono',
            selected && !premiumLocked ? 'opacity-75' : 'text-muted-foreground',
          )}
        >
          Choose 4–20 images
        </p>
      </StudioToggleOption>

      {selected && !premiumLocked && (
        <div className="sl-custom-campaign-stepper sl-custom-campaign-stepper--active">
          <button
            type="button"
            className="sl-custom-campaign-stepper-btn"
            aria-label="Fewer images"
            disabled={disabled || imageCount <= CUSTOM_CAMPAIGN_MIN}
            onClick={() => step(-1)}
          >
            <Minus className="size-3" aria-hidden />
          </button>
          <span className="sl-custom-campaign-stepper-value">
            <span className="sl-custom-campaign-stepper-count">{imageCount}</span>
            <span className="sl-custom-campaign-stepper-label">images</span>
          </span>
          <button
            type="button"
            className="sl-custom-campaign-stepper-btn"
            aria-label="More images"
            disabled={disabled || imageCount >= CUSTOM_CAMPAIGN_MAX}
            onClick={() => step(1)}
          >
            <Plus className="size-3" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
