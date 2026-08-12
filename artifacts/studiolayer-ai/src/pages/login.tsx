import { useState } from 'react';
import { useLogin } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AuthPageShell } from '@/components/layout/auth-page-shell';
import {
  AUTH_FORM_MAX_WIDTH,
  AUTH_FORM_STACK,
  AuthField,
  AuthFormHeader,
  AuthInput,
  AuthPasswordInput,
  AuthPageFrame,
  AuthSecondaryNav,
  AuthTextLink,
} from '@/components/auth/auth-editorial';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: () => {
          // TODO(dev-workaround): Remove full page reload once SelectedTalentProvider
          // synchronizes selectedTalentId correctly across logout/login without remount.
          const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
          window.location.assign(`${appBase}/studio`);
        },
        onError: () => {
          toast({
            title: "We couldn't complete your request.",
            description: 'Please try again in a few moments.',
          });
        },
      },
    );
  };

  return (
    <AuthPageShell>
      <AuthPageFrame>
        <div className={AUTH_FORM_MAX_WIDTH}>
          <AuthFormHeader title="Sign In" />

          <form onSubmit={handleSubmit} className={AUTH_FORM_STACK}>
            <AuthField id="email" label="Business Email">
              <AuthInput
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="creative@studio.com"
                required
                disabled={loginMutation.isPending}
                autoComplete="email"
                data-testid="input-email"
              />
            </AuthField>

            <AuthField id="password" label="Password">
              <AuthPasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loginMutation.isPending}
                autoComplete="current-password"
                data-testid="input-password"
                toggleTestId="toggle-password-visibility"
              />
            </AuthField>

            <div className="flex justify-end pt-1">
              <AuthTextLink href="/forgot-password" className="text-sm font-normal text-muted-foreground">
                Forgot Password?
              </AuthTextLink>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-none border-foreground bg-foreground text-background hover:bg-foreground/90"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <AuthSecondaryNav
            prompt="Don't have a Studio?"
            linkHref="/register"
            linkLabel="Create Studio"
            linkTestId="link-register"
          />
        </div>
      </AuthPageFrame>
    </AuthPageShell>
  );
}
