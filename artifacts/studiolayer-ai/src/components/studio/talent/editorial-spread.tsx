// ---------------------------------------------------------------------------
// Editorial Spread — absolute canvas renderer (Sprint 3.3)
// Mobile (≤767px): 2-column vertical grid per spread.
// Desktop (≥768px): PDF art-directed absolute canvas (unchanged).
// ---------------------------------------------------------------------------

import { TalentCard } from './talent-card';
import { TALENT_PORTRAIT_HEIGHT } from './casting-tokens';
import type { ModelIdentity } from './types';
import type { TalentLayoutSlot, TalentLayoutSpread } from './talent-layout-spec';

interface EditorialSpreadViewProps {
  spread: TalentLayoutSpread;
  placements: Array<{ talent: ModelIdentity; slot: TalentLayoutSlot }>;
  selectedTalentId: string;
  selectingId: string | null;
  onSelect: (id: string) => void;
}

function EditorialSpreadMobileGrid({
  spread,
  placements,
  selectedTalentId,
  selectingId,
  onSelect,
}: EditorialSpreadViewProps) {
  return (
    <section
      className="sl-talent-spread-mobile"
      aria-label={`Editorial spread ${spread.spreadId}`}
    >
      <div className="sl-talent-spread-grid">
        {placements.map(({ talent, slot }) => (
          <TalentCard
            key={slot.talentCode}
            model={talent}
            isSelected={selectedTalentId === talent.id && !selectingId}
            isSelecting={selectingId === talent.id}
            disabled={!!selectingId}
            portraitMaxHeight={TALENT_PORTRAIT_HEIGHT}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function EditorialSpreadDesktopCanvas({
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

export function EditorialSpreadView(props: EditorialSpreadViewProps) {
  return (
    <>
      <div className="sl-talent-spread-mobile-wrap md:hidden">
        <EditorialSpreadMobileGrid {...props} />
      </div>
      <div className="sl-talent-spread-canvas-wrap hidden md:block">
        <EditorialSpreadDesktopCanvas {...props} />
      </div>
    </>
  );
}
