import { useCallback, useEffect, useState } from 'react';

const DEV_DEMO_MODE_KEY = 'studiolayer:dev-credit-demo-mode';
const DEV_SIMULATED_BALANCE_KEY = 'studiolayer:dev-credit-simulated';
export const DEV_STUDIO_CREDIT_DEVELOPER_EMAIL = 'neerajtri19@gmail.com';

function isDevelopmentEnvironment(): boolean {
  return import.meta.env.DEV;
}

export function isDevStudioCreditDeveloper(
  user?: { email?: string | null } | null,
): boolean {
  return (
    isDevelopmentEnvironment() &&
    user?.email === DEV_STUDIO_CREDIT_DEVELOPER_EMAIL
  );
}

/** @deprecated Use isDevStudioCreditDeveloper */
export const isDevStudioCreditTester = isDevStudioCreditDeveloper;

/** @deprecated Use DEV_STUDIO_CREDIT_DEVELOPER_EMAIL */
export const DEV_STUDIO_CREDIT_TESTER_EMAIL = DEV_STUDIO_CREDIT_DEVELOPER_EMAIL;

function clampBalance(value: number): number {
  return Math.min(999, Math.max(0, Math.floor(value)));
}

function readDemoMode(): boolean {
  if (!isDevelopmentEnvironment()) return false;
  try {
    return sessionStorage.getItem(DEV_DEMO_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDemoMode(enabled: boolean): void {
  if (!isDevelopmentEnvironment()) return;
  try {
    if (enabled) {
      sessionStorage.setItem(DEV_DEMO_MODE_KEY, '1');
    } else {
      sessionStorage.removeItem(DEV_DEMO_MODE_KEY);
    }
  } catch {
    // Storage unavailable — demo mode remains in-memory only.
  }
}

function readSimulatedBalance(fallback: number): number {
  if (!isDevelopmentEnvironment()) return fallback;
  try {
    const raw = sessionStorage.getItem(DEV_SIMULATED_BALANCE_KEY);
    if (raw == null || raw === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return clampBalance(parsed);
  } catch {
    return fallback;
  }
}

function writeSimulatedBalance(value: number): void {
  if (!isDevelopmentEnvironment()) return;
  try {
    sessionStorage.setItem(DEV_SIMULATED_BALANCE_KEY, String(clampBalance(value)));
  } catch {
    // Storage unavailable — simulated balance remains in-memory only.
  }
}

export function useDevStudioCreditSimulator(
  serverRemaining: number,
  user?: { email?: string | null } | null,
) {
  const isDeveloper = isDevStudioCreditDeveloper(user);
  const normalizedServerRemaining = clampBalance(serverRemaining);

  const [demoMode, setDemoModeState] = useState(
    () => isDeveloper && readDemoMode(),
  );
  const [simulatedBalance, setSimulatedBalanceState] = useState(() =>
    isDeveloper
      ? readSimulatedBalance(normalizedServerRemaining)
      : normalizedServerRemaining,
  );

  useEffect(() => {
    if (!isDeveloper || demoMode) return;
    setSimulatedBalanceState(normalizedServerRemaining);
  }, [isDeveloper, demoMode, normalizedServerRemaining]);

  const setDemoMode = useCallback(
    (enabled: boolean) => {
      if (!isDeveloper) return;
      writeDemoMode(enabled);
      setDemoModeState(enabled);
      if (enabled) {
        const next = clampBalance(simulatedBalance);
        setSimulatedBalanceState(next);
        writeSimulatedBalance(next);
      }
    },
    [isDeveloper, simulatedBalance],
  );

  const applySimulatedBalance = useCallback(
    (value: number) => {
      if (!isDeveloper) return;
      const next = clampBalance(value);
      setSimulatedBalanceState(next);
      writeSimulatedBalance(next);
      if (!demoMode) {
        writeDemoMode(true);
        setDemoModeState(true);
      }
    },
    [isDeveloper, demoMode],
  );

  const adjustBy = useCallback(
    (delta: number) => {
      if (!isDeveloper) return;
      const base = demoMode ? simulatedBalance : normalizedServerRemaining;
      const next = clampBalance(base + delta);
      setSimulatedBalanceState(next);
      writeSimulatedBalance(next);
      if (!demoMode) {
        writeDemoMode(true);
        setDemoModeState(true);
      }
    },
    [isDeveloper, demoMode, simulatedBalance, normalizedServerRemaining],
  );

  const resetToServer = useCallback(() => {
    if (!isDeveloper) return;
    writeDemoMode(false);
    setDemoModeState(false);
    setSimulatedBalanceState(normalizedServerRemaining);
    writeSimulatedBalance(normalizedServerRemaining);
  }, [isDeveloper, normalizedServerRemaining]);

  const displayRemaining =
    isDeveloper && demoMode ? simulatedBalance : normalizedServerRemaining;

  return {
    isDeveloper,
    demoMode,
    setDemoMode,
    simulatedBalance,
    serverRemaining: normalizedServerRemaining,
    displayRemaining,
    applySimulatedBalance,
    adjustBy,
    resetToServer,
  };
}

/** @deprecated Use useDevStudioCreditSimulator */
export function useDevStudioCreditDisplay(
  serverRemaining: number,
  user?: { email?: string | null } | null,
) {
  const simulator = useDevStudioCreditSimulator(serverRemaining, user);
  return {
    isTester: simulator.isDeveloper,
    override: simulator.demoMode ? simulator.simulatedBalance : null,
    displayRemaining: simulator.displayRemaining,
    setOverride: (value: number | null) => {
      if (value == null) {
        simulator.resetToServer();
        return;
      }
      simulator.applySimulatedBalance(value);
    },
    decrementBy: (amount: number) => simulator.adjustBy(-amount),
    clearOverride: simulator.resetToServer,
  };
}
