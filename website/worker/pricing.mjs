/**
 * Read-only UK retail asking-price references. No visitor URL, cookies, keys or writes.
 *
 * createPriceService({ products, sources, seedQuotes?, fetchImpl?, now?, cache?, limits? })
 *   handleRequest(request, env?, ctx?): Promise<Response> (GET /api/prices only)
 *   getSnapshot(): Promise<Feed> (load cached/seed evidence, never fetch)
 *   refresh(): Promise<Feed> (retrieve allowlisted sources)
 *
 * sources is { [productId]: SourceDescriptor[] }. Descriptors pin exact identity,
 * approved product titles and description patterns, not a generic sale banner.
 * cache is optional { get(key): Promise<JSONState|null>, put(key,state): Promise<void> }.
 * A shared durable adapter instead uses revision-bound read/compareAndSwap and
 * consistentSnapshots. Warm reads reload it; conditional conflicts merge only
 * dated observations without regressing the winner's cycle progress.
 * Persist JSON state beyond a week to retain dated evidence during outages.
 * Keys include the full product/source configuration and price policy.
 * An adapter must return decoded JSON and keep each key isolated. No user data is
 * cached. A cache outage falls back to this instance's memory without losing quotes.
 * now is a function returning epoch milliseconds (or a Date), useful in tests.
 *
 * 'current' means a successful observation within seven days; timestamps and
 * refresh failures remain visible. Shipping is excluded. One source is indicative,
 * not a UK-wide market survey. Stale prices are historical and must be labelled.
 */

export const DISCOUNT_BPS = 1000;
export const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
export const STALE_MS = REFRESH_MS;
export const DEFAULT_LIMITS = Object.freeze({ concurrency: 4, timeoutMs: 7000, maxBodyBytes: 2 * 1024 * 1024, maxSources: 320, maxSourcesPerProduct: 4, batchSources: 32 });

const METHOD = 'Weekly snapshot of the lowest exact in-stock UK retail asking price among the configured sources; includes VAT, excludes delivery. Not completed-sale or investment value.';
const IN_STOCK = /^(?:https?:\/\/schema\.org\/)?InStock$/i;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/;

export function nextWeeklyRefresh(time) {
  if (!Number.isFinite(time) || time < 0) throw new TypeError('Invalid review clock');
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = value => Object.fromEntries(formatter.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const local = parts(time), weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const monday = (1 - weekday + 7) % 7;
  const reviewAt = days => {
    const wallTime = Date.UTC(local.year, local.month - 1, local.day + days, 9), london = parts(wallTime);
    const offset = Date.UTC(london.year, london.month - 1, london.day, london.hour, london.minute, london.second) - wallTime;
    return wallTime - offset;
  };
  const next = reviewAt(monday);
  return next > time ? next : reviewAt(monday + 7);
}

export function discountedPence(marketPence) {
  if (!validPence(marketPence)) throw new TypeError('Expected positive integer GBP pence');
  return Math.floor((marketPence * (10000 - DISCOUNT_BPS) + 5000) / 10000);
}

function validPence(value) { return Number.isSafeInteger(value) && value > 0 && value <= 100_000_000; }
function iso(value) { return new Date(value).toISOString(); }
function timestamp(value, time) {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, zone] = parts;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= time ? parsed : null;
}
function decodeEntities(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', eacute: 'é', Eacute: 'É', pound: '£' };
  return String(value ?? '').replace(/&(#(?:x[a-f0-9]+|\d+)|[a-z]+);/gi, (entity, key) => {
    if (key[0] !== '#') return Object.hasOwn(named, key) ? named[key] : entity;
    const numeric = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff) ? String.fromCodePoint(numeric) : entity;
  });
}
function normalize(value) {
  return decodeEntities(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}
function plainText(value) { return decodeEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function productIdentity(product) {
  return {
    language: product.language, setKey: product.setKey, type: product.type,
    packs: product.packs, unit: product.unit, edition: product.edition || 'standard',
    cardsPerPack: product.cardsPerPack ?? null,
  };
}
function sameIdentity(left, right) {
  return left && right && ['language', 'setKey', 'type', 'packs', 'unit', 'edition', 'cardsPerPack'].every(key => (left[key] ?? (key === 'edition' ? 'standard' : null)) === (right[key] ?? (key === 'edition' ? 'standard' : null)));
}
function validSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port &&
      !/^(?:localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|\d+(?:\.\d+){3})$/i.test(url.hostname);
  } catch { return false; }
}
function fingerprint(value) {
  // Deterministic non-secret cache namespace. Full configuration stays in state
  // and is checked too, so a hash collision cannot load unrelated evidence.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}
function limitOptions(options = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, max]) => [key, Number.isSafeInteger(options[key]) && options[key] > 0 ? Math.min(max, options[key]) : max]));
}
function priceToPence(price) {
  if (typeof price !== 'string' && typeof price !== 'number') return null;
  const text = String(price).trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, pennies = ''] = text.split('.');
  const value = Number(whole) * 100 + Number(pennies.padEnd(2, '0'));
  return validPence(value) ? value : null;
}
function problem(code, definitive = false) { return Object.assign(new Error(code), { code, definitive }); }
function requiredDescription(source, description) {
  const text = plainText(description);
  return source.match.requiredText.every(pattern => new RegExp(pattern, 'i').test(text));
}
function productDescriptionElement(body, source) {
  const expected = source.match.descriptionElement;
  if (!expected || expected.tag !== 'div' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(expected.className) || typeof expected.pageTitle !== 'string' || !validSourceUrl(expected.pageUrl) || !source.match.sku && !source.match.variantId) throw problem('invalid-description-adapter', true);
  const attributes = tag => Object.fromEntries([...tag.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decodeEntities(match[2] ?? match[3])]));
  const document = body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const meta = [...document.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  for (const [property, value] of [['og:title', expected.pageTitle], ['og:url', expected.pageUrl]]) {
    const candidates = meta.filter(item => item.property?.toLowerCase() === property);
    if (candidates.length !== 1 || candidates[0].content !== value) throw problem('description-page-mismatch', true);
  }
  const candidates = [...document.matchAll(/<div\b[^>]*>/gi)].filter(match => (attributes(match[0]).class || '').split(/\s+/).includes(expected.className));
  if (candidates.length !== 1) throw problem('ambiguous-description-element', true);
  const start = candidates[0].index, fragment = document.slice(start, start + 32768);
  let depth = 0;
  for (const match of fragment.matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth > 20) throw problem('description-element-limit', true);
    if (depth === 0) return fragment.slice(0, match.index + match[0].length);
  }
  throw problem('description-element-limit', true);
}
function validateProviderTime(candidate, time) {
  if (candidate === undefined || candidate === null || candidate === '') return null;
  // Provider modification times are optional, but supplied malformed/future dates
  // are never converted into an observation at the current time.
  const value = timestamp(candidate, time);
  if (value === null) throw problem('invalid-source-timestamp', true);
  return iso(value);
}

/** Parse only product-scoped structured prices. AggregateOffer/lowPrice, scraped
 * text, compare-at prices, pre-orders and arbitrary promotional banners are ignored. */
export function parseSourceDocument(body, source, time = Date.now()) {
  if (source.format === 'shopify-json') {
    let product;
    try { product = JSON.parse(body); } catch { throw problem('invalid-json'); }
    if (!source.match.titles.some(title => normalize(title) === normalize(product.title)) || !requiredDescription(source, product.description)) throw problem('identity-mismatch', true);
    // Standard Shopify .js does not guarantee currency. Require an explicit
    // currency in this document; never infer GBP from a UK hostname or £ symbol.
    if (product.currency !== 'GBP') throw problem('non-gbp-currency', true);
    const variants = Array.isArray(product.variants) ? product.variants.filter(variant => String(variant.id) === String(source.match.variantId)) : [];
    if (variants.length !== 1) throw problem('variant-mismatch', true);
    const variant = variants[0];
    if (source.match.variantTitle && normalize(variant.title) !== normalize(source.match.variantTitle)) throw problem('variant-mismatch', true);
    if (variant.available !== true) throw problem('out-of-stock', true);
    if (!validPence(variant.price)) throw problem('invalid-price', true);
    const providerUpdatedAt = validateProviderTime(product.updated_at, time);
    return { marketPence: variant.price, currency: 'GBP', title: product.title, providerUpdatedAt };
  }
  if (source.format !== 'jsonld') throw problem('unsupported-format', true);
  const nodes = [];
  function visit(value, depth = 0) {
    if (depth > 12 || nodes.length > 500) throw problem('structured-data-limit');
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); }
    else if (value && typeof value === 'object') {
      nodes.push(value);
      if (value['@graph']) visit(value['@graph'], depth + 1);
      if ((Array.isArray(value['@type']) ? value['@type'] : [value['@type']]).includes('ProductGroup') && value.hasVariant) visit(value.hasVariant, depth + 1);
    }
  }
  const scripts = [...body.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (scripts.length > 64) throw problem('structured-data-limit');
  for (const script of scripts) {
    try { visit(JSON.parse(script[1].trim())); } catch (error) { if (error.code) throw error; /* unrelated malformed schema is not evidence */ }
  }
  const matches = nodes.filter(node => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('Product') && source.match.titles.some(title => normalize(title) === normalize(node.name)) && (!source.match.sku || String(node.sku) === String(source.match.sku)));
  if (matches.length !== 1) throw problem('identity-mismatch', true);
  const description = plainText(matches[0].description) || (source.match.descriptionElement ? productDescriptionElement(body, source) : '');
  if (!requiredDescription(source, description)) throw problem('identity-mismatch', true);
  const product = matches[0];
  const providerUpdatedAt = validateProviderTime(product.dateModified, time);
  let offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  offers = offers.filter(offer => offer && (!offer['@type'] || (Array.isArray(offer['@type']) ? offer['@type'].includes('Offer') : offer['@type'] === 'Offer')));
  if (source.match.variantId) offers = offers.filter(offer => {
    try { return new URL(offer.url, source.url).searchParams.get('variant') === String(source.match.variantId); } catch { return false; }
  });
  if (source.match.variantTitle) offers = offers.filter(offer => normalize(offer.name) === normalize(source.match.variantTitle));
  if (!offers.length) throw problem('no-exact-offer', true);
  // Any variant must be pinned above; otherwise exactly one price offer is needed.
  if (!source.match.variantId && !source.match.variantTitle && offers.length !== 1) throw problem('ambiguous-offer', true);
  const gbp = offers.filter(offer => offer.priceCurrency === 'GBP');
  if (!gbp.length) throw problem('non-gbp-currency', true);
  const stock = gbp.filter(offer => IN_STOCK.test(offer.availability));
  if (!stock.length) throw problem('out-of-stock', true);
  const prices = stock.map(offer => priceToPence(offer.price)).filter(value => value !== null);
  if (prices.length !== stock.length) throw problem('invalid-price', true);
  return { marketPence: Math.min(...prices), currency: 'GBP', title: product.name, providerUpdatedAt };
}

async function readBody(response, maxBytes, signal) {
  const length = Number(response.headers.get('content-length'));
  if (length > maxBytes) throw problem('response-too-large');
  if (!response.body || !response.body.getReader) throw problem('missing-stream');
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw problem('timeout');
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw problem('response-too-large');
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createPriceService({ products, sources, seedQuotes = [], fetchImpl = globalThis.fetch, now = Date.now, cache, limits: overrides } = {}) {
  if (!Array.isArray(products) || products.length > 1000 || !sources || typeof sources !== 'object') throw new TypeError('Expected products array and fixed sources map');
  const limits = limitOptions(overrides);
  const productMap = new Map(); const descriptors = [];
  for (const product of products) {
    if (!SAFE_ID.test(product.id) || productMap.has(product.id)) throw new TypeError('Invalid or duplicate product ID');
    const identity = productIdentity(product);
    if (!identity.language || !identity.setKey || !identity.type || !identity.unit || !Number.isSafeInteger(identity.packs) || identity.packs < 0) throw new TypeError(`Incomplete identity: ${product.id}`);
    productMap.set(product.id, { product, identity });
    const entries = sources[product.id] || [];
    if (!Array.isArray(entries) || entries.length > limits.maxSourcesPerProduct) throw new TypeError('Source count exceeded');
    for (const source of entries) {
      if (!SAFE_ID.test(source.id) || !validSourceUrl(source.url) || source.country !== 'GB' || source.currency !== 'GBP' || !sameIdentity(identity, source.identity) || !['jsonld', 'shopify-json'].includes(source.format) || !source.match?.titles?.length || !Array.isArray(source.match.requiredText) || !source.match.requiredText.length) throw new TypeError(`Invalid source descriptor: ${product.id}`);
      for (const pattern of source.match.requiredText) {
        if (typeof pattern !== 'string' || pattern.length > 250) throw new TypeError('Invalid identity pattern');
        new RegExp(pattern, 'i');
      }
      const key = `${product.id}:${source.id}`;
      if (descriptors.some(item => item.key === key)) throw new TypeError('Duplicate source ID');
      descriptors.push({ ...source, productId: product.id, key });
    }
  }
  if (Object.keys(sources).some(id => !productMap.has(id)) || descriptors.length > limits.maxSources) throw new TypeError('Unknown product or source budget exceeded');
  const configuration = JSON.stringify({ policy: { discountBps: DISCOUNT_BPS, refreshMs: REFRESH_MS, staleMs: STALE_MS, review: 'Monday 09:00 Europe/London' }, identities: [...productMap].map(([id, item]) => [id, item.identity]), descriptors });
  const cacheKey = `stackr-prices-v2-${fingerprint(configuration)}`;
  const emptyState = () => ({ version: 2, configuration, lastAttemptAt: null, cycleStartedAt: null, refreshCursor: 0, quotes: {} });
  let state = emptyState(), storageRevision, writeFailure = null;
  let persistenceStatus = cache ? 'not-written' : 'memory';
  let initialized = false; let initialization; let inflight;
  function timeNow() { const value = Number(now()); if (!Number.isFinite(value) || value < 0) throw new TypeError('Invalid clock'); return value; }
  function validQuote(quote, source, time) {
    return quote && quote.productId === source.productId && quote.sourceId === source.id && quote.currency === 'GBP' && sameIdentity(quote.identity, source.identity) && validPence(quote.marketPence) && timestamp(quote.observedAt, time) !== null && timestamp(quote.asOf ?? quote.observedAt, time) !== null && Date.parse(quote.asOf ?? quote.observedAt) <= Date.parse(quote.observedAt) && (!quote.providerUpdatedAt || (timestamp(quote.providerUpdatedAt, time) !== null && Date.parse(quote.providerUpdatedAt) <= Date.parse(quote.observedAt)));
  }
  function mergeSeeds(target, time) {
    for (const quote of seedQuotes) {
      const source = descriptors.find(item => item.productId === quote.productId && item.id === quote.sourceId);
      if (!source || !validQuote(quote, source, time)) continue;
      const existing = target.quotes[source.key];
      if (!existing || (existing.quote && Date.parse(quote.observedAt) > Date.parse(existing.quote.observedAt) && !existing.inactive)) target.quotes[source.key] = { quote: { ...quote, asOf: quote.asOf || quote.observedAt }, inactive: false, error: null, checkedAt: quote.observedAt };
    }
  }
  function adoptSaved(saved, time) {
    if (saved?.version !== 2 || saved.configuration !== configuration || saved.lastAttemptAt !== null && timestamp(saved.lastAttemptAt, time) === null) return false;
    const next = emptyState(); next.lastAttemptAt = saved.lastAttemptAt;
    if (Number.isSafeInteger(saved.refreshCursor) && saved.refreshCursor > 0 && saved.refreshCursor < descriptors.length && timestamp(saved.cycleStartedAt, time) !== null) {
      next.refreshCursor = saved.refreshCursor; next.cycleStartedAt = saved.cycleStartedAt;
    }
    for (const source of descriptors) {
      const entry = saved.quotes?.[source.key];
      if (entry && (!entry.quote || validQuote(entry.quote, source, time))) {
        next.quotes[source.key] = { quote: entry.quote || null, inactive: entry.inactive === true, error: typeof entry.error === 'string' ? entry.error.slice(0, 100) : null, checkedAt: timestamp(entry.checkedAt, time) !== null ? entry.checkedAt : entry.quote?.observedAt || null };
      }
    }
    mergeSeeds(next, time); state = next; return true;
  }
  async function reloadStorage() {
    if (!cache) return true;
    try {
      const record = typeof cache.read === 'function' ? await cache.read(cacheKey) : { value: await cache.get(cacheKey), revision: undefined };
      if (record.value !== null && record.value !== undefined && !adoptSaved(record.value, timeNow())) throw Error('Invalid price snapshot');
      const previousRevision = storageRevision, previousStatus = persistenceStatus;
      storageRevision = record.revision;
      if (writeFailure && (writeFailure.revision === record.revision || !record.value)) persistenceStatus = writeFailure.status;
      else {
        writeFailure = null;
        persistenceStatus = record.value ? previousStatus === 'stored' && previousRevision === record.revision ? 'stored' : 'loaded' : 'not-written';
      }
      return true;
    } catch { persistenceStatus = 'failed'; return false; }
  }
  async function initialize() {
    if (initialized) return;
    if (initialization) return initialization;
    initialization = (async () => { mergeSeeds(state, timeNow()); await reloadStorage(); initialized = true; })();
    return initialization;
  }
  function applyOutcome(target, outcome) {
    const previous = target.quotes[outcome.key] || { quote: null, inactive: false, error: null, checkedAt: null };
    const previousTime = Date.parse(previous.checkedAt || previous.quote?.observedAt || '') || -1;
    const incomingTime = Date.parse(outcome.checkedAt);
    if (outcome.kind === 'failure') {
      if (incomingTime >= previousTime) target.quotes[outcome.key] = { ...previous, error: outcome.error };
    } else if (outcome.kind === 'withdrawal') {
      if (incomingTime >= previousTime) target.quotes[outcome.key] = { ...previous, inactive: true, error: outcome.error, checkedAt: outcome.checkedAt };
    } else if (incomingTime > previousTime || incomingTime === previousTime && !previous.inactive) {
      target.quotes[outcome.key] = { quote: outcome.quote, inactive: false, error: null, checkedAt: outcome.checkedAt };
    }
  }
  function snapshot() {
    const time = timeNow(); const result = {};
    const coordinationUnavailable = cache?.consistentSnapshots && (persistenceStatus === 'failed' || persistenceStatus === 'conflict');
    for (const [id, { identity }] of productMap) {
      const configured = descriptors.filter(source => source.productId === id);
      const evidence = configured.map(source => {
        const entry = state.quotes[source.key]; const quote = entry?.quote;
        const age = quote ? time - Date.parse(quote.asOf || quote.observedAt) : Infinity;
        return { id: source.id, name: source.name, url: source.url, currency: 'GBP', marketPence: quote?.marketPence ?? null, observedAt: quote?.observedAt ?? null, asOf: quote?.asOf ?? null, providerUpdatedAt: quote?.providerUpdatedAt ?? null, status: coordinationUnavailable || !quote || entry.inactive ? 'unavailable' : age >= STALE_MS ? 'stale' : 'current', error: entry?.error || null };
      });
      const current = evidence.filter(source => source.status === 'current');
      const stale = evidence.filter(source => source.status === 'stale');
      const eligible = current.length ? current : stale;
      const selected = [...eligible].sort((left, right) => left.marketPence - right.marketPence || Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
      const marketPence = selected?.marketPence ?? null;
      const shopPence = marketPence === null ? null : discountedPence(marketPence);
      result[id] = { productId: id, identity: { ...identity }, status: selected ? (current.length ? 'current' : 'stale') : 'unavailable', currency: 'GBP', marketPence, shopPence, savingsPence: marketPence === null ? null : marketPence - shopPence, observedAt: selected?.observedAt ?? null, asOf: selected?.asOf ?? null, expiresAt: selected ? iso(Date.parse(selected.asOf || selected.observedAt) + STALE_MS) : null, selectedSourceId: selected?.id ?? null, configuredSourceCount: configured.length, currentSourceCount: current.length, indicative: current.length < 2, method: METHOD, sources: evidence };
    }
    const attempted = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : null;
    return { generatedAt: iso(time), nextRefreshAt: iso(writeFailure ? writeFailure.retryAt : state.refreshCursor > 0 || attempted === null ? time : nextWeeklyRefresh(attempted)), lastRefreshAttemptAt: state.lastAttemptAt, refreshPending: state.refreshCursor > 0, refreshProgress: { completedSources: state.refreshCursor || (attempted !== null ? descriptors.length : 0), totalSources: descriptors.length }, persistenceStatus, discountBps: DISCOUNT_BPS, refreshIntervalMs: REFRESH_MS, freshnessMs: STALE_MS, reviewSchedule: 'Monday 09:00 Europe/London', currency: 'GBP', referenceType: 'UK retail asking price', referencePeriod: 'weekly', method: METHOD, products: result };
  }
  async function retrieve(source) {
    const controller = new AbortController(); let timer;
    const operation = (async () => {
      const response = await fetchImpl(source.url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { Accept: source.format === 'jsonld' ? 'text/html,application/xhtml+xml' : 'application/json' }, signal: controller.signal });
      if (!response.ok || response.redirected) throw problem(`provider-http-${response.status}`);
      if (response.url && response.url !== source.url) throw problem('unexpected-response-url');
      const body = await readBody(response, limits.maxBodyBytes, controller.signal);
      const time = timeNow();
      const parsed = parseSourceDocument(body, source, time);
      return { ...parsed, productId: source.productId, sourceId: source.id, identity: { ...source.identity }, observedAt: iso(time), asOf: iso(time) };
    })();
    try {
      return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(problem('timeout')); }, limits.timeoutMs); })]);
    } finally { clearTimeout(timer); }
  }
  async function refresh() {
    await initialize();
    if (inflight) return inflight;
    inflight = (async () => {
      if (cache?.consistentSnapshots && !await reloadStorage()) return snapshot();
      if (writeFailure && timeNow() < writeFailure.retryAt) return snapshot();
      const draft = JSON.parse(JSON.stringify(state)), outcomes = [];
      const originalRevision = storageRevision;
      if (!draft.refreshCursor) draft.cycleStartedAt = iso(timeNow());
      const end = Math.min(descriptors.length, draft.refreshCursor + limits.batchSources);
      let cursor = draft.refreshCursor;
      const runner = async () => {
        while (cursor < end) {
          const source = descriptors[cursor++]; let outcome;
          try { const quote = await retrieve(source); outcome = { key: source.key, kind: 'quote', quote, checkedAt: quote.observedAt }; }
          catch (error) { outcome = { key: source.key, kind: error.definitive ? 'withdrawal' : 'failure', error: error.code || 'provider-unavailable', checkedAt: iso(timeNow()) }; }
          outcomes.push(outcome); applyOutcome(draft, outcome);
        }
      };
      await Promise.all(Array.from({ length: Math.min(limits.concurrency, end - draft.refreshCursor) }, runner));
      draft.refreshCursor = end < descriptors.length ? end : 0;
      if (!draft.refreshCursor) { draft.lastAttemptAt = draft.cycleStartedAt; draft.cycleStartedAt = null; }
      if (typeof cache?.compareAndSwap === 'function') {
        let candidate = draft, revision = originalRevision;
        try {
          for (let attempt = 0; attempt < 4; attempt++) {
            const result = await cache.compareAndSwap(cacheKey, candidate, revision);
            const latest = result.latest;
            if (latest.value && !adoptSaved(latest.value, timeNow())) throw Error('Invalid price snapshot readback');
            storageRevision = latest.revision;
            if (result.written) { writeFailure = null; persistenceStatus = 'stored'; return snapshot(); }
            // Another writer won. Rebase observations onto its exact revision,
            // preserving its cursor and any newer authoritative source result.
            candidate = JSON.parse(JSON.stringify(state));
            for (const outcome of outcomes) applyOutcome(candidate, outcome);
            revision = latest.revision;
          }
          writeFailure = { status: 'conflict', revision: storageRevision, retryAt: timeNow() + 300000 }; persistenceStatus = 'conflict';
        } catch { await reloadStorage(); writeFailure = { status: 'failed', revision: storageRevision, retryAt: timeNow() + 300000 }; persistenceStatus = 'failed'; }
      } else {
        state = draft;
        try { if (cache) { await cache.put(cacheKey, JSON.parse(JSON.stringify(state))); persistenceStatus = 'stored'; } } catch { persistenceStatus = 'failed'; }
      }
      return snapshot();
    })();
    try { return await inflight; } finally { inflight = null; }
  }
  async function getSnapshot() {
    const warm = initialized; await initialize();
    if (warm && cache?.consistentSnapshots && !inflight) await reloadStorage();
    return snapshot();
  }
  async function handleRequest(request) {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (url.pathname !== '/api/prices') return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
    if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'GET required' }), { status: 405, headers: { ...headers, Allow: 'GET' } });
    // Query parameters never select a fetch target, force refresh, or change discount.
    await initialize();
    const time = timeNow();
    if (inflight) await inflight;
    else if (state.refreshCursor > 0 || !state.lastAttemptAt || time >= nextWeeklyRefresh(Date.parse(state.lastAttemptAt))) await refresh();
    return new Response(JSON.stringify(snapshot()), { status: 200, headers });
  }
  return { handleRequest, getSnapshot, refresh };
}
