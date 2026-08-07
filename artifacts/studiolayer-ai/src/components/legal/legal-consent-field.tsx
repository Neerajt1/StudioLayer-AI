import { Link } from 'wouter';
import { Checkbox } from '@/components/ui/checkbox';
import { LEGAL_DOCUMENT_PATHS } from '@/lib/legal-documents';
import { cn } from '@/lib/utils';

interface LegalConsentFieldProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function LegalConsentField({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  id = 'legal-consent',
}: LegalConsentFieldProps) {
  return (
    <div className={cn('sl-legal-consent', className)}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="sl-legal-consent-checkbox mt-0.5"
        data-testid="checkbox-legal-consent"
      />
      <label htmlFor={id} className="sl-legal-consent-label">
        I agree to the{' '}
        <Link href={LEGAL_DOCUMENT_PATHS.terms} className="sl-legal-consent-link">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href={LEGAL_DOCUMENT_PATHS.privacy} className="sl-legal-consent-link">
          Privacy Policy
        </Link>
        .
      </label>
    </div>
  );
}
