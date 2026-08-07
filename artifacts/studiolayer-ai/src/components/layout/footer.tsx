import { LegalFooterLinks } from '@/components/legal/legal-footer-links';
import { StudioContactFooterLink } from '@/components/layout/studio-contact-footer-link';

export function Footer() {
  return (
    <footer className="sl-footer">
      <div className="sl-footer-inner">
        <LegalFooterLinks />
        <StudioContactFooterLink />
        <p className="sl-footer-copy">
          © 2026 StudioLayer AI. All rights reserved. A product of 29Copper Media Works.
        </p>
      </div>
    </footer>
  );
}
