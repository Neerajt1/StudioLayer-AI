import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GalleryPaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function GalleryPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: GalleryPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav className="sl-gallery-pagination" aria-label="Gallery pages">
      <p className="sl-gallery-pagination-summary">
        Showing {first}–{last} of {totalCount}
      </p>

      <div className="sl-gallery-pagination-controls">
        <button
          type="button"
          className="sl-gallery-pagination-arrow"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden />
        </button>

        {pages.map((value) => (
          <button
            key={value}
            type="button"
            className={cn(
              'sl-gallery-pagination-page',
              value === page && 'is-current',
            )}
            onClick={() => onPageChange(value)}
            aria-label={`Page ${value}`}
            aria-current={value === page ? 'page' : undefined}
          >
            {value}
          </button>
        ))}

        <button
          type="button"
          className="sl-gallery-pagination-arrow"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight aria-hidden />
        </button>
      </div>
    </nav>
  );
}
