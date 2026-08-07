// ---------------------------------------------------------------------------
// BrandIntro — editorial opening sequence (opacity-only)
// Playback · timing · reduced motion · callbacks · cleanup
// Asset: public/brand/logo.svg only
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import {
  BRAND_NAME,
  BRAND_TAGLINE_PRIMARY,
  BRAND_TAGLINE_SECONDARY,
} from '@/components/design-system/brand-tokens';
import { prefersReducedMotion } from '@/lib/studio-intro';
import { cn } from '@/lib/utils';

/** Monogram / name / tagline fade duration (ms). */
const FADE_MS = 250;

/** Delay after monogram completes before brand name fades in (ms). */
const NAME_DELAY_MS = 150;

/** Delay after brand name completes before taglines fade in (ms). */
const TAGLINE_DELAY_MS = 100;

/** Hold after full signature is visible (ms). */
const HOLD_MS = 700;

/** Cross-fade into destination page (ms). */
export const BRAND_INTRO_CROSSFADE_MS = 275;

const signatureCompleteAt = FADE_MS + NAME_DELAY_MS + FADE_MS + TAGLINE_DELAY_MS + FADE_MS;

const fadeStyle = {
  transition: `opacity ${FADE_MS}ms ease-out`,
};

export interface BrandIntroProps {
  onCrossfadeStart?: () => void;
  onComplete: () => void;
}

export function BrandIntro({ onCrossfadeStart, onComplete }: BrandIntroProps) {
  const [monogramVisible, setMonogramVisible] = useState(false);
  const [nameVisible, setNameVisible] = useState(false);
  const [taglinesVisible, setTaglinesVisible] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);

  useEffect(() => {
    if (prefersReducedMotion()) {
      onCrossfadeStart?.();
      onComplete();
      return;
    }

    const timers: number[] = [];

    const raf = requestAnimationFrame(() => {
      setMonogramVisible(true);
    });

    timers.push(
      window.setTimeout(() => setNameVisible(true), FADE_MS + NAME_DELAY_MS),
    );

    timers.push(
      window.setTimeout(
        () => setTaglinesVisible(true),
        FADE_MS + NAME_DELAY_MS + FADE_MS + TAGLINE_DELAY_MS,
      ),
    );

    timers.push(
      window.setTimeout(() => {
        onCrossfadeStart?.();
        setOverlayVisible(false);
      }, signatureCompleteAt + HOLD_MS),
    );

    timers.push(
      window.setTimeout(() => {
        onComplete();
      }, signatureCompleteAt + HOLD_MS + BRAND_INTRO_CROSSFADE_MS),
    );

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [onCrossfadeStart, onComplete]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-white',
        overlayVisible ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      style={{
        opacity: overlayVisible ? 1 : 0,
        transition: `opacity ${BRAND_INTRO_CROSSFADE_MS}ms ease-out`,
      }}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center text-center">
        <div style={{ ...fadeStyle, opacity: monogramVisible ? 1 : 0 }}>
          <BrandLogo variant="auth" format="svg" />
        </div>
        <p
          className="sl-brand-name mt-5 text-[1.953125rem]"
          style={{ ...fadeStyle, opacity: nameVisible ? 1 : 0 }}
        >
          {BRAND_NAME}
        </p>
        <div
          className="mt-1 space-y-0"
          style={{ ...fadeStyle, opacity: taglinesVisible ? 1 : 0 }}
        >
          <p className="sl-tagline-primary text-[1.078125rem] leading-[1.28]">
            {BRAND_TAGLINE_PRIMARY}
          </p>
          <p className="sl-tagline-secondary text-[0.953125rem] leading-[1.28]">
            {BRAND_TAGLINE_SECONDARY}
          </p>
        </div>
      </div>
    </div>
  );
}
