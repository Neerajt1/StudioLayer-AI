import { useCallback, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { WelcomeScreen } from '@/components/welcome/welcome-screen';
import {
  hasEnteredStudioWelcome,
  isStudioWelcomeRoute,
  shouldShowStudioWelcome,
} from '@/lib/studio-welcome';

/**
 * Browser-session welcome gate above Studio entry routes.
 *
 * - No auth / login / logout coupling
 * - sessionStorage is authoritative for the browser session
 * - In-memory mirror keeps the overlay dismissed immediately after Enter Studio
 *   without remounting the router tree
 */
export function WelcomeGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [enteredThisSession, setEnteredThisSession] = useState(() =>
    hasEnteredStudioWelcome(),
  );

  const handleDismissed = useCallback(() => {
    // sessionStorage is set inside WelcomeScreen on click; mirror here for render.
    setEnteredThisSession(true);
  }, []);

  const showOverlay =
    isStudioWelcomeRoute(location)
    && !enteredThisSession
    && shouldShowStudioWelcome();

  return (
    <>
      {children}
      {showOverlay ? <WelcomeScreen onDismissed={handleDismissed} /> : null}
    </>
  );
}
