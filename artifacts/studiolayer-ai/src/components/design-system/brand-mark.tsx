// ---------------------------------------------------------------------------
// StudioLayer AI — Brand Mark (Freeze v1)
// Approved monogram + primary and secondary taglines.
// ---------------------------------------------------------------------------

import { BrandLogo } from '@/components/brand/BrandLogo';
import { cn } from '@/lib/utils';
import {
  BRAND_TAGLINE_PRIMARY,
  BRAND_TAGLINE_SECONDARY,
} from './brand-tokens';

export interface BrandMarkProps {
  /** compact = nav · default = auth · editorial = auth */
  size?: 'default' | 'compact' | 'editorial';
  align?: 'left' | 'center';
  className?: string;
}

const SIZE_CLASSES = {
  compact: {
    logo: 'nav' as const,
    taglines: 'mt-0.5 space-y-0',
    primary: 'text-[0.8125rem]',
    secondary: 'text-[0.6875rem]',
  },
  default: {
    logo: 'auth' as const,
    taglines: 'mt-0.5 space-y-0',
    primary: 'text-[0.9375rem]',
    secondary: 'text-[0.8125rem]',
  },
  editorial: {
    logo: 'auth' as const,
    taglines: 'mt-1 space-y-0',
    primary: 'text-[1.375rem]',
    secondary: 'text-[1.1875rem]',
  },
} as const;

export function BrandMark({
  size = 'default',
  align = 'left',
  className,
}: BrandMarkProps) {
  const styles = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        align === 'center' && 'text-center',
        className,
      )}
    >
      <BrandLogo variant={styles.logo} />
      <div className={styles.taglines}>
        <p className={cn('sl-tagline-primary', styles.primary)}>
          {BRAND_TAGLINE_PRIMARY}
        </p>
        <p className={cn('sl-tagline-secondary', styles.secondary)}>
          {BRAND_TAGLINE_SECONDARY}
        </p>
      </div>
    </div>
  );
}
