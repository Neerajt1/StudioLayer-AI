import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const PRIMARY_BATCH_PREVIEW_COUNT = 4;

interface ExpandableImageBatchProps {
  totalCount: number;
  primaryClassName?: string;
  expandedClassName?: string;
  renderPrimary: (indices: number[]) => ReactNode;
  renderExpanded: (indices: number[]) => ReactNode;
  expandLabel?: (remainingCount: number) => string;
}

export function ExpandableImageBatch({
  totalCount,
  primaryClassName,
  expandedClassName,
  renderPrimary,
  renderExpanded,
  expandLabel = (remaining) => `View ${remaining} more`,
}: ExpandableImageBatchProps) {
  const [expanded, setExpanded] = useState(false);
  const showExpand = totalCount > PRIMARY_BATCH_PREVIEW_COUNT;
  const primaryIndices = Array.from(
    { length: Math.min(totalCount, PRIMARY_BATCH_PREVIEW_COUNT) },
    (_, index) => index,
  );
  const expandedIndices = showExpand
    ? Array.from(
        { length: totalCount - PRIMARY_BATCH_PREVIEW_COUNT },
        (_, index) => index + PRIMARY_BATCH_PREVIEW_COUNT,
      )
    : [];

  return (
    <div className="sl-expandable-image-batch">
      <div className={cn('sl-expandable-image-batch-primary', primaryClassName)}>
        {renderPrimary(primaryIndices)}
      </div>

      {showExpand && (
        <div className="sl-expandable-image-batch-expand-wrap">
          <button
            type="button"
            className={cn(
              'sl-expandable-image-batch-toggle',
              expanded && 'sl-expandable-image-batch-toggle--open',
            )}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown className="size-3.5" aria-hidden />
            {expanded ? 'View less' : expandLabel(expandedIndices.length)}
          </button>

          {expanded && (
            <div className={cn('sl-expandable-image-batch-expanded', expandedClassName)}>
              {renderExpanded(expandedIndices)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
