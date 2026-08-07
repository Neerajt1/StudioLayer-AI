// ---------------------------------------------------------------------------
// StudioLayer AI — Casting Studio (Sprint 3.3)
//
// Absolute-positioned editorial spreads from Models Placement.pdf.
// Identity assignment via talent-layout-spec (deterministic codes only).
// ---------------------------------------------------------------------------

import { useMemo, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useStudioWorkflow } from '@/context/studio-workflow-context';
import type { ModelIdentity } from './types';
import { isProductionModel } from './types';
import {
  buildTalentCatalog,
  TALENT_LAYOUT,
  TALENT_SEQUENCE,
} from './talent-layout-spec';
import { EditorialSpreadView } from './editorial-spread';

const SELECT_ANIMATION_MS = 420;

interface CastingStudioProps {
  identities: ModelIdentity[];
}

export function CastingStudio({ identities }: CastingStudioProps) {
  const { workflow, setTalentId } = useStudioWorkflow();
  const [, setLocation] = useLocation();
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const productionIdentities = useMemo(
    () => identities.filter((m) => isProductionModel(m.id)),
    [identities],
  );

  const spreads = useMemo(
    () => buildTalentCatalog(productionIdentities),
    [productionIdentities],
  );

  const visibleCount = useMemo(
    () => spreads.reduce((sum, entry) => sum + entry.placements.length, 0),
    [spreads],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (selectingId) return;
      setSelectingId(id);
      setTalentId(id);
      window.setTimeout(() => {
        setLocation('/studio');
      }, SELECT_ANIMATION_MS);
    },
    [selectingId, setTalentId, setLocation],
  );

  return (
    <div>
      <div data-casting-studio-extensions aria-hidden />

      {process.env.NODE_ENV === 'development' && visibleCount < TALENT_SEQUENCE.length && (
        <p className="sr-only">
          {`Casting Studio: ${visibleCount}/${TALENT_SEQUENCE.length} production identities loaded`}
        </p>
      )}

      {spreads.map(({ spread, placements }) => (
        <div key={spread.spreadId}>
          <EditorialSpreadView
            spread={spread}
            placements={placements}
            selectedTalentId={workflow.talentId}
            selectingId={selectingId}
            onSelect={handleSelect}
          />
          {spread.spreadId < TALENT_LAYOUT.length && (
            <div className="min-h-[24svh]" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
