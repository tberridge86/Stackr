import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runInNewContext } from 'node:vm';

export const TARGETS = Object.freeze({
  supabase: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  api: 'https://api.stackrtcg.com/v1',
});
const TABLES = new Set(['binders', 'binder_cards', 'user_card_variants']);
const LANGUAGES = new Set(['en', 'ja', 'ko', 'zh-cn', 'zh-tw', 'fr', 'es', 'it', 'pt-br', 'de']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class MeasurementError extends Error {
  constructor(code) { super(code); this.name = 'MeasurementError'; this.code = code; }
}
const fail = code => { throw new MeasurementError(code); };
export function safeFailure(error) {
  return { code: error instanceof MeasurementError ? error.code : 'measurement_failed',
    httpStatus: Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : null,
    cancelled: error?.name === 'AbortError', timedOut: ['TimeoutError', 'PersonalDataReadTimeoutError'].includes(error?.name) };
}
export function publicKeyOnly(key) {
  if (typeof key !== 'string' || !key) fail('public_key_missing');
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return key;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    if (key.split('.').length === 3 && payload.role === 'anon' && payload.ref === 'oakdbbzdqwurpjnoqhmu') return key;
  } catch { /* Never echo a rejected key. */ }
  fail('privileged_or_invalid_key');
}
export function validateCredentials(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'email,password'
    || typeof value.email !== 'string' || typeof value.password !== 'string') fail('credentials_invalid');
  if (!value.email.trim() && !value.password) return null;
  if (!value.email.trim() || !value.password || value.email.length > 320 || value.password.length > 4096) fail('credentials_invalid');
  return { email: value.email.trim(), password: value.password };
}

/** No raw URLs, headers, bodies, row identities or provider errors enter records. */
export function createMeasuredTransport({ fetchImpl = globalThis.fetch, maxRequests = 512, maxBytes = 64 * 1024 * 1024 } = {}) {
  const records = [], streamIds = new Map();
  let userId = null, token = null, loginUsed = false, receivedBytes = 0;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 180_000);
  timer.unref?.();
  function classify(url, method) {
    if (url.username || url.password || url.hash) fail('target_not_allowed');
    if (url.origin === TARGETS.supabase) {
      if (url.pathname === '/auth/v1/token' && method === 'POST'
        && url.searchParams.toString() === 'grant_type=password' && !loginUsed) {
        loginUsed = true; return 'auth_sign_in';
      }
      if (url.pathname === '/auth/v1/user' && method === 'GET' && !url.search) return 'auth_user';
      const table = url.pathname.replace('/rest/v1/', '');
      if (method === 'GET' && TABLES.has(table) && url.pathname === '/rest/v1/' + table && userId) {
        const allowed = new Set(['select', 'order', 'offset', 'limit', table === 'binder_cards' ? 'binder_id' : 'user_id']);
        if ([...url.searchParams.keys()].some(key => !allowed.has(key))) fail('query_not_allowed');
        if (table !== 'binder_cards' && url.searchParams.get('user_id') !== 'eq.' + userId) fail('owner_filter_missing');
        const limit = Number(url.searchParams.get('limit')), offset = Number(url.searchParams.get('offset'));
        if (!Number.isSafeInteger(limit) || limit <= 0 || limit > (table === 'binders' ? 50 : 500)
          || !Number.isSafeInteger(offset) || offset < 0 || offset > 256_000) fail('page_budget_invalid');
        if (table === 'binder_cards') {
          const filter = url.searchParams.get('binder_id') ?? '';
          const ids = filter.startsWith('in.(') && filter.endsWith(')') ? filter.slice(4, -1).split(',') : [];
          if (!ids.length || ids.length > 50 || ids.some(id => !UUID.test(id))) fail('binder_filter_invalid');
        }
        return table;
      }
    }
    if (url.origin === 'https://api.stackrtcg.com' && url.pathname === '/v1/market/collection-valuation'
      && !url.search && method === 'GET' && userId) return 'prepared_valuation';
    fail('target_not_allowed');
  }
  const measuredFetch = async (input, init = {}) => {
    const request = typeof input === 'object' && input !== null && 'url' in input ? input : null;
    let url;
    try { url = new URL(request?.url ?? String(input)); } catch { fail('target_not_allowed'); }
    const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
    const category = classify(url, method);
    const headers = new Headers(init.headers ?? request?.headers);
    if (userId && headers.get('Authorization') !== 'Bearer ' + token) fail('session_header_mismatch');
    if (records.length >= maxRequests || deadline.signal.aborted) fail('request_budget_exhausted');
    const record = { category, startedMs: performance.now(), durationMs: null, status: null, decodedBodyBytes: 0 };
    if (TABLES.has(category)) {
      const stream = new URL(url); stream.searchParams.delete('offset'); stream.searchParams.delete('limit');
      const key = stream.toString();
      if (!streamIds.has(key)) streamIds.set(key, streamIds.size + 1);
      Object.assign(record, { stream: streamIds.get(key), offset: Number(url.searchParams.get('offset')),
        requestedLimit: Number(url.searchParams.get('limit')), returnedRows: null });
    }
    records.push(record);
    const signal = AbortSignal.any([deadline.signal, AbortSignal.timeout(10_000), ...(init.signal ? [init.signal] : request?.signal ? [request.signal] : [])]);
    let reader, rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = () => reject(new MeasurementError('request_cancelled_or_timed_out')); });
    signal.addEventListener('abort', rejectAbort, { once: true });
    if (signal.aborted) rejectAbort();
    try {
      const response = await Promise.race([fetchImpl(input, { ...init, redirect: 'error', signal }), aborted]);
      record.status = response.status;
      const chunks = []; let size = 0;
      reader = response.body?.getReader();
      if (reader) for (;;) {
        const part = await Promise.race([reader.read(), aborted]); if (part.done) break;
        size += part.value.byteLength; receivedBytes += part.value.byteLength;
        if (size > 16 * 1024 * 1024 || receivedBytes > maxBytes) { await reader.cancel(); fail('body_budget_exhausted'); }
        chunks.push(part.value);
      }
      const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
      record.decodedBodyBytes = size;
      if (TABLES.has(category) && response.ok) {
        let rows; try { rows = JSON.parse(body.toString('utf8')); } catch { fail('invalid_table_response'); }
        if (!Array.isArray(rows)) fail('invalid_table_response');
        record.returnedRows = rows.length;
      }
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('content-encoding'); responseHeaders.delete('content-length');
      return new Response([204, 205, 304].includes(response.status) ? null : body,
        { status: response.status, headers: responseHeaders });
    } catch (error) {
      // Auth SDK may log transport errors. Never give it a provider message,
      // request URL, body, credentials or an unsafe cause/stack from fetch.
      throw error instanceof MeasurementError ? error : new MeasurementError('transport_failed');
    } finally {
      signal.removeEventListener('abort', rejectAbort);
      if (signal.aborted && reader) void reader.cancel().catch(() => {});
      record.durationMs = performance.now() - record.startedMs;
    }
  };
  return { fetch: measuredFetch, records,
    bindSession(session) {
      if (!UUID.test(session?.user?.id ?? '') || typeof session.access_token !== 'string') fail('session_invalid');
      userId = session.user.id; token = session.access_token;
    },
    close() { clearTimeout(timer); deadline.abort(); userId = null; token = null; },
  };
}

export const HOME_MEASUREMENT_MODULES = ['homeSavedCollection', 'homeSavedCollectionCache', 'binders', 'ownership', 'uiCollectionPages',
  'requestCache', 'personalDataRead', 'collectionSummaryInvalidation', 'supabaseReadFetch', 'preparedCollectionValuation',
  'stackrApiV1', 'stackrApiTransportPolicy', 'stackrPreviewApiProxy', 'cataloguePriceHash'];
const sourceBlob = source => {
  const normalized = source.replaceAll('\r\n', '\n');
  return createHash('sha1').update('blob ' + Buffer.byteLength(normalized) + '\0').update(normalized).digest('hex');
};
export function pinHomeReaderSource(root) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) fail('source_revision_invalid');
  const blobs = Object.fromEntries(HOME_MEASUREMENT_MODULES.map(name => [name, sourceBlob(execFileSync('git',
    ['show', revision + ':lib/' + name + '.ts'], { cwd: root, encoding: 'utf8', maxBuffer: 2_000_000 }))]));
  const pin = { revision, blobs }; assertFrozenSource(root, pin); return pin;
}
export function assertFrozenSource(root, pin) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (revision !== pin.revision) fail('source_changed');
  for (const name of HOME_MEASUREMENT_MODULES) {
    if (sourceBlob(readFileSync(resolve(root, 'lib', name + '.ts'), 'utf8')) !== pin.blobs[name]) fail('source_changed');
  }
}

/** Execute shipped readers/cache/pagers; unused native/enrichment boundaries fail closed. */
export function loadHomeReader(root, supabase, pin = pinHomeReaderSource(root)) {
  const require = createRequire(resolve(root, 'package.json')), ts = require('typescript');
  const modules = new Map(), blobs = {};
  const real = new Set(HOME_MEASUREMENT_MODULES);
  const unused = new Proxy({}, { get() { return () => fail('unexpected_optional_dependency'); } });
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const module = { exports: {} }; modules.set(name, module.exports);
    const source = readFileSync(resolve(root, 'lib', name + '.ts'), 'utf8').replaceAll('\r\n', '\n');
    blobs[name] = sourceBlob(source);
    if (blobs[name] !== pin.blobs[name]) fail('source_changed');
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { module, exports: module.exports, require(specifier) {
        const dependency = specifier.replace(/^\.\//, '');
        if (real.has(dependency)) return load(dependency);
        if (dependency === 'supabase') return { supabase };
        if (dependency === 'config') return { PRICE_API_URL: 'https://api.stackrtcg.com', STACKR_API_URL: 'https://api.stackrtcg.com' };
        if (dependency === 'stackrQuery') return { invalidateStackrCollectionQueries() {} };
        if (specifier === 'buffer') return { Buffer };
        return unused;
      }, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, AbortController, URL, Buffer, TextEncoder,
        Date, performance, __DEV__: false });
    return module.exports;
  }
  return { read: load('homeSavedCollection').fetchHomeSavedCollection, load, blobs,
    invalidate() { load('collectionSummaryInvalidation').bumpCollectionSummaryVersion(); },
    close() { load('homeSavedCollectionCache').invalidateHomeSavedFacts(); load('requestCache').invalidateRequestCache(); } };
}

export function summarizeHttp(records) {
  const categories = {};
  for (const record of records) {
    const bucket = categories[record.category] ??= { requests: 0, decodedBodyBytes: 0, sumDurationMs: 0, statuses: {} };
    if (record.status !== null) bucket.statuses[record.status] = (bucket.statuses[record.status] ?? 0) + 1;
    bucket.requests++; bucket.decodedBodyBytes += record.decodedBodyBytes; bucket.sumDurationMs += record.durationMs ?? 0;
  }
  const streams = [];
  for (const stream of new Set(records.flatMap(record => record.stream ? [record.stream] : []))) {
    const pages = records.filter(record => record.stream === stream && record.status >= 200 && record.status < 300);
    let expected = 0;
    const complete = pages.length > 0 && pages.at(-1).returnedRows === 0 && pages.every(page => {
      const matches = page.offset === expected; expected += page.returnedRows; return matches;
    });
    streams.push({ category: pages[0]?.category, pages: pages.map(({ offset, requestedLimit, returnedRows }) => ({ offset, requestedLimit, returnedRows })),
      completeByEmptyPage: complete, observedMaxReturnedRows: Math.max(0, ...pages.map(page => page.returnedRows)),
      lowerThanRequestedContinuationObserved: pages.some((page, index) => page.returnedRows > 0 && page.returnedRows < page.requestedLimit && pages[index + 1]?.returnedRows > 0) });
  }
  return { requests: records.length, decodedBodyBytes: records.reduce((total, record) => total + record.decodedBodyBytes, 0), categories, streams };
}
function factsReport(facts) {
  const cards = [...facts.cardsByBinder.values()].flat(), languages = {};
  for (const card of cards) if (LANGUAGES.has(card.language)) languages[card.language] = (languages[card.language] ?? 0) + 1;
  return { binders: facts.binders.length, savedPlacements: cards.length, ownedRows: facts.ownedRows.length,
    ownedQuantities: facts.ownedRows.reduce((total, row) => total + row.quantity, 0), savedLanguages: languages };
}
function preparedReport(response, lib) {
  const exact = response?.summary;
  if (!['ready', 'pending', 'updating'].includes(response?.state)) fail('prepared_contract_invalid');
  if (!exact) return { state: response.state, hasSummary: false, earlyEligible: false };
  const selected = lib.preferredPreparedValuation(exact);
  const pricing = lib.isPreparedGeneralValuation(selected) ? lib.preparedGeneralPricingSummary(selected) : lib.preparedPricingSummary(exact);
  if (!pricing) fail('prepared_contract_invalid');
  const matching = typeof response.requestedCollectionRevision === 'string' && response.requestedCollectionRevision.trim().length > 0
    && response.requestedCollectionRevision === exact.collectionRevision;
  return { state: response.state, hasSummary: true, matchingRevision: matching, earlyEligible: response.state === 'ready' && matching && pricing.unpricedUnits === 0,
    coverage: { totalUnits: pricing.totalUnits, pricedUnits: pricing.pricedUnits, unpricedUnits: pricing.unpricedUnits,
      exactPricedUnits: pricing.exactPricedUnits, generalEstimateUnits: pricing.generalEstimateUnits, staleUnits: pricing.staleUnits,
      subtotalPresent: pricing.total !== null }, freshness: pricing.state };
}

/** Service scheduling experiment only: no rendered Home, persisted display, price fallback or optional sections. */
export async function measureDependencyLoad({ mode, scenario, reader, supabase, api, transport, userId }) {
  const start = performance.now(), firstRecord = transport.records.length;
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId) fail('verified_account_changed');
  const controller = new AbortController();
  let factsAt = null, preparedAt = null;
  const settle = promise => promise.then(value => ({ value }), error => ({ failure: safeFailure(error) }));
  const readFacts = () => reader.read(userId, { signal: controller.signal, forceRefresh: scenario === 'force-facts' })
    .then(value => { factsAt = performance.now() - start; return value; });
  const readPrepared = () => reader.load('personalDataRead').withPersonalDataReadTimeout(() => api.collectionValuation())
    .then(value => { preparedAt = performance.now() - start; return value.data; });
  if (scenario === 'local-invalidation') reader.invalidate();
  let facts, prepared;
  if (mode === 'serial') { facts = await settle(readFacts()); prepared = await settle(readPrepared()); }
  else [facts, prepared] = await Promise.all([settle(readFacts()), settle(readPrepared())]);
  const http = summarizeHttp(transport.records.slice(firstRecord));
  const coverage = prepared.failure ? null : preparedReport(prepared.value, reader.load('preparedCollectionValuation'));
  return { report: { mode, scenario, factsReadyMs: factsAt, preparedResponseReadyMs: preparedAt,
    bothSourcesReadyMs: facts.failure || prepared.failure ? null : Math.max(factsAt, preparedAt),
    completeSummaryServiceEligibleMs: coverage?.earlyEligible ? preparedAt : null,
    facts: facts.failure ? { failure: facts.failure } : factsReport(facts.value),
    prepared: prepared.failure ? { failure: prepared.failure } : coverage, http },
    // Private comparison values never enter an emitted receipt.
    privateFacts: facts.value, privatePrepared: prepared.value };
}
