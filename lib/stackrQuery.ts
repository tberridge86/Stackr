import { QueryClient } from '@tanstack/react-query';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const stackrQueryTiming = {
  hotPathStaleMs: MINUTE_MS,
  profileStatsStaleMs: 45 * 1000,
  cacheMaxAgeMs: DAY_MS,
} as const;

export const stackrQueryKeys = {
  collectionSummaryRoot: ['stackr', 'collection-summary'] as const,
  collectionSummary: (userId?: string | null) =>
    ['stackr', 'collection-summary', userId ?? 'anonymous'] as const,
  profileStatsRoot: ['stackr', 'profile-stats'] as const,
  profileStats: (userId?: string | null) =>
    ['stackr', 'profile-stats', userId ?? 'anonymous'] as const,
  binderLibraryRoot: ['stackr', 'binder-library'] as const,
  binderLibrary: (userId?: string | null) =>
    ['stackr', 'binder-library', userId ?? 'anonymous', 'overview'] as const,
  binderLibrarySummaries: (userId: string | null | undefined, signature: string) =>
    ['stackr', 'binder-library', userId ?? 'anonymous', 'summaries', signature] as const,
} as const;

export const stackrQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: stackrQueryTiming.hotPathStaleMs,
      gcTime: stackrQueryTiming.cacheMaxAgeMs,
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function invalidateStackrCollectionQueries() {
  void stackrQueryClient.invalidateQueries({ queryKey: stackrQueryKeys.collectionSummaryRoot });
  void stackrQueryClient.invalidateQueries({ queryKey: stackrQueryKeys.profileStatsRoot });
  void stackrQueryClient.invalidateQueries({ queryKey: stackrQueryKeys.binderLibraryRoot });
}
