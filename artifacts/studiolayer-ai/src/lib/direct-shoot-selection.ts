/**
 * Direct Shoot pose selection — pure helpers for V1 single-shot persistence.
 * Canonical workflow field: StudioWorkflow.usedPoses (pose IDs, max 1 in V1).
 */

export function seedDirectShootSelection(
  usedPoses: readonly string[] | undefined,
  shootImageCount: number,
): string[] {
  if (!usedPoses?.length || shootImageCount <= 0) return [];
  return usedPoses.slice(0, shootImageCount);
}

export function toggleDirectShootSelection(
  current: readonly string[],
  poseId: string,
  shootImageCount: number,
): string[] {
  if (shootImageCount === 1) {
    if (current.includes(poseId)) {
      return current.filter((id) => id !== poseId);
    }
    return [poseId];
  }

  if (current.includes(poseId)) {
    return current.filter((id) => id !== poseId);
  }
  if (current.length >= shootImageCount) {
    return [...current];
  }
  return [...current, poseId];
}

export function usedPosesFromDirectShootSelection(
  selectedPoseIds: readonly string[],
): string[] | undefined {
  return selectedPoseIds.length > 0 ? [...selectedPoseIds] : undefined;
}
