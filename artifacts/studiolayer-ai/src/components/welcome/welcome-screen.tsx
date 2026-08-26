import { useEffect, useId, useState } from 'react';
import { prefersReducedMotion } from '@/lib/studio-intro';
import {
  getStudioWelcomeAssetBase,
  markStudioWelcomeEntered,
} from '@/lib/studio-welcome';
import { cn } from '@/lib/utils';
import './welcome-screen.css';

const EXIT_MS = 320;

/**
 * Approved desktop artwork (16:10). Mobile paths are reserved for a future
 * approved 9:16 asset — until then the desktop art is used with contain.
 */
const WELCOME_ASSETS = {
  desktop: {
    svg: 'studiolayer-welcome-desktop.svg',
    png: 'studiolayer-welcome-desktop.png',
  },
  /** Set filenames here when approved mobile artwork is added under public/welcome/. */
  mobile: {
    svg: null as string | null,
    png: null as string | null,
  },
} as const;

export interface WelcomeScreenProps {
  onDismissed: () => void;
}

export function WelcomeScreen({ onDismissed }: WelcomeScreenProps) {
  const titleId = useId();
  const [exiting, setExiting] = useState(false);
  const reducedMotion = prefersReducedMotion();
  const assetBase = getStudioWelcomeAssetBase();

  const desktopSvg = `${assetBase}/${WELCOME_ASSETS.desktop.svg}`;
  const desktopPng = `${assetBase}/${WELCOME_ASSETS.desktop.png}`;
  const mobileSvg = WELCOME_ASSETS.mobile.svg
    ? `${assetBase}/${WELCOME_ASSETS.mobile.svg}`
    : null;
  const mobilePng = WELCOME_ASSETS.mobile.png
    ? `${assetBase}/${WELCOME_ASSETS.mobile.png}`
    : null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Do not autofocus — programmatic focus was painting a persistent focus ring
    // that looked like a button border. Keyboard users can still Tab to the CTA.
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleEnter = () => {
    if (exiting) return;
    markStudioWelcomeEntered();

    if (reducedMotion) {
      onDismissed();
      return;
    }

    setExiting(true);
    window.setTimeout(() => {
      onDismissed();
    }, EXIT_MS);
  };

  return (
    <div
      className={cn(
        'sl-welcome-screen',
        exiting && 'is-exiting',
        reducedMotion && 'is-reduced-motion',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <span id={titleId} className="sr-only">
        StudioLayer AI — Editorial Fashion Reimagined. Enter Studio to begin.
      </span>

      <div className="sl-welcome-frame">
        <picture>
          {mobileSvg ? (
            <source
              media="(max-width: 767px)"
              type="image/svg+xml"
              srcSet={mobileSvg}
            />
          ) : null}
          {mobilePng ? (
            <source media="(max-width: 767px)" type="image/png" srcSet={mobilePng} />
          ) : null}
          <source type="image/svg+xml" srcSet={desktopSvg} />
          <img
            className="sl-welcome-artwork"
            src={desktopPng}
            alt=""
            width={1920}
            height={1200}
            decoding="async"
            draggable={false}
          />
        </picture>

        <button
          type="button"
          className="sl-welcome-enter"
          aria-label="Enter Studio"
          data-testid="welcome-enter-studio"
          onClick={handleEnter}
        >
          Enter Studio
        </button>
      </div>
    </div>
  );
}
