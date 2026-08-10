import { POSE_LIBRARY_DISPLAY_NAMES } from '@/lib/pose-library-display';
import { DirectShootMobileTile } from '@/components/studio/direct-shoot-mobile-tile';

interface DirectShootMobileBoardProps {
  selectedPoses: string[];
  selectionLimitReached: boolean;
  onTogglePose: (poseName: string) => void;
}

/**
 * Phase-1 Direct Shoot — touch-first mobile pose library.
 * Two-column grid of individual PoseN.png tiles for phones (<640px).
 */
export function DirectShootMobileBoard({
  selectedPoses,
  selectionLimitReached,
  onTogglePose,
}: DirectShootMobileBoardProps) {
  return (
    <div
      className="sl-direct-shoot-mobile-board"
      role="list"
      aria-label="Pose library"
      data-pose-count={POSE_LIBRARY_DISPLAY_NAMES.length}
    >
      {POSE_LIBRARY_DISPLAY_NAMES.map((poseName) => (
        <DirectShootMobileTile
          key={poseName}
          poseName={poseName}
          selected={selectedPoses.includes(poseName)}
          disabled={selectionLimitReached}
          onToggle={() => onTogglePose(poseName)}
        />
      ))}
    </div>
  );
}
