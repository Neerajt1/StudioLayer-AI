// ---------------------------------------------------------------------------
// Gallery Shoots — generation session grouping with legacy one-root fallback
//
// Canonical model: one generationSessionId = one Gallery Shoot.
// Legacy renders without generationSessionId: one root = one Shoot (no heuristics).
// ---------------------------------------------------------------------------

import {
  galleryGenerationCreditLabel,
  reconcileLegacyShootGenerationType,
  type GenerationType,
} from '@workspace/studio-credit-engine';
import {
  getAncestorChain,
  type LedgerRender,
} from '@/lib/creative-ledger';
import type { CreativeLedgerCardRender } from '@/components/gallery/creative-ledger-card';

/** Images per original generation — extensible for future storyboard / video. */
export const SHOOT_BATCH_SIZE: Record<GenerationType, number> = {
  hero: 1,
  editorial: 2,
  campaign: 4,
};

export const SHOOT_TYPE_LABEL: Record<GenerationType, string> = {
  hero: 'Hero',
  campaign: 'Campaign',
  editorial: 'Editorial',
};

export interface GalleryShoot {
  /** Stable id — generationSessionId (canonical) or `shoot-{rootBatchId}` (legacy). */
  id: string;
  rootId: number;
  generationType: GenerationType;
  createdAt: Date;
  /**
   * Gallery slot images — latest completed tip per original root, or the failed
   * root when that slot never produced output (P0-7).
   */
  images: CreativeLedgerCardRender[];
  sourceImageUrl: string | null;
  modelPersona?: string;
  locationEnvironment?: string;
  /** Studio Credits for the whole Shoot (one generation transaction). */
  studioCreditsUsed: number;
  /**
   * Paid completed post-production edits on this Shoot (e.g. Remove Background).
   * Crop is client-only / free and must never appear here. Failed refinements
   * are excluded so Shoot accounting matches Gallery cycle "Edits Made".
   */
  refinementCount: number;
  imageCount: number;
}

function parseTime(value: string | Date | undefined): number {
  if (value == null) return 0;
  return new Date(value).getTime();
}

function generationTypeOf(render: LedgerRender): GenerationType {
  return (render.generationType ?? 'hero') as GenerationType;
}

/**
 * Gallery shoot type from original roots. Rewrites only the inverted historical
 * pairs (2×campaign → editorial, 4×editorial → campaign). Mixed types, Hero,
 * and Custom Campaign counts stay as stored.
 */
function shootGenerationTypeFromRoots(
  roots: CreativeLedgerCardRender[],
): GenerationType {
  const stored = generationTypeOf(roots[0]!);
  const types = new Set(roots.map(generationTypeOf));
  if (types.size !== 1) return stored;
  return reconcileLegacyShootGenerationType(stored, roots.length);
}

/** Walk parent chain to the original generation root. */
export function shootRootForRender<T extends LedgerRender>(
  allRenders: T[],
  renderId: number,
): T | undefined {
  return getAncestorChain(allRenders, renderId)[0];
}

function isCompletedWithOutput<T extends CreativeLedgerCardRender>(render: T): boolean {
  return (
    render.status === 'completed' &&
    typeof render.outputImageUrl === 'string' &&
    render.outputImageUrl.length > 0
  );
}

/** Genuine failed render with no usable output — safe for P0-7 Gallery messaging. */
export function isFailedGalleryRenderWithoutOutput<
  T extends { status?: string; outputImageUrl?: string | null },
>(render: T): boolean {
  if (render.status !== 'failed') return false;
  return !(
    typeof render.outputImageUrl === 'string' && render.outputImageUrl.length > 0
  );
}

/** Latest completed descendant for a root slot (handles refinements). */
export function tipRenderForRoot<T extends CreativeLedgerCardRender>(
  rootId: number,
  allRenders: T[],
): T | undefined {
  const byId = new Map(allRenders.map((r) => [r.id, r]));
  const childrenByParent = new Map<number, T[]>();

  for (const render of allRenders) {
    if (render.parentRenderId == null) continue;
    const siblings = childrenByParent.get(render.parentRenderId) ?? [];
    siblings.push(render);
    childrenByParent.set(render.parentRenderId, siblings);
  }

  const root = byId.get(rootId);
  if (!root) return undefined;

  function findLatestCompletedTip(current: T): T | undefined {
    const children = childrenByParent.get(current.id);
    if (!children?.length) {
      return isCompletedWithOutput(current) ? current : undefined;
    }

    const sortedChildren = [...children].sort(
      (a, b) => parseTime(b.createdAt) - parseTime(a.createdAt) || b.id - a.id,
    );

    for (const child of sortedChildren) {
      const childTip = findLatestCompletedTip(child);
      if (childTip) return childTip;
    }

    return isCompletedWithOutput(current) ? current : undefined;
  }

  return findLatestCompletedTip(root);
}

/**
 * Gallery slot display: prefer the completed tip; otherwise surface a failed root
 * so partial/all-failed Shoots remain visible in the existing Gallery path.
 */
export function displayRenderForRoot<T extends CreativeLedgerCardRender>(
  rootId: number,
  allRenders: T[],
): T | undefined {
  const tip = tipRenderForRoot(rootId, allRenders);
  if (tip) return tip;

  const root = allRenders.find((render) => render.id === rootId);
  if (!root) return undefined;
  if (!isFailedGalleryRenderWithoutOutput(root)) return undefined;
  return root;
}

/**
 * Legacy null-session roots have no authoritative project identity.
 * Never heuristic-merge by garment / type / time / expected batch size —
 * one root = one Gallery Shoot.
 */
export function groupRootRendersIntoBatches(
  roots: CreativeLedgerCardRender[],
): CreativeLedgerCardRender[][] {
  const sorted = [...roots].sort(
    (a, b) => parseTime(a.createdAt) - parseTime(b.createdAt) || a.id - b.id,
  );
  return sorted.map((root) => [root]);
}

function studioCreditsForShootBatch(batch: CreativeLedgerCardRender[]): number {
  const root = batch[0];
  if (!root) return 0;

  // Generation metadata is written at request time. Only show credits when every
  // original root in the batch completed — partial/failed batches were not charged.
  const generationSucceeded = batch.every(
    (render) =>
      render.status === 'completed' &&
      typeof render.outputImageUrl === 'string' &&
      render.outputImageUrl.length > 0,
  );
  if (!generationSucceeded) {
    return 0;
  }

  const fromRow = root.studioCreditsUsed;
  if (fromRow != null && fromRow > 0) {
    return fromRow;
  }
  return galleryGenerationCreditLabel(shootGenerationTypeFromRoots(batch));
}

/** Completed paid edit rows only — Crop never creates render rows. */
export function isCompletedPaidEditRender(
  render: Pick<
    CreativeLedgerCardRender,
    'status' | 'parentRenderId' | 'refinementType' | 'assetType' | 'outputImageUrl'
  >,
): boolean {
  if (render.parentRenderId == null) return false;
  if (!isCompletedWithOutput(render as CreativeLedgerCardRender)) return false;

  if (render.refinementType === 'remove_background') return true;
  if (render.assetType === 'background_removed') return true;
  return false;
}

function refinementCountForShoot(
  shootRootId: number,
  batchRootIds: Set<number>,
  allRenders: CreativeLedgerCardRender[],
): number {
  let count = 0;
  for (const render of allRenders) {
    if (!isCompletedPaidEditRender(render)) continue;
    const root = shootRootForRender(allRenders, render.id);
    if (!root || !batchRootIds.has(root.id)) continue;
    if (Math.min(...batchRootIds) !== shootRootId) continue;
    count += 1;
  }
  return count;
}

function refinementCountForSession(
  sessionId: string,
  allRenders: CreativeLedgerCardRender[],
): number {
  let count = 0;
  for (const render of allRenders) {
    if (render.generationSessionId !== sessionId) continue;
    if (!isCompletedPaidEditRender(render)) continue;
    count += 1;
  }
  return count;
}

function buildShootFromRoots(
  id: string,
  roots: CreativeLedgerCardRender[],
  allRenders: CreativeLedgerCardRender[],
): GalleryShoot | null {
  const sortedRoots = [...roots].sort((a, b) => a.id - b.id);
  const batchRootIds = new Set(sortedRoots.map((r) => r.id));
  const shootRootId = sortedRoots[0]!.id;
  const images = sortedRoots
    .map((root) => displayRenderForRoot(root.id, allRenders))
    .filter((r): r is CreativeLedgerCardRender => r != null);

  // Keep all-failed Shoots visible; only drop when every slot is still unsettled.
  if (images.length === 0) return null;

  return {
    id,
    rootId: shootRootId,
    generationType: shootGenerationTypeFromRoots(sortedRoots),
    createdAt: new Date(sortedRoots[0]!.createdAt ?? Date.now()),
    images,
    sourceImageUrl: sortedRoots[0]!.sourceImageUrl ?? null,
    modelPersona: (sortedRoots[0] as { modelPersona?: string }).modelPersona,
    locationEnvironment: (sortedRoots[0] as { locationEnvironment?: string })
      .locationEnvironment,
    studioCreditsUsed: studioCreditsForShootBatch(sortedRoots),
    refinementCount: refinementCountForShoot(shootRootId, batchRootIds, allRenders),
    imageCount: images.length,
  };
}

/** Canonical grouping — one generationSessionId per Gallery Shoot. */
function buildSessionGalleryShoots(
  allRenders: CreativeLedgerCardRender[],
): GalleryShoot[] {
  const sessionIds = new Set<string>();
  for (const render of allRenders) {
    if (render.generationSessionId) {
      sessionIds.add(render.generationSessionId);
    }
  }

  const shoots: GalleryShoot[] = [];

  for (const sessionId of sessionIds) {
    const sessionRenders = allRenders.filter(
      (r) => r.generationSessionId === sessionId,
    );
    const roots = sessionRenders.filter((r) => r.parentRenderId == null);
    const shoot = buildShootFromRoots(sessionId, roots, allRenders);
    if (shoot) {
      shoot.refinementCount = refinementCountForSession(sessionId, allRenders);
      shoots.push(shoot);
    }
  }

  return shoots;
}

/** Legacy: one null-session root → one Shoot (no cross-project heuristics). */
function buildLegacyGalleryShoots(
  allRenders: CreativeLedgerCardRender[],
): GalleryShoot[] {
  const legacyRenders = allRenders.filter((r) => !r.generationSessionId);
  if (legacyRenders.length === 0) return [];

  const roots = legacyRenders.filter((r) => r.parentRenderId == null);
  const batches = groupRootRendersIntoBatches(roots);

  return batches
    .map((batch) => {
      const shootRootId = Math.min(...batch.map((r) => r.id));
      return buildShootFromRoots(`shoot-${shootRootId}`, batch, legacyRenders);
    })
    .filter((shoot): shoot is GalleryShoot => shoot != null);
}

/** Build Shoot entities from the flat render list returned by the API. */
export function buildGalleryShoots(
  allRenders: CreativeLedgerCardRender[],
): GalleryShoot[] {
  if (!Array.isArray(allRenders)) {
    return [];
  }

  const sessionShoots = buildSessionGalleryShoots(allRenders);
  const legacyShoots = buildLegacyGalleryShoots(allRenders);

  return [...sessionShoots, ...legacyShoots].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/** Completed Shoots ready for Gallery display. */
export function filterCompletedShoots(shoots: GalleryShoot[]): GalleryShoot[] {
  return shoots.filter((shoot) => shoot.imageCount > 0);
}

export function formatShootDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function findShootForRender(
  shoots: GalleryShoot[],
  renderId: number,
): GalleryShoot | undefined {
  return shoots.find((shoot) => shoot.images.some((img) => img.id === renderId));
}

export { filterCompletedRenders } from '@/lib/creative-ledger';
