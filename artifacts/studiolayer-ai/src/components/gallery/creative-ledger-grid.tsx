import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  GHOST_LEDGER_SLOT_COUNT,
  LEDGER_EAGER_IMAGE_COUNT,
  ghostSlotCount,
  loadingSkeletonCount,
  markCreativeLedgerOnboarded,
  readCreativeLedgerOnboarded,
} from '@/lib/creative-ledger';
import type { GalleryShoot } from '@/lib/gallery-shoots';
import { ShootCard, ShootCardGhost, ShootCardSkeleton } from '@/components/gallery/shoot-card';

interface CreativeLedgerGridProps {
  shoots: GalleryShoot[];
  /**
   * Ledger size across every page. Onboarding ghosts key off the whole ledger,
   * not the visible page, so paging never resurrects them.
   */
  totalShootCount?: number;
  exitingShootIds?: Set<string>;
  isInitialLoading?: boolean;
  isRefreshing?: boolean;
  onOpenShoot: (shoot: GalleryShoot) => void;
}

export function CreativeLedgerGrid({
  shoots,
  totalShootCount,
  exitingShootIds = new Set(),
  isInitialLoading = false,
  isRefreshing = false,
  onOpenShoot,
}: CreativeLedgerGridProps) {
  const ledgerSize = totalShootCount ?? shoots.length;
  const [onboardingComplete, setOnboardingComplete] = useState(() =>
    readCreativeLedgerOnboarded(),
  );
  const [mountedShootIds, setMountedShootIds] = useState<Set<string>>(() => new Set());
  const [enteringShootIds, setEnteringShootIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (ledgerSize >= GHOST_LEDGER_SLOT_COUNT) {
      markCreativeLedgerOnboarded();
      setOnboardingComplete(true);
    }
  }, [ledgerSize]);

  useEffect(() => {
    const unseen = shoots.filter(
      (shoot) => !mountedShootIds.has(shoot.id) && !exitingShootIds.has(shoot.id),
    );
    if (unseen.length === 0) return;

    const unseenIds = unseen.map((shoot) => shoot.id);
    setMountedShootIds((current) => {
      const next = new Set(current);
      for (const id of unseenIds) next.add(id);
      return next;
    });
    setEnteringShootIds((current) => {
      const next = new Set(current);
      for (const id of unseenIds) next.add(id);
      return next;
    });

    const timer = window.setTimeout(() => {
      setEnteringShootIds((current) => {
        const next = new Set(current);
        for (const id of unseenIds) next.delete(id);
        return next;
      });
    }, 320);

    return () => window.clearTimeout(timer);
  }, [shoots, exitingShootIds, mountedShootIds]);

  const skeletons = loadingSkeletonCount(isInitialLoading, shoots.length);
  const ghosts = isInitialLoading ? 0 : ghostSlotCount(ledgerSize, onboardingComplete);

  return (
    <div
      className={cn(
        'sl-creative-ledger-stage',
        isInitialLoading && 'sl-creative-ledger-stage--loading',
        isRefreshing && 'sl-creative-ledger-stage--refreshing',
      )}
      data-testid="creative-ledger-grid-root"
    >
      <div className="sl-creative-ledger-grid sl-creative-ledger-grid--shoots">
        {shoots.map((shoot, index) => (
          <ShootCard
            key={shoot.id}
            shoot={shoot}
            imagePriority={index < LEDGER_EAGER_IMAGE_COUNT}
            isExiting={exitingShootIds.has(shoot.id)}
            isEntering={enteringShootIds.has(shoot.id)}
            onOpen={onOpenShoot}
          />
        ))}
        {Array.from({ length: skeletons }, (_, index) => (
          <ShootCardSkeleton key={`skeleton-${index}`} index={index} />
        ))}
        {Array.from({ length: ghosts }, (_, index) => (
          <ShootCardGhost key={`ghost-${index}`} index={index} />
        ))}
      </div>
    </div>
  );
}
