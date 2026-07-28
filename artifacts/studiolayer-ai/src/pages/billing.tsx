import { Sidebar } from '@/components/layout/sidebar';
import { useGetMe, useGetRenderUsage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const tiers = [
  {
    name: 'Free',
    tier: 'free',
    price: '$0',
    renderLimit: 3,
    features: [
      '3 renders per month',
      'Standard quality output',
      'Basic model personas',
      'Community support',
    ],
  },
  {
    name: 'Pro',
    tier: 'pro',
    price: '$49',
    renderLimit: 100,
    features: [
      '100 renders per month',
      'High-resolution output',
      'All model personas',
      'All location environments',
      'Priority processing',
      'Email support',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    price: '$249',
    renderLimit: null,
    features: [
      'Unlimited renders',
      'Ultra high-res output (8K)',
      'Custom model training',
      'Batch processing',
      'API access',
      'Dedicated account manager',
      '24/7 priority support',
    ],
  },
];

export default function BillingPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Subscription & Billing
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Manage your plan and usage
            </p>
          </div>

          {!userLoading && !usageLoading && user && usage && (
            <div className="mb-8 p-6 border border-border rounded bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    Current Plan: {user.subscriptionTier.toUpperCase()}
                  </h3>
                  <p className="text-sm text-muted-foreground font-mono">
                    {usage.limit === null
                      ? `${usage.used} renders used this month • Unlimited`
                      : `${usage.used} of ${usage.limit} renders used this month`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-foreground">
                    {tiers.find((t) => t.tier === user.subscriptionTier)?.price || '$0'}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    per month
                  </div>
                </div>
              </div>

              {usage.limit !== null && (
                <div className="mt-4">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {tiers.map((tier) => {
              const isCurrent = user?.subscriptionTier === tier.tier;

              return (
                <div
                  key={tier.tier}
                  className={cn(
                    'border rounded bg-card p-6 relative',
                    tier.popular && 'border-accent',
                    isCurrent && 'ring-2 ring-accent'
                  )}
                  data-testid={`card-tier-${tier.tier}`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <div className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full font-mono">
                        POPULAR
                      </div>
                    </div>
                  )}

                  {isCurrent && (
                    <div className="absolute -top-3 right-4">
                      <div className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full font-mono">
                        CURRENT
                      </div>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      {tier.name}
                    </h3>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-3xl font-bold text-foreground">
                        {tier.price}
                      </span>
                      <span className="text-sm text-muted-foreground font-mono">
                        /month
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {tier.renderLimit === null
                        ? 'Unlimited renders'
                        : `${tier.renderLimit} renders/month`}
                    </p>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {tier.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    variant={tier.popular ? 'default' : 'outline'}
                    disabled={isCurrent}
                    data-testid={`button-upgrade-${tier.tier}`}
                  >
                    {isCurrent ? 'Current Plan' : `Upgrade to ${tier.name}`}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="mt-8 p-6 border border-border rounded bg-card">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Billing Information
            </h3>
            <p className="text-sm text-muted-foreground font-mono mb-4">
              Contact sales@studiolayer.ai to update your subscription or discuss custom plans.
            </p>
            <div className="flex gap-4">
              <Button variant="outline" data-testid="button-contact-sales">
                Contact Sales
              </Button>
              <Button variant="outline" data-testid="button-manage-payment">
                Manage Payment Method
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
