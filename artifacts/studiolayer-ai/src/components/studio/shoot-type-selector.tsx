import { useState } from 'react';
import { cn } from '@/lib/utils';
import { workspaceCreditTooltip, type ImageCount } from '@workspace/studio-credit-engine';
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
    <div className="sl-shoot-type-grid grid grid-cols-3 gap-2 items-stretch">
      {options.map((opt) => {
        const isSelected = !customCampaignActive && imageCount === opt.value;
        const premiumLocked = isPremiumLocked(opt.value);
        const hintVisible = activeHint === opt.value;

        return (
          <div key={opt.value} className="relative">
            {hintVisible && (
              <p
                className={cn(
                  'sl-shoot-type-credit-hint',
                  hintPhase === 'visible' && 'sl-shoot-type-credit-hint--visible',
                  hintPhase === 'exit' && 'sl-shoot-type-credit-hint--exit',
                )}
                onTransitionEnd={handleHintTransitionEnd}
              >
                {workspaceCreditTooltip(opt.value)}
              </p>
            )}
            <StudioToggleOption
              selected={isSelected && !premiumLocked}
              disabled={disabled}
              onClick={() => onSelect(opt.value)}
              onMouseEnter={() => showHint(opt.value)}
              onMouseLeave={() => hideHint(opt.value)}
              onFocus={() => showHint(opt.value)}
              onBlur={() => hideHint(opt.value)}
              className={cn(
                'flex h-full min-h-[3.125rem] w-full flex-col items-center justify-center gap-0.5 px-2 py-1.5',
                premiumLocked && 'opacity-50 cursor-pointer',
              )}
            >
              <p
                className={cn(
                  'text-[11px] font-semibold leading-none',
                  isSelected && !premiumLocked ? 'text-inherit' : 'text-muted-foreground',
                )}
              >
                {opt.label}
              </p>
              <p
                className={cn(
                  'text-[9px] font-mono leading-none',
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
