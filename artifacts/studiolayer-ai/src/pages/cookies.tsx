import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { COOKIE_POLICY } from '@/content/legal';

export default function CookiePolicyPage() {
  return (
    <LegalDocumentPage
      document={COOKIE_POLICY}
      backHref="/legal"
      backLabel="Back to Legal"
    />
  );
}
