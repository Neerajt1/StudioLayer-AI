import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * Public entry — Studio Workspace is the landing experience for every visitor.
 * Auth is not required to view Workspace; protected actions gate in-page.
 */
export default function HomePage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/studio');
  }, [setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">
          Loading StudioLayer AI…
        </p>
      </div>
    </div>
  );
}
