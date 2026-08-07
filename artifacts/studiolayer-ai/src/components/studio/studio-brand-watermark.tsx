// ---------------------------------------------------------------------------
// Studio Workspace — Editorial brand watermark (Studio page only)
// Page-level background element — right-side placement, behind workspace content.
// Uses BrandLogo — single rendering path for the approved SL monogram.
// ---------------------------------------------------------------------------

import { BrandLogo } from '@/components/brand/BrandLogo';
import { cn } from '@/lib/utils';

export function StudioBrandWatermark() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-0 select-none',
        'hidden md:block',
      )}
    >
      <BrandLogo
        decorative
        className={cn(
          'absolute w-auto object-contain opacity-[0.055]',
          'h-[350px] md:h-[400px] lg:h-[465px] xl:h-[500px]',
          'top-[calc(50%+50px)] left-3/4 -translate-x-1/2 -translate-y-1/2',
        )}
      />
    </div>
  );
}
