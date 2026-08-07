/** Shared preparing label for every download action — includes elapsed timer. */
export function formatDownloadPreparingLabel(elapsedSec: number): string {
  if (elapsedSec <= 0) return 'Preparing…';

  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const elapsed = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
  return `Preparing… ${elapsed}`;
}
