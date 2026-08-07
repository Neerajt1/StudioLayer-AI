import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, error } = useGetMe();

  useEffect(() => {
    if (!isLoading && (error || !user)) {
      setLocation('/login');
    }
  }, [isLoading, error, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">
            Authenticating…
          </p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return null;
  }

  return <>{children}</>;
}
