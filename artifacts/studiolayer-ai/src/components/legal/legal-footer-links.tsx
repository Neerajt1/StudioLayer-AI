import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import { LEGAL_DOCUMENT_PATHS } from '@/lib/legal-documents';

interface LegalFooterLinksProps {
  className?: string;
}

export function LegalFooterLinks({ className }: LegalFooterLinksProps) {
  return (
    <nav
      className={cn('sl-legal-footer-links', className)}
      aria-label="Legal documents"
    >
      <Link href={LEGAL_DOCUMENT_PATHS.terms} className="sl-legal-footer-link">
        Terms of Service
      </Link>
      <span aria-hidden className="sl-legal-footer-separator">
        ·
      </span>
      <Link href={LEGAL_DOCUMENT_PATHS.privacy} className="sl-legal-footer-link">
        Privacy Policy
      </Link>
      <span aria-hidden className="sl-legal-footer-separator">
        ·
      </span>
      <Link href={LEGAL_DOCUMENT_PATHS.cookies} className="sl-legal-footer-link">
        Cookies
      </Link>
    </nav>
  );
}
