import { useMemo, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppShell } from '@/components/layout/app-shell';
import { EditorialPageHeader } from '@/components/design-system/editorial-page-header';
import { CastingStudio } from '@/components/studio/talent/casting-studio';
import { buildPublicTalentPreviewIdentities } from '@/components/studio/talent/public-talent-preview';
import { isProductionModel } from '@/components/studio/talent/types';
import type { ModelIdentity } from '@/components/studio/talent/types';
import { useGetIdentities, useGetMe } from '@workspace/api-client-react';
import {
  consumeCastingScrollToHeader,
  scrollToCastingPageHeader,
} from '@/lib/casting-navigation';

export default function CastingPage() {
  const [location] = useLocation();
  const { isSuccess: isAuthenticated } = useGetMe();
  const { data: identitiesFromApi = [] } = useGetIdentities({
    query: { enabled: isAuthenticated },
  } as never);

  useEffect(() => {
    if (!consumeCastingScrollToHeader()) return;
    scrollToCastingPageHeader();
  }, [location]);

  const identities = useMemo((): ModelIdentity[] => {
    if (isAuthenticated) {
      return identitiesFromApi as ModelIdentity[];
    }
    // Visitors browse public static identity portraits — no identities API call.
    return buildPublicTalentPreviewIdentities();
  }, [isAuthenticated, identitiesFromApi]);

  const talentCount = useMemo(
    () => identities.filter((m) => isProductionModel(m.id)).length,
    [identities],
  );

  return (
    <AppShell
      footer
      breakout={<CastingStudio identities={identities} />}
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
