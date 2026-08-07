// ---------------------------------------------------------------------------
// Auth editorial primitives — Login / Register presentation only
// ---------------------------------------------------------------------------

import type { ComponentProps, ReactNode } from 'react';
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

/** Auth shell brand block — canonical StudioLayer AI signature (Monogram → Name → Tagline). */
export function AuthBrandMark() {
  return (
    <>
      <BrandLogo variant="auth" format="svg" />
      <p className="sl-brand-name mt-5 text-[1.953125rem]">{BRAND_NAME}</p>
      <div className="mt-1 space-y-0">
        <p className="sl-tagline-primary text-[1.078125rem] leading-[1.28]">
          {BRAND_TAGLINE_PRIMARY}
        </p>
        <p className="sl-tagline-secondary text-[0.953125rem] leading-[1.28]">
          {BRAND_TAGLINE_SECONDARY}
        </p>
      </div>
    </>
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
