import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const storage = new AsyncLocalStorage();
const TRACEPARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i;
const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MANIFEST_PHASES = new Set(['manifest_versions', 'manifest_latest_change', 'manifest_languages']);

function safeRequestId(value) {
  return typeof value === 'string' && REQUEST_ID.test(value) ? value.toLowerCase() : undefined;
}

function emitTraceEvent(event) {
  try { console.info(JSON.stringify(event)); } catch { /* Telemetry cannot fail a catalogue read. */ }
}

function randomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

export function parseTraceparent(value) {
  const match = TRACEPARENT.exec(String(value ?? '').trim());
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), flags: match[3].toLowerCase() };
}

export function childTrace(value) {
  const incoming = parseTraceparent(value);
  return {
    traceId: incoming?.traceId ?? randomHex(16),
    spanId: randomHex(8),
    parentSpanId: incoming?.parentSpanId ?? null,
    flags: incoming?.flags ?? '01',
  };
}

export function formatTraceparent(trace = storage.getStore()) {
  return trace ? `00-${trace.traceId}-${trace.spanId}-${trace.flags}` : null;
}

export function currentTrace() {
  return storage.getStore() ?? null;
}

export function observeCatalogueManifestRead(phase, read) {
  if (!MANIFEST_PHASES.has(phase)) return read();
  const parent = currentTrace();
  const context = { ...parent, ...childTrace(formatTraceparent(parent)), catalogueReadPhase: phase };
  return storage.run(context, async () => {
    const startedAt = performance.now();
    const emit = (outcome) => emitTraceEvent({
      event: 'stackr_catalogue_manifest_read', phase, outcome,
      trace_id: context.traceId, span_id: context.spanId, parent_span_id: context.parentSpanId,
      request_id: safeRequestId(context.requestId),
      duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    emit('started');
    let outcome = 'success';
    try {
      return await read();
    } catch (error) {
      outcome = context.catalogueReadSignal?.aborted ? 'cancelled' : 'error';
      throw error;
    } finally {
      emit(outcome);
    }
  });
}

export function catalogueReadSignal(childSignal) {
  const parent = currentTrace()?.catalogueReadSignal;
  return parent && childSignal ? AbortSignal.any([parent, childSignal]) : parent ?? childSignal;
}

// Bind the builder, not just fetch: the SDK also uses this signal during retry
// backoff and body reads. It returns plain errors on abort, so recheck afterward.
export async function readCatalogueQuery(query, childSignal) {
  const signal = catalogueReadSignal(childSignal);
  signal?.throwIfAborted();
  const result = await (signal ? query.abortSignal(signal) : query);
  signal?.throwIfAborted();
  return result;
}

export function publicCatalogueRead(req, res, next) {
  const controller = new AbortController();
  const cleanup = () => {
    req.removeListener('aborted', abort);
    res.removeListener('close', close);
    res.removeListener('finish', cleanup);
  };
  const abort = () => {
    controller.abort(new DOMException('Catalogue client disconnected.', 'AbortError'));
    cleanup();
  };
  const close = () => {
    if (!res.writableFinished) abort();
    else cleanup();
  };
  req.once('aborted', abort);
  res.once('close', close);
  res.once('finish', cleanup);
  if (req.aborted || res.destroyed) abort();
  // Shared clients retain no request signal. Copy the existing trace so parallel
  // requests for the same identity cannot cancel each other.
  storage.run({ ...(currentTrace() ?? childTrace(req.headers.traceparent)),
    catalogueReadSignal: controller.signal, requestId: safeRequestId(req.stackrRequestId) }, next);
}

export function traceMiddleware() {
  return (req, res, next) => {
    const trace = childTrace(req.headers.traceparent);
    req.stackrTrace = trace;
    res.setHeader('Traceparent', formatTraceparent(trace));
    res.setHeader('X-Trace-Id', trace.traceId);
    storage.run(trace, next);
  };
}

export function createTracedFetch(fetchImpl = globalThis.fetch) {
  return async (input, init = {}) => {
    const parent = currentTrace();
    const span = childTrace(parent ? formatTraceparent(parent) : null);
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('traceparent', formatTraceparent(span));
    const startedAt = Date.now();
    let status = 0;
    try {
      const response = await fetchImpl(input, { ...init, headers });
      status = response.status;
      return response;
    } finally {
      emitTraceEvent({
        level: status >= 500 || status === 0 ? 'error' : 'info',
        event: 'stackr_trace_span',
        trace_id: span.traceId,
        span_id: span.spanId,
        parent_span_id: span.parentSpanId,
        service: 'stackr-api',
        operation: 'supabase_rest',
        status,
        duration_ms: Date.now() - startedAt,
        ...(MANIFEST_PHASES.has(parent?.catalogueReadPhase) ? {
          phase: parent.catalogueReadPhase, request_id: safeRequestId(parent.requestId),
        } : {}),
      });
    }
  };
}
