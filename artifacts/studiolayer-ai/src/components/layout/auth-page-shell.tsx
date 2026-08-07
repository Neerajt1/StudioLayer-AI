// ---------------------------------------------------------------------------
// Auth Page Shell — editorial composition for login / register
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AuthBrandMark } from '@/components/auth/auth-editorial';
import { BrandIntro, BRAND_INTRO_CROSSFADE_MS } from '@/components/brand/BrandIntro';
import { StudioContactFooterLink } from '@/components/layout/studio-contact-footer-link';
import {
  isStudioIntroRoute,
  markStudioIntroComplete,
  markStudioIntroStarted,
  prefersReducedMotion,
  shouldPlayStudioIntro,
} from '@/lib/studio-intro';
import { cn } from '@/lib/utils';

interface AuthPageShellProps {
  children: React.ReactNode;
}

export function AuthPageShell({ children }: AuthPageShellProps) {
  const [location] = useLocation();
  const introEligible = isStudioIntroRoute(location);
  const [introActive, setIntroActive] = useState(
    () => introEligible && shouldPlayStudioIntro(),
  );
  const [authRevealed, setAuthRevealed] = useState(() => !introActive);

  useEffect(() => {
    if (introActive) {
      markStudioIntroStarted();
    }
  }, [introActive]);

  useEffect(() => {
    if (!introEligible || !prefersReducedMotion()) {
      return;
    }

    markStudioIntroComplete();
    setIntroActive(false);
    setAuthRevealed(true);
  }, [introEligible]);

  const handleCrossfadeStart = useCallback(() => {
    setAuthRevealed(true);
  }, []);

  const handleIntroComplete = useCallback(() => {
    markStudioIntroComplete();
    setIntroActive(false);
  }, []);

  return (
    <div className="sl-auth-shell relative min-h-screen w-full bg-background">
      {introActive && (
        <BrandIntro
          onCrossfadeStart={handleCrossfadeStart}
          onComplete={handleIntroComplete}
        />
      )}

      <div
        className={cn(
          'transition-opacity ease-out',
          authRevealed ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{
          transitionDuration: introActive ? `${BRAND_INTRO_CROSSFADE_MS}ms` : undefined,
        }}
        aria-hidden={!authRevealed}
      >
        <div className="absolute left-0 top-0 z-10 pt-12 pl-10 sm:pt-14 sm:pl-12 lg:pt-16 lg:pl-20 xl:pt-20 xl:pl-24">
          <AuthBrandMark />
        </div>

        <div className="flex min-h-screen w-full flex-col items-center justify-center p-4 pb-16 lg:-translate-x-6 xl:-translate-x-8">
          <div className="flex w-full flex-1 items-center justify-center">{children}</div>
          <StudioContactFooterLink className="mt-8 shrink-0" />
        </div>
      </div>
    </div>
  );
}
