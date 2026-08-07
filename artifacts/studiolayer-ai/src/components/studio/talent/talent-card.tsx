// ---------------------------------------------------------------------------
// StudioLayer AI — Talent Portrait
// ---------------------------------------------------------------------------

import { memo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelIdentity } from './types';
import { ModelImageFrame } from './model-image-frame';
import {
  TALENT_MOTION,
  TALENT_PORTRAIT_HEIGHT,
  TALENT_SLOT_WIDTH,
} from './casting-tokens';

interface TalentCardProps {
  model: ModelIdentity;
  isSelected: boolean;
  isSelecting?: boolean;
  disabled?: boolean;
  slotWidth?: string;
  portraitMaxHeight?: string;
  editorialAbsolute?: boolean;
  onSelect: (id: string) => void;
}

export const TalentCard = memo(function TalentCard({
  model,
  isSelected,
  isSelecting = false,
  disabled,
  slotWidth = TALENT_SLOT_WIDTH,
  portraitMaxHeight = TALENT_PORTRAIT_HEIGHT,
  editorialAbsolute = false,
  onSelect,
}: TalentCardProps) {
  const interactive = !disabled && !isSelecting;
  const showSelected = isSelected || isSelecting;

  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled && !isSelecting) onSelect(model.id);
      }}
      style={editorialAbsolute ? undefined : { width: slotWidth }}
      className={cn(
        'group relative overflow-visible border-0 bg-transparent p-0 text-left select-none',
        editorialAbsolute ? 'flex h-full w-full flex-col' : 'flex shrink-0 flex-col items-center text-center',
        TALENT_MOTION,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        showSelected && '-translate-y-0.5 motion-reduce:translate-y-0',
        !disabled
          && !showSelected
          && 'hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
        isSelecting && 'scale-[0.98] motion-reduce:scale-100',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <div className={cn('relative', editorialAbsolute ? 'min-h-0 flex-1' : 'w-full')}>
        <ModelImageFrame
          src={model.imageUrl}
          alt={model.displayName}
          identityId={model.id}
          interactive={interactive}
          portraitMaxHeight={portraitMaxHeight}
        />

        {!showSelected && !disabled && (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-3 flex justify-center',
              'opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none',
              'group-hover:opacity-100',
            )}
          >
            <span className="rounded-sm bg-foreground px-2.5 py-1 text-[10px] font-medium text-background">
              Select
            </span>
          </div>
        )}
      </div>

      {showSelected && (
        <div
          className={cn(
            'absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/90 pointer-events-none',
            'transition-transform duration-200 ease-out motion-reduce:transition-none',
            isSelecting && 'scale-110',
          )}
          aria-hidden
        >
          <Check className="h-3 w-3 text-background" strokeWidth={2.5} />
        </div>
      )}

      <p
        className={cn(
          'shrink-0 truncate text-[11px] font-medium leading-tight',
          editorialAbsolute ? 'mt-2' : 'mt-4 w-full',
          'transition-colors duration-200 ease-out motion-reduce:transition-none',
          showSelected
            ? 'text-foreground'
            : 'text-foreground/65 group-hover:text-foreground motion-reduce:group-hover:text-foreground/65',
        )}
      >
        {model.displayName}
      </p>
    </button>
  );
});
