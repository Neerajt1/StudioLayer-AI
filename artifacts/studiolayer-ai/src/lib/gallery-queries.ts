import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import {
  getGetRenderUsageQueryOptions,
  getListRendersQueryOptions,
} from '@workspace/api-client-react';

/** Shared cache window for gallery list + billing-cycle stats. */
export const GALLERY_QUERY_STALE_MS = 30_000;

/** Keep gallery data in memory across navigations within a session. */
export const GALLERY_QUERY_GC_MS = 5 * 60_000;

/** React Query options shared by gallery list + usage hooks and prefetch. */
export const galleryQueryOptions = {
  staleTime: GALLERY_QUERY_STALE_MS,
  gcTime: GALLERY_QUERY_GC_MS,
  placeholderData: keepPreviousData,
} as const;

export function prefetchGalleryQueries(queryClient: QueryClient): void {
  void queryClient.prefetchQuery(
    getListRendersQueryOptions({ query: galleryQueryOptions as never }),
  );
  void queryClient.prefetchQuery(
    getGetRenderUsageQueryOptions({ query: galleryQueryOptions as never }),
  );
}
