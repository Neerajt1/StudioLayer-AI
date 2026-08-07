import { useLayoutEffect, useRef, useState, type CSSProperties, type TransitionEvent } from 'react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion } from '@/lib/studio-intro';

const DEFAULT_DURATION_MS = 600;
const FIXED_SEGMENT_COUNT = 3;
export const STUDIO_CREDIT_MAX_SEGMENTS = ['M', 'A', 'X'] as const;

export interface StudioCreditFlipCounterProps {
  /** Confirmed server balance to display (numeric mode) */
  value?: number;
  /** Fixed three-character display (e.g. MAX for unlimited accounts) */
  segments?: readonly [string, string, string];
  /** Prior confirmed balance — when omitted, tracked internally (numeric mode) */
  previousValue?: number;
  /** Prior segments — when omitted, tracked internally (segment mode) */
  previousSegments?: readonly [string, string, string];
  /** Flip animation duration in ms (default 600) */
  duration?: number;
  className?: string;
  /** Accessible label override */
  ariaLabel?: string;
}

function padSegments(
  segments: string[],
  length: number,
): string[] {
  if (segments.length >= length) return segments.slice(0, length);
  return Array.from({ length: length - segments.length }, () => '0').concat(segments);
}

function clampDisplayValue(n: number): number {
  return Math.min(999, Math.max(0, Math.floor(n)));
}

function toNumericSegments(n: number): string[] {
  return String(clampDisplayValue(n))
    .padStart(FIXED_SEGMENT_COUNT, '0')
    .split('');
}

interface FlipCharacterCellProps {
  character: string;
  fromCharacter: string;
  animate: boolean;
  duration: number;
}

function FlipCharacterFace({
  character,
  half,
}: {
  character: string;
  half: 'top' | 'bottom';
}) {
  return (
    <span
      className={cn(
        'sl-flip-digit__half',
        half === 'top' ? 'sl-flip-digit__half--top' : 'sl-flip-digit__half--bottom',
      )}
    >
      <span className="sl-flip-digit__char" aria-hidden="true">
        {character}
      </span>
    </span>
  );
}

function FlipCharacterCell({
  character,
  fromCharacter,
  animate,
  duration,
}: FlipCharacterCellProps) {
  const [displayCharacter, setDisplayCharacter] = useState(character);
  const [flipFrom, setFlipFrom] = useState(fromCharacter);
  const [flipTo, setFlipTo] = useState(character);
  const [isAnimating, setIsAnimating] = useState(false);

  useLayoutEffect(() => {
    if (!animate || fromCharacter === character) {
      setDisplayCharacter(character);
      setIsAnimating(false);
      return;
    }

    setFlipFrom(fromCharacter);
    setFlipTo(character);
    setIsAnimating(false);

    const frame = requestAnimationFrame(() => {
      setIsAnimating(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [animate, character, fromCharacter]);

  const handleTransitionEnd = (event: TransitionEvent<HTMLSpanElement>) => {
    if (event.propertyName !== 'transform') return;
    setDisplayCharacter(character);
    setIsAnimating(false);
  };

  if (!isAnimating) {
    return (
      <span className="sl-flip-digit" aria-hidden="true">
        <FlipCharacterFace character={displayCharacter} half="top" />
        <FlipCharacterFace character={displayCharacter} half="bottom" />
      </span>
    );
  }

  return (
    <span
      className="sl-flip-digit sl-flip-digit--flipping"
      style={{ '--sl-flip-duration': `${duration}ms` } as CSSProperties}
      aria-hidden="true"
    >
      <FlipCharacterFace character={flipFrom} half="top" />
      <FlipCharacterFace character={flipTo} half="bottom" />
      <span className="sl-flip-digit__flap" onTransitionEnd={handleTransitionEnd}>
        <span className="sl-flip-digit__flap-face sl-flip-digit__flap-face--front">
          <FlipCharacterFace character={flipFrom} half="top" />
        </span>
        <span className="sl-flip-digit__flap-face sl-flip-digit__flap-face--back">
          <FlipCharacterFace character={flipTo} half="top" />
        </span>
      </span>
    </span>
  );
}

/**
 * Split-flap Studio Credit counter — mechanical hinge flip per character.
 * Animates only when display changes after initial mount.
 */
export function StudioCreditFlipCounter({
  value = 0,
  segments,
  previousValue,
  previousSegments,
  duration = DEFAULT_DURATION_MS,
  className,
  ariaLabel,
}: StudioCreditFlipCounterProps) {
  const mountedRef = useRef(false);
  const prevValueRef = useRef(value);
  const prevSegmentsRef = useRef<readonly [string, string, string]>(
    segments ?? (toNumericSegments(value) as [string, string, string]),
  );
  const reducedMotion = prefersReducedMotion();

  const currentSegments = segments
    ? padSegments([...segments], FIXED_SEGMENT_COUNT)
    : toNumericSegments(value);

  const fromValue = previousValue ?? prevValueRef.current;
  const previousSegmentList = segments
    ? padSegments(
        [...(previousSegments ?? prevSegmentsRef.current)],
        FIXED_SEGMENT_COUNT,
      )
    : toNumericSegments(fromValue);

  const shouldAnimate =
    mountedRef.current &&
    !reducedMotion &&
    currentSegments.some((char, index) => char !== previousSegmentList[index]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    prevValueRef.current = value;
    if (segments) {
      prevSegmentsRef.current = segments;
    } else {
      prevSegmentsRef.current = toNumericSegments(value) as [string, string, string];
    }
  }, [value, segments]);

  const resolvedAriaLabel =
    ariaLabel ??
    (segments
      ? 'Unlimited Studio Credits'
      : `${value} Studio Credits`);

  return (
    <span
      className={cn('sl-flip-counter', className)}
      aria-live="polite"
      aria-atomic="true"
      aria-label={resolvedAriaLabel}
    >
      <span className="sl-flip-counter__digits" aria-hidden="true">
        {currentSegments.map((character, index) => (
          <FlipCharacterCell
            key={index}
            character={character}
            fromCharacter={previousSegmentList[index] ?? '0'}
            animate={
              shouldAnimate && previousSegmentList[index] !== character
            }
            duration={duration}
          />
        ))}
      </span>
    </span>
  );
}
