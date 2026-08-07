import type { LegalDocument, LegalDocumentSlug } from '@/lib/legal-documents';
import { COOKIE_POLICY } from '@/content/legal/cookie-policy';
import { PRIVACY_POLICY } from '@/content/legal/privacy-policy';
import { TERMS_OF_SERVICE } from '@/content/legal/terms-of-service';

export const LEGAL_DOCUMENTS: Record<LegalDocumentSlug, LegalDocument> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
  cookies: COOKIE_POLICY,
};

export const LEGAL_DOCUMENT_LIST: readonly LegalDocument[] = [
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  COOKIE_POLICY,
];

export function getLegalDocumentByPath(path: string): LegalDocument | undefined {
  return LEGAL_DOCUMENT_LIST.find((document) => document.path === path);
}

export { COOKIE_POLICY, PRIVACY_POLICY, TERMS_OF_SERVICE };
