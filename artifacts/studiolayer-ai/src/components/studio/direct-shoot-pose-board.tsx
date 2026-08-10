import { useMemo } from 'react';
import { POSE_LIBRARY_DISPLAY_NAMES } from '@/lib/pose-library-display';
import {
  CURATED_BOARD_ASPECT_RATIO,
  getAllCuratedPlacements,
  getCuratedPlacementStyle,
} from '@/lib/direct-shoot-curated-layout';
import { DirectShootPoseTile } from '@/components/studio/direct-shoot-pose-tile';

interface DirectShootPoseBoardProps {
  selectedPoses: string[];
  selectionLimitReached: boolean;
  onTogglePose: (poseName: string) => void;
}

/**
 * Phase-1 Direct Shoot pose library — controlled editorial grid on a white canvas.
 * 75 individual PoseN.png tiles in deterministic row/band layout.
 */
export function DirectShootPoseBoard({
  selectedPoses,
  selectionLimitReached,
  onTogglePose,
}: DirectShootPoseBoardProps) {
  const placements = useMemo(
    () =>
      getAllCuratedPlacements().sort(
        (a, b) => a.placement.zIndex - b.placement.zIndex,
      ),
    [],
  );

  const poseOrder = useMemo(
    () => new Set(POSE_LIBRARY_DISPLAY_NAMES),
    [],
  );

  return (
    <div className="sl-direct-shoot-pose-board-shell">
      <div
        className="sl-direct-shoot-pose-board"
        style={{ aspectRatio: String(CURATED_BOARD_ASPECT_RATIO) }}
        role="list"
        aria-label="Pose library board"
        data-pose-count={poseOrder.size}
      >
        {placements.map(({ poseName, placement }) => (
          <DirectShootPoseTile
            key={poseName}
            poseName={poseName}
            placementStyle={getCuratedPlacementStyle(placement)}
            selected={selectedPoses.includes(poseName)}
            disabled={selectionLimitReached}
            onToggle={() => onTogglePose(poseName)}
          />
        ))}
      </div>
    </div>
  );
}
