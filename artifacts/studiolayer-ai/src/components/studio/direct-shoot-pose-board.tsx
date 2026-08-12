import { useMemo } from 'react';
import {
  CANONICAL_BOARD_ASPECT_RATIO,
  getAllCanonicalPlacements,
  getCanonicalPlacementStyle,
} from '@/lib/direct-shoot-canonical-layout';
import { CANONICAL_POSE_ENTRIES } from '@/lib/pose-library-display';
import { DirectShootPoseTile } from '@/components/studio/direct-shoot-pose-tile';

interface DirectShootPoseBoardProps {
  selectedPoseIds: string[];
  selectionLimitReached: boolean;
  onTogglePose: (poseId: string) => void;
}

/**
 * Direct Shoot pose library — canonical Pose1–Pose75 editorial grid.
 */
export function DirectShootPoseBoard({
  selectedPoseIds,
  selectionLimitReached,
  onTogglePose,
}: DirectShootPoseBoardProps) {
  const entryById = useMemo(
    () => new Map(CANONICAL_POSE_ENTRIES.map((entry) => [entry.poseId, entry])),
    [],
  );

  const placements = useMemo(
    () =>
      getAllCanonicalPlacements().sort(
        (a, b) => a.placement.zIndex - b.placement.zIndex,
      ),
    [],
  );

  return (
    <div className="sl-direct-shoot-pose-board-shell">
      <div
        className="sl-direct-shoot-pose-board"
        style={{ aspectRatio: String(CANONICAL_BOARD_ASPECT_RATIO) }}
        role="list"
        aria-label="Pose library board"
        data-pose-count={CANONICAL_POSE_ENTRIES.length}
      >
        {placements.map(({ poseId, placement }) => {
          const entry = entryById.get(poseId);
          if (!entry) return null;

          return (
            <DirectShootPoseTile
              key={poseId}
              poseId={entry.poseId}
              poseName={entry.name}
              placementStyle={getCanonicalPlacementStyle(placement)}
              selected={selectedPoseIds.includes(poseId)}
              disabled={selectionLimitReached}
              onToggle={() => onTogglePose(poseId)}
            />
          );
        })}
      </div>
    </div>
  );
}
