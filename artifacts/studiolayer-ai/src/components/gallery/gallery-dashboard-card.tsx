import { Info } from 'lucide-react';
import type { RenderUsage } from '@workspace/api-client-react';
import { BillingCycleSummary } from '@/components/gallery/billing-cycle-summary';
import {
  EMPTY_BILLING_CYCLE_STATS,
  mergeBillingCycleStats,
  type BillingCycleStats,
} from '@/lib/creative-ledger';
import { membershipAllowanceForTier, membershipCreditsRemaining } from '@/lib/membership';

interface GalleryDashboardCardProps {
  usage?: RenderUsage | null;
}

function resolveGalleryBillingStats(usage?: RenderUsage | null): BillingCycleStats {
  try {
    if (usage == null) return EMPTY_BILLING_CYCLE_STATS;

    const allowance = membershipAllowanceForTier(usage.tier, usage.limit);
    const remaining =
      usage.remaining ??
      membershipCreditsRemaining(usage.tier, usage.used, usage.limit);

    return mergeBillingCycleStats(usage.cycleStats, remaining, allowance);
  } catch {
    return EMPTY_BILLING_CYCLE_STATS;
  }
}

export function GalleryDashboardCard({ usage }: GalleryDashboardCardProps) {
  const stats = resolveGalleryBillingStats(usage);

  return (
    <section className="sl-gallery-dashboard-card" aria-label="Gallery dashboard">
      <div className="sl-gallery-dashboard-card-billing">
        <BillingCycleSummary stats={stats} variant="dashboard" />
      </div>

      <div className="sl-gallery-dashboard-card-divider" aria-hidden />

      <div className="sl-gallery-dashboard-card-info">
        <h2 className="sl-billing-cycle-heading sl-gallery-dashboard-card-info-heading">
          Gallery Information
        </h2>
        <div className="sl-gallery-dashboard-info">
          <div className="sl-gallery-dashboard-info-item">
            <Info aria-hidden className="sl-gallery-dashboard-info-icon" />
            <p>
              Images remain available throughout your billing cycle plus a 7-day grace
              period before automatic removal.
            </p>
          </div>
          <div className="sl-gallery-dashboard-info-item">
            <Info aria-hidden className="sl-gallery-dashboard-info-icon" />
            <p>
              Every image permanently records Studio Credit usage and refinement history.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
