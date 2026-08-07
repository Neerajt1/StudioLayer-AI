import { AuthPageShell } from '@/components/layout/auth-page-shell';
import {
  AUTH_FORM_MAX_WIDTH,
  AuthFormHeader,
  AuthSecondaryNav,
} from '@/components/auth/auth-editorial';

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell>
      <div className={AUTH_FORM_MAX_WIDTH}>
        <AuthFormHeader title="Forgot Password" />

        <p className="mb-10 text-sm leading-relaxed text-muted-foreground">
          Password reset is not available through the app at this time. Contact{' '}
          <a
            href="mailto:info@studiolayerai.com"
            className="text-foreground underline underline-offset-2"
          >
            info@studiolayerai.com
          </a>{' '}
          for assistance.
        </p>

        <AuthSecondaryNav
          prompt="Remember your password?"
          linkHref="/login"
          linkLabel="Sign In"
          linkTestId="link-login"
        />
      </div>
    </AuthPageShell>
  );
}
