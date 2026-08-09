import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { ContactSheetSlotRect } from '@/lib/contact-sheet-layout-types';
import {
  getPoseFigureCanvasStyle,
  getPoseFigureImageStyle,
  getPoseFigureLayout,
  getPoseReferenceImageUrl,
} from '@/lib/pose-library-display';

interface PoseLibraryCardProps {
  poseName: string;
  layout?: 'absolute' | 'uniform' | 'artwork';
  slotRect?: ContactSheetSlotRect;
  frameVariant: string;
  selected: boolean;
  selectionOrder: number | null;
  disabled?: boolean;
  onToggle: () => void;
}

export function PoseLibraryCard({
  poseName,
  layout = 'absolute',
  slotRect,
  frameVariant,
  selected,
  selectionOrder,
  disabled = false,
  onToggle,
}: PoseLibraryCardProps) {
  const referenceUrl = getPoseReferenceImageUrl(poseName);
  const figureLayout = getPoseFigureLayout(poseName);
  const isUniformLayout = layout === 'uniform';
  const isArtworkLayout = layout === 'artwork';
  const isIllustrated = referenceUrl != null;

  const slotStyle = isUniformLayout
    ? undefined
    : ({
        '--slot-left': `${slotRect?.left ?? 0}%`,
        '--slot-top': `${slotRect?.top ?? 0}%`,
        '--slot-width': `${slotRect?.width ?? 100}%`,
        '--slot-height': `${slotRect?.height ?? 100}%`,
      } as CSSProperties);

  return (
    <button
      type="button"
      className={cn(
        'sl-contact-sheet-slot',
        isUniformLayout && 'sl-contact-sheet-slot--uniform',
        isArtworkLayout && 'sl-contact-sheet-slot--artwork',
        isIllustrated && 'sl-contact-sheet-slot--illustrated',
        selected && 'sl-contact-sheet-slot--selected',
        disabled && !selected && 'sl-contact-sheet-slot--disabled',
      )}
      style={slotStyle}
      aria-pressed={selected}
      aria-label={
        selected && selectionOrder != null
          ? `${poseName}, selected ${selectionOrder}`
          : poseName
      }
      disabled={disabled && !selected}
      onClick={onToggle}
    >
      {isIllustrated ? (
        <div className="sl-pose-library-card-clip" aria-hidden>
          <div
            className={cn(
              'sl-pose-library-card-art sl-pose-library-card-art--illustrated',
              figureLayout?.canvasAlignContent === 'center' &&
                'sl-pose-library-card-art--portrait',
            )}
          >
            <div
              className="sl-pose-library-card-canvas"
              style={figureLayout ? getPoseFigureCanvasStyle(figureLayout) : undefined}
            >
              <img
                src={referenceUrl}
                alt=""
                className="sl-pose-library-card-image sl-pose-library-card-figure"
                style={figureLayout ? getPoseFigureImageStyle(figureLayout) : undefined}
                loading="lazy"
                draggable={false}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className={cn('sl-pose-library-card-art', frameVariant)}>
          <div className="sl-pose-library-card-canvas">
            <div className="sl-pose-library-card-pending" aria-hidden />
          </div>
        </div>
      )}
      <span className="sl-pose-library-card-label">{poseName}</span>
      {selected && selectionOrder != null ? (
        <span className="sl-pose-library-card-indicator" aria-hidden>
          <span className="sl-pose-library-card-indicator-check">✓</span>
          <span className="sl-pose-library-card-indicator-order">
            {String(selectionOrder).padStart(2, '0')}
          </span>
        </span>
      ) : null}
    </button>
  );
}
