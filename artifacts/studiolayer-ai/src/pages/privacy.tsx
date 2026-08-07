import { LegalDocumentPage } from '@/components/legal/legal-document-page';
import { PRIVACY_POLICY } from '@/content/legal';

export default function PrivacyPage() {
  return <LegalDocumentPage document={PRIVACY_POLICY} />;
}
