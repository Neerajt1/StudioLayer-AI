import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  creditCostForImageCount,
  formatStudioCredits,
  type ImageCount,
} from '@workspace/studio-credit-engine';
import { StudioToggleOption } from '@/components/studio/studio-workspace-controls';

interface ShootTypeOption {
  value: ImageCount;
  label: string;
  sub: string;
}

interface ShootTypeSelectorProps {
  options: readonly ShootTypeOption[];
  imageCount: ImageCount;
  customCampaignActive?: boolean;
  isPremiumLocked: (value: ImageCount) => boolean;
  disabled: boolean;
  onSelect: (value: ImageCount) => void;
}

export function ShootTypeSelector({
  options,
  imageCount,
  customCampaignActive = false,
  isPremiumLocked,
  disabled,
  onSelect,
}: ShootTypeSelectorProps) {
  const [activeHint, setActiveHint] = useState<ImageCount | null>(null);
  const [hintPhase, setHintPhase] = useState<'visible' | 'exit'>('visible');

  const showHint = (value: ImageCount) => {
    setActiveHint(value);
    setHintPhase('visible');
  };

  const hideHint = (value: ImageCount) => {
    setActiveHint((current) => {
      if (current !== value) return current;
      setHintPhase('exit');
      return value;
    });
  };

  const handleHintTransitionEnd = () => {
    if (hintPhase === 'exit') {
      setActiveHint(null);
      setHintPhase('visible');
    }
  };

  return (
    <div className="sl-shoot-type-grid">
      {options.map((opt) => {
        const isSelected = !customCampaignActive && imageCount === opt.value;
        const premiumLocked = isPremiumLocked(opt.value);
        const hintVisible = activeHint === opt.value;
        const creditLabel = formatStudioCredits(creditCostForImageCount(opt.value));
        const showSelectedCredit = isSelected && !premiumLocked;

        return (
          <div key={opt.value} className="sl-shoot-type-option-wrap relative">
            {showSelectedCredit ? (
              <p className="sl-shoot-type-credit-hint sl-shoot-type-credit-hint--selected-above">
                {creditLabel}
              </p>
            ) : hintVisible ? (
              <p
                className={cn(
                  'sl-shoot-type-credit-hint sl-shoot-type-credit-hint--hover',
                  hintPhase === 'visible' && 'sl-shoot-type-credit-hint--visible',
                  hintPhase === 'exit' && 'sl-shoot-type-credit-hint--exit',
                )}
                onTransitionEnd={handleHintTransitionEnd}
              >
                {creditLabel}
              </p>
            ) : null}
            <StudioToggleOption
              selected={isSelected && !premiumLocked}
              disabled={disabled}
              onClick={() => onSelect(opt.value)}
              onMouseEnter={() => showHint(opt.value)}
              onMouseLeave={() => hideHint(opt.value)}
              onFocus={() => showHint(opt.value)}
              onBlur={() => hideHint(opt.value)}
              className={cn(
                'sl-shoot-type-option flex h-full w-full flex-col items-center justify-center gap-1 px-2.5 py-2 sm:min-h-[3.125rem] sm:gap-0.5 sm:px-2 sm:py-2',
                premiumLocked && 'cursor-pointer opacity-50',
              )}
            >
              <p
                className={cn(
                  'sl-shoot-type-option-label font-semibold',
                  isSelected && !premiumLocked ? 'text-inherit' : 'text-muted-foreground',
                )}
              >
                {opt.label}
              </p>
              <p
                className={cn(
                  'sl-shoot-type-option-sub font-mono',
                  isSelected && !premiumLocked
                    ? 'opacity-75'
                    : 'text-muted-foreground',
                )}
              >
                {opt.sub}
              </p>
            </StudioToggleOption>
          </div>
        );
      })}
    </div>
  );
}
