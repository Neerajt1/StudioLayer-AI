// ---------------------------------------------------------------------------
// StudioLayer AI — Talent Collection (Editorial Sprint 1)
//
// Independent horizontal row. The next talent appears as an invitation —
// the collection continues without feeling cut off or incomplete.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelIdentity, TalentCollectionConfig } from './types';
import { isProductionModel } from './types';
import { TalentCard } from './talent-card';

interface TalentCollectionProps {
  config: TalentCollectionConfig;
  identities: ModelIdentity[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

function useScrollOverflow(ref: React.RefObject<HTMLDivElement | null>) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    setHasOverflow(overflow);
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    update();
    el.addEventListener('scroll', update, { passive: true });

    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref, update]);

  return { canScrollLeft, canScrollRight, hasOverflow };
}

export function TalentCollection({
  config,
  identities,
  selectedId,
  onSelect,
  disabled,
}: TalentCollectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight, hasOverflow } = useScrollOverflow(scrollRef);

  const models = useMemo(
    () =>
      identities.filter(
        (m) =>
          (m as ModelIdentity & { gender?: string }).gender === config.key
          && isProductionModel(m.id),
      ),
    [identities, config.key],
  );

  const scrollBy = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * 0.7);
    el.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-foreground">{config.title}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          {config.subtitle}
        </p>
      </div>

      {models.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-muted-foreground font-mono">Loading Studio Talent…</p>
        </div>
      ) : (
        <div className="group/collection relative">
          <button
            type="button"
            aria-label={`Scroll ${config.title} left`}
            onClick={() => scrollBy('left')}
            disabled={disabled || !canScrollLeft}
            className={cn(
              'absolute -left-1 top-[42%] z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center',
              'text-foreground/50 transition-opacity duration-200 ease-out motion-reduce:transition-none',
              'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              canScrollLeft && hasOverflow ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            aria-label={`Scroll ${config.title} right`}
            onClick={() => scrollBy('right')}
            disabled={disabled || !canScrollRight}
            className={cn(
              'absolute -right-1 top-[42%] z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center',
              'text-foreground/50 transition-opacity duration-200 ease-out motion-reduce:transition-none',
              'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              canScrollRight && hasOverflow ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>

          {/*
            Slot width (min(42%, 10.5rem)) + gap-10: ~2 talents fully visible,
            the next appears as an invitation — not an awkward mid-body cutoff.
          */}
          <div
            ref={scrollRef}
            className={cn(
              'sl-talent-collection-scroll flex gap-10 overflow-x-auto scroll-smooth py-2',
              '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {models.map((model) => (
              <TalentCard
                key={model.id}
                model={model}
                isSelected={selectedId === model.id}
                disabled={disabled}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
