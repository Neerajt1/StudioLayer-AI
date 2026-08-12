import { CANONICAL_POSE_ENTRIES } from '@/lib/pose-library-display';
import { DirectShootMobileTile } from '@/components/studio/direct-shoot-mobile-tile';

interface DirectShootMobileBoardProps {
  selectedPoseIds: string[];
  selectionLimitReached: boolean;
  onTogglePose: (poseId: string) => void;
}

/**
 * Direct Shoot — touch-first mobile pose library (canonical Pose1–Pose75).
 */
export function DirectShootMobileBoard({
  selectedPoseIds,
  selectionLimitReached,
  onTogglePose,
}: DirectShootMobileBoardProps) {
  return (
    <div
      className="sl-direct-shoot-mobile-board"
      role="list"
      aria-label="Pose library"
      data-pose-count={CANONICAL_POSE_ENTRIES.length}
    >
      {CANONICAL_POSE_ENTRIES.map(({ poseId, name: poseName }) => (
        <DirectShootMobileTile
          key={poseId}
          poseId={poseId}
          poseName={poseName}
          selected={selectedPoseIds.includes(poseId)}
          disabled={selectionLimitReached}
          onToggle={() => onTogglePose(poseId)}
        />
      ))}
    </div>
  );
}
