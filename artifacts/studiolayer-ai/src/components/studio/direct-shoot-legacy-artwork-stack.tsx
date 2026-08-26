/**
 * INACTIVE — Legacy olive T1–T8 contact-sheet presentation (Phase 5C-H).
 * Not imported by the Phase-1 Direct Shoot modal. Kept for historical reversibility.
 */
import { getArtworkContactSheetTemplates } from '@/lib/contact-sheet-artwork-layout';
import { cn } from '@/lib/utils';
import { getPoseCardFrameVariant, POSE_LIBRARY_DISPLAY_NAMES } from '@/lib/pose-library-display';
import { PoseLibraryCard } from '@/components/studio/pose-library-card';
import { isSymmetricalPresentationExperimentActive } from '@/lib/pose-presentation-experiment';

interface DirectShootLegacyArtworkStackProps {
  selectedPoses: string[];
  selectionLimitReached: boolean;
  onTogglePose: (poseName: string) => void;
}

export function DirectShootLegacyArtworkStack({
  selectedPoses,
  selectionLimitReached,
  onTogglePose,
}: DirectShootLegacyArtworkStackProps) {
  const artworkTemplates = getArtworkContactSheetTemplates();
  const symmetricalPresentation = isSymmetricalPresentationExperimentActive();

  return (
    <div
      className={cn(
        'sl-contact-sheet-artwork-stack',
        symmetricalPresentation && 'sl-contact-sheet-artwork-stack--symmetrical',
      )}
    >
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
                onToggle={() => onTogglePose(poseName)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
