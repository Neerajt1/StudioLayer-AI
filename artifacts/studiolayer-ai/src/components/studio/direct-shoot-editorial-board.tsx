import { useMemo } from 'react';
import { getPoseCardFrameVariant, POSE_LIBRARY_DISPLAY_NAMES } from '@/lib/pose-library-display';
import {
  EDITORIAL_CANVAS_ASPECT_RATIO,
  getAllEditorialPlacements,
  getEditorialCanvasAlignStyle,
  getEditorialPlacementStyle,
} from '@/lib/direct-shoot-layout-v3';
import { PoseLibraryCard } from '@/components/studio/pose-library-card';

interface DirectShootEditorialBoardProps {
  selectedPoses: string[];
  selectionLimitReached: boolean;
  onTogglePose: (poseName: string) => void;
}

/**
 * INACTIVE — Reference-sheet editorial board (Phase 5C V3).
 * Not imported by the Phase-1 Direct Shoot modal. Kept for historical reversibility.
 */
export function DirectShootEditorialBoard({
  selectedPoses,
  selectionLimitReached,
  onTogglePose,
}: DirectShootEditorialBoardProps) {
  const poseIndexByName = useMemo(
    () => new Map(POSE_LIBRARY_DISPLAY_NAMES.map((name, index) => [name, index])),
    [],
  );

  const placements = useMemo(
    () =>
      getAllEditorialPlacements().sort(
        (a, b) => a.placement.zIndex - b.placement.zIndex,
      ),
    [],
  );

  return (
    <div className="sl-direct-shoot-editorial-board-shell">
      <div
        className="sl-direct-shoot-editorial-board"
        style={{ aspectRatio: String(EDITORIAL_CANVAS_ASPECT_RATIO) }}
        role="list"
        aria-label="Editorial pose board"
      >
        {placements.map(({ poseName, placement }) => {
          const poseIndex = poseIndexByName.get(poseName) ?? 0;
          const selectionIndex = selectedPoses.indexOf(poseName);
          const selectionOrder = selectionIndex >= 0 ? selectionIndex + 1 : null;

          return (
            <PoseLibraryCard
              key={poseName}
              poseName={poseName}
              layout="editorial-v3"
              editorialPlacementStyle={getEditorialPlacementStyle(placement)}
              editorialCanvasAlignStyle={getEditorialCanvasAlignStyle(placement)}
              frameVariant={getPoseCardFrameVariant(poseIndex)}
              selected={selectionOrder != null}
              selectionOrder={selectionOrder}
              disabled={selectionLimitReached}
              onToggle={() => onTogglePose(poseName)}
            />
          );
        })}
      </div>
    </div>
  );
}
