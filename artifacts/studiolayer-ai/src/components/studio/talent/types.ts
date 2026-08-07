// ---------------------------------------------------------------------------
// StudioLayer AI — Talent Library types (PDS-001)
// ---------------------------------------------------------------------------

export interface ModelIdentity {
  id: string;
  displayName: string;
  imageUrl: string;
  ethnicity: string;
  gender?: 'womens' | 'mens' | 'kids';
}

export type GenderCollection = 'womens' | 'mens' | 'kids';

export interface TalentCollectionConfig {
  key: GenderCollection;
  title: string;
  subtitle: string;
}

export const TALENT_COLLECTIONS: TalentCollectionConfig[] = [
  {
    key: 'womens',
    title: 'Women',
    subtitle: 'Premium female talent curated for fashion campaigns.',
  },
  {
    key: 'mens',
    title: 'Men',
    subtitle: 'Premium male talent curated for fashion campaigns.',
  },
  {
    key: 'kids',
    title: 'Kids',
    subtitle: 'Premium youth talent curated for fashion campaigns.',
  },
];

/** Hide internal Gen2 benchmark identities from the customer-facing gallery. */
export function isProductionModel(id: string): boolean {
  return !id.includes('TEST');
}
