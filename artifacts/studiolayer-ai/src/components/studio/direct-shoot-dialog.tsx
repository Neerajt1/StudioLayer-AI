import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getArtworkContactSheetTemplates } from '@/lib/contact-sheet-artwork-layout';
import {
  getPoseCardFrameVariant,
  POSE_LIBRARY_DISPLAY_NAMES,
} from '@/lib/pose-library-display';
import { PoseLibraryCard } from '@/components/studio/pose-library-card';

interface DirectShootDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shootImageCount: number;
}

/** Legacy experiment storage key — cleared on open so stale modes cannot persist. */
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

  const artworkTemplates = useMemo(() => getArtworkContactSheetTemplates(), []);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sl-direct-shoot-dialog gap-0 overflow-hidden border border-border bg-card p-0 sm:max-w-none">
        <DialogHeader className="sl-direct-shoot-header">
          <DialogTitle className="sl-direct-shoot-title">Direct Your Shoot</DialogTitle>
          <DialogDescription className="sl-direct-shoot-subtitle">
            Choose the poses you want for your shoot
          </DialogDescription>
        </DialogHeader>

        <div className="sl-direct-shoot-grid-scroll" role="list" aria-label="Pose library">
          <div className="sl-contact-sheet-scroll">
            <div className="sl-contact-sheet-artwork-stack">
              {artworkTemplates.map((template) => (
                <section
                  key={template.templateId}
                  className="sl-contact-sheet-artwork-template"
                  aria-label={`Contact sheet template ${String(template.templateId).padStart(2, '0')}`}
                >
                  <img
                    src={template.artworkUrl}
                    alt=""
                    className="sl-contact-sheet-artwork-layer"
                    draggable={false}
                  />
                  {template.slots.map((slot) => {
                    const poseName = POSE_LIBRARY_DISPLAY_NAMES[slot.poseIndex];
                    if (!poseName) {
                      return null;
                    }

                    const selectionIndex = selectedPoses.indexOf(poseName);
                    const selectionOrder = selectionIndex >= 0 ? selectionIndex + 1 : null;

                    return (
                      <PoseLibraryCard
                        key={slot.slotId}
                        poseName={poseName}
                        layout="artwork"
                        slotRect={slot.rect}
                        frameVariant={getPoseCardFrameVariant(slot.poseIndex)}
                        selected={selectionOrder != null}
                        selectionOrder={selectionOrder}
                        disabled={selectionLimitReached}
                        onToggle={() => togglePose(poseName)}
                      />
                    );
                  })}
                </section>
              ))}
            </div>
          </div>
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
