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

export function getIncrementalListWindow(
  columns: number,
  options?: {
    initialRows?: number;
    pageRows?: number;
    minInitial?: number;
    minPage?: number;
  }
) {
  const safeColumns = Math.max(1, Math.floor(columns) || 1);
  const initialRows = options?.initialRows ?? 10;
  const pageRows = options?.pageRows ?? 6;

  return {
    initialCount: Math.max(options?.minInitial ?? 24, safeColumns * initialRows),
    pageSize: Math.max(options?.minPage ?? 18, safeColumns * pageRows),
  };
}

export type BinderRetrievalObservation = {
  sequence: number;
  start: 'screen-load';
  source: 'network' | 'local-preview' | null;
  catalogueComplete: boolean;
  cards: number;
  modelReadyMs: number | null;
  visibleContentMs: number | null;
  ownershipEditableMs: number | null;
  cancelled: boolean;
};
const binderRetrievalObservations: BinderRetrievalObservation[] = [];
let binderRetrievalSequence = 0;
/** Bounded device-local diagnostics; no account, binder, card identifiers or remote submission. */
export function getBinderRetrievalObservations(): BinderRetrievalObservation[] {
  return binderRetrievalObservations.map((observation) => ({ ...observation }));
}
export function beginBinderRetrieval(clock = () => globalThis.performance?.now?.() ?? Date.now()) {
  const started = clock();
  const observation: BinderRetrievalObservation = {
    sequence: ++binderRetrievalSequence, start: 'screen-load', source: null, catalogueComplete: false, cards: 0,
    modelReadyMs: null, visibleContentMs: null, ownershipEditableMs: null, cancelled: false,
  };
  binderRetrievalObservations.push(observation);
  if (binderRetrievalObservations.length > 32) binderRetrievalObservations.shift();
  let currentRows = new Set<unknown>();
  const elapsed = () => Math.max(0, clock() - started);
  return {
    model(rows: readonly unknown[], source: 'network' | 'local-preview', complete = true) {
      if (observation.cancelled) return;
      currentRows = new Set(rows);
      if (observation.modelReadyMs == null && rows.length) {
        observation.modelReadyMs = elapsed(); observation.cards = rows.length; observation.source = source; observation.catalogueComplete = complete;
      }
    },
    committedRows(rows: readonly unknown[]) { if (!observation.cancelled) currentRows = new Set(rows); },
    visible(rows: readonly unknown[]) {
      if (!observation.cancelled && observation.modelReadyMs != null && observation.visibleContentMs == null
        && rows.some((row) => currentRows.has(row))) observation.visibleContentMs = elapsed();
    },
    editable() {
      if (!observation.cancelled && observation.ownershipEditableMs == null) observation.ownershipEditableMs = elapsed();
    },
    cancel() { observation.cancelled = true; currentRows.clear(); },
  };
}
