type PerfMetadata = Record<string, string | number | boolean | null | undefined>;

const perfStarts = new Map<string, number>();

const shouldLogPerf = () => typeof __DEV__ !== 'undefined' && __DEV__;

export function markPerformance(label: string) {
  if (!shouldLogPerf()) return;
  perfStarts.set(label, Date.now());
}

export function measurePerformance(label: string, metadata?: PerfMetadata) {
  if (!shouldLogPerf()) return;
  const startedAt = perfStarts.get(label);
  if (!startedAt) return;
  perfStarts.delete(label);
  const elapsed = Date.now() - startedAt;
  const suffix = metadata ? ` ${JSON.stringify(metadata)}` : '';
  console.log(`[perf] ${label}: ${elapsed}ms${suffix}`);
}

export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
  metadata?: PerfMetadata
): Promise<T> {
  if (!shouldLogPerf()) return fn();
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const elapsed = Date.now() - startedAt;
    const suffix = metadata ? ` ${JSON.stringify(metadata)}` : '';
    console.log(`[perf] ${label}: ${elapsed}ms${suffix}`);
  }
}

export const stackrListPerformance = {
  marketListings: {
    initialNumToRender: 8,
    maxToRenderPerBatch: 6,
    updateCellsBatchingPeriod: 60,
    windowSize: 8,
    removeClippedSubviews: true,
  },
  cardGrid(columns: number) {
    return {
      initialNumToRender: Math.max(8, columns * 4),
      maxToRenderPerBatch: Math.max(6, columns * 3),
      updateCellsBatchingPeriod: 50,
      windowSize: 7,
      removeClippedSubviews: true,
    };
  },
} as const;
