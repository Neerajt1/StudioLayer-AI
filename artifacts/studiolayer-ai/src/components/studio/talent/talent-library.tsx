// ---------------------------------------------------------------------------
// StudioLayer AI — Casting Studio (Editorial Sprint 1)
//
// Premium digital modelling agency — presentation only. Whitespace is an
// active design element; photography always wins over interface chrome.
// ---------------------------------------------------------------------------

import { TalentCollection } from './talent-collection';
import { TALENT_COLLECTIONS, type ModelIdentity } from './types';

export type { ModelIdentity } from './types';

interface TalentLibraryProps {
  identities: ModelIdentity[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function TalentLibrary({
  identities,
  selectedId,
  onSelect,
  disabled,
}: TalentLibraryProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-14">
        {/*
          Extension slot — insert without layout redesign:
          Continue Working · Featured Talent · Search · Favourites · AI Recommendations
        */}
        <div data-talent-library-extensions />

        {TALENT_COLLECTIONS.map((config) => (
          <TalentCollection
            key={config.key}
            config={config}
            identities={identities}
            selectedId={selectedId}
            onSelect={onSelect}
            disabled={disabled}
          />
        ))}
      </div>

      {selectedId && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              if (!disabled) onSelect('');
            }}
            className="text-[10px] text-muted-foreground/60 font-mono transition-colors duration-150 hover:text-muted-foreground"
            disabled={disabled}
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}
