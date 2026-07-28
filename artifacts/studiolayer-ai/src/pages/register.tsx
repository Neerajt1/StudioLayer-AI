import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useRegister } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const registerMutation = useRegister();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(
      { data: { name, email, password } },
      {
        onSuccess: () => {
          setLocation('/studio');
        },
        onError: (error: any) => {
          toast({
            title: 'Registration failed',
            description: error?.error || 'Could not create account',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
            StudioLayer AI
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Professional Editorial Render Engine
          </p>
        </div>

        <div className="border border-border rounded bg-card p-8">
          <h2 className="text-xl font-semibold mb-6 text-foreground">
            Create Account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                required
                disabled={registerMutation.isPending}
                className="font-mono text-sm"
                data-testid="input-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="creative@studio.com"
                required
                disabled={registerMutation.isPending}
                className="font-mono text-sm"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={registerMutation.isPending}
                className="font-mono text-sm"
                data-testid="input-password"
              />
              <p className="text-xs text-muted-foreground font-mono">
                Minimum 8 characters
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={registerMutation.isPending}
              data-testid="button-register"
            >
              {registerMutation.isPending ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-accent hover:underline font-medium"
                data-testid="link-login"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
