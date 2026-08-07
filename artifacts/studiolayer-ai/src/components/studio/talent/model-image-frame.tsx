// ---------------------------------------------------------------------------
// StudioLayer AI — Talent Portrait Frame (Sprint 3.4)
//
// Body-normalized transparent PNG + per-identity editorial calibration.
// Casting Studio only when identityId is provided.
// ---------------------------------------------------------------------------

import { cn } from '@/lib/utils';
import {
  STUDIO_CANVAS_WHITE,
  TALENT_MOTION_TRANSFORM,
  TALENT_PORTRAIT_HEIGHT,
} from './casting-tokens';
import { getEditorialCalibration } from './editorial-calibration';
import {
  bodySlotFillForId,
  getPersonBounds,
} from './portrait-normalization';

interface ModelImageFrameProps {
  src: string;
  alt: string;
  identityId?: string;
  interactive?: boolean;
  portraitMaxHeight?: string;
  className?: string;
}

export function ModelImageFrame({
  src,
  alt,
  identityId,
  interactive = true,
  portraitMaxHeight = TALENT_PORTRAIT_HEIGHT,
  className,
}: ModelImageFrameProps) {
  const useBodyNormalization = Boolean(identityId);

  if (!useBodyNormalization) {
    return (
      <div
        className={cn('relative w-full overflow-visible', className)}
        style={{ maxHeight: portraitMaxHeight, backgroundColor: STUDIO_CANVAS_WHITE }}
      >
        <div
          className="relative flex h-full w-full items-end justify-center overflow-visible"
          style={{
            maxHeight: portraitMaxHeight,
            minHeight: portraitMaxHeight,
            backgroundColor: STUDIO_CANVAS_WHITE,
          }}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="block h-auto w-auto max-h-full max-w-full object-contain object-bottom"
            style={{ maxHeight: portraitMaxHeight }}
          />
        </div>
      </div>
    );
  }

  const bounds = getPersonBounds(identityId!);
  const bodyFill = bodySlotFillForId(identityId!);
  const calibration = getEditorialCalibration(identityId!);
  const imageHeightScale = (1 / bounds.personHeight) * bodyFill * calibration.scale;

  return (
    <div
      className={cn('relative h-full w-full overflow-visible', className)}
      style={{ backgroundColor: STUDIO_CANVAS_WHITE }}
    >
      <div
        className="absolute inset-x-0 overflow-visible"
        style={{
          height: portraitMaxHeight,
          maxHeight: '100%',
          bottom: calibration.baseline,
          backgroundColor: STUDIO_CANVAS_WHITE,
        }}
      >
        <div
          className="absolute left-1/2 overflow-visible"
          style={{
            bottom: 0,
            transform: `translateX(-50%) translateY(${calibration.yOffset}px)`,
          }}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn(
              'block max-w-none',
              interactive && [
                TALENT_MOTION_TRANSFORM,
                'origin-bottom',
                'group-hover:scale-[1.012]',
                'motion-reduce:group-hover:scale-100',
              ],
            )}
            style={{
              height: `calc(${portraitMaxHeight} * ${imageHeightScale})`,
              maxHeight: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}
