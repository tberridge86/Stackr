type PerfMetadata = Record<string, string | number | boolean | null | undefined>;

export type StartupPhase = 'root-mounted' | 'root-layout' | 'shell-layout' | 'navigation-ready' | 'overlay-removed';
const startupPhases: Partial<Record<StartupPhase, number>> = {};
let startupStartedAt: number | undefined;
/** One bounded, device-local observation. Does not measure OS process creation. */
export function markStartupPhase(phase: StartupPhase) {
  const now = globalThis.performance?.now?.() ?? Date.now();
  startupStartedAt ??= now;
  startupPhases[phase] ??= Math.max(0, now - startupStartedAt);
}

export function getStartupObservation() {
  return { origin: 'first-js-startup-mark' as const, phasesMs: { ...startupPhases } };
}

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

export type RetrievalOrigin = 'tap' | 'input' | 'filter' | 'retry' | 'route' | 'screen-load' | 'inspection-request';
export type RetrievalCondition = {
  network: 'unverified' | 'wifi' | 'mobile' | 'offline';
  cache: 'unverified' | 'memory' | 'persisted' | 'cold' | 'expired';
};
let retrievalCondition: RetrievalCondition = { network: 'unverified', cache: 'unverified' };
export function getRetrievalCondition(): RetrievalCondition { return { ...retrievalCondition }; }
/** Labels supplied by the phone tester; changing a label does not clear caches or establish network conditions. */
export function setRetrievalCondition(condition: RetrievalCondition) { retrievalCondition = { ...condition }; }
export type RetrievalSource = 'memory' | 'persisted' | 'network' | 'local-preview';
export type RetrievalPhase = 'auth-ready' | 'binder-ready' | 'facts-ready' | 'facts-committed' | 'visible-rows'
  | 'network-complete' | 'card-source-ready' | 'ownership-ready' | 'artwork-ready' | 'thumbnail-loaded' | 'thumbnail-displayed'
  | 'detail-loaded' | 'detail-displayed' | 'prices-ready' | 'facts-settled' | 'settled';
export type RetrievalFailure = 'access' | 'facts' | 'ownership' | 'artwork' | 'prices' | 'source';
export type RetrievalImageEvent = {
  phase: 'loaded' | 'displayed' | 'retry' | 'failed';
  rendition: 'thumbnail' | 'detail';
  attempt: number;
  terminal?: boolean;
  cache?: 'memory' | 'disk' | 'none' | 'unknown';
  width?: number;
  height?: number;
};
export type RetrievalObservation = {
  sequence: number;
  journey: 'binder' | 'search' | 'inspection';
  origin: RetrievalOrigin;
  source: RetrievalSource | null;
  phasesMs: Partial<Record<RetrievalPhase, number>>;
  outcome: 'pending' | 'success' | 'partial' | 'failure' | 'cancelled';
  /** Factual settlement never means optional artwork, ownership or prices have finished. */
  settlementScope: 'facts-only' | 'inspection-image';
  failures: RetrievalFailure[];
  cards: number;
  catalogueComplete: boolean;
  condition: RetrievalCondition;
  images: { loaded: number; displayed: number; retries: number; failed: number;
    cache: Record<'memory' | 'disk' | 'none' | 'unknown', number>;
    firstLoadedDimensions: Partial<Record<'thumbnail' | 'detail', { width: number; height: number }>> };
};
const RETRIEVAL_OBSERVATION_LIMIT = 256;
const retrievalObservations: RetrievalObservation[] = [];
let retrievalSequence = 0;
let droppedObservations = 0;
let retrievalGeneration = 0;
const retrievalClock = () => globalThis.performance?.now?.() ?? Date.now();
const copyRetrieval = (value: RetrievalObservation): RetrievalObservation => ({
  ...value, phasesMs: { ...value.phasesMs }, failures: [...value.failures],
  condition: { ...value.condition },
  images: { ...value.images, cache: { ...value.images.cache }, firstLoadedDimensions: {
    ...(value.images.firstLoadedDimensions.thumbnail ? { thumbnail: { ...value.images.firstLoadedDimensions.thumbnail } } : {}),
    ...(value.images.firstLoadedDimensions.detail ? { detail: { ...value.images.firstLoadedDimensions.detail } } : {}),
  } },
});

/** Export each measurement block before the bounded window fills. No identifiers, URLs or queries are retained. */
export function exportRetrievalObservations() {
  if (pendingBinderTap && retrievalClock() - pendingBinderTap.started > 15_000) {
    pendingBinderTap.trace.cancel(); pendingBinderTap = null;
  }
  return {
    schemaVersion: 1, measurement: 'device-local-js-callbacks' as const,
    capacity: RETRIEVAL_OBSERVATION_LIMIT, droppedObservations,
    observations: retrievalObservations.map(copyRetrieval),
  };
}
export function resetRetrievalObservations() {
  retrievalGeneration++;
  pendingBinderTap?.trace.cancel();
  pendingBinderTap = null;
  retrievalObservations.length = 0;
  droppedObservations = 0;
}

export function beginRetrieval(journey: RetrievalObservation['journey'], origin: RetrievalOrigin, clock = retrievalClock) {
  const started = clock();
  const generation = retrievalGeneration;
  const observation: RetrievalObservation = { sequence: ++retrievalSequence, journey, origin, source: null,
    phasesMs: {}, outcome: 'pending', settlementScope: journey === 'inspection' ? 'inspection-image' : 'facts-only', failures: [], cards: 0, catalogueComplete: false,
    condition: { ...retrievalCondition },
    images: { loaded: 0, displayed: 0, retries: 0, failed: 0, cache: { memory: 0, disk: 0, none: 0, unknown: 0 }, firstLoadedDimensions: {} } };
  retrievalObservations.push(observation);
  if (retrievalObservations.length > RETRIEVAL_OBSERVATION_LIMIT) {
    retrievalObservations.shift();
    droppedObservations++;
  }
  let active = true;
  const isActive = () => active && generation === retrievalGeneration;
  const phase = (name: RetrievalPhase) => {
    if (isActive()) observation.phasesMs[name] ??= Math.max(0, clock() - started);
  };
  return {
    phase,
    pending() { return isActive() && observation.outcome === 'pending'; },
    source(source: RetrievalSource) { if (isActive()) observation.source ??= source; },
    image(event: RetrievalImageEvent) {
      if (!isActive()) return;
      if (event.phase === 'loaded') {
        observation.images.loaded++;
        observation.images.cache[event.cache ?? 'unknown']++;
        if (Number.isFinite(event.width) && Number.isFinite(event.height) && event.width! > 0 && event.height! > 0) {
          observation.images.firstLoadedDimensions[event.rendition] ??= { width: event.width!, height: event.height! };
        }
        phase(event.rendition === 'detail' ? 'detail-loaded' : 'thumbnail-loaded');
      } else if (event.phase === 'displayed') {
        observation.images.displayed++;
        phase(event.rendition === 'detail' ? 'detail-displayed' : 'thumbnail-displayed');
        if (journey === 'inspection') {
          phase('settled');
          observation.outcome = observation.failures.length ? 'partial' : 'success';
        }
      } else if (event.phase === 'retry') observation.images.retries++;
      else {
        observation.images.failed++;
        if (event.terminal && !observation.failures.includes('artwork')) observation.failures.push('artwork');
        if (event.terminal && observation.outcome === 'success') observation.outcome = 'partial';
        if (event.terminal && journey === 'inspection') {
          phase('settled');
          observation.outcome = observation.images.displayed > 0 ? 'partial' : 'failure';
        }
      }
    },
    facts(cards: number, source: RetrievalSource, complete = false) {
      if (!isActive()) return;
      observation.cards = cards;
      observation.catalogueComplete = complete;
      observation.source ??= source;
      if (cards > 0 && observation.outcome === 'failure') observation.outcome = 'partial';
      if (cards > 0) phase('facts-ready');
      if (source === 'network' && complete) phase('network-complete');
    },
    fail(failure: RetrievalFailure) {
      if (!isActive()) return;
      if (!observation.failures.includes(failure)) observation.failures.push(failure);
      if (observation.outcome === 'success') observation.outcome = 'partial';
    },
    settle(usable = observation.cards > 0) {
      if (!isActive()) return;
      // Optional callbacks remain independent and can update the observed status.
      // This endpoint must never be read as completion of those optional requests.
      phase(journey === 'inspection' ? 'settled' : 'facts-settled');
      observation.outcome = observation.failures.length ? (usable ? 'partial' : 'failure') : 'success';
    },
    cancel() {
      if (active && observation.outcome === 'pending') observation.outcome = 'cancelled';
      active = false;
    },
  };
}

export type BinderRetrievalObservation = {
  sequence: number; start: RetrievalOrigin; source: RetrievalSource | null; catalogueComplete: boolean; cards: number;
  modelReadyMs: number | null; visibleContentMs: number | null; ownershipEditableMs: number | null;
  networkCompleteMs: number | null; cancelled: boolean;
};
/** Compatibility view; visibleContentMs is JS viewability, never a native paint measurement. */
export function getBinderRetrievalObservations(): BinderRetrievalObservation[] {
  return retrievalObservations.filter(value => value.journey === 'binder').map(value => ({
    sequence: value.sequence, start: value.origin, source: value.source, catalogueComplete: value.catalogueComplete,
    cards: value.cards, modelReadyMs: value.phasesMs['facts-ready'] ?? null,
    visibleContentMs: value.phasesMs['visible-rows'] ?? null, ownershipEditableMs: value.phasesMs['ownership-ready'] ?? null,
    networkCompleteMs: value.phasesMs['network-complete'] ?? null, cancelled: value.outcome === 'cancelled',
  }));
}

type BinderTrace = ReturnType<typeof createBinderRetrieval>;
let pendingBinderTap: { binderId: string; started: number; trace: BinderTrace } | null = null;
/** The transient routing key is never included in exported diagnostics. */
export function startBinderRetrieval(binderId: string) {
  pendingBinderTap?.trace.cancel();
  pendingBinderTap = { binderId, started: retrievalClock(), trace: createBinderRetrieval(retrievalClock, 'tap') };
}
export function beginBinderRetrieval(clock = retrievalClock, binderId?: string) {
  const pending = pendingBinderTap;
  pendingBinderTap = null;
  if (pending && pending.binderId === binderId && retrievalClock() - pending.started <= 15_000) return pending.trace;
  pending?.trace.cancel();
  return createBinderRetrieval(clock, 'screen-load');
}
function createBinderRetrieval(clock: () => number, origin: RetrievalOrigin) {
  const trace = beginRetrieval('binder', origin, clock);
  let currentRows = new Set<unknown>();
  let hasModel = false;
  let active = true;
  return {
    ...trace,
    model(rows: readonly unknown[], source: RetrievalSource, complete = true) {
      if (!active) return;
      currentRows = new Set(rows);
      hasModel ||= rows.length > 0;
      trace.facts(rows.length, source, complete);
    },
    committedRows(rows: readonly unknown[]) {
      if (!active) return;
      currentRows = new Set(rows);
      if (rows.length && hasModel) trace.phase('facts-committed');
    },
    visible(rows: readonly unknown[]) {
      if (active && hasModel && rows.some(row => currentRows.has(row))) trace.phase('visible-rows');
    },
    editable() { trace.phase('ownership-ready'); },
    cancel() { active = false; currentRows.clear(); trace.cancel(); },
  };
}
