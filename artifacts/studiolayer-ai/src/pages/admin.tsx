import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import { AppShell } from '@/components/layout/app-shell';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { apiUrl } from '@/lib/api-base-url';
import { AdminSystemHealth } from '@/components/admin/admin-system-health';
import { AdminGenerations } from '@/components/admin/admin-generations';
import { AdminCustomersStudioCredits } from '@/components/admin/admin-customers-studio-credits';
import { AdminPromotions } from '@/components/admin/admin-promotions';
import { AdminProviderUsage } from '@/components/admin/admin-provider-usage';
import { AdminStudioCredits } from '@/components/admin/admin-studio-credits';

type AdminMe = {
  id: number;
  email: string;
  name: string;
  isAdmin: true;
};

function PlaceholderCard({ title }: { title: string }) {
  return (
    <Card className="border-border">
      <CardContent className="py-5 space-y-2">
        <p className="sl-page-subheading text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">Coming next</p>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function verifyAdmin() {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/admin/me'), {
          method: 'GET',
          credentials: 'include',
        });

        if (cancelled) return;

        if (res.status === 200) {
          const json = (await res.json()) as AdminMe;
          setAdmin(json);
          setLoading(false);
          return;
        }

        if (res.status === 401) {
          setLocation('/login');
          return;
        }

        if (res.status === 403) {
          setLocation('/studio');
          return;
        }

        // Unexpected responses: fail closed to /studio.
        setLocation('/studio');
      } catch {
        setLocation('/studio');
      }
    }

    void verifyAdmin();

    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Authenticating…</p>
        </div>
      </div>
    );
  }

  // Should never render for non-admin users because /api/admin/me is the gate.
  if (!admin) {
    return null;
  }

  return (
    <AppShell>
      <EditorialPageHeader
        id="admin-page-header"
        companion="Admin"
        supporting="StudioLayer Admin"
        tagline="Operations & Control Center"
      />

      <div className="mt-10 space-y-4">
        <AdminSystemHealth />
        <AdminGenerations />
        <AdminCustomersStudioCredits />
        <AdminStudioCredits />
        <AdminProviderUsage />
        <AdminPromotions />
        <PlaceholderCard title="SUBSCRIPTIONS" />
        <PlaceholderCard title="ALERTS" />
        <PlaceholderCard title="AUDIT LOG" />
      </div>
    </AppShell>
  );
}

