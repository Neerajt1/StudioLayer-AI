import { EditorialNav } from '@/components/layout/editorial-nav';
import { Footer } from '@/components/layout/footer';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  /** Full-bleed content below the contained header (e.g. Casting spreads) */
  breakout?: React.ReactNode;
  footer?: boolean;
  className?: string;
}

export function AppShell({
  children,
  breakout,
  footer = false,
  className,
}: AppShellProps) {
  return (
    <div className={cn('sl-app-frame min-h-screen bg-background', className)}>
      <div className="sl-app-page-main">
        <div className="sl-editorial-container">
          <div className="sl-monogram-slot" aria-hidden="true">
            <BrandLogo variant="nav" decorative />
          </div>

          <header className="sl-app-nav-region">
            <EditorialNav />
          </header>

          <main className="sl-page-content">
            {children}
          </main>
        </div>

        {breakout != null && (
          <div className="sl-editorial-breakout-region">{breakout}</div>
        )}
      </div>

      {footer && <Footer />}
    </div>
  );
}
