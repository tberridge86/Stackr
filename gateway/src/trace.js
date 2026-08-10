const TRACEPARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i;

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function parseTraceparent(value) {
  const match = TRACEPARENT.exec(String(value ?? '').trim());
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), flags: match[3].toLowerCase() };
}

export function createTraceContext(value) {
  const incoming = parseTraceparent(value);
  return {
    traceId: incoming?.traceId ?? randomHex(16),
    spanId: randomHex(8),
    parentSpanId: incoming?.parentSpanId ?? null,
    flags: incoming?.flags ?? '01',
  };
}

export function traceparentFor(trace) {
  return `00-${trace.traceId}-${trace.spanId}-${trace.flags}`;
}
