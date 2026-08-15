import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import {
  getGetMeQueryKey,
  getGetRenderUsageQueryKey,
  useCreateMembershipSubscription,
  useGetMe,
  useGetRenderUsage,
  type CreateMembershipSubscriptionInputPlan,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { openRazorpaySubscriptionCheckout } from '@/lib/razorpay-checkout';
import {
  MembershipCreditAllowances,
  MembershipDisplayPricing,
  compactFinishedImagesLabel,
  creativeStepCreditCopy,
  finishedImagesOutcomeLabel,
  formatStudioCredits,
  membershipPlanDisplayPrice,
  type MembershipPricingMarket,
} from '@workspace/studio-credit-engine';
import {
  membershipAllowanceLabel,
  membershipCreditsRemaining,
  membershipLabel,
} from '@/lib/membership';
import { fetchPricingMarket, CLIENT_TIMEZONE_HEADER } from '@/lib/fetch-pricing-market';
import { browserTimeZone } from '@/lib/pricing-market';

const INTRO_SUPPORTING =
  'Choose the Studio membership that best supports your creative workflow.';

const INTRO_TAGLINE =
  "Every render is fully traceable in your Creative Ledger. Whether you're exploring your first editorial render or producing campaigns at scale, every membership is designed to deliver the same commitment to quality, consistency, and craftsmanship.";

const MEMBERSHIP_TIERS = [
  {
    id: 'pro',
    plan: 'basic' as const satisfies CreateMembershipSubscriptionInputPlan,
    name: 'Studio Basic',
    subtitle: 'For growing fashion brands',
    credits: formatStudioCredits(MembershipCreditAllowances.basic),
    outcome: finishedImagesOutcomeLabel(MembershipCreditAllowances.basic),
    features: [
      'Hero',
      'Campaign',
      'Editorial',
      'Studio Gallery',
      'Studio Talent',
      'Priority Rendering',
    ],
    chooseLabel: 'Choose Studio Basic',
    testId: 'button-choose-basic',
    recommended: false,
  },
  {
    id: 'enterprise',
    plan: 'pro' as const satisfies CreateMembershipSubscriptionInputPlan,
    name: 'Studio Pro',
    subtitle: 'For creative teams & agencies',
    credits: formatStudioCredits(MembershipCreditAllowances.pro),
    outcome: finishedImagesOutcomeLabel(MembershipCreditAllowances.pro),
    features: [
      'Hero',
      'Campaign',
      'Editorial',
      'Studio Gallery',
      'Studio Talent',
      'Faster Priority Rendering',
    ],
    chooseLabel: 'Choose Studio Pro',
    testId: 'button-choose-pro',
    recommended: true,
  },
] as const;

const MEMBERSHIP_FAQ = [
  {
    q: 'What are Studio Credits?',
    a: 'Studio Credits are your allowance for creating finished fashion imagery. Every creative step — generating or refining an image — uses one Studio Credit. Paid memberships include a monthly balance that resets at the start of each billing period.',
  },
  {
    q: 'Can I see where I spend my Studio Credits?',
    a: 'Yes. Every image in your Studio Gallery — your Creative Ledger — records exactly how many Studio Credits were used and how many refinements produced the final result. Membership summarizes your allowance; Gallery explains every render.',
  },
  {
    q: 'When do Studio Credits reset?',
    a: 'Complimentary Studio includes one one-time Studio Credit. Studio Basic and Studio Pro renew monthly. Studio Pass credits are valid for seven days. Your balance is always visible in your Studio Profile and on this page.',
  },
];

function isActiveTier(tier: string, cardId: string): boolean {
  return tier === cardId;
}

function membershipCheckoutErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const bodyError = (data as { error: unknown }).error;
      if (typeof bodyError === 'string' && bodyError.trim()) {
        return bodyError.trim();
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    const match = error.message.match(/^HTTP \d+ [^:]+:\s*(.+)$/);
    if (match?.[1]) return match[1].trim();
    return error.message.trim();
  }

  return 'Unable to start membership checkout. Please try again.';
}

interface MembershipCardProps {
  tier: (typeof MEMBERSHIP_TIERS)[number];
  price: string;
  active: boolean;
  checkoutBusy: boolean;
  choosingThisPlan: boolean;
  onChoose: (tier: (typeof MEMBERSHIP_TIERS)[number]) => void;
}

function MembershipCard({
  tier,
  price,
  active,
  checkoutBusy,
  choosingThisPlan,
  onChoose,
}: MembershipCardProps) {
  return (
    <div
      className={cn(
        'sl-membership-tier-card',
        tier.recommended && 'sl-membership-tier-card--recommended',
      )}
    >
      {tier.recommended && (
        <p className="sl-membership-tier-badge">Recommended</p>
      )}
      <div className="sl-membership-tier-card-body">
        <h3 className="sl-membership-tier-title">{tier.name}</h3>
        <p className="sl-membership-tier-subtitle">{tier.subtitle}</p>
        <div className="sl-membership-tier-pricing">
          <p className="sl-membership-tier-price">
            {price}
            <span>/ month</span>
          </p>
          <p className="sl-membership-tier-credits">{tier.credits}</p>
          <p className="sl-membership-tier-outcome">{tier.outcome}</p>
        </div>
        <ul className="sl-membership-tier-features">
          {tier.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
      <div className="sl-membership-tier-cta-wrap">
        {active ? (
          <Button
            className="w-full"
            variant="outline"
            disabled
            data-testid={tier.testId}
          >
            Current Membership
          </Button>
        ) : (
          <>
            <Button
              className="w-full"
              variant={tier.recommended ? 'default' : 'outline'}
              disabled={checkoutBusy}
              onClick={() => onChoose(tier)}
              data-testid={tier.testId}
            >
              {choosingThisPlan ? 'Opening checkout…' : tier.chooseLabel}
            </Button>
            <p className="mt-2 text-center text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground">
              Auto-renews until cancelled
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function CurrentMembershipSummary({
  tier,
  usage,
}: {
  tier: string;
  usage: { used: number; limit: number | null };
}) {
  const isFree = tier === 'free';
  const remaining = membershipCreditsRemaining(tier, usage.used, usage.limit);

  return (
    <div className="sl-membership-current-summary">
      <p className="sl-membership-info-label">Current Membership</p>
      <p className="sl-membership-info-name">{membershipLabel(tier)}</p>

      {isFree ? (
        <>
          <p className="sl-membership-info-meta">One-Time Studio Credit</p>
          <p className="sl-membership-info-usage">
            {usage.used} of {MembershipCreditAllowances.complimentary} used
          </p>
          <p className="sl-membership-info-footnote">Never resets.</p>
        </>
      ) : (
        <>
          <p className="sl-membership-info-credits">{membershipAllowanceLabel(tier)}</p>
          <p className="sl-membership-info-remaining">{remaining} remaining</p>
          <p className="sl-membership-info-footnote">Renews monthly</p>
        </>
      )}
    </div>
  );
}

function StudioPassCompact() {
  return (
    <div className="sl-membership-pass-compact">
      <div className="sl-membership-pass-compact-copy">
        <h3 className="sl-membership-pass-compact-title">Studio Pass</h3>
        <p className="sl-membership-pass-compact-subtitle">One-time creative access</p>
        <p className="sl-membership-pass-compact-line">
          {MembershipDisplayPricing.studioPass}
          {' • '}
          {formatStudioCredits(MembershipCreditAllowances.studioPass)}
        </p>
        <p className="sl-membership-pass-compact-line">
          {compactFinishedImagesLabel(MembershipCreditAllowances.studioPass)}
        </p>
        <p className="sl-membership-pass-compact-meta">
          Valid 7 Days • No Subscription
        </p>
      </div>
    </div>
  );
}

function StudioTopUpCompact() {
  return (
    <div className="sl-membership-topup-compact">
      <div className="sl-membership-topup-compact-copy">
        <h3 className="sl-membership-topup-compact-title">Studio Top-Up</h3>
        <p className="sl-membership-topup-compact-line">
          {formatStudioCredits(MembershipCreditAllowances.topUp)}
        </p>
        <p className="sl-membership-topup-compact-price">
          {MembershipDisplayPricing.topUp}
        </p>
        <p className="sl-membership-topup-compact-meta">For active Studio Members</p>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useGetMe();
  const { data: usage } = useGetRenderUsage();
  const clientTimeZone = browserTimeZone();
  const createSubscription = useCreateMembershipSubscription({
    request: {
      headers: clientTimeZone
        ? { [CLIENT_TIMEZONE_HEADER]: clientTimeZone }
        : undefined,
    },
  });
  const [pricingMarket, setPricingMarket] =
    useState<MembershipPricingMarket>('international');

  const [pendingPlan, setPendingPlan] =
    useState<CreateMembershipSubscriptionInputPlan | null>(null);
  const checkoutInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPricingMarket().then((market) => {
      if (!cancelled) setPricingMarket(market);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tier = user?.subscriptionTier ?? 'free';
  const usageData = { used: usage?.used ?? 0, limit: usage?.limit ?? null };
  const purchaseBusy = pendingPlan != null || createSubscription.isPending;

  const releaseCheckoutLock = () => {
    checkoutInFlightRef.current = false;
    setPendingPlan(null);
  };

  const handleChoosePlan = async (
    membershipTier: (typeof MEMBERSHIP_TIERS)[number],
  ) => {
    if (checkoutInFlightRef.current) return;

    checkoutInFlightRef.current = true;
    setPendingPlan(membershipTier.plan);

    try {
      const checkout = await createSubscription.mutateAsync({
        data: { plan: membershipTier.plan },
      });

      if (!checkout.keyId || !checkout.subscriptionId) {
        throw new Error('Checkout details were incomplete. Please try again.');
      }

      await openRazorpaySubscriptionCheckout({
        keyId: checkout.keyId,
        subscriptionId: checkout.subscriptionId,
        description: membershipTier.name,
        onSuccess: () => {
          releaseCheckoutLock();
          toast({
            title: 'Payment received',
            description:
              'Your Studio Credits will appear once payment is confirmed.',
          });
          void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          void queryClient.invalidateQueries({
            queryKey: getGetRenderUsageQueryKey(),
          });
        },
        onDismiss: () => {
          releaseCheckoutLock();
        },
      });
    } catch (error) {
      releaseCheckoutLock();
      toast({
        title: "We couldn't start checkout.",
        description: membershipCheckoutErrorMessage(error),
      });
    }
  };

  return (
    <AppShell footer>
      <EditorialPageHeader
        companion="Membership"
        supporting={INTRO_SUPPORTING}
        tagline={INTRO_TAGLINE}
        className="sl-page-header--membership"
      />

      <CurrentMembershipSummary tier={tier} usage={usageData} />

      <div className="sl-membership-page">
        <section className="sl-membership-plans-section">
          <h2 className="sl-membership-plans-heading">Choose Your Membership</h2>
          <div className="sl-membership-plans-row">
            {MEMBERSHIP_TIERS.map((membershipTier) => {
              const active = isActiveTier(tier, membershipTier.id);
              return (
                <MembershipCard
                  key={membershipTier.id}
                  tier={membershipTier}
                  price={membershipPlanDisplayPrice(
                    membershipTier.plan,
                    pricingMarket,
                  )}
                  active={active}
                  checkoutBusy={purchaseBusy}
                  choosingThisPlan={pendingPlan === membershipTier.plan}
                  onChoose={handleChoosePlan}
                />
              );
            })}
          </div>
        </section>

        <section className="sl-membership-credits-note">
          <h3 className="sl-membership-credits-note-heading">Understanding Studio Credits</h3>
          <p className="sl-membership-credits-note-body">
            {creativeStepCreditCopy()} Most creators refine each image up to three times.
            Fewer refinements allow you to create even more finished images.
          </p>
        </section>

        <section className="sl-membership-secondary-offers">
          <StudioPassCompact />
          <StudioTopUpCompact />
        </section>

        <section className="sl-membership-faq-section max-w-3xl mx-auto">
          <h2 className="sl-section-label sl-membership-faq-title text-center">Membership FAQ</h2>
          <Accordion type="single" collapsible className="w-full">
            {MEMBERSHIP_FAQ.map((item, index) => (
              <AccordionItem key={item.q} value={`faq-${index}`}>
                <AccordionTrigger className="text-sm text-foreground hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </div>
    </AppShell>
  );
}
