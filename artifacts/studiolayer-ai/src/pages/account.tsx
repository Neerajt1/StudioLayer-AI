import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Footer } from '@/components/layout/footer';
import { useGetMe, useGetRenderUsage } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function AccountPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: usage, isLoading: usageLoading } = useGetRenderUsage();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showPasswordMsg, setShowPasswordMsg] = useState(false);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  const usedPct =
    usage?.limit != null ? Math.min((usage.used / usage.limit) * 100, 100) : 0;

  const planLabel = (tier: string) =>
    tier === 'free' ? 'Free Trial' : tier === 'pro' ? 'Starter Studio Plan' : 'Enterprise Bulk Plan';

  const planLimit = (tier: string) =>
    tier === 'free' ? 3 : tier === 'pro' ? 400 : 800;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1 p-8 max-w-3xl">
          {/* Page header */}
          <div className="mb-8">
            <h2
              className="text-foreground mb-2"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '22px',
                fontWeight: 600,
                letterSpacing: '-0.01em',
              }}
            >
              Account Profile
            </h2>
            <p className="text-sm text-muted-foreground font-mono">
              Manage your studio identity, brand assets, and usage metrics
            </p>
          </div>

          {/* ── Block 1: Stored Identity Credentials ── */}
          <section className="mb-6 border border-border rounded bg-card p-6">
            <h3
              className="text-foreground mb-4 text-sm font-semibold tracking-tight"
            >
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                      User Account Owner
                    </Label>
                    <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-foreground">
                      {user?.name ?? '—'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                      Subscription Tier
                    </Label>
                    <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-foreground font-medium">
                      {user ? planLabel(user.subscriptionTier) : '—'}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Studio / Corporate Organization Name
                  </Label>
                  <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-foreground font-medium">
                    29Copper Media Works
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Registered Email
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
                      A password reset link will be sent to {user?.email}. (SMTP integration pending.)
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Optional Corporate Billing Details ── */}
          <section className="mb-6 border border-border rounded bg-card p-6">
            <button
              type="button"
              onClick={() => setShowBillingDetails((v) => !v)}
              className="flex items-center justify-between w-full text-left group"
            >
              <h3
                className="text-foreground text-sm font-semibold tracking-tight"
              >
                Optional Corporate Billing Details
              </h3>
              <span className="text-muted-foreground text-sm font-mono transition-transform duration-200" style={{ transform: showBillingDetails ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▾
              </span>
            </button>

            {showBillingDetails && (
              <div className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Company Tax ID / GSTIN
                  </Label>
                  <Input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="e.g. 27AAPFU0939F1ZV"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Official Billing Address
                  </Label>
                  <Input
                    type="text"
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    placeholder="123 Commerce St, Suite 400, City, State, ZIP"
                    className="font-mono text-sm"
                  />
                </div>
                <p className="text-muted-foreground font-mono" style={{ fontSize: '11px', lineHeight: '1.5' }}>
                  These details are voluntary and will be automatically appended to your downloadable monthly subscription invoices for accounting compliance.
                </p>
              </div>
            )}
          </section>

          {/* ── Block 2: Stored Brand Assets ── */}
          <section className="mb-6 border border-border rounded bg-card p-6">
            <h3
              className="text-foreground mb-1 text-sm font-semibold tracking-tight"
            >
              Stored Brand Assets
            </h3>
            <p className="text-xs text-muted-foreground font-mono mb-5">
              Default transparent logo for watermark overlay and corporate invoicing profiles
            </p>

            <div className="space-y-5">
              <div>
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2 block">
                  Corporate Logo (transparent PNG)
                </Label>
                <FileUpload
                  onFileSelect={(url) => setLogoUrl(url || null)}
                  accept="image/png"
                  className="min-h-0"
                />
                {logoUrl && (
                  <div className="mt-3 w-20 h-20 border border-border rounded overflow-hidden bg-white flex items-center justify-center">
                    <img
                      src={logoUrl}
                      alt="Brand logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Invoice Company Name
                  </Label>
                  <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-muted-foreground font-mono">
                    {user?.name ?? 'Not set'}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Invoice Email
                  </Label>
                  <div className="px-3 py-2.5 border border-border rounded bg-background text-sm text-muted-foreground font-mono">
                    {user?.email ?? 'Not set'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Block 3: Operational Metric Ring ── */}
          <section className="border border-border rounded bg-card p-6">
            <h3
              className="text-foreground mb-1 text-sm font-semibold tracking-tight"
            >
              Render Credit Usage
            </h3>
            <p className="text-xs text-muted-foreground font-mono mb-6">
              Current monthly render bucket consumption
            </p>

            {usageLoading || userLoading ? (
              <div className="h-32 bg-muted rounded animate-pulse" />
            ) : (
              <div className="flex items-center gap-8">
                {/* Ring */}
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

                {/* Stats */}
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {usage?.used ?? 0}{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      / {user ? planLimit(user.subscriptionTier) : '—'} Credits Used This Month
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    Plan: {user ? planLabel(user.subscriptionTier) : '—'} ·{' '}
                    {usage?.canRender
                      ? `${(user ? planLimit(user.subscriptionTier) : 0) - (usage?.used ?? 0)} credits remaining`
                      : 'Allowance exhausted'}
                  </p>
                  {!usage?.canRender && (
                    <p className="text-xs text-foreground font-mono mt-2 underline underline-offset-2 cursor-pointer hover:opacity-70">
                      → Purchase 100 extra renders for $25
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <Footer />
      </main>
    </div>
  );
}
