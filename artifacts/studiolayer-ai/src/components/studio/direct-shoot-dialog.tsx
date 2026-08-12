import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  onConfirm?: (selectedPoseIds: string[]) => void;
  onDismiss?: () => void;
}

/** Cleared on open so stale experiment modes cannot persist. */
const LEGACY_LAYOUT_STORAGE_KEY = 'studiolayer.direct-shoot.layout-mode';

export function DirectShootDialog({
  open,
  onOpenChange,
  shootImageCount,
  onConfirm,
  onDismiss,
}: DirectShootDialogProps) {
  const [selectedPoseIds, setSelectedPoseIds] = useState<string[]>([]);
  const confirmedThisSessionRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.sessionStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!open) {
      setSelectedPoseIds([]);
      return;
    }
    confirmedThisSessionRef.current = false;
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
    }
  }, [open]);

  const isSingleShotSelection = shootImageCount === 1;
  const selectionLimitReached = selectedPoseIds.length >= shootImageCount;
  const tileSelectionLimitReached = !isSingleShotSelection && selectionLimitReached;
  const selectedCount = selectedPoseIds.length;
  const remainingCount = Math.max(0, shootImageCount - selectedCount);
  const allSelected = selectedCount === shootImageCount && shootImageCount > 0;

  const togglePose = useCallback(
    (poseId: string) => {
      setSelectedPoseIds((current) => {
        if (isSingleShotSelection) {
          if (current.includes(poseId)) {
            return current.filter((id) => id !== poseId);
          }
          return [poseId];
        }

        if (current.includes(poseId)) {
          return current.filter((id) => id !== poseId);
        }
        if (current.length >= shootImageCount) {
          return current;
        }
        return [...current, poseId];
      });
    },
    [isSingleShotSelection, shootImageCount],
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
      return 'CONFIRM POSES';
    }
    if (selectedCount === 0) {
      return `SELECT ${shootImageCount} POSE${shootImageCount === 1 ? '' : 'S'}`;
    }
    return `SELECT ${remainingCount} MORE`;
  }, [allSelected, selectedCount, remainingCount, shootImageCount]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !confirmedThisSessionRef.current) {
        onDismiss?.();
      }
      onOpenChange(nextOpen);
    },
    [onDismiss, onOpenChange],
  );

  const handleDirectShoot = () => {
    if (!allSelected) return;
    confirmedThisSessionRef.current = true;
    onConfirm?.(selectedPoseIds);
    onOpenChange(false);
  };

  const isMobilePresentation = useDirectShootMobilePresentation();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              selectedPoseIds={selectedPoseIds}
              selectionLimitReached={tileSelectionLimitReached}
              onTogglePose={togglePose}
            />
          ) : (
            <DirectShootPoseBoard
              selectedPoseIds={selectedPoseIds}
              selectionLimitReached={tileSelectionLimitReached}
              onTogglePose={togglePose}
            />
          )}
        </div>

        <footer className="sl-direct-shoot-footer">
          <div className="sl-direct-shoot-footer-summary">
            <p className="sl-direct-shoot-selection-count">{selectionPrimaryLabel}</p>
            {showRemainingMessage ? (
              <p className="sl-direct-shoot-remaining">
                Select {remainingCount} more pose{remainingCount === 1 ? '' : 's'} to continue.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="sl-direct-shoot-cta"
            disabled={!allSelected}
            onClick={handleDirectShoot}
          >
            {ctaLabel}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
