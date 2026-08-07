// ---------------------------------------------------------------------------
// Editorial Spread — absolute canvas renderer (Sprint 3.3)
// ---------------------------------------------------------------------------

import { TalentCard } from './talent-card';
import type { ModelIdentity } from './types';
import type { TalentLayoutSlot, TalentLayoutSpread } from './talent-layout-spec';

interface EditorialSpreadViewProps {
  spread: TalentLayoutSpread;
  placements: Array<{ talent: ModelIdentity; slot: TalentLayoutSlot }>;
  selectedTalentId: string;
  selectingId: string | null;
  onSelect: (id: string) => void;
}

export function EditorialSpreadView({
  spread,
  placements,
  selectedTalentId,
  selectingId,
  onSelect,
}: EditorialSpreadViewProps) {
  return (
    <section
      className="relative w-full"
      style={{ minHeight: '100svh' }}
      aria-label={`Editorial spread ${spread.spreadId}`}
    >
      {placements.map(({ talent, slot }) => (
        <div
          key={slot.talentCode}
          className="absolute overflow-visible"
          data-talent-code={slot.talentCode}
          style={{
            left: slot.left,
            top: slot.top,
            width: slot.width,
            height: slot.height,
          }}
        >
          <TalentCard
            model={talent}
            isSelected={selectedTalentId === talent.id && !selectingId}
            isSelecting={selectingId === talent.id}
            disabled={!!selectingId}
            portraitMaxHeight={slot.height}
            editorialAbsolute
            onSelect={onSelect}
          />
        </div>
      ))}
    </section>
  );
}
