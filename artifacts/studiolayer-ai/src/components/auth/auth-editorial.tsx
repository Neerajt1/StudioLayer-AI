// ---------------------------------------------------------------------------
// Auth editorial primitives — Login / Register presentation only
// ---------------------------------------------------------------------------

import { useState, type ComponentProps, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link } from 'wouter';
import { BrandLogo } from '@/components/brand/BrandLogo';
import {
  BRAND_NAME,
  BRAND_TAGLINE_PRIMARY,
  BRAND_TAGLINE_SECONDARY,
} from '@/components/design-system/brand-tokens';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const AUTH_FORM_MAX_WIDTH = 'w-full max-w-sm';

/** Vertical rhythm between form field groups (+8px vs prior space-y-8). */
export const AUTH_FORM_STACK = 'space-y-10';

interface AuthBrandMarkProps {
  variant?: 'default' | 'stacked';
}

/** Auth shell brand block — canonical StudioLayer AI signature (Monogram → Name → Tagline). */
export function AuthBrandMark({ variant = 'default' }: AuthBrandMarkProps) {
  return (
    <div className={cn(variant === 'stacked' && 'sl-auth-brand-mark--stacked text-center')}>
      <BrandLogo variant="auth" format="svg" className={variant === 'stacked' ? 'mx-auto' : undefined} />
      <p
        className={cn(
          'sl-brand-name mt-5 text-[1.953125rem]',
          variant === 'stacked' && 'sl-auth-brand-mark-name--stacked',
        )}
      >
        {BRAND_NAME}
      </p>
      <div className="mt-1 space-y-0">
        <p
          className={cn(
            'sl-tagline-primary text-[1.078125rem] leading-[1.28]',
            variant === 'stacked' && 'sl-auth-brand-mark-tagline--stacked',
          )}
        >
          {BRAND_TAGLINE_PRIMARY}
        </p>
        <p
          className={cn(
            'sl-tagline-secondary text-[0.953125rem] leading-[1.28]',
            variant === 'stacked' && 'sl-auth-brand-mark-tagline--stacked',
          )}
        >
          {BRAND_TAGLINE_SECONDARY}
        </p>
      </div>
    </div>
  );
}

interface AuthPageFrameProps {
  children: ReactNode;
}

/** Login / Register breathing room — form offset, scroll affordance, brand separation. */
export function AuthPageFrame({ children }: AuthPageFrameProps) {
  return (
    <div className="flex w-full min-h-[calc(100svh+3rem)] flex-col items-center justify-center pt-10 pb-20">
      {children}
    </div>
  );
}

export const authInputClassName =
  'h-11 rounded-none border-0 border-b border-border bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:border-[#6E896A] focus-visible:outline-none';

export const authLabelClassName = 'text-[13px] font-medium tracking-wide text-[#2D2D2D]';

interface AuthFormHeaderProps {
  title: string;
  className?: string;
}

export function AuthFormHeader({ title, className }: AuthFormHeaderProps) {
  return (
    <h2 className={cn('sl-page-subheading mb-10 text-[1.25rem]', className)}>
      {title}
    </h2>
  );
}

interface AuthFieldProps {
  id: string;
  label: string;
  hint?: string;
  hintTone?: 'muted' | 'valid' | 'error';
  children: ReactNode;
}

export function AuthField({ id, label, hint, hintTone = 'muted', children }: AuthFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={authLabelClassName}>
        {label}
      </Label>
      {children}
      {hint ? (
        <p
          className={cn(
            'text-xs leading-relaxed',
            hintTone === 'valid' && 'text-[#2D2D2D]',
            hintTone === 'error' && 'text-destructive',
            hintTone === 'muted' && 'text-muted-foreground',
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function AuthInput(props: ComponentProps<typeof Input>) {
  return <Input className={cn(authInputClassName, props.className)} {...props} />;
}

interface AuthPasswordInputProps extends Omit<ComponentProps<typeof Input>, 'type'> {
  toggleTestId?: string;
}

export function AuthPasswordInput({
  className,
  disabled,
  toggleTestId,
  ...props
}: AuthPasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn(authInputClassName, 'pr-10', className)}
      />
      <button
        type="button"
        className="absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center justify-center p-1 text-muted-foreground transition-colors hover:text-[#2D2D2D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E896A] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        data-testid={toggleTestId}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

interface AuthLegalFooterProps {
  className?: string;
}

export function AuthLegalFooter({ className }: AuthLegalFooterProps) {
  return (
    <p className={cn('text-center text-[11px] leading-relaxed text-muted-foreground/80', className)}>
      By creating your Studio, you agree to the{' '}
      <Link href="/terms" className="text-muted-foreground hover:text-[#2D2D2D]">
        Terms of Service
      </Link>{' '}
      and{' '}
      <Link href="/privacy" className="text-muted-foreground hover:text-[#2D2D2D]">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

interface AuthTextLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function AuthTextLink({ href, children, className, ...props }: AuthTextLinkProps) {
  return (
    <Link
      href={href}
      className={cn('text-[#6E896A] hover:text-[#5A7356] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E896A] focus-visible:ring-offset-2', className)}
      {...props}
    >
      {children}
    </Link>
  );
}

interface AuthSecondaryNavProps {
  prompt: string;
  linkHref: string;
  linkLabel: string;
  linkTestId?: string;
}

export function AuthSecondaryNav({
  prompt,
  linkHref,
  linkLabel,
  linkTestId,
}: AuthSecondaryNavProps) {
  return (
    <div className="mt-12 space-y-1 text-center">
      <p className="text-sm text-muted-foreground">{prompt}</p>
      <AuthTextLink href={linkHref} data-testid={linkTestId}>
        {linkLabel}
      </AuthTextLink>
    </div>
  );
}
