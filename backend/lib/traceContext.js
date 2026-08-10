import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

const storage = new AsyncLocalStorage();
const TRACEPARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i;

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
      console.info(JSON.stringify({
        level: status >= 500 || status === 0 ? 'error' : 'info',
        event: 'stackr_trace_span',
        trace_id: span.traceId,
        span_id: span.spanId,
        parent_span_id: span.parentSpanId,
        service: 'stackr-api',
        operation: 'supabase_rest',
        status,
        duration_ms: Date.now() - startedAt,
      }));
    }
  };
}
