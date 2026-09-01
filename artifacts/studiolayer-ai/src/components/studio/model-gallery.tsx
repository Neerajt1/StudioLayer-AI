// ---------------------------------------------------------------------------
// StudioLayer AI — Model Gallery (SL-018)
//
// Visual model picker with Women / Men / Kids section tabs.
// Each card shows a portrait image, model name, hover animation, and
// selected state. Selecting a model auto-derives gender + age for the pipeline.
//
// Design decisions:
//   - Tabs are pill-style inside a muted track (familiar SaaS pattern).
//   - Cards use 2:3 portrait aspect ratio (industry standard for model shots).
//   - Internal TEST/Gen2 benchmark identities are hidden from users.
//   - 3-column grid on all viewports (cards are small, 3 fits cleanly).
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModelIdentity {
  id: string;
  displayName: string;
  imageUrl: string;
  ethnicity: string;
  gender?: 'womens' | 'mens' | 'kids';
}

interface ModelGalleryProps {
  identities: ModelIdentity[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

type GenderTab = 'womens' | 'mens' | 'kids';

const TABS: { key: GenderTab; label: string }[] = [
  { key: 'womens', label: 'Women' },
  { key: 'mens',   label: 'Men'   },
  { key: 'kids',   label: 'Kids'  },
];

/** Hide internal Gen2 benchmark identities from the customer-facing gallery. */
function isProductionModel(id: string): boolean {
  return !id.includes('TEST');
}

export function ModelGallery({
  identities,
  selectedId,
  onSelect,
  disabled,
}: ModelGalleryProps) {
  const [activeTab, setActiveTab] = useState<GenderTab>('womens');

  const visible = identities.filter(
    (m) => (m as ModelIdentity & { gender?: string }).gender === activeTab
      && isProductionModel(m.id),
  );

  return (
    <div className="space-y-3">
      {/* Section tabs */}
      <div className="flex gap-1 bg-muted rounded-md p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { if (!disabled) setActiveTab(tab.key); }}
            className={cn(
              'flex-1 text-xs font-medium py-1.5 rounded transition-all duration-150',
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Model grid */}
      {visible.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-muted-foreground font-mono">
            Loading models…
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {visible.map((model) => {
            const isSelected = selectedId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => { if (!disabled) onSelect(isSelected ? '' : model.id); }}
                className={cn(
                  'group relative flex flex-col rounded overflow-hidden border transition-all duration-200 text-left select-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-foreground ring-1 ring-foreground'
                    : 'border-border hover:border-foreground/50 hover:shadow-sm',
                  disabled && 'opacity-50 pointer-events-none',
                )}
              >
                {/* Portrait image */}
                <div className="w-full aspect-[2/3] bg-muted overflow-hidden">
                  <img
                    src={model.imageUrl}
                    alt={model.displayName}
                    className={cn(
                      'w-full h-full object-cover object-top transition-transform duration-300',
                      !disabled && !isSelected && 'group-hover:scale-[1.04]',
                    )}
                    loading="lazy"
                    draggable={false}
                  />
                </div>

                {/* Selected check badge */}
                {isSelected && (
                  <div
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-foreground rounded-full flex items-center justify-center pointer-events-none"
                    aria-hidden
                  >
                    <Check className="w-3 h-3 text-background" strokeWidth={3} />
                  </div>
                )}

                {/* Name strip */}
                <div
                  className={cn(
                    'w-full px-1.5 py-1.5 text-center transition-colors duration-150',
                    isSelected
                      ? 'bg-foreground'
                      : 'bg-card group-hover:bg-white group-hover:text-[hsl(var(--olive-text))]',
                  )}
                >
                  <p
                    className={cn(
                      'text-[11px] font-medium leading-tight truncate',
                      isSelected ? 'text-background' : 'text-foreground',
                    )}
                  >
                    {model.displayName}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Clear link */}
      {selectedId && (
        <button
          type="button"
          onClick={() => { if (!disabled) onSelect(''); }}
          className="text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors"
          disabled={disabled}
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
