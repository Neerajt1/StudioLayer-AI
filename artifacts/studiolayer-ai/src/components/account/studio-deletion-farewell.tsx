// ---------------------------------------------------------------------------
// Studio Deletion — farewell screen after successful account removal
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const FADE_MS = 275;
const HOLD_MS = 900;

interface StudioDeletionFarewellProps {
  onComplete: () => void;
}

export function StudioDeletionFarewell({ onComplete }: StudioDeletionFarewellProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timers: number[] = [];

    const raf = requestAnimationFrame(() => {
      setVisible(true);
    });

    timers.push(
      window.setTimeout(() => {
        setVisible(false);
      }, FADE_MS + HOLD_MS),
    );

    timers.push(
      window.setTimeout(() => {
        onComplete();
      }, FADE_MS + HOLD_MS + FADE_MS),
    );

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white px-6"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={cn('max-w-md text-center transition-opacity ease-out')}
        style={{
          opacity: visible ? 1 : 0,
          transitionDuration: `${FADE_MS}ms`,
        }}
      >
        <p className="sl-brand-name text-[1.25rem] text-foreground">
          Your Studio has been permanently deleted.
        </p>
        <p className="sl-tagline-primary mt-3 text-[1rem] leading-[1.35] text-muted-foreground">
          Thank you for being part of StudioLayer AI.
        </p>
      </div>
    </div>
  );
}
