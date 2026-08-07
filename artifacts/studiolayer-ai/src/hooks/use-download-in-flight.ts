import { useCallback, useEffect, useRef, useState } from 'react';

/** Guards duplicate download requests and tracks elapsed preparation time. */
export function useDownloadInFlight() {
  const [inFlight, setInFlight] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setInFlight(true);
    setElapsedSec(0);

    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    try {
      await action();
    } finally {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      inFlightRef.current = false;
      setInFlight(false);
      setElapsedSec(0);
    }
  }, []);

  return { inFlight, elapsedSec, run };
}
