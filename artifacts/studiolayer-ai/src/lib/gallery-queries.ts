import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { getListRendersQueryOptions } from '@workspace/api-client-react';

/** Shared cache window for gallery render list. */
export const GALLERY_QUERY_STALE_MS = 30_000;

/** Usage stats can be reused longer; mutations invalidate this query. */
export const GALLERY_USAGE_QUERY_STALE_MS = 60_000;

/** Keep gallery data in memory across navigations within a session. */
export const GALLERY_QUERY_GC_MS = 5 * 60_000;

/** React Query options shared by gallery list hook and prefetch. */
export const galleryQueryOptions = {
  staleTime: GALLERY_QUERY_STALE_MS,
  gcTime: GALLERY_QUERY_GC_MS,
  placeholderData: keepPreviousData,
} as const;

/** React Query options for Gallery billing-cycle stats — same payload, longer reuse. */
export const galleryUsageQueryOptions = {
  staleTime: GALLERY_USAGE_QUERY_STALE_MS,
  gcTime: GALLERY_QUERY_GC_MS,
  placeholderData: keepPreviousData,
} as const;

/** Prefetch the Gallery grid only — usage stats load after the list paints. */
export function prefetchGalleryQueries(queryClient: QueryClient): void {
  void queryClient.prefetchQuery(
    getListRendersQueryOptions({ query: galleryQueryOptions as never }),
  );
}
