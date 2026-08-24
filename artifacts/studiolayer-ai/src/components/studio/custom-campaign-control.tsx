import { Minus, Plus } from 'lucide-react';
import {
  CUSTOM_CAMPAIGN_MAX,
  CUSTOM_CAMPAIGN_MIN,
} from '@workspace/studio-credit-engine';

interface CustomCampaignStepperProps {
  imageCount: number;
  disabled: boolean;
  onImageCountChange: (count: number) => void;
}

/** Image-count stepper shown when Custom Campaign is the active shoot type. */
export function CustomCampaignStepper({
  imageCount,
  disabled,
  onImageCountChange,
}: CustomCampaignStepperProps) {
  const clampCount = (value: number) =>
    Math.min(CUSTOM_CAMPAIGN_MAX, Math.max(CUSTOM_CAMPAIGN_MIN, value));

  const step = (delta: number) => {
    onImageCountChange(clampCount(imageCount + delta));
  };

  return (
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
  );
}
