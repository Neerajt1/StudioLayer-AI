import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DirectShootPoseBoard } from '@/components/studio/direct-shoot-pose-board';
import { DirectShootMobileBoard } from '@/components/studio/direct-shoot-mobile-board';
import { useDirectShootMobilePresentation } from '@/hooks/use-direct-shoot-mobile';
import { cn } from '@/lib/utils';

interface DirectShootDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shootImageCount: number;
}

/** Cleared on open so stale experiment modes cannot persist. */
const LEGACY_LAYOUT_STORAGE_KEY = 'studiolayer.direct-shoot.layout-mode';

export function DirectShootDialog({
  open,
  onOpenChange,
  shootImageCount,
}: DirectShootDialogProps) {
  const [selectedPoses, setSelectedPoses] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.sessionStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!open) {
      setSelectedPoses([]);
      return;
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
    }
  }, [open]);

  const selectionLimitReached = selectedPoses.length >= shootImageCount;
  const selectedCount = selectedPoses.length;
  const remainingCount = Math.max(0, shootImageCount - selectedCount);
  const allSelected = selectedCount === shootImageCount && shootImageCount > 0;

  const togglePose = useCallback(
    (poseName: string) => {
      setSelectedPoses((current) => {
        if (current.includes(poseName)) {
          return current.filter((name) => name !== poseName);
        }
        if (current.length >= shootImageCount) {
          return current;
        }
        return [...current, poseName];
      });
    },
    [shootImageCount],
  );

  const selectionPrimaryLabel = useMemo(() => {
    if (selectedCount === 0) {
      return '0 SELECTED';
    }
    return `${selectedCount} OF ${shootImageCount} SELECTED`;
  }, [selectedCount, shootImageCount]);

  const showRemainingMessage = selectedCount > 0 && remainingCount > 0;

  const ctaLabel = useMemo(() => {
    if (allSelected) {
      return 'DIRECT THIS SHOOT';
    }
    if (selectedCount === 0) {
      return 'DIRECT WITH SELECTED + AUTO-SELECT REMAINING →';
    }
    return `DIRECT WITH ${selectedCount} + AUTO-SELECT ${remainingCount} →`;
  }, [allSelected, selectedCount, remainingCount]);

  const handleDirectShoot = () => {
    onOpenChange(false);
  };

  const isMobilePresentation = useDirectShootMobilePresentation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sl-direct-shoot-dialog gap-0 overflow-hidden border border-border bg-card p-0 sm:max-w-none">
        <DialogHeader className="sl-direct-shoot-header">
          <DialogTitle className="sl-direct-shoot-title">Direct Your Shoot</DialogTitle>
          <DialogDescription className="sl-direct-shoot-subtitle">
            Choose the poses you want for your shoot
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'sl-direct-shoot-grid-scroll sl-direct-shoot-grid-scroll--phase1',
            isMobilePresentation && 'sl-direct-shoot-grid-scroll--mobile',
          )}
          role="list"
          aria-label="Pose library"
          data-presentation-mode={
            isMobilePresentation ? 'phase-1-mobile-grid' : 'phase-1-editorial-grid'
          }
        >
          {isMobilePresentation ? (
            <DirectShootMobileBoard
              selectedPoses={selectedPoses}
              selectionLimitReached={selectionLimitReached}
              onTogglePose={togglePose}
            />
          ) : (
            <DirectShootPoseBoard
              selectedPoses={selectedPoses}
              selectionLimitReached={selectionLimitReached}
              onTogglePose={togglePose}
            />
          )}
        </div>

        <footer className="sl-direct-shoot-footer">
          <div className="sl-direct-shoot-footer-summary">
            <p className="sl-direct-shoot-selection-count">{selectionPrimaryLabel}</p>
            {showRemainingMessage ? (
              <p className="sl-direct-shoot-remaining">
                StudioLayer AI chooses the remaining {remainingCount}.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="sl-direct-shoot-cta"
            onClick={handleDirectShoot}
          >
            {ctaLabel}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
