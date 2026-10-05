import { createHash } from 'node:crypto';

export const CARDMARKET_POKEMON_GAME_ID = 6;
export const cardmarketPublicGuideUrls = Object.freeze({
  priceGuide: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${CARDMARKET_POKEMON_GAME_ID}.json`,
  products: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_${CARDMARKET_POKEMON_GAME_ID}.json`,
});

const retryable = new Set([408, 429, 500, 502, 503, 504]);
const priceFields = ['avg', 'low', 'trend', 'avg1', 'avg7', 'avg30', 'avg-holo', 'low-holo', 'trend-holo', 'avg1-holo', 'avg7-holo', 'avg30-holo'];
const marketFields = ['trend', 'avg30', 'avg'];
const cleanEtag = value => String(value ?? '').trim().replace(/^W\//, '') || null;
const validPrice = value => value == null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function validCreatedAt(value) {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function retryAfterMs(value, fallbackMs) {
  if (!value) return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.round(seconds * 1000), 30_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 30_000) : fallbackMs;
}

async function responseTextWithinLimit(response, maxBytes) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new Error(`Cardmarket download exceeds ${maxBytes} byte limit.`);
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error(`Cardmarket download exceeds ${maxBytes} byte limit.`);
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`Cardmarket download exceeds ${maxBytes} byte limit.`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))));
}

function timeoutSignal(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Cardmarket download exceeded ${timeoutMs}ms deadline.`)), timeoutMs);
  const abort = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abort();
    else externalSignal.addEventListener('abort', abort, { once: true });
  }
  return { signal: controller.signal, dispose: () => { clearTimeout(timeout); externalSignal?.removeEventListener('abort', abort); } };
}

export function validateCardmarketPublicGuide(kind, payload) {
  if (!payload || typeof payload !== 'object' || payload.version !== 1 || !validCreatedAt(payload.createdAt)) throw new Error(`Invalid Cardmarket ${kind} envelope.`);
  const rows = kind === 'priceGuide' ? payload.priceGuides : kind === 'products' ? payload.products : null;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Cardmarket ${kind} rows missing or empty.`);
  const seen = new Set();
  for (const row of rows) {
    if (!Number.isSafeInteger(row?.idProduct) || row.idProduct <= 0 || seen.has(row.idProduct)) throw new Error(`Invalid Cardmarket ${kind} idProduct.`);
    seen.add(row.idProduct);
    if (!Number.isSafeInteger(row.idCategory) || row.idCategory <= 0) throw new Error(`Invalid Cardmarket ${kind} idCategory.`);
    if (kind === 'priceGuide') {
      if (!priceFields.some(field => Object.hasOwn(row, field) && validPrice(row[field])) || !priceFields.every(field => !Object.hasOwn(row, field) || validPrice(row[field]))) throw new Error('Invalid Cardmarket price-guide row.');
    } else if (typeof row.name !== 'string' || !row.name.trim()) throw new Error('Invalid Cardmarket product row.');
  }
  return rows;
}

/** Downloads one public static feed. No database or catalogue writes occur here. */
export async function downloadCardmarketPublicGuide(kind, { fetchImpl = fetch, retries = 2, previousEtag = null, signal, timeoutMs = 45_000, maxBytes = 32 * 1024 * 1024, retryDelayMs = 500, sleepImpl = sleep } = {}) {
  const url = cardmarketPublicGuideUrls[kind];
  if (!url) throw new Error(`Unsupported Cardmarket public guide kind: ${kind}`);
  if (!Number.isInteger(retries) || retries < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid Cardmarket download options.');
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const deadline = timeoutSignal(timeoutMs, signal);
    let receivedResponse = false;
    try {
      const response = await fetchImpl(url, { headers: previousEtag ? { 'If-None-Match': previousEtag } : undefined, signal: deadline.signal });
      receivedResponse = true;
      if (response.status === 304) return { kind, url, unchanged: true, etag: cleanEtag(response.headers.get('etag')), createdAt: null, rows: null, sha256: null };
      if (!response.ok) {
        lastError = new Error(`Cardmarket ${kind} download failed (${response.status}).`);
        if (!retryable.has(response.status) || attempt === retries) throw lastError;
        await sleepImpl(retryAfterMs(response.headers.get('retry-after'), retryDelayMs));
        continue;
      }
      const body = await responseTextWithinLimit(response, maxBytes);
      const payload = JSON.parse(body);
      const rows = validateCardmarketPublicGuide(kind, payload);
      return {
        kind, url, unchanged: false, etag: cleanEtag(response.headers.get('etag')), createdAt: payload.createdAt,
        rows, payload, rawPayload: body, byteLength: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'),
      };
    } catch (error) {
      lastError = error;
      if (receivedResponse || signal?.aborted || deadline.signal.aborted || attempt === retries) throw error;
      await sleepImpl(retryDelayMs);
    } finally {
      deadline.dispose();
    }
  }
  throw lastError;
}

/**
 * Public guide rows lack language, condition, grade and finish identity. Join only exact
 * Cardmarket IDs. `low` is an asking/listing floor and is intentionally not a market estimate.
 */
export function toCardmarketGeneralEstimate(product, guide, { sourceCreatedAt = null, sourceEtag = null, sourceSha256 = null } = {}) {
  if (!product || !guide || product.idProduct !== guide.idProduct || product.idCategory !== guide.idCategory) return null;
  const selectedField = marketFields.find(field => typeof guide[field] === 'number'
    && Number.isFinite(guide[field]) && guide[field] > 0);
  if (!selectedField) return null;
  return {
    idProduct: product.idProduct,
    idCategory: product.idCategory,
    currency: 'EUR',
    value: guide[selectedField],
    priceType: 'general_market_estimate',
    selectedField,
    sourceCreatedAt: validCreatedAt(sourceCreatedAt) ? sourceCreatedAt : null,
    sourceEtag: cleanEtag(sourceEtag),
    sourceSha256: typeof sourceSha256 === 'string' && /^[a-f0-9]{64}$/i.test(sourceSha256) ? sourceSha256.toLowerCase() : null,
    language: null,
    condition: null,
    finish: null,
  };
}

/** Explicitly represents `low` only as a provider asking-price floor. */
export function toCardmarketAskingPrice(product, guide, metadata = {}) {
  if (!product || !guide || product.idProduct !== guide.idProduct || product.idCategory !== guide.idCategory || !validPrice(guide.low) || guide.low == null) return null;
  return { ...toCardmarketMetadata(product, guide, metadata), value: guide.low, priceType: 'asking_price', selectedField: 'low' };
}

function toCardmarketMetadata(product, guide, { sourceCreatedAt = null, sourceEtag = null, sourceSha256 = null } = {}) {
  return { idProduct: product.idProduct, idCategory: product.idCategory, currency: 'EUR', sourceCreatedAt: validCreatedAt(sourceCreatedAt) ? sourceCreatedAt : null, sourceEtag: cleanEtag(sourceEtag), sourceSha256: typeof sourceSha256 === 'string' && /^[a-f0-9]{64}$/i.test(sourceSha256) ? sourceSha256.toLowerCase() : null, language: null, condition: null, finish: null };
}
