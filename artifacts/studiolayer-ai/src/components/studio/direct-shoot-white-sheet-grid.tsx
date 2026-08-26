import {
  getPoseCardFrameVariant,
} from '@/lib/pose-library-display';
import {
  getWhiteSheetCellProfile,
  getWhiteSheetCellStyle,
  getWhiteSheetPoseSlots,
} from '@/lib/direct-shoot-white-sheet-experiment';
import { PoseLibraryCard } from '@/components/studio/pose-library-card';

interface DirectShootWhiteSheetGridProps {
  selectedPoses: string[];
  selectionLimitReached: boolean;
  onTogglePose: (poseName: string) => void;
}

export function DirectShootWhiteSheetGrid({
  selectedPoses,
  selectionLimitReached,
  onTogglePose,
}: DirectShootWhiteSheetGridProps) {
  const slots = getWhiteSheetPoseSlots();

  return (
    <div className="sl-direct-shoot-white-sheet">
      <div className="sl-direct-shoot-white-sheet-grid" role="list">
        {slots.map((slot) => {
          const selectionIndex = selectedPoses.indexOf(slot.poseName);
          const selectionOrder = selectionIndex >= 0 ? selectionIndex + 1 : null;
          const cellProfile = getWhiteSheetCellProfile(slot.poseName);

          return (
            <PoseLibraryCard
              key={slot.slotId}
              poseName={slot.poseName}
              layout="white-sheet"
              whiteSheetCellStyle={getWhiteSheetCellStyle(cellProfile)}
              frameVariant={getPoseCardFrameVariant(slot.poseIndex)}
              selected={selectionOrder != null}
              selectionOrder={selectionOrder}
              disabled={selectionLimitReached}
              onToggle={() => onTogglePose(slot.poseName)}
            />
          );
        })}
      </div>
    </div>
  );
}
