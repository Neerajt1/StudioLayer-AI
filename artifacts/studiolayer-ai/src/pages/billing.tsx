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
import {
  membershipPaymentFailedToastCopy,
  openRazorpayOrderCheckout,
  openRazorpaySubscriptionCheckout,
} from '@/lib/razorpay-checkout';
import {
  MembershipCreditAllowances,
  finishedImagesOutcomeLabel,
  formatStudioCredits,
  membershipAddOnDisplayPrice,
  membershipPlanDisplayPrice,
  type MembershipPricingMarket,
  type StudioAddOnProductId,
} from '@workspace/studio-credit-engine';
import {
  membershipAllowanceLabel,
  membershipCreditsRemaining,
  membershipLabel,
} from '@/lib/membership';
import { fetchPricingMarket, CLIENT_TIMEZONE_HEADER } from '@/lib/fetch-pricing-market';
import { browserTimeZone } from '@/lib/pricing-market';
import {
  formatMembershipBillingDate,
  fetchMembershipSubscriptionStatus,
  cancelMembershipRenewalAtCycleEnd,
  scheduleStudioProUpgrade,
  scheduledProNeedsCheckout,
  type MembershipSubscriptionStatus,
} from '@/lib/schedule-studio-pro';
import { createStudioAddOnCheckoutOrder } from '@/lib/studio-add-on-checkout';

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
    outcome: `Create up to ${MembershipCreditAllowances.basic} images at 2K`,
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
    outcome: `Create up to ${MembershipCreditAllowances.pro} images at 2K`,
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
    a: 'Complimentary Studio includes one one-time Studio Credit. Studio Basic and Studio Pro renew monthly. Studio Credits from a Studio Pass are valid for seven days. Your balance is always visible in your Studio Profile and on this page.',
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
  mode: 'choose' | 'upgrade' | 'scheduled' | 'scheduled-pending-auth' | 'hidden';
  scheduledStartLabel: string | null;
  onChoose: (tier: (typeof MEMBERSHIP_TIERS)[number]) => void;
  onUpgrade: () => void;
}

function MembershipCard({
  tier,
  price,
  active,
  checkoutBusy,
  choosingThisPlan,
  mode,
  scheduledStartLabel,
  onChoose,
  onUpgrade,
}: MembershipCardProps) {
  if (mode === 'hidden') {
    return null;
  }

  const showUpgradeCopy = mode === 'upgrade';
  const showScheduledCopy =
    mode === 'scheduled' || mode === 'scheduled-pending-auth';
  const upgradeAction =
    mode === 'upgrade' || mode === 'scheduled-pending-auth';

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
          <p className="sl-membership-tier-outcome">
            {tier.outcome}
            <sup>*</sup>
          </p>
        </div>
        <ul className="sl-membership-tier-features">
          {tier.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        {showUpgradeCopy && scheduledStartLabel ? (
          <div className="mt-4 space-y-2 text-center text-[0.75rem] leading-relaxed text-muted-foreground">
            <p>
              Studio Pro will start on your next billing date:{' '}
              {scheduledStartLabel}.
            </p>
            <p>Your current Studio Basic membership remains active until then.</p>
            <p>Nothing is charged today.</p>
          </div>
        ) : null}
        {showScheduledCopy && scheduledStartLabel ? (
          <p className="mt-4 text-center text-[0.75rem] leading-relaxed text-muted-foreground">
            Studio Pro is scheduled for {scheduledStartLabel}. Your current
            Studio Basic membership remains active until then.
          </p>
        ) : null}
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
        ) : mode === 'scheduled' ? (
          <Button
            className="w-full"
            variant="outline"
            disabled
            data-testid="button-upgrade-to-pro"
          >
            Studio Pro scheduled
          </Button>
        ) : (
          <>
            <Button
              className="w-full"
              variant={tier.recommended ? 'default' : 'outline'}
              disabled={checkoutBusy}
              onClick={() => {
                if (upgradeAction) {
                  onUpgrade();
                  return;
                }
                onChoose(tier);
              }}
              data-testid={
                upgradeAction ? 'button-upgrade-to-pro' : tier.testId
              }
            >
              {choosingThisPlan
                ? 'Opening checkout…'
                : mode === 'upgrade'
                  ? 'Upgrade to Studio Pro'
                  : mode === 'scheduled-pending-auth'
                    ? 'Continue Studio Pro setup'
                    : tier.chooseLabel}
            </Button>
            <p className="mt-2 text-center text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground">
              {upgradeAction
                ? 'Nothing is charged today'
                : 'Auto-renews until cancelled'}
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
  scheduledProStartLabel,
  isProActive,
  cancelAtCycleEnd,
  cancelEffectiveLabel,
  cancelBusy,
  onCancelRenewal,
}: {
  tier: string;
  usage: { used: number; limit: number | null; remaining: number | null };
  scheduledProStartLabel: string | null;
  isProActive: boolean;
  cancelAtCycleEnd: boolean;
  cancelEffectiveLabel: string | null;
  cancelBusy: boolean;
  onCancelRenewal: () => void;
}) {
  const isFree = tier === 'free';
  // Prefer API spendable balance (membership + Top-Up + Pass lots). Fallback matches Workspace.
  const remaining =
    usage.remaining ??
    membershipCreditsRemaining(tier, usage.used, usage.limit);
  const isPaidMember = !isFree;

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
          {cancelAtCycleEnd && cancelEffectiveLabel ? (
            <p className="sl-membership-info-footnote">
              Cancellation requested. Your membership remains active until{' '}
              {cancelEffectiveLabel}. It will not renew after that date.
            </p>
          ) : isProActive ? (
            <p className="sl-membership-info-footnote">
              Studio Pro is now active.{' '}
              {formatStudioCredits(MembershipCreditAllowances.pro)} are available
              for this billing period.
            </p>
          ) : scheduledProStartLabel ? (
            <p className="sl-membership-info-footnote">
              Studio Pro is scheduled for {scheduledProStartLabel}. Your current
              Studio Basic membership remains active until then.
            </p>
          ) : (
            <p className="sl-membership-info-footnote">Renews monthly</p>
          )}
          {isPaidMember && !cancelAtCycleEnd ? (
            <Button
              type="button"
              variant="ghost"
              className="sl-membership-cancel-renewal"
              disabled={cancelBusy}
              onClick={onCancelRenewal}
              data-testid="button-cancel-membership-renewal"
            >
              {cancelBusy ? 'Cancelling renewal…' : 'Cancel Subscription'}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function StudioPassCompact({
  market,
  eligible,
  checkoutBusy,
  choosing,
  onChoose,
}: {
  market: MembershipPricingMarket;
  eligible: boolean;
  checkoutBusy: boolean;
  choosing: boolean;
  onChoose: () => void;
}) {
  return (
    <div className="sl-membership-pass-compact">
      <div className="sl-membership-pass-compact-copy">
        <h3 className="sl-membership-pass-compact-title">Studio Pass</h3>
        <p className="sl-membership-pass-compact-line">
          {formatStudioCredits(MembershipCreditAllowances.studioPass)},{' '}
          <span className="sl-membership-pass-compact-subtitle">
            One-time creative access
          </span>
        </p>
        <p className="sl-membership-topup-compact-price">
          {membershipAddOnDisplayPrice('studioPass', market)}
        </p>
        <p className="sl-membership-pass-compact-line">
          Create up to {MembershipCreditAllowances.studioPass} images at 2K
          <sup>*</sup>
        </p>
        <p className="sl-membership-pass-compact-meta">
          Valid 7 Days • No Subscription
        </p>
        {!eligible ? (
          <p className="sl-membership-pass-compact-eligibility">
            Available to Complimentary Studio accounts
          </p>
        ) : null}
      </div>
      <Button
        className="sl-membership-pass-compact-cta"
        variant="outline"
        disabled={!eligible || checkoutBusy}
        onClick={onChoose}
        data-testid="button-choose-studio-pass"
      >
        {choosing ? 'Opening checkout…' : 'Choose Studio Pass'}
      </Button>
    </div>
  );
}

function StudioTopUpCompact({
  market,
  eligible,
  checkoutBusy,
  choosing,
  onChoose,
}: {
  market: MembershipPricingMarket;
  eligible: boolean;
  checkoutBusy: boolean;
  choosing: boolean;
  onChoose: () => void;
}) {
  return (
    <div className="sl-membership-topup-compact">
      <div className="sl-membership-topup-compact-copy">
        <h3 className="sl-membership-topup-compact-title">Studio Top-Up</h3>
        <p className="sl-membership-topup-compact-line">
          {formatStudioCredits(MembershipCreditAllowances.topUp)}
        </p>
        <p className="sl-membership-topup-compact-price">
          {membershipAddOnDisplayPrice('topUp', market)}
        </p>
        <p className="sl-membership-topup-compact-line">
          Create up to {MembershipCreditAllowances.topUp} images at 2K
          <sup>*</sup>
        </p>
        <p className="sl-membership-topup-compact-meta">For active Studio Members</p>
      </div>
      <Button
        className="sl-membership-topup-compact-cta"
        variant="outline"
        disabled={!eligible || checkoutBusy}
        onClick={onChoose}
        data-testid="button-top-up-credits"
      >
        {choosing ? 'Opening checkout…' : 'Top Up Credits'}
      </Button>
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
  const [membershipStatus, setMembershipStatus] =
    useState<MembershipSubscriptionStatus | null>(null);
  const [schedulingPro, setSchedulingPro] = useState(false);

  const [pendingPlan, setPendingPlan] =
    useState<CreateMembershipSubscriptionInputPlan | null>(null);
  const [pendingAddOn, setPendingAddOn] = useState<StudioAddOnProductId | null>(
    null,
  );
  const [cancellingMembership, setCancellingMembership] = useState(false);
  const checkoutInFlightRef = useRef(false);

  const refreshMembershipStatus = async () => {
    try {
      const status = await fetchMembershipSubscriptionStatus();
      setMembershipStatus(status);
    } catch {
      setMembershipStatus(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetchPricingMarket().then((market) => {
      if (!cancelled) setPricingMarket(market);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchMembershipSubscriptionStatus()
      .then((status) => {
        if (!cancelled) setMembershipStatus(status);
      })
      .catch(() => {
        if (!cancelled) setMembershipStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.subscriptionTier]);

  const tier = user?.subscriptionTier ?? 'free';
  const usageData = {
    used: usage?.used ?? 0,
    limit: usage?.limit ?? null,
    remaining: usage?.remaining ?? null,
  };
  const purchaseBusy =
    pendingPlan != null ||
    pendingAddOn != null ||
    createSubscription.isPending ||
    schedulingPro;
  const isPaidMember = tier === 'pro' || tier === 'enterprise';
  const isBasicMember = tier === 'pro';
  const isProMember = tier === 'enterprise';
  const passEligible = !isPaidMember;
  const topUpEligible = isPaidMember;
  const scheduledStartLabel =
    formatMembershipBillingDate(membershipStatus?.scheduledPro?.startAt) ??
    formatMembershipBillingDate(membershipStatus?.currentEnd);
  const scheduledNeedsAuth = scheduledProNeedsCheckout(
    membershipStatus?.scheduledPro?.status,
  );

  const releaseCheckoutLock = () => {
    checkoutInFlightRef.current = false;
    setPendingPlan(null);
    setPendingAddOn(null);
    setSchedulingPro(false);
  };

  const handleCancelMembershipRenewal = async () => {
    if (cancellingMembership) return;
    const until =
      formatMembershipBillingDate(membershipStatus?.currentEnd) ??
      'the end of your current billing period';
    const confirmed = window.confirm(
      `Cancel your membership renewal?\n\nYour Studio membership will remain active until ${until}. It will not renew after that date. Your Studio account and Creative Ledger history will stay intact.`,
    );
    if (!confirmed) return;

    setCancellingMembership(true);
    try {
      const result = await cancelMembershipRenewalAtCycleEnd();
      const effective =
        formatMembershipBillingDate(result.cancelEffectiveAt) ?? until;
      toast({
        title: 'Renewal cancelled',
        description: `Your membership remains active until ${effective}. It will not renew after that date.`,
      });
      void refreshMembershipStatus();
    } catch (error) {
      toast({
        title: "We couldn't cancel renewal.",
        description:
          error instanceof Error
            ? error.message
            : 'Your membership is unchanged.',
      });
    } finally {
      setCancellingMembership(false);
    }
  };

  const handleChoosePlan = async (
    membershipTier: (typeof MEMBERSHIP_TIERS)[number],
  ) => {
    if (checkoutInFlightRef.current) return;
    if (isBasicMember && membershipTier.plan === 'pro') return;

    checkoutInFlightRef.current = true;
    setPendingPlan(membershipTier.plan);

    try {
      const checkout = await createSubscription.mutateAsync({
        data: { plan: membershipTier.plan },
      });

      if (!checkout.keyId || !checkout.subscriptionId) {
        throw new Error('Checkout details were incomplete. Please try again.');
      }

      // Already paid / reconciled (e.g. local created while Razorpay active) — never reopen Checkout.
      const needsCheckout =
        checkout.status === 'created' ||
        checkout.status === 'authenticated' ||
        checkout.status === 'pending';
      if (!needsCheckout) {
        releaseCheckoutLock();
        toast({
          title: 'Membership confirmed',
          description:
            'Your Studio membership is already active. Studio Credits will appear once confirmation finishes.',
        });
        void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        void queryClient.invalidateQueries({
          queryKey: getGetRenderUsageQueryKey(),
        });
        void refreshMembershipStatus();
        return;
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
          void refreshMembershipStatus();
        },
        onDismiss: () => {
          releaseCheckoutLock();
        },
        onPaymentFailed: (failure) => {
          releaseCheckoutLock();
          const copy = membershipPaymentFailedToastCopy(failure);
          toast({
            title: copy.title,
            description: copy.description,
          });
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

  const handleUpgradeToPro = async () => {
    if (checkoutInFlightRef.current) return;
    if (!isBasicMember) return;

    checkoutInFlightRef.current = true;
    setSchedulingPro(true);

    try {
      const checkout = await scheduleStudioProUpgrade();
      const startLabel =
        formatMembershipBillingDate(checkout.startAt) ?? 'your next billing date';

      if (!scheduledProNeedsCheckout(checkout.status) && checkout.alreadyScheduled) {
        releaseCheckoutLock();
        toast({
          title: 'Studio Pro is scheduled',
          description: `Studio Pro is scheduled for ${startLabel}. Your current Studio Basic membership remains active until then.`,
        });
        void refreshMembershipStatus();
        return;
      }

      if (!checkout.keyId || !checkout.subscriptionId) {
        throw new Error('Checkout details were incomplete. Please try again.');
      }

      await openRazorpaySubscriptionCheckout({
        keyId: checkout.keyId,
        subscriptionId: checkout.subscriptionId,
        description: 'Studio Pro',
        onSuccess: () => {
          releaseCheckoutLock();
          toast({
            title: 'Studio Pro scheduled',
            description: `Studio Pro is scheduled for ${startLabel}. Your current Studio Basic membership remains active until then.`,
          });
          void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          void queryClient.invalidateQueries({
            queryKey: getGetRenderUsageQueryKey(),
          });
          void refreshMembershipStatus();
        },
        onDismiss: () => {
          releaseCheckoutLock();
          void refreshMembershipStatus();
        },
        onPaymentFailed: (failure) => {
          releaseCheckoutLock();
          const copy = membershipPaymentFailedToastCopy(failure);
          toast({
            title: copy.title,
            description: copy.description,
          });
          void refreshMembershipStatus();
        },
      });
    } catch (error) {
      releaseCheckoutLock();
      toast({
        title: "We couldn't schedule Studio Pro.",
        description: membershipCheckoutErrorMessage(error),
      });
    }
  };

  const handleChooseAddOn = async (product: StudioAddOnProductId) => {
    if (checkoutInFlightRef.current) return;
    if (product === 'studioPass' && !passEligible) return;
    if (product === 'topUp' && !topUpEligible) return;

    checkoutInFlightRef.current = true;
    setPendingAddOn(product);

    try {
      const checkout = await createStudioAddOnCheckoutOrder(product);
      if (!checkout.keyId || !checkout.orderId) {
        throw new Error('Checkout details were incomplete. Please try again.');
      }

      await openRazorpayOrderCheckout({
        keyId: checkout.keyId,
        orderId: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        description:
          product === 'studioPass' ? 'Studio Pass' : 'Studio Top-Up',
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
        description:
          error instanceof Error
            ? error.message
            : 'Unable to start checkout.',
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

      <CurrentMembershipSummary
        tier={tier}
        usage={usageData}
        scheduledProStartLabel={
          isBasicMember && membershipStatus?.scheduledPro
            ? scheduledStartLabel
            : null
        }
        isProActive={isProMember}
        cancelAtCycleEnd={Boolean(membershipStatus?.cancelAtCycleEnd)}
        cancelEffectiveLabel={formatMembershipBillingDate(
          membershipStatus?.cancelEffectiveAt ?? membershipStatus?.currentEnd,
        )}
        cancelBusy={cancellingMembership}
        onCancelRenewal={() => {
          void handleCancelMembershipRenewal();
        }}
      />

      <div className="sl-membership-page">
        <section className="sl-membership-plans-section">
          <h2 className="sl-membership-plans-heading">Choose Your Membership</h2>
          <div className="sl-membership-plans-row">
            {MEMBERSHIP_TIERS.map((membershipTier) => {
              const active = isActiveTier(tier, membershipTier.id);
              let mode: MembershipCardProps['mode'] = 'choose';
              if (membershipTier.plan === 'pro' && isBasicMember) {
                if (membershipStatus?.scheduledPro) {
                  mode = scheduledNeedsAuth
                    ? 'scheduled-pending-auth'
                    : 'scheduled';
                } else {
                  mode = 'upgrade';
                }
              }
              if (membershipTier.plan === 'basic' && isProMember) {
                mode = 'hidden';
              }

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
                  choosingThisPlan={
                    pendingPlan === membershipTier.plan ||
                    (membershipTier.plan === 'pro' && schedulingPro)
                  }
                  mode={mode}
                  scheduledStartLabel={
                    membershipTier.plan === 'pro' ? scheduledStartLabel : null
                  }
                  onChoose={handleChoosePlan}
                  onUpgrade={handleUpgradeToPro}
                />
              );
            })}
          </div>
        </section>

        <section className="sl-membership-credits-note">
          <h3 className="sl-membership-credits-note-heading">Understanding Studio Credits</h3>
          <p className="sl-membership-credits-note-body">
            <sup>*</sup>2K generation uses 1 Studio Credit. 4K uses 2 credits. Remove Background uses 1 Studio Credit.
          </p>
        </section>

        <section className="sl-membership-secondary-offers">
          <StudioPassCompact
            market={pricingMarket}
            eligible={passEligible}
            checkoutBusy={purchaseBusy}
            choosing={pendingAddOn === 'studioPass'}
            onChoose={() => {
              void handleChooseAddOn('studioPass');
            }}
          />
          <StudioTopUpCompact
            market={pricingMarket}
            eligible={topUpEligible}
            checkoutBusy={purchaseBusy}
            choosing={pendingAddOn === 'topUp'}
            onChoose={() => {
              void handleChooseAddOn('topUp');
            }}
          />
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
