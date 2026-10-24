import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = (code) => { throw Object.assign(new Error(code), { probeCode: code }); };
const check = (condition, code) => { if (!condition) fail(code); };
const key = (identity) => identity.cardId + ':' + identity.variantId;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function integer(value, min, max, code) {
  check(Number.isSafeInteger(value) && value >= min && value <= max, code);
  return value;
}
function secureUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('invalid_url'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port
    && !isIP(url.hostname.replace(/^\[|\]$/g, '')) && url.hostname.includes('.')
    && !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname), 'unsafe_url');
  return url;
}
function origin(value) {
  const url = secureUrl(value);
  check(url.pathname === '/' && !url.search, 'origin_required');
  return url.origin;
}

export function validateRetrievalCohort(input) {
  const cohort = structuredClone(input);
  check(cohort?.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(cohort.probeSourceSha ?? ''), 'invalid_cohort');
  cohort.apiOrigin = origin(cohort.apiOrigin);
  check(Array.isArray(cohort.cdnOrigins) && cohort.cdnOrigins.length <= 10, 'invalid_cdn_origins');
  cohort.cdnOrigins = [...new Set(cohort.cdnOrigins.map(origin))];
  check(Array.isArray(cohort.cases) && cohort.cases.length > 0 && cohort.cases.length <= 20, 'invalid_cases');
  check(new Set(cohort.cases.map((item) => item?.id)).size === cohort.cases.length, 'duplicate_case');
  for (const item of cohort.cases) {
    check(item && /^[a-z0-9_-]{1,80}$/.test(item.id ?? '') && ['card', 'set'].includes(item.kind), 'invalid_case');
    check(Array.isArray(item.identities) && item.identities.length > 0 && item.identities.length <= 500, 'invalid_identities');
    if (item.kind === 'card') check(item.identities.length === 1, 'card_requires_one_identity');
    const first = item.identities[0];
    for (const identity of item.identities) {
      check(identity && ['cardId', 'variantId', 'setId', 'catalogueVersionId'].every((field) => UUID.test(identity[field] ?? ''))
        && typeof identity.collectorNumber === 'string' && identity.collectorNumber.length > 0
        && identity.collectorNumber.length <= 40 && /^[a-zA-Z-]{2,10}$/.test(identity.languageCode ?? ''), 'invalid_identity');
      check(identity.setId === first.setId && identity.languageCode === first.languageCode
        && identity.catalogueVersionId === first.catalogueVersionId, 'mixed_set_scope');
    }
    check(new Set(item.identities.map(key)).size === item.identities.length, 'duplicate_expected_identity');
    if (item.image !== undefined) {
      check(item.image && item.kind === 'card' && cohort.cdnOrigins.length > 0, 'image_requires_card_and_cdn');
      check(typeof item.image.assetId === 'string' && item.image.assetId.length > 0 && item.image.assetId.length <= 512
        && /^(original|card-grid|search-result|detail-page)$/.test(item.image.role ?? '')
        && /^image\/(png|jpeg|webp|avif|svg\+xml)$/.test(item.image.mimeType ?? '')
        && /^[a-f0-9]{64}$/.test(item.image.sha256 ?? ''), 'invalid_image_evidence');
      integer(item.image.byteSize, 1, 10 * 1024 * 1024, 'invalid_image_size');
    }
  }
  return cohort;
}

export function durationSummary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (ratio) => sorted.length ? sorted[Math.ceil(sorted.length * ratio) - 1] : null;
  return { count: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.at(-1) ?? null };
}
function validateCard(card, expected) {
  check(card?.cardId === expected.cardId && card.set?.setId === expected.setId
    && card.languageCode === expected.languageCode && card.catalogueVersionId === expected.catalogueVersionId
    && card.collectorNumber?.value === expected.collectorNumber, 'card_identity_mismatch');
  check(Array.isArray(card.variants), 'variants_missing');
  const variants = card.variants.filter((variant) => variant?.variantId === expected.variantId);
  check(variants.length === 1, 'variant_missing_or_duplicate');
  return variants[0];
}

// probeSourceSha is the tested candidate, not evidence of a deployed revision.
// Origins must be explicitly trusted by the operator; this is not a DNS sandbox.
export async function probeRetrievalAcceptance(input, options = {}) {
  const cohort = validateRetrievalCohort(input);
  const samples = integer(options.samples ?? 1, 1, 5, 'invalid_samples');
  const timeoutMs = integer(options.timeoutMs ?? 10000, 1, 30000, 'invalid_timeout');
  const maxRequests = integer(options.maxRequests ?? 100, 1, 500, 'invalid_request_budget');
  const maxBytes = integer(options.maxBytes ?? 64 * 1024 * 1024, 1, 128 * 1024 * 1024, 'invalid_byte_budget');
  check(options.surface === undefined || ['fixture', 'live_api'].includes(options.surface), 'invalid_surface');
  check(options.surface !== 'live_api' || options.fetchImpl === undefined, 'live_requires_native_fetch');
  check(options.surface === 'live_api' || typeof options.fetchImpl === 'function', 'fixture_requires_injected_fetch');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const requests = [];
  let totalBytes = 0;

  async function read(value, type, expectedImage) {
    const url = secureUrl(value);
    check(type === 'api' ? url.origin === cohort.apiOrigin
      : cohort.cdnOrigins.includes(url.origin) && !url.search, 'untrusted_origin');
    check(!options.signal?.aborted, 'cancelled');
    check(requests.length < maxRequests && totalBytes < maxBytes, 'budget_exhausted');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    const started = performance.now();
    const record = { type, status: null, bytes: 0, durationMs: 0, transportOk: false, error: null };
    requests.push(record);
    let reader;
    let response;
    let abortListener;
    const aborted = new Promise((_, reject) => {
      abortListener = () => reject(Object.assign(new Error('aborted'), { probeCode: options.signal?.aborted ? 'cancelled' : 'timeout' }));
      controller.signal.addEventListener('abort', abortListener, { once: true });
    });
    const bounded = (operation) => Promise.race([Promise.resolve().then(operation), aborted]);
    try {
      response = await bounded(() => fetchImpl(url.href, { method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { Accept: type === 'api' ? 'application/json' : expectedImage.mimeType } }));
      record.status = response.status;
      check(response.ok && !response.redirected && (!response.url || response.url === url.href), 'http_or_redirect');
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      check(mime === (type === 'api' ? 'application/json' : expectedImage.mimeType), 'content_type_mismatch');
      const ceiling = type === 'api' ? 2 * 1024 * 1024 : expectedImage.byteSize;
      const length = response.headers.get('content-length');
      if (length !== null) check(/^\d+$/.test(length) && Number(length) <= ceiling, 'body_too_large');
      check(response.body?.getReader, 'body_missing');
      reader = response.body.getReader();
      const chunks = [];
      for (;;) {
        const chunk = await bounded(() => reader.read());
        if (chunk.done) break;
        record.bytes += chunk.value.byteLength;
        totalBytes += chunk.value.byteLength;
        check(record.bytes <= ceiling && totalBytes <= maxBytes, 'body_too_large');
        chunks.push(Buffer.from(chunk.value));
      }
      const bytes = Buffer.concat(chunks);
      let result;
      if (type === 'api') {
        try { result = JSON.parse(bytes.toString('utf8')); } catch { fail('invalid_json'); }
        check(result?.data && typeof result.data === 'object' && !Array.isArray(result.data) && result.error == null, 'invalid_envelope');
      } else {
        check(bytes.length === expectedImage.byteSize && hash(bytes) === expectedImage.sha256, 'image_checksum_mismatch');
        result = null;
      }
      record.transportOk = true;
      return result;
    } catch (error) {
      record.error = error.probeCode ?? 'transport_failure';
      fail(record.error);
    } finally {
      record.durationMs = performance.now() - started;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', abortListener);
      if (reader) void reader.cancel().catch(() => {});
      else if (response?.body) void response.body.cancel().catch(() => {});
      controller.abort();
    }
  }
  async function pages(path, field, consume) {
    const cursors = new Set();
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(path, cohort.apiOrigin);
      url.searchParams.set('limit', '50');
      if (cursor) url.searchParams.set('cursor', cursor);
      const body = await read(url.href, 'api');
      const rows = body.data[field];
      check(Array.isArray(rows) && rows.length <= 50, 'invalid_page');
      consume(rows);
      const pagination = body.meta?.pagination;
      check(pagination && Object.hasOwn(pagination, 'nextCursor'), 'pagination_missing');
      cursor = pagination.nextCursor;
      if (cursor === null) return;
      check(typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 4096 && rows.length > 0, 'invalid_cursor');
      check(!cursors.has(cursor), 'repeated_cursor');
      cursors.add(cursor);
    }
    fail('page_budget_exhausted');
  }
  async function runCase(item) {
    const expected = item.identities[0];
    if (item.kind === 'set') {
      const wanted = new Map(item.identities.map((identity) => [key(identity), identity]));
      const seen = new Set();
      await pages('/v1/sets/' + expected.setId + '/cards?language=' + expected.languageCode + '&includeAssets=false', 'cards', (cards) => {
        check(cards.reduce((count, card) => count + (Array.isArray(card?.variants) ? card.variants.length : 0), 0) <= 50,
          'variant_page_limit_exceeded');
        for (const card of cards) {
          check(Array.isArray(card?.variants) && card.variants.length > 0 && card.variants.length <= 50, 'variants_missing');
          for (const variant of card.variants) {
            const identityKey = key({ cardId: card.cardId, variantId: variant?.variantId });
            check(wanted.has(identityKey), 'unexpected_identity');
            check(!seen.has(identityKey), 'duplicate_identity');
            validateCard(card, wanted.get(identityKey));
            seen.add(identityKey);
          }
        }
      });
      check(seen.size === wanted.size, 'incomplete_identity_set');
      return;
    }
    const body = await read(cohort.apiOrigin + '/v1/cards/' + expected.cardId, 'api');
    const variant = validateCard(body.data.card, expected);
    if (!item.image) return;
    const matches = [];
    const seenAssets = new Set();
    await pages('/v1/assets/manifest?assetType=card_image&variantId=' + expected.variantId, 'assets', (assets) => {
      for (const asset of assets) {
        check(typeof asset?.assetId === 'string' && !seenAssets.has(asset.assetId), 'duplicate_or_missing_asset');
        seenAssets.add(asset.assetId);
        if (asset.assetId === item.image.assetId) matches.push(asset);
      }
    });
    check(matches.length === 1, 'expected_asset_missing');
    const asset = matches[0];
    check(asset.cardId === expected.cardId && asset.variantId === expected.variantId
      && asset.setId === expected.setId && asset.assetType === 'card_image', 'asset_identity_mismatch');
    check(variant.image?.assetId === asset.assetId, 'card_manifest_asset_mismatch');
    const select = (image) => item.image.role === 'original' ? [image]
      : (image.derivatives ?? []).filter((entry) => entry.role === item.image.role);
    const renditions = select(asset);
    const cardRenditions = select(variant.image);
    check(renditions.length === 1 && cardRenditions.length === 1, 'rendition_missing_or_duplicate');
    const rendition = renditions[0];
    check(rendition.deliveryUrl === cardRenditions[0].deliveryUrl, 'card_manifest_url_mismatch');
    check(rendition.mimeType === item.image.mimeType && rendition.contentSha256 === item.image.sha256
      && rendition.byteSize === item.image.byteSize, 'asset_evidence_mismatch');
    await read(rendition.deliveryUrl, 'cdn', item.image);
  }

  const results = [];
  for (const item of cohort.cases) {
    for (let index = 0; index < samples; index += 1) {
      const started = performance.now();
      const requestStart = requests.length;
      const result = { id: item.id, sample: index + 1, ok: false, error: null, durationMs: 0, requestCount: 0 };
      try { await runCase(item); result.ok = true; }
      catch (error) { result.error = error.probeCode ?? 'validation_failure'; }
      result.durationMs = performance.now() - started;
      result.requestCount = requests.length - requestStart;
      results.push(result);
    }
  }
  return { schemaVersion: 1, probeSourceSha: cohort.probeSourceSha, probeSourceVerification: 'operator_supplied_unverified', servedApiRevision: 'unverified',
    cohortSha256: hash(JSON.stringify(cohort)), measuredAt: new Date().toISOString(),
    surface: options.surface ?? 'fixture', scope: 'explicit_public_api_and_cdn_cohort',
    ok: results.every((result) => result.ok), attemptedSamples: results.length,
    successfulSamples: results.filter((result) => result.ok).length, failedSamples: results.filter((result) => !result.ok).length,
    requestCount: requests.length, responseBytes: totalBytes,
    successfulSampleLatency: durationSummary(results.filter((result) => result.ok).map((result) => result.durationMs)),
    cacheState: 'uncontrolled_first_request_and_repeats', deviceRendering: 'not_run', deploymentApproved: false,
    results, requests };
}
