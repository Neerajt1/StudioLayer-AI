// ---------------------------------------------------------------------------
// Legal documents — routing registry and shared types
// Draft content lives in content/legal/ and will be replaced after legal review.
// ---------------------------------------------------------------------------

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

export interface LegalDocument {
  slug: string;
  path: string;
  title: string;
  description: string;
  lastUpdated: string;
  effectiveDate?: string;
  version?: string;
  /** When true, renders published version metadata instead of the draft notice. */
  isPublished?: boolean;
  intro: readonly string[];
  sections: readonly LegalSection[];
}

export const LEGAL_DRAFT_NOTICE =
  'This document is provided as temporary placeholder content pending formal legal review. Final language will be published separately.';

export const LEGAL_DOCUMENT_PATHS = {
  terms: '/terms',
  privacy: '/privacy',
  cookies: '/cookies',
  legal: '/legal',
} as const;

export type LegalDocumentSlug = 'terms' | 'privacy' | 'cookies';

export const PUBLIC_LEGAL_ROUTES = new Set<string>([
  LEGAL_DOCUMENT_PATHS.terms,
  LEGAL_DOCUMENT_PATHS.privacy,
  LEGAL_DOCUMENT_PATHS.cookies,
  LEGAL_DOCUMENT_PATHS.legal,
]);

export function isPublicLegalRoute(path: string): boolean {
  return PUBLIC_LEGAL_ROUTES.has(path);
}
