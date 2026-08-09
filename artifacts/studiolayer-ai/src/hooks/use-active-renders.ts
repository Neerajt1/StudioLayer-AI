import { useQueries } from '@tanstack/react-query';
import { getGetRenderQueryOptions } from '@workspace/api-client-react';

function makeRefetchInterval(enabled: boolean) {
  return (query: { state: { data: { status?: string } | undefined } }) => {
    if (!enabled) return false;
    const render = query.state.data;
    if (render && (render.status === 'processing' || render.status === 'pending')) {
      return 2000;
    }
    return false;
  };
}

/** Poll an arbitrary number of render rows (Custom Campaign batches up to 20). */
export function useActiveRenders(activeRenderIds: number[]) {
  const queries = useQueries({
    queries: activeRenderIds.map((id) => ({
      ...getGetRenderQueryOptions(id, {
        query: {
          enabled: id > 0,
          refetchInterval: makeRefetchInterval(id > 0),
        },
      } as never),
    })),
  });

  return activeRenderIds.map((_, index) => queries[index]?.data);
}
