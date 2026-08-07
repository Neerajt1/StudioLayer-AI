import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { AuthPageShell } from '@/components/layout/auth-page-shell';
import {
  AUTH_FORM_MAX_WIDTH,
  AuthFormHeader,
  AuthTextLink,
} from '@/components/auth/auth-editorial';
import type { LegalDocument } from '@/lib/legal-documents';
import { LEGAL_DRAFT_NOTICE } from '@/lib/legal-documents';
import { cn } from '@/lib/utils';

interface LegalDocumentPageProps {
  document: LegalDocument;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

function formatLegalDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function LegalDocumentPage({
  document,
  backHref = '/register',
  backLabel = 'Back to Create Studio',
  className,
}: LegalDocumentPageProps) {
  return (
    <AuthPageShell>
      <div className={cn('sl-legal-page w-full max-w-2xl px-4 py-16 sm:py-20', className)}>
        <div className={cn(AUTH_FORM_MAX_WIDTH, 'mx-auto max-w-none')}>
          <AuthFormHeader title={document.title} className="mb-6" />

          {document.isPublished ? (
            <dl className="sl-legal-version">
              {document.effectiveDate ? (
                <div>
                  <dt>Effective Date</dt>
                  <dd>{formatLegalDate(document.effectiveDate)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Last Updated</dt>
                <dd>{formatLegalDate(document.lastUpdated)}</dd>
              </div>
              {document.version ? (
                <div>
                  <dt>Version</dt>
                  <dd>{document.version}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <>
              <p className="sl-legal-meta">
                Last updated {formatLegalDate(document.lastUpdated)}
              </p>
              <aside className="sl-legal-draft-notice" role="note">
                {LEGAL_DRAFT_NOTICE}
              </aside>
            </>
          )}

          <article className="sl-legal-document">
            {document.intro.map((paragraph) => (
              <p key={paragraph} className="sl-legal-paragraph sl-legal-paragraph--intro">
                {paragraph}
              </p>
            ))}

            {document.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="sl-legal-section"
                aria-labelledby={`${section.id}-heading`}
              >
                <h3 id={`${section.id}-heading`} className="sl-legal-section-title">
                  {section.title}
                </h3>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="sl-legal-paragraph">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </article>

          <nav className="sl-legal-related" aria-label="Related legal documents">
            <LegalInlineLink href="/terms">Terms of Service</LegalInlineLink>
            <span aria-hidden className="sl-legal-related-separator">
              ·
            </span>
            <LegalInlineLink href="/privacy">Privacy Policy</LegalInlineLink>
            <span aria-hidden className="sl-legal-related-separator">
              ·
            </span>
            <LegalInlineLink href="/cookies">Cookie Policy</LegalInlineLink>
          </nav>

          <p className="mt-10 text-sm text-muted-foreground">
            <AuthTextLink href={backHref}>{backLabel}</AuthTextLink>
          </p>
        </div>
      </div>
    </AuthPageShell>
  );
}

function LegalInlineLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="sl-legal-inline-link">
      {children}
    </Link>
  );
}
