import { cn } from '@/lib/utils';
import type { BillingCycleStats } from '@/lib/creative-ledger';
import { EMPTY_BILLING_CYCLE_STATS } from '@/lib/creative-ledger';
import { ImageIcon } from 'lucide-react';

const SL_TOKEN_ICON = '/icons/sl-token.svg';
const STUDIO_SPARK_ICON = '/icons/studio-spark.svg';

export interface BillingCycleSummaryProps {
  stats?: BillingCycleStats | null;
  className?: string;
  variant?: 'default' | 'dashboard';
}

function formatAverage(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatStudioCreditRemaining(remaining: number, allowance: number): string {
  const safeRemaining = Number.isFinite(remaining) ? remaining : 0;
  const safeAllowance = Number.isFinite(allowance) ? allowance : 0;
  return `${safeRemaining} of ${safeAllowance}`;
}

function resolveStats(stats?: BillingCycleStats | null): BillingCycleStats {
  if (stats == null) return EMPTY_BILLING_CYCLE_STATS;
  return stats;
}

/**
 * Reusable billing-cycle dashboard widget.
 * Future: credit history, usage trends, top-ups, billing history.
 */
export function BillingCycleSummary({
  stats,
  className,
  variant = 'default',
}: BillingCycleSummaryProps) {
  const {
    studioCreditsUsed,
    imagesCreated,
    averageRefinementsPerImage,
    creditsRemaining,
    studioCreditAllowance,
  } = resolveStats(stats);

  if (variant === 'dashboard') {
    return (
      <section
        className={cn('sl-billing-cycle-summary sl-billing-cycle-summary--dashboard', className)}
        aria-label="This billing cycle"
      >
        <h2 className="sl-billing-cycle-heading">This Billing Cycle</h2>
        <dl className="sl-billing-cycle-stats">
          <div className="sl-billing-cycle-stat">
            <img
              src={SL_TOKEN_ICON}
              alt=""
              aria-hidden
              className="sl-billing-cycle-stat-icon sl-billing-cycle-stat-icon--studio-credit"
            />
            <dt>Studio Credits Used</dt>
            <dd className="sl-billing-cycle-stat-value">{studioCreditsUsed}</dd>
          </div>
          <div className="sl-billing-cycle-stat">
            <ImageIcon
              aria-hidden
              className="sl-billing-cycle-stat-icon sl-billing-cycle-stat-icon--lucide"
            />
            <dt>Images Created</dt>
            <dd className="sl-billing-cycle-stat-value">{imagesCreated}</dd>
          </div>
          <div className="sl-billing-cycle-stat">
            <img
              src={STUDIO_SPARK_ICON}
              alt=""
              aria-hidden
              className="sl-billing-cycle-stat-icon"
            />
            <dt>Avg. Refinements / Image</dt>
            <dd className="sl-billing-cycle-stat-value">
              {formatAverage(averageRefinementsPerImage)}
            </dd>
          </div>
          <div className="sl-billing-cycle-stat">
            <img
              src={SL_TOKEN_ICON}
              alt=""
              aria-hidden
              className="sl-billing-cycle-stat-icon sl-billing-cycle-stat-icon--studio-credit"
            />
            <dt>Studio Credit Remaining</dt>
            <dd className="sl-billing-cycle-stat-value">
              {formatStudioCreditRemaining(creditsRemaining, studioCreditAllowance)}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className={cn('sl-billing-cycle-summary', className)} aria-label="This billing cycle">
      <h2 className="sl-billing-cycle-heading">This Billing Cycle</h2>
      <dl className="sl-billing-cycle-stats">
        <div className="sl-billing-cycle-stat">
          <dt>Studio Credits Used</dt>
          <dd className="sl-billing-cycle-stat-value">{studioCreditsUsed}</dd>
        </div>
        <div className="sl-billing-cycle-stat">
          <dt>Images Created</dt>
          <dd className="sl-billing-cycle-stat-value">{imagesCreated}</dd>
        </div>
        <div className="sl-billing-cycle-stat">
          <dt>Avg. Refinements / Image</dt>
          <dd className="sl-billing-cycle-stat-value">
            {formatAverage(averageRefinementsPerImage)}
          </dd>
        </div>
        <div className="sl-billing-cycle-stat">
          <dt>Studio Credit Remaining</dt>
          <dd className="sl-billing-cycle-stat-value sl-billing-cycle-stat-value--with-icon">
            <img
              src={SL_TOKEN_ICON}
              alt=""
              aria-hidden
              className="sl-billing-cycle-stat-icon sl-billing-cycle-stat-icon--studio-credit"
            />
            <span>{formatStudioCreditRemaining(creditsRemaining, studioCreditAllowance)}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
