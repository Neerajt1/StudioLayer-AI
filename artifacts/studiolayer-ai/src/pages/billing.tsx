import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Footer } from '@/components/layout/footer';
import { useGetMe, useGetRenderUsage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';

export default function BillingPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage();
  const [showTopUp, setShowTopUp] = useState(false);

  const usedPct =
    usage?.limit != null ? Math.min((usage.used / usage.limit) * 100, 100) : 0;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1 p-8">
          {/* Header */}
          <div className="mb-8">
            <h2
              className="text-foreground mb-2"
              style={{
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: '28px',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              Subscription &amp; Billing
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Transparent pricing for professional fashion studios
            </p>
          </div>

          {/* Usage summary */}
          {!userLoading && !usageLoading && user && usage && (
            <div className="mb-10 p-5 border border-border rounded bg-card max-w-2xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Current Plan:{' '}
                    <span className="uppercase tracking-wider font-semibold">
                      {user.subscriptionTier}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {usage.limit === null
                      ? `${usage.used} renders used · Unlimited plan`
                      : `${usage.used} of ${usage.limit} renders used · resets monthly`}
                  </p>
                </div>
                {usage.limit !== null && usage.used >= usage.limit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTopUp(true)}
                    className="text-xs shrink-0"
                  >
                    Buy 100 Extra Renders — $25
                  </Button>
                )}
              </div>
              {usage.limit !== null && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all rounded-full"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Top-up exhausted notice */}
          {usage && usage.limit !== null && usage.used >= usage.limit && !showTopUp && (
            <div className="mb-6 p-4 border border-border rounded bg-card max-w-2xl">
              <p className="text-sm text-foreground font-medium mb-1">
                Monthly render allowance exhausted
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                You've used all {usage.limit} renders for this period. Purchase a top-up pack or upgrade your plan to continue.
              </p>
            </div>
          )}

          {/* Top-up modal */}
          {showTopUp && (
            <div className="mb-8 p-6 border border-foreground rounded bg-card max-w-2xl">
              <h4
                className="text-foreground mb-1"
                style={{ fontFamily: "'EB Garamond', Georgia, serif", fontSize: '20px', fontWeight: 600 }}
              >
                On-Demand Render Top-Up
              </h4>
              <p className="text-xs text-muted-foreground font-mono mb-4">
                One-time purchase · Credits active immediately · No subscription change
              </p>
              <div className="flex items-center justify-between p-4 border border-border rounded bg-background mb-4">
                <div>
                  <p className="text-sm font-medium text-foreground">+ 100 Priority Renders</p>
                  <p className="text-xs text-muted-foreground font-mono">Added to your current monthly balance</p>
                </div>
                <span className="text-xl font-bold text-foreground">$25</span>
              </div>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => setShowTopUp(false)}>
                  Purchase Top-Up
                </Button>
                <Button variant="outline" onClick={() => setShowTopUp(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Twin pricing cards — perfectly centred */}
          <div className="flex items-center justify-center min-h-[70vh]">
            <div className="flex flex-col lg:flex-row gap-8 w-full max-w-4xl">
              {/* Starter Studio Plan */}
              <div className="border border-border rounded-lg bg-card py-8 px-6 flex flex-col flex-1">
                <h3
                  className="text-foreground mb-1"
                  style={{
                    fontFamily: "'EB Garamond', Georgia, serif",
                    fontSize: '24px',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  Starter Studio Plan
                </h3>
                <div className="mb-6">
                  <span className="text-sm text-muted-foreground line-through font-mono mr-2">
                    $199 / mo
                  </span>
                  <span className="text-3xl font-bold text-foreground">$99</span>
                  <span className="text-sm text-muted-foreground font-mono ml-1">/ month</span>
                  <div className="mt-2">
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono border border-border">
                      LAUNCH OFFER
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  {[
                    '✔ 400 High-Res AI Studio Renders Per Month',
                    '✔ Single-Hanger Upload Interface',
                    '✔ Full Aspect, Demographics, & Expression Selectors',
                    '✔ Smart Ambient Studio Lighting Matcher',
                  ].map((f) => (
                    <li key={f} className="text-sm text-foreground leading-relaxed">
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={user?.subscriptionTier === 'pro' ? 'outline' : 'default'}
                  disabled={user?.subscriptionTier === 'pro'}
                  data-testid="button-upgrade-starter"
                >
                  {user?.subscriptionTier === 'pro' ? 'Current Plan' : 'Upgrade to Starter'}
                </Button>
              </div>

              {/* Enterprise Bulk Plan — sharp midnight-black focus border */}
              <div
                className="rounded-lg bg-card py-8 px-6 flex flex-col flex-1"
                style={{ border: '1px solid #09090B' }}
              >
                <h3
                  className="text-foreground mb-1"
                  style={{
                    fontFamily: "'EB Garamond', Georgia, serif",
                    fontSize: '24px',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  Enterprise Bulk Plan
                </h3>
                <div className="mb-6">
                  <span className="text-sm text-muted-foreground line-through font-mono mr-2">
                    $299 / mo
                  </span>
                  <span className="text-3xl font-bold text-foreground">$149</span>
                  <span className="text-sm text-muted-foreground font-mono ml-1">/ month</span>
                  <div className="mt-2">
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono border border-border">
                      LAUNCH OFFER
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  {[
                    '✔ 800 Priority Bulk Renders Per Month',
                    '✔ ⚡ Bulk Studio Mode (Upload up to 10 concurrent images)',
                    '✔ Parallel 2x5 Grid Rendering Queue',
                    '✔ Stored Asset Folder Management',
                  ].map((f) => (
                    <li key={f} className="text-sm text-foreground leading-relaxed">
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  disabled={user?.subscriptionTier === 'enterprise'}
                  data-testid="button-upgrade-enterprise"
                >
                  {user?.subscriptionTier === 'enterprise'
                    ? 'Current Plan'
                    : 'Upgrade to Enterprise'}
                </Button>
              </div>
            </div>
          </div>

          {/* Top-up nudge at bottom */}
          <div className="mt-8 p-5 border border-border rounded bg-card max-w-3xl mx-auto text-center">
            <p className="text-sm text-muted-foreground font-mono">
              Need extra capacity mid-month?{' '}
              <button
                onClick={() => setShowTopUp(true)}
                className="text-foreground underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                Buy 100 Extra Renders ($25)
              </button>{' '}
              · Contact{' '}
              <span className="text-foreground">sales@studiolayer.ai</span> for custom volume plans.
            </p>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
