import { Link } from 'wouter';
import { AuthPageShell } from '@/components/layout/auth-page-shell';
import {
  AUTH_FORM_MAX_WIDTH,
  AuthFormHeader,
  AuthTextLink,
} from '@/components/auth/auth-editorial';
import { LEGAL_DOCUMENT_LIST } from '@/content/legal';
import { LEGAL_DRAFT_NOTICE } from '@/lib/legal-documents';

export default function LegalIndexPage() {
  return (
    <AuthPageShell>
      <div className="sl-legal-page w-full max-w-2xl px-4 py-16 sm:py-20">
        <div className={AUTH_FORM_MAX_WIDTH}>
          <AuthFormHeader title="Legal" className="mb-6" />

          <aside className="sl-legal-draft-notice" role="note">
            {LEGAL_DRAFT_NOTICE}
          </aside>

          <ul className="sl-legal-index">
            {LEGAL_DOCUMENT_LIST.map((document) => (
              <li key={document.slug}>
                <Link href={document.path} className="sl-legal-index-link">
                  <span className="sl-legal-index-title">{document.title}</span>
                  <span className="sl-legal-index-description">{document.description}</span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-10 text-sm text-muted-foreground">
            <AuthTextLink href="/register">Back to Create Studio</AuthTextLink>
          </p>
        </div>
      </div>
    </AuthPageShell>
  );
}
