// ---------------------------------------------------------------------------
// StudioLayer AI — Official Brand Logo (Production Asset v1.0)
// Single source of truth for the approved SL monogram.
// Assets: public/brand/logo.svg (canonical vector) · public/brand/logo.png (raster)
// Do not modify, upscale, or recolour.
// ---------------------------------------------------------------------------

import { cn } from '@/lib/utils';

const LOGO_PNG_SRC = '/brand/logo.png';
const LOGO_SVG_SRC = '/brand/logo.svg';
const LOGO_WIDTH = 759;
const LOGO_HEIGHT = 628;

export type BrandLogoVariant = 'auth' | 'nav' | 'footer';
export type BrandLogoFormat = 'png' | 'svg';

export interface BrandLogoProps {
  /** auth: 72–84px · nav: 32–36px · footer: 24–28px */
  variant?: BrandLogoVariant;
  /** svg: canonical vector · png: raster (favicons, legacy fallbacks) */
  format?: BrandLogoFormat;
  /** Decorative instances omit accessible name (e.g. navigation monogram). */
  decorative?: boolean;
  className?: string;
}

const VARIANT_HEIGHT: Record<BrandLogoVariant, string> = {
  auth: 'h-[4.75rem]',   /* 76px — within 72–84px auth range */
  nav: 'h-8',            /* 32px */
  footer: 'h-7',         /* 28px */
};

const LOGO_SRC: Record<BrandLogoFormat, string> = {
  png: LOGO_PNG_SRC,
  svg: LOGO_SVG_SRC,
};

export function BrandLogo({
  variant = 'nav',
  format = 'png',
  decorative = false,
  className,
}: BrandLogoProps) {
  return (
    <img
      src={LOGO_SRC[format]}
      alt={decorative ? '' : 'StudioLayer AI'}
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      className={cn('w-auto shrink-0 object-contain', VARIANT_HEIGHT[variant], className)}
      decoding="async"
      draggable={false}
    />
  );
}
