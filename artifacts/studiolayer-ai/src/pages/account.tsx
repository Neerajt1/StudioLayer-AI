import { useState } from 'react';
import { Link } from 'wouter';
import { AppShell } from '@/components/layout/app-shell';
import { useGetMe, useGetRenderUsage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import { AccountStatementDownloadLink } from '@/components/account/account-statement-download-link';
import { ProfileContactSection } from '@/components/account/profile-contact-section';
import { StudioDeletionSection } from '@/components/account/studio-deletion';
import { membershipAllowanceForTier, membershipLabel } from '@/lib/membership';
import { isStudioCreditLimitBlocked } from '@workspace/studio-credit-engine';

export default function AccountPage() {
  const { data: user, isLoading: userLoading, isSuccess: isAuthenticated } =
    useGetMe();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage({
    query: { enabled: isAuthenticated },
  } as never);
  const [showPasswordMsg, setShowPasswordMsg] = useState(false);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  const planLabel = (tier: string) => membershipLabel(tier);

  const displayPlanLimit = (tier: string) =>
    membershipAllowanceForTier(tier, usage?.limit ?? null);

  const usedPct =
    usage?.limit != null ? Math.min((usage.used / usage.limit) * 100, 100) : 0;

  const formatCreditUsageLine = (tier: string, used: number) => {
    const limit = displayPlanLimit(tier);
    if (tier === 'free') {
      return `Complimentary Studio Credit · ${used} of ${limit} used`;
    }
    return `Studio Credits · ${used} of ${limit} used`;
  };

  const showAuthenticatedProfile = isAuthenticated && Boolean(user);
  const showVisitorProfile = !userLoading && !showAuthenticatedProfile;

  return (
    <AppShell footer>
          <div className={showVisitorProfile ? 'sl-visitor-page-emphasis' : undefined}>
          <EditorialPageHeader
            companion="Profile"
            supporting="Studio Identity & Usage"
            tagline={
              showVisitorProfile
                ? 'Sign in to manage your studio credentials and subscription'
                : 'Manage your studio credentials and subscription'
            }
            className="sl-page-header--workspace"
            aside={
              showAuthenticatedProfile ? (
                <AccountStatementDownloadLink variant="header" />
              ) : undefined
            }
          />

          <div className="sl-editorial-narrow">
          {showVisitorProfile ? (
            <section className="mb-6 border border-border rounded bg-card p-6">
              <h3 className="sl-section-label mb-4">Identity Credentials</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Your Studio Profile appears here after you create an account.
                Explore Membership and the Workspace freely — sign in when you are ready.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login" className="sl-studio-btn no-underline">
                  Login
                </Link>
                <Link
                  href="/register"
                  className="sl-studio-btn sl-studio-btn--primary no-underline"
                >
                  Sign Up
                </Link>
              </div>
            </section>
          ) : (
            <>
          <section className="mb-6 border border-border rounded bg-card p-6">
            <h3 className="sl-section-label mb-4">
              Identity Credentials
            </h3>

            {userLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Full Name
                  </Label>
                  <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-foreground">
                    {user?.name ?? '—'}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Registered Business Email
                  </Label>
                  <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-foreground font-mono">
                    {user?.email ?? '—'}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Password
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-muted-foreground font-mono flex-1">
                      ••••••••••••
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs shrink-0"
                      onClick={() => setShowPasswordMsg(true)}
                    >
                      Reset Password
                    </Button>
                  </div>
                  {showPasswordMsg && (
                    <p className="text-xs text-muted-foreground font-mono">
                      Contact info@studiolayerai.com if you need to reset your password.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/*
            Future section slot — Business Contact
            Business Phone (Optional) with Studio updates, feature releases,
            exclusive launch pricing, and priority support messaging.
          */}
          <section
            id="business-contact"
            data-future-section="business-contact"
            className="hidden"
            aria-hidden="true"
          />

          <section id="studio-billing" className="mb-6 border border-border rounded bg-card p-6">
            <button
              type="button"
              onClick={() => setShowBillingDetails((v) => !v)}
              className="flex items-center justify-between w-full text-left group"
            >
              <h3 className="sl-section-label">
                Studio Billing
              </h3>
              <span className="text-muted-foreground text-sm font-mono transition-transform duration-200" style={{ transform: showBillingDetails ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▾
              </span>
            </button>

            {showBillingDetails && (
              <div className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Company Tax ID / GSTIN</Label>
                  <Input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="e.g. 27AAPFU0939F1ZV"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Official Billing Address</Label>
                  <Input
                    type="text"
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    placeholder="123 Commerce St, Suite 400, City, State, ZIP"
                  />
                </div>
                <p className="text-muted-foreground font-mono" style={{ fontSize: '11px', lineHeight: '1.5' }}>
                  These details are voluntary and will be automatically appended to your downloadable monthly subscription invoices for accounting compliance.
                </p>
              </div>
            )}
          </section>

          <section className="mb-6 border border-border rounded bg-card p-6">
            <h3 className="sl-section-label mb-4">
              Subscription
            </h3>

            {userLoading ? (
              <div className="h-10 bg-muted rounded animate-pulse" />
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Current Plan
                </Label>
                <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-foreground font-medium">
                  {user ? planLabel(user.subscriptionTier) : '—'}
                </div>
              </div>
            )}
          </section>

          <section className="border border-border rounded bg-card p-6">
            <h3 className="sl-section-label mb-1">
              Studio Credits
            </h3>
            <p className="sl-ui-helper mb-6">
              Track your Studio Credit usage. Every render is recorded in your Creative Ledger.
            </p>

            {usageLoading || userLoading ? (
              <div className="h-32 bg-muted rounded animate-pulse" />
            ) : (
              <div className="flex items-center gap-8">
                <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
                  <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                    <circle
                      cx="48" cy="48" r="38"
                      fill="none"
                      stroke="hsl(240 6% 90%)"
                      strokeWidth="10"
                    />
                    <circle
                      cx="48" cy="48" r="38"
                      fill="none"
                      stroke="#18181B"
                      strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 38}`}
                      strokeDashoffset={`${2 * Math.PI * 38 * (1 - usedPct / 100)}`}
                      strokeLinecap="round"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-foreground font-mono">
                      {Math.round(usedPct)}%
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {usage?.used ?? 0}{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      {user
                        ? `of ${displayPlanLimit(user.subscriptionTier)} used`
                        : '—'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {user ? formatCreditUsageLine(user.subscriptionTier, usage?.used ?? 0) : '—'}
                  </p>
                  {isStudioCreditLimitBlocked(usage) && (
                    <Link
                      href="/billing"
                      className="text-xs text-foreground font-mono mt-2 underline underline-offset-2 cursor-pointer hover:opacity-70 inline-block"
                    >
                      → View Membership
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>

          <StudioDeletionSection />
            </>
          )}

          <ProfileContactSection />
          </div>
          </div>
    </AppShell>
  );
}
