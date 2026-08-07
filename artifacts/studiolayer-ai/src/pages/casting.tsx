import { useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppShell } from '@/components/layout/app-shell';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import { CastingStudio } from '@/components/studio/talent/casting-studio';
import { isProductionModel } from '@/components/studio/talent/types';
import { useGetIdentities } from '@workspace/api-client-react';
import {
  consumeCastingScrollToHeader,
  scrollToCastingPageHeader,
} from '@/lib/casting-navigation';

export default function CastingPage() {
  const [location] = useLocation();
  const { data: identities = [] } = useGetIdentities();

  useEffect(() => {
    if (!consumeCastingScrollToHeader()) return;
    scrollToCastingPageHeader();
  }, [location]);

  const talentCount = useMemo(
    () => (identities as { id: string }[]).filter((m) => isProductionModel(m.id)).length,
    [identities],
  );

  return (
    <AppShell
      footer
      breakout={<CastingStudio identities={identities as never} />}
    >
      <EditorialPageHeader
        id="casting-page-header"
        companion="Talent"
        supporting={`${talentCount} Editorial Talents`}
        tagline="Built for Fashion Campaigns"
      />
    </AppShell>
  );
}
