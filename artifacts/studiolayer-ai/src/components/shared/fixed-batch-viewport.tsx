import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Primary visible cells in the fixed 2×2 generation/gallery viewport. */
export const FIXED_BATCH_VIEWPORT_CAPACITY = 4;

interface FixedBatchViewportProps {
  totalCount: number;
  className?: string;
  gridClassName?: string;
  renderCell: (index: number) => ReactNode;
}

/**
 * Fixed-height image viewport for Studio generation and Gallery shoot detail.
 * Shows up to four images in a 2×2 grid; additional images scroll inside the viewport.
 */
export function FixedBatchViewport({
  totalCount,
  className,
  gridClassName,
  renderCell,
}: FixedBatchViewportProps) {
  const scrollable = totalCount > FIXED_BATCH_VIEWPORT_CAPACITY;

  return (
    <div
      className={cn(
        'sl-fixed-batch-viewport',
        scrollable && 'sl-fixed-batch-viewport--scrollable',
        className,
      )}
    >
      <div className={cn('sl-fixed-batch-viewport-grid', gridClassName)}>
        {Array.from({ length: totalCount }, (_, index) => renderCell(index))}
      </div>
    </div>
  );
}
