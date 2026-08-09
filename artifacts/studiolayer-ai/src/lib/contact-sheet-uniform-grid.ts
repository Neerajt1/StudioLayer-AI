import { CONTACT_SHEET_POSE_COUNT } from '@/lib/contact-sheet-layout';

/** Simple sequential slot entry for the uniform-grid experiment. */
export interface UniformGridPoseSlot {
  slotId: number;
  poseIndex: number;
}

/** 75 identical grid cells — pose 01 → slot 01, … pose 75 → slot 75. */
export const UNIFORM_GRID_POSE_SLOTS: readonly UniformGridPoseSlot[] = Array.from(
  { length: CONTACT_SHEET_POSE_COUNT },
  (_, poseIndex) => ({
    slotId: poseIndex + 1,
    poseIndex,
  }),
);

export function getUniformGridPoseSlots(): readonly UniformGridPoseSlot[] {
  return UNIFORM_GRID_POSE_SLOTS;
}
