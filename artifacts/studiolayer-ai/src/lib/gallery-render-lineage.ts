// ---------------------------------------------------------------------------
// Gallery render lineage — original slot + post-production versions
// ---------------------------------------------------------------------------

import { shootRootForRender } from '@/lib/gallery-shoots';
import { isBackgroundRemovedRender } from '@/lib/gallery-transparent-output';
import type { CreativeLedgerCardRender } from '@/components/gallery/creative-ledger-card';

export type GalleryRenderLineageVersionId = 'original' | 'background_removed';

export interface GalleryRenderLineageVersion {
  id: GalleryRenderLineageVersionId;
  label: string;
  render: CreativeLedgerCardRender;
}

function isCompletedWithOutput(render: CreativeLedgerCardRender): boolean {
  return (
    render.status === 'completed' &&
    typeof render.outputImageUrl === 'string' &&
    render.outputImageUrl.length > 0
  );
}

function parseTime(value: string | Date | undefined): number {
  if (value == null) return 0;
  return new Date(value).getTime();
}

/** Original generation root for any render in a Gallery slot. */
export function slotRootForRender(
  allRenders: CreativeLedgerCardRender[],
  renderId: number,
): CreativeLedgerCardRender | undefined {
  return shootRootForRender(allRenders, renderId);
}

/** Latest completed Remove Background descendant for a slot root. */
export function latestBackgroundRemovedForRoot(
  allRenders: CreativeLedgerCardRender[],
  rootId: number,
): CreativeLedgerCardRender | undefined {
  const candidates = allRenders.filter((render) => {
    if (!isBackgroundRemovedRender(render) || !isCompletedWithOutput(render)) {
      return false;
    }
    const root = shootRootForRender(allRenders, render.id);
    return root?.id === rootId;
  });

  if (candidates.length === 0) return undefined;

  return [...candidates].sort(
    (a, b) => parseTime(b.createdAt) - parseTime(a.createdAt) || b.id - a.id,
  )[0];
}

/** Ordered lineage versions for a slot — Original, then latest post-production. */
export function lineageVersionsForSlot(
  allRenders: CreativeLedgerCardRender[],
  renderId: number,
): GalleryRenderLineageVersion[] {
  const root = slotRootForRender(allRenders, renderId);
  if (!root || !isCompletedWithOutput(root)) return [];

  const versions: GalleryRenderLineageVersion[] = [
    { id: 'original', label: 'Original', render: root },
  ];

  const backgroundRemoved = latestBackgroundRemovedForRoot(allRenders, root.id);
  if (backgroundRemoved) {
    versions.push({
      id: 'background_removed',
      label: 'Background removed',
      render: backgroundRemoved,
    });
  }

  return versions;
}

export function hasMultipleLineageVersions(
  allRenders: CreativeLedgerCardRender[],
  renderId: number,
): boolean {
  return lineageVersionsForSlot(allRenders, renderId).length > 1;
}

/** Resolve which lineage version is active for the current render id. */
export function activeLineageVersionId(
  allRenders: CreativeLedgerCardRender[],
  renderId: number,
): GalleryRenderLineageVersionId {
  const render = allRenders.find((entry) => entry.id === renderId);
  if (render && isBackgroundRemovedRender(render)) {
    return 'background_removed';
  }
  return 'original';
}
