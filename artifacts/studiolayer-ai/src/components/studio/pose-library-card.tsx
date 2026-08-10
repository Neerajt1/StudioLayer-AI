import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { ContactSheetSlotRect } from '@/lib/contact-sheet-layout-types';
import {
  getPoseFigureCanvasStyle,
  getPoseFigureImageStyle,
  getPoseFigureLayout,
  getPoseReferenceImageUrl,
} from '@/lib/pose-library-display';
import {
  getPosePresentationFigureVars,
  getPosePresentationOverlay,
  isSymmetricalPresentationExperimentActive,
} from '@/lib/pose-presentation-experiment';

interface PoseLibraryCardProps {
  poseName: string;
  layout?: 'absolute' | 'uniform' | 'artwork' | 'white-sheet' | 'editorial-v3';
  slotRect?: ContactSheetSlotRect;
  whiteSheetCellStyle?: Record<string, string>;
  editorialPlacementStyle?: Record<string, string | number>;
  editorialCanvasAlignStyle?: Record<string, string>;
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
  whiteSheetCellStyle,
  editorialPlacementStyle,
  editorialCanvasAlignStyle,
  frameVariant,
  selected,
  selectionOrder,
  disabled = false,
  onToggle,
}: PoseLibraryCardProps) {
  const referenceUrl = getPoseReferenceImageUrl(poseName);
  const figureLayout = getPoseFigureLayout(poseName);
  const presentationOverlay = getPosePresentationOverlay(poseName);
  const symmetricalExperiment = isSymmetricalPresentationExperimentActive();
  const isUniformLayout = layout === 'uniform';
  const isArtworkLayout = layout === 'artwork';
  const isWhiteSheetLayout = layout === 'white-sheet';
  const isEditorialV3Layout = layout === 'editorial-v3';
  const isIllustrated = referenceUrl != null;

  const slotStyle = isEditorialV3Layout
    ? (() => {
        if (!editorialPlacementStyle) return undefined;
        const { objectPosition: _op, ...rest } = editorialPlacementStyle;
        return rest as CSSProperties;
      })()
    : isUniformLayout || isWhiteSheetLayout
      ? (isWhiteSheetLayout ? (whiteSheetCellStyle as CSSProperties) : undefined)
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
        isWhiteSheetLayout && 'sl-contact-sheet-slot--white-sheet',
        isEditorialV3Layout && 'sl-contact-sheet-slot--editorial-v3',
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
              symmetricalExperiment &&
                !isWhiteSheetLayout &&
                !isEditorialV3Layout &&
                'sl-pose-library-card-art--symmetrical',
              figureLayout?.canvasAlignContent === 'center' &&
                !isEditorialV3Layout &&
                'sl-pose-library-card-art--portrait',
            )}
          >
            <div
              className="sl-pose-library-card-canvas"
              style={{
                ...(isEditorialV3Layout
                  ? editorialCanvasAlignStyle
                  : figureLayout
                    ? getPoseFigureCanvasStyle(figureLayout)
                    : undefined),
                ...(isEditorialV3Layout
                  ? undefined
                  : isWhiteSheetLayout
                    ? whiteSheetCellStyle
                    : getPosePresentationFigureVars(presentationOverlay)),
              }}
            >
              <img
                src={referenceUrl}
                alt=""
                className="sl-pose-library-card-image sl-pose-library-card-figure"
                style={{
                  ...(isEditorialV3Layout && editorialPlacementStyle
                    ? {
                        objectPosition: String(
                          editorialPlacementStyle.objectPosition ?? 'center bottom',
                        ),
                      }
                    : figureLayout
                      ? getPoseFigureImageStyle(figureLayout)
                      : undefined),
                  ...(isEditorialV3Layout
                    ? undefined
                    : isWhiteSheetLayout
                      ? whiteSheetCellStyle
                      : getPosePresentationFigureVars(presentationOverlay)),
                }}
                loading={isEditorialV3Layout ? 'eager' : 'lazy'}
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
          {!isEditorialV3Layout ? (
            <>
              <span className="sl-pose-library-card-indicator-check">✓</span>
              <span className="sl-pose-library-card-indicator-order">
                {String(selectionOrder).padStart(2, '0')}
              </span>
            </>
          ) : (
            <span className="sl-pose-library-card-indicator-check">✓</span>
          )}
        </span>
      ) : null}
    </button>
  );
}
