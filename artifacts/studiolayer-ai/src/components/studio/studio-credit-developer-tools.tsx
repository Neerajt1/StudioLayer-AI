import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import type { useDevStudioCreditSimulator } from '@/lib/dev-studio-credit-display';

type DevStudioCreditSimulator = ReturnType<typeof useDevStudioCreditSimulator>;

interface StudioCreditDeveloperToolsProps {
  simulator: DevStudioCreditSimulator;
  className?: string;
}

/** Development-only Studio Credit simulator — excluded from production builds. */
export function StudioCreditDeveloperTools({
  simulator,
  className,
}: StudioCreditDeveloperToolsProps) {
  if (!import.meta.env.DEV || !simulator.isDeveloper) return null;

  const [expanded, setExpanded] = useState(false);
  const [draftValue, setDraftValue] = useState(String(simulator.simulatedBalance));

  useEffect(() => {
    setDraftValue(String(simulator.simulatedBalance));
  }, [simulator.simulatedBalance]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(draftValue);
    if (!Number.isFinite(parsed)) return;
    simulator.applySimulatedBalance(parsed);
  };

  return (
    <div className={cn('sl-developer-tools', className)}>
      <button
        type="button"
        className="sl-developer-tools-toggle"
        aria-expanded={expanded}
        aria-controls="studio-credit-developer-tools-panel"
        onClick={() => setExpanded((open) => !open)}
      >
        <span>Developer Tools</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'sl-developer-tools-chevron',
            expanded && 'sl-developer-tools-chevron--open',
          )}
        />
      </button>

      {expanded && (
        <div
          id="studio-credit-developer-tools-panel"
          className="sl-developer-tools-panel"
          role="region"
          aria-label="Studio Credit developer simulator"
        >
          <div className="sl-developer-tools-row sl-developer-tools-row--demo">
            <label className="sl-developer-tools-label" htmlFor="dev-credit-demo-mode">
              Demo Mode
            </label>
            <Switch
              id="dev-credit-demo-mode"
              checked={simulator.demoMode}
              onCheckedChange={simulator.setDemoMode}
            />
          </div>

          <dl className="sl-developer-tools-stats">
            <div>
              <dt>Server</dt>
              <dd>{simulator.serverRemaining}</dd>
            </div>
            <div>
              <dt>Simulated</dt>
              <dd>{simulator.simulatedBalance}</dd>
            </div>
            <div>
              <dt>Display</dt>
              <dd>{simulator.displayRemaining}</dd>
            </div>
          </dl>

          <form className="sl-developer-tools-form" onSubmit={handleSubmit}>
            <label className="sl-developer-tools-label" htmlFor="dev-credit-balance">
              Studio Credits
            </label>
            <div className="sl-developer-tools-row">
              <input
                id="dev-credit-balance"
                className="sl-developer-tools-input"
                type="number"
                min={0}
                max={999}
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
              />
              <button type="submit" className="sl-developer-tools-button">
                Apply
              </button>
            </div>
          </form>

          <div className="sl-developer-tools-actions">
            <button
              type="button"
              className="sl-developer-tools-button"
              onClick={() => simulator.adjustBy(1)}
            >
              +1
            </button>
            <button
              type="button"
              className="sl-developer-tools-button"
              onClick={() => simulator.adjustBy(5)}
            >
              +5
            </button>
            <button
              type="button"
              className="sl-developer-tools-button"
              onClick={() => simulator.adjustBy(10)}
            >
              +10
            </button>
            <button
              type="button"
              className="sl-developer-tools-button"
              onClick={() => simulator.adjustBy(-1)}
            >
              −1
            </button>
            <button
              type="button"
              className="sl-developer-tools-button sl-developer-tools-button--wide"
              onClick={simulator.resetToServer}
            >
              Reset to Server Value
            </button>
          </div>

          <p className="sl-developer-tools-hint">
            Display-only simulator. Billing, API, and ledger remain unchanged.
          </p>
        </div>
      )}
    </div>
  );
}
