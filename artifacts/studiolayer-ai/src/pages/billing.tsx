import { AppShell } from '@/components/layout/app-shell';
import { useGetMe, useGetRenderUsage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  MembershipCreditAllowances,
  MembershipDisplayPricing,
  compactFinishedImagesLabel,
  creativeStepCreditCopy,
  finishedImagesOutcomeLabel,
  formatStudioCredits,
} from '@workspace/studio-credit-engine';
import {
  membershipAllowanceLabel,
  membershipCreditsRemaining,
  membershipLabel,
} from '@/lib/membership';

const INTRO_SUPPORTING =
  'Choose the Studio membership that best supports your creative workflow.';

const INTRO_TAGLINE =
  "Every render is fully traceable in your Creative Ledger. Whether you're exploring your first editorial render or producing campaigns at scale, every membership is designed to deliver the same commitment to quality, consistency, and craftsmanship.";

const MEMBERSHIP_TIERS = [
  {
    id: 'pro',
    name: 'Studio Basic',
    subtitle: 'For growing fashion brands',
    originalPrice: '$99',
    price: MembershipDisplayPricing.basicMonthly,
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
    chooseLabel: 'Choose Basic',
    testId: 'button-choose-basic',
    recommended: false,
  },
  {
    id: 'enterprise',
    name: 'Studio Pro',
    subtitle: 'For creative teams & agencies',
    originalPrice: '$120',
    price: MembershipDisplayPricing.proMonthly,
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
    chooseLabel: 'Choose Pro',
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

interface MembershipCardProps {
  tier: (typeof MEMBERSHIP_TIERS)[number];
  active: boolean;
  disabled: boolean;
}

function MembershipCard({ tier, active, disabled }: MembershipCardProps) {
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
          {'originalPrice' in tier && tier.originalPrice && (
            <p className="sl-membership-tier-original-price">
              {tier.originalPrice} / month
            </p>
          )}
          <p className="sl-membership-tier-price">
            {tier.price}
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
      {active ? (
        <div className="sl-membership-tier-cta-wrap">
          <Button
            className="w-full"
            variant="outline"
            disabled={disabled}
            data-testid={tier.testId}
          >
            Current Membership
          </Button>
        </div>
      ) : null}
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
  const { data: user } = useGetMe();
  const { data: usage } = useGetRenderUsage();

  const tier = user?.subscriptionTier ?? 'free';
  const usageData = { used: usage?.used ?? 0, limit: usage?.limit ?? null };

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
                  active={active}
                  disabled={active}
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
