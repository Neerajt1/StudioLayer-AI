import { formatCreditAmount } from '@workspace/studio-credit-engine';
import { cn } from '@/lib/utils';
import type { BillingCycleStats } from '@/lib/creative-ledger';
import { EMPTY_BILLING_CYCLE_STATS } from '@/lib/creative-ledger';
import { formatStudioCredits } from '@workspace/studio-credit-engine';
import { ImageIcon } from 'lucide-react';

const SL_TOKEN_ICON = '/icons/sl-token.svg';
const STUDIO_SPARK_ICON = '/icons/studio-spark.svg';

export interface BillingCycleSummaryProps {
  stats?: BillingCycleStats | null;
  className?: string;
  variant?: 'default' | 'dashboard';
}

/** Spendable balance only — do not pair with membership allowance (Top-Ups make X of Y misleading). */
function formatStudioCreditRemaining(remaining: number): string {
  const safeRemaining = Number.isFinite(remaining) ? remaining : 0;
  return formatStudioCredits(safeRemaining);
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
    editsMade,
    creditsRemaining,
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
            <dd className="sl-billing-cycle-stat-value">{formatCreditAmount(studioCreditsUsed)}</dd>
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
            <dt>Edits Made</dt>
            <dd className="sl-billing-cycle-stat-value">{editsMade}</dd>
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
              {formatStudioCreditRemaining(creditsRemaining)}
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
          <dd className="sl-billing-cycle-stat-value">{formatCreditAmount(studioCreditsUsed)}</dd>
        </div>
        <div className="sl-billing-cycle-stat">
          <dt>Images Created</dt>
          <dd className="sl-billing-cycle-stat-value">{imagesCreated}</dd>
        </div>
        <div className="sl-billing-cycle-stat">
          <dt>Edits Made</dt>
          <dd className="sl-billing-cycle-stat-value">{editsMade}</dd>
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
            <span>{formatStudioCreditRemaining(creditsRemaining)}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
