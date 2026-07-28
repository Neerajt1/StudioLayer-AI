import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading, error } = useGetMe();

  useEffect(() => {
    if (!isLoading) {
      if (user && !error) {
        setLocation('/studio');
      } else {
        setLocation('/login');
      }
    }
  }, [isLoading, user, error, setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground font-mono">
          Loading StudioLayer AI...
        </p>
      </div>
    </div>
  );
}
