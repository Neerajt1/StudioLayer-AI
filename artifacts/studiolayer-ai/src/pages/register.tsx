import { useState } from 'react';
import { useLocation } from 'wouter';
import { useRegister } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AuthPageShell } from '@/components/layout/auth-page-shell';
import { LegalConsentField } from '@/components/legal/legal-consent-field';
import {
  AUTH_FORM_MAX_WIDTH,
  AUTH_FORM_STACK,
  AuthField,
  AuthFormHeader,
  AuthInput,
  AuthPasswordInput,
  AuthPageFrame,
  AuthSecondaryNav,
} from '@/components/auth/auth-editorial';
import { registerErrorToast } from '@/lib/auth-error-messages';

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const registerMutation = useRegister();
  const { toast } = useToast();

  const passwordStarted = password.length > 0;
  const passwordValid = password.length >= 8;
  const confirmStarted = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;
  const confirmPasswordValid = confirmPassword.trim().length > 0 && passwordsMatch;
  const canSubmit =
    name.trim().length > 0
    && email.trim().length > 0
    && passwordValid
    && confirmPasswordValid
    && acceptedLegal
    && !registerMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordValid) {
      return;
    }

    if (!passwordsMatch) {
      toast({
        title: 'Please confirm your password.',
        description: 'Both entries must match.',
      });
      return;
    }

    if (!acceptedLegal) {
      toast({
        title: 'Please accept the Terms of Service.',
        description: 'You must agree before creating your Studio.',
      });
      return;
    }

    registerMutation.mutate(
      { data: { name, email, password } },
      {
        onSuccess: () => {
          setLocation('/studio');
        },
        onError: (error) => {
          const copy = registerErrorToast(error);
          toast({
            title: copy.title,
            description: copy.description,
          });
        },
      },
    );
  };

  return (
    <AuthPageShell>
      <AuthPageFrame>
        <div className={AUTH_FORM_MAX_WIDTH}>
          <AuthFormHeader title="Create Studio" />

          <form onSubmit={handleSubmit} className={AUTH_FORM_STACK}>
          <AuthField id="name" label="Full Name">
            <AuthInput
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Rivera"
              required
              disabled={registerMutation.isPending}
              autoComplete="name"
              data-testid="input-name"
            />
          </AuthField>

          <AuthField id="email" label="Business Email">
            <AuthInput
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="creative@studio.com"
              required
              disabled={registerMutation.isPending}
              autoComplete="email"
              data-testid="input-email"
            />
          </AuthField>

          <AuthField
            id="password"
            label="Password"
            hint={passwordStarted ? 'Minimum 8 characters' : undefined}
            hintTone={passwordStarted && passwordValid ? 'valid' : 'muted'}
          >
            <AuthPasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={registerMutation.isPending}
              autoComplete="new-password"
              data-testid="input-password"
              toggleTestId="toggle-password-visibility"
            />
          </AuthField>

          <AuthField
            id="confirmPassword"
            label="Confirm Password"
            hint={
              confirmStarted && !passwordsMatch
                ? 'Passwords must match'
                : undefined
            }
            hintTone={confirmStarted && !passwordsMatch ? 'error' : 'muted'}
          >
            <AuthPasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={registerMutation.isPending}
              autoComplete="new-password"
              data-testid="input-confirm-password"
              toggleTestId="toggle-confirm-password-visibility"
            />
          </AuthField>

          <div className="space-y-6 pt-2">
            <LegalConsentField
              checked={acceptedLegal}
              onCheckedChange={setAcceptedLegal}
              disabled={registerMutation.isPending}
            />

            <Button
              type="submit"
              className="h-11 w-full rounded-none border-foreground bg-foreground text-background hover:bg-foreground/90"
              disabled={!canSubmit}
              data-testid="button-register"
            >
              {registerMutation.isPending ? 'Creating Studio...' : 'Create Studio'}
            </Button>
          </div>
          </form>

          <AuthSecondaryNav
            prompt="Already have a Studio?"
            linkHref="/login"
            linkLabel="Sign In"
            linkTestId="link-login"
          />
        </div>
      </AuthPageFrame>
    </AuthPageShell>
  );
}
