import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RenderUsage } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import { membershipCreditsRemaining } from '@/lib/membership';
import { prefersReducedMotion } from '@/lib/studio-intro';
import {
  StudioCreditFlipCounter,
  STUDIO_CREDIT_MAX_SEGMENTS,
  type StudioCreditFlipCounterProps,
} from '@/components/studio/studio-credit-flip-counter';

/** Matches split-flap flip duration — keep in sync with StudioCreditFlipCounter. */
const FLIP_DURATION_MS = 600;

/** @deprecated Use StudioCreditFlipCounterProps */
export type StudioCreditCounterProps = StudioCreditFlipCounterProps;

/** @deprecated Use StudioCreditFlipCounter */
export const StudioCreditCounter = StudioCreditFlipCounter;

export { StudioCreditFlipCounter, type StudioCreditFlipCounterProps };

function clampDisplayValue(n: number): number {
  return Math.min(999, Math.max(0, Math.floor(n)));
}

/**
 * Steps the displayed balance one credit at a time toward the target so the
 * split-flap counter receives the same single-step updates as server refetches.
 */
function useAnimatedStudioCreditBalance(
  target: number,
  enabled: boolean,
): number {
  const clampedTarget = clampDisplayValue(target);
  const [displayed, setDisplayed] = useState(clampedTarget);
  const displayedRef = useRef(clampedTarget);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!enabled) {
      clearTimer();
      mountedRef.current = false;
      setDisplayed(clampedTarget);
      displayedRef.current = clampedTarget;
      return clearTimer;
    }

    if (prefersReducedMotion()) {
      clearTimer();
      setDisplayed(clampedTarget);
      displayedRef.current = clampedTarget;
      mountedRef.current = true;
      return clearTimer;
    }

    if (!mountedRef.current) {
      mountedRef.current = true;
      setDisplayed(clampedTarget);
      displayedRef.current = clampedTarget;
      return clearTimer;
    }

    if (displayedRef.current === clampedTarget) {
      return clearTimer;
    }

    clearTimer();

    let cancelled = false;

    const scheduleStep = (immediate: boolean) => {
      if (cancelled) return;

      timerRef.current = setTimeout(() => {
        if (cancelled) return;

        const current = displayedRef.current;
        if (current === clampedTarget) return;

        const next = current < clampedTarget ? current + 1 : current - 1;
        displayedRef.current = next;
        setDisplayed(next);

        if (next !== clampedTarget) {
          scheduleStep(false);
        }
      }, immediate ? 0 : FLIP_DURATION_MS);
    };

    scheduleStep(true);

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [clampedTarget, enabled]);

  return enabled ? displayed : clampedTarget;
}

export interface StudioCreditBalanceDisplayProps {
  usage?: RenderUsage | null;
  isLoading?: boolean;
  isUnlimited?: boolean;
  /** Optional display override (development simulator only) */
  displayValue?: number;
  devPanel?: ReactNode;
  className?: string;
}

function resolveRemainingCredits(usage?: RenderUsage | null): number {
  if (usage == null) return 0;
  return (
    usage.remaining ??
    membershipCreditsRemaining(usage.tier, usage.used, usage.limit)
  );
}

/** Workspace floating instrument — confirmed balance with live split-flap animation. */
export function StudioCreditBalanceDisplay({
  usage,
  isLoading = false,
  isUnlimited = false,
  displayValue,
  devPanel,
  className,
}: StudioCreditBalanceDisplayProps) {
  const serverRemaining = resolveRemainingCredits(usage);
  const targetRemaining =
    displayValue != null ? displayValue : serverRemaining;
  const showMaxDisplay = isUnlimited && displayValue == null;
  const animatedRemaining = useAnimatedStudioCreditBalance(
    targetRemaining,
    !isLoading && !showMaxDisplay,
  );

  return (
    <section
      className={cn('sl-studio-credit-instrument', className)}
      aria-label="Studio Credit balance"
    >
      <p className="sl-studio-credit-instrument-label">Studio Credits</p>
      {isLoading ? (
        <div
          className="sl-studio-credit-instrument-display sl-studio-credit-instrument-display--loading"
          aria-busy="true"
          aria-label="Loading Studio Credit balance"
        >
          <StudioCreditFlipCounter
            value={0}
            className="sl-studio-credit-instrument-counter"
          />
        </div>
      ) : (
        <div className="sl-studio-credit-instrument-display">
          {showMaxDisplay ? (
            <StudioCreditFlipCounter
              segments={STUDIO_CREDIT_MAX_SEGMENTS}
              className="sl-studio-credit-instrument-counter"
            />
          ) : (
            <StudioCreditFlipCounter
              value={animatedRemaining}
              className="sl-studio-credit-instrument-counter"
            />
          )}
        </div>
      )}
      {devPanel}
    </section>
  );
}
