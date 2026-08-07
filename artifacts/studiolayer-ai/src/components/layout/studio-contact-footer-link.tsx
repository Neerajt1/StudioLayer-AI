import { STUDIO_CONTACT_MAILTO } from '@/lib/studio-contact';
import { cn } from '@/lib/utils';

interface StudioContactFooterLinkProps {
  className?: string;
}

export function StudioContactFooterLink({ className }: StudioContactFooterLinkProps) {
  return (
    <a href={STUDIO_CONTACT_MAILTO} className={cn('sl-footer-contact', className)}>
      We&apos;re always listening
    </a>
  );
}
