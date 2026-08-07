import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatGenerationElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
}

export function GenerationProgressIndicator({
  label,
  hint,
  elapsedSec,
  compact = false,
}: {
  label: string;
  hint?: string;
  elapsedSec: number;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'gap-2 p-4' : 'gap-4 p-8')}>
      <div className={cn('relative', compact ? 'h-8 w-8' : 'h-14 w-14')}>
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-t-foreground border-r-transparent border-b-transparent border-l-transparent" />
        {!compact && (
          <Sparkles className="absolute inset-0 m-auto h-5 w-5 animate-pulse text-muted-foreground" />
        )}
      </div>
      <div>
        <p className={cn('font-medium text-foreground', compact ? 'text-[10px]' : 'text-sm')}>{label}</p>
        <p className={cn('mt-1 font-mono text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>
          {formatGenerationElapsed(elapsedSec)}
          {hint ? ` · ${hint}` : ''}
        </p>
      </div>
    </div>
  );
}
