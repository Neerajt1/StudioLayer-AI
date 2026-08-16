// ---------------------------------------------------------------------------
// Gallery render version control — Original ↔ post-production within one slot
// ---------------------------------------------------------------------------

import { cn } from '@/lib/utils';
import type { GalleryRenderLineageVersion } from '@/lib/gallery-render-lineage';

interface GalleryRenderVersionControlProps {
  versions: GalleryRenderLineageVersion[];
  activeVersionId: string;
  disabled?: boolean;
  onSelect: (version: GalleryRenderLineageVersion) => void;
  className?: string;
}

export function GalleryRenderVersionControl({
  versions,
  activeVersionId,
  disabled = false,
  onSelect,
  className,
}: GalleryRenderVersionControlProps) {
  if (versions.length < 2) {
    return null;
  }

  return (
    <div
      className={cn('sl-gallery-lineage-control', className)}
      role="tablist"
      aria-label="Image version"
    >
      {versions.map((version) => {
        const isActive = version.id === activeVersionId;
        return (
          <button
            key={version.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            className={cn(
              'sl-gallery-lineage-option',
              isActive && 'is-active',
            )}
            onClick={() => onSelect(version)}
          >
            {version.label}
          </button>
        );
      })}
    </div>
  );
}
