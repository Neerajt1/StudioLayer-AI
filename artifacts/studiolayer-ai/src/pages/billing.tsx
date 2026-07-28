import { Sidebar } from '@/components/layout/sidebar';
import { Footer } from '@/components/layout/footer';
import { useGetMe, useGetRenderUsage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';

export default function BillingPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1 p-8">
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
            <div className="mb-10 p-5 border border-border rounded bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Current Plan:{' '}
                    <span className="text-accent uppercase tracking-wider">
                      {user.subscriptionTier}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {usage.limit === null
                      ? `${usage.used} renders used today · Unlimited`
                      : `${usage.used} of ${usage.limit} renders used · resets daily`}
                  </p>
                </div>
              </div>
              {usage.limit !== null && (
                <div className="mt-3">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: `${Math.min((usage.used / usage.limit) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Two-tier pricing grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-3xl">
            {/* Starter */}
            <div className="border border-border rounded-lg bg-card p-7 relative flex flex-col">
              <h3
                className="text-foreground mb-1"
                style={{
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: '22px',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                Starter Studio Plan
              </h3>
              <div className="mb-5">
                <span className="text-sm text-muted-foreground line-through font-mono mr-2">
                  $199 / mo
                </span>
                <span className="text-2xl font-bold text-foreground">$99</span>
                <span className="text-sm text-muted-foreground font-mono ml-1">
                  / month
                </span>
                <div className="mt-1">
                  <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded font-mono">
                    LAUNCH OFFER
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 flex-1 mb-7">
                {[
                  '✔ 50 High-Res AI Studio Renders Per Day (Resets Daily)',
                  '✔ Single-Image Upload Interface Canvas',
                  '✔ Full Aspect Ratio Control (4:5, 9:16, 1:1, 16:9)',
                  '✔ Multi-Ethnic Model Customization Engine',
                  '✔ Standard Ambient Studio Lighting Matcher',
                ].map((f) => (
                  <li key={f} className="text-sm text-foreground flex items-start gap-2">
                    <span>{f}</span>
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

            {/* Enterprise */}
            <div
              className="rounded-lg bg-card p-7 relative flex flex-col"
              style={{
                border: '1px solid rgba(99, 179, 237, 0.5)',
                boxShadow: '0 0 20px rgba(99, 179, 237, 0.08)',
              }}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full font-mono">
                  MOST POWERFUL
                </span>
              </div>

              <h3
                className="text-foreground mb-1 mt-2"
                style={{
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: '22px',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                Enterprise Bulk Plan
              </h3>
              <div className="mb-5">
                <span className="text-sm text-muted-foreground line-through font-mono mr-2">
                  $299 / mo
                </span>
                <span className="text-2xl font-bold text-foreground">$149</span>
                <span className="text-sm text-muted-foreground font-mono ml-1">
                  / month
                </span>
                <div className="mt-1">
                  <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded font-mono">
                    LAUNCH OFFER
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 flex-1 mb-7">
                {[
                  '✔ 300 Priority Bulk Renders Per Day (Resets Daily)',
                  '✔ ⚡ Bulk Studio Mode (Upload up to 10 concurrent images)',
                  '✔ Priority Graphics Rendering Queue (Zero waiting lines)',
                  '✔ Full Aspect, Multi-Ethnic, and Watermark Toggle Controls',
                  '✔ Dedicated Asset Gallery Folder Management',
                ].map((f) => (
                  <li key={f} className="text-sm text-foreground flex items-start gap-2">
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={user?.subscriptionTier === 'enterprise'}
                data-testid="button-upgrade-enterprise"
              >
                {user?.subscriptionTier === 'enterprise'
                  ? 'Current Plan'
                  : 'Upgrade to Enterprise'}
              </Button>
            </div>
          </div>

          <div className="mt-10 p-5 border border-border rounded bg-card max-w-3xl">
            <p className="text-sm text-muted-foreground font-mono">
              Contact{' '}
              <span className="text-foreground">sales@studiolayer.ai</span> to
              discuss custom volume plans or annual billing discounts.
            </p>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
