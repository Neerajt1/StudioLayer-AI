import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { TERMS_OF_SERVICE } from '@/content/legal';

export default function TermsPage() {
  return <LegalDocumentPage document={TERMS_OF_SERVICE} />;
}
