import { useEffect, useState } from 'react';

/** Matches Direct Shoot mobile presentation breakpoint in index.css. */
const DIRECT_SHOOT_MOBILE_MEDIA = '(max-width: 639px)';

export function useDirectShootMobilePresentation() {
  const [isMobilePresentation, setIsMobilePresentation] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(DIRECT_SHOOT_MOBILE_MEDIA).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(DIRECT_SHOOT_MOBILE_MEDIA);

    const sync = () => {
      setIsMobilePresentation(mediaQuery.matches);
    };

    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return isMobilePresentation;
}
