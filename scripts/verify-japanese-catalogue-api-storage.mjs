import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createCatalogueV1Service } from '../backend/lib/stackrApiV1.js';

export const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
export const STAGING_SUPABASE_ORIGIN = `https://${STAGING_PROJECT_REF}.supabase.co`;
export const PUBLIC_CATALOGUE_BUCKET = 'stackr-catalogue-public';
export const REQUIRED_DERIVATIVE_ROLES = Object.freeze([
  'card-grid',
  'search-result',
  'detail-page',
]);

const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const STORAGE_PATH_PREFIX = '/storage/v1/object/public/';
const DEFAULT_SAMPLE_LIMIT = 25;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function clean(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function parseInteger(value, fallback, { min, max, name }) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parseCli(argv) {
  const options = new Map();
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    const [name, ...valueParts] = argument.slice(2).split('=');
    options.set(name, valueParts.length ? valueParts.join('=') : true);
  }
  const probeStorage = options.has('skip-storage-probe')
    ? false
    : String(options.get('probe-storage') ?? 'true').toLowerCase() !== 'false';
  return {
    target: clean(options.get('target')) ?? clean(process.env.STACKR_CATALOGUE_IMPORT_TARGET) ?? 'staging',
    output: clean(options.get('output')),
    probeStorage,
    setConcurrency: parseInteger(options.get('set-concurrency'), 4, {
      min: 1,
      max: 8,
      name: 'set-concurrency',
    }),
    probeConcurrency: parseInteger(options.get('probe-concurrency'), 12, {
      min: 1,
      max: 16,
      name: 'probe-concurrency',
    }),
    probeRetries: parseInteger(options.get('probe-retries'), 3, {
      min: 0,
      max: 5,
      name: 'probe-retries',
    }),
    probeTimeoutMs: parseInteger(options.get('probe-timeout-ms'), 15_000, {
      min: 1_000,
      max: 30_000,
      name: 'probe-timeout-ms',
    }),
  };
}

export function assertCanonicalStagingConfiguration({ target, supabaseUrl, serviceKey }) {
  if (target !== 'staging') {
    throw new Error('Japanese API/storage verification is restricted to target=staging.');
  }
  const value = clean(supabaseUrl);
  if (!value || value.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(`SUPABASE_URL must be canonical staging ${STAGING_SUPABASE_ORIGIN}.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`SUPABASE_URL must be canonical staging ${STAGING_SUPABASE_ORIGIN}.`);
  }
  if (parsed.origin !== STAGING_SUPABASE_ORIGIN
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password) {
    throw new Error(`SUPABASE_URL must be exactly ${STAGING_SUPABASE_ORIGIN}.`);
  }
  if (!clean(serviceKey)) {
    throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.');
  }
  return { supabaseUrl: STAGING_SUPABASE_ORIGIN };
}

function deeplyDecodePathSegment(value) {
  let decoded = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) return decoded;
    decoded = next;
  }
  return decoded;
}

function safeObjectPath(value) {
  const pathValue = clean(value);
  if (!pathValue || pathValue.startsWith('/') || pathValue.endsWith('/')) return null;
  const rawParts = pathValue.split('/');
  if (rawParts.some((part) => !part)) return null;
  try {
    const parts = rawParts.map(deeplyDecodePathSegment);
    if (parts.some((part) => (
      !part
      || part === '.'
      || part === '..'
      || part.includes('/')
      || part.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(part)
    ))) return null;
    return parts.join('/');
  } catch {
    return null;
  }
}

export function inspectStagingStorageUrl(value) {
  const raw = clean(value);
  if (!raw) return { ok: false, reason: 'missing_url' };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'https:'
    || parsed.origin !== STAGING_SUPABASE_ORIGIN
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash) {
    return { ok: false, reason: 'non_staging_storage_origin' };
  }
  if (!parsed.pathname.startsWith(STORAGE_PATH_PREFIX)) {
    return { ok: false, reason: 'non_public_storage_path' };
  }
  const storagePath = parsed.pathname.slice(STORAGE_PATH_PREFIX.length);
  const slash = storagePath.indexOf('/');
  if (slash <= 0) return { ok: false, reason: 'missing_storage_object' };
  let bucket;
  try {
    bucket = deeplyDecodePathSegment(storagePath.slice(0, slash));
  } catch {
    return { ok: false, reason: 'invalid_storage_bucket' };
  }
  if (bucket !== PUBLIC_CATALOGUE_BUCKET) {
    return { ok: false, reason: 'unexpected_storage_bucket' };
  }
  const objectKey = safeObjectPath(storagePath.slice(slash + 1));
  if (!objectKey) return { ok: false, reason: 'unsafe_storage_object_key' };
  return {
    ok: true,
    normalizedUrl: parsed.href,
    bucket,
    objectKey,
  };
}

function inspectDelivery(deliveryPath, deliveryUrl, label) {
  const reasons = [];
  const safePath = safeObjectPath(deliveryPath);
  if (!safePath) reasons.push(`${label}:unsafe_delivery_path`);
  const url = inspectStagingStorageUrl(deliveryUrl);
  if (!url.ok) reasons.push(`${label}:${url.reason}`);
  if (safePath && url.ok && safePath !== url.objectKey) {
    reasons.push(`${label}:delivery_path_url_mismatch`);
  }
  return { reasons, url: url.ok ? url.normalizedUrl : null };
}

export function inspectAppReadyImage(image) {
  const reasons = [];
  const urls = [];
  if (!image || typeof image !== 'object') {
    return { ok: false, reasons: ['missing_image'], urls };
  }
  if (image.assetType !== 'card_image') reasons.push('not_card_image');
  if (!clean(image.assetId)) reasons.push('missing_asset_id');
  if (image.permissionStatus !== 'approved') reasons.push('permission_not_approved');
  if (clean(image.unavailableReason)) reasons.push('asset_marked_unavailable');

  const original = inspectDelivery(image.deliveryPath, image.deliveryUrl, 'original');
  reasons.push(...original.reasons);
  if (original.url) urls.push(original.url);

  const derivatives = Array.isArray(image.derivatives) ? image.derivatives : [];
  for (const role of REQUIRED_DERIVATIVE_ROLES) {
    const matches = derivatives.filter((derivative) => clean(derivative?.role) === role);
    if (matches.length !== 1) {
      reasons.push(matches.length ? `${role}:duplicate_derivative_role` : `${role}:missing_derivative`);
      continue;
    }
    const delivery = inspectDelivery(matches[0].deliveryPath, matches[0].deliveryUrl, role);
    reasons.push(...delivery.reasons);
    if (delivery.url) urls.push(delivery.url);
  }
  return { ok: reasons.length === 0, reasons, urls };
}

export async function mapWithConcurrency(values, concurrency, worker) {
  const items = [...values];
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

function retryDelayMs(attempt, response) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1_000, 5_000);
  return Math.min(250 * (2 ** attempt), 2_000);
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // A body that is already closed does not affect object availability.
  }
}

async function readFirstResponseChunk(response) {
  const reader = response?.body?.getReader?.();
  if (!reader) return 0;
  try {
    const { value } = await reader.read();
    return value?.byteLength ?? 0;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The first read can close a short ranged response before cancellation.
    }
  }
}

export async function probeStorageUrl(url, options = {}) {
  const inspected = inspectStagingStorageUrl(url);
  if (!inspected.ok) {
    return { ok: false, url, attempts: 0, method: null, status: null, error: inspected.reason };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    const method = 'GET';
    try {
      response = await fetchImpl(inspected.normalizedUrl, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'image/*', Range: 'bytes=0-31' },
      });
      const status = response.status;
      if (status >= 200 && status < 300) {
        const contentType = clean(response.headers.get('content-type'))?.toLowerCase() ?? null;
        if (!contentType?.startsWith('image/')) {
          await cancelResponseBody(response);
          return {
            ok: false,
            url: inspected.normalizedUrl,
            attempts: attempt + 1,
            method,
            status,
            contentType,
            bytesRead: 0,
            error: 'non_image_content_type',
          };
        }
        const bytesRead = await readFirstResponseChunk(response);
        if (bytesRead === 0) {
          return {
            ok: false,
            url: inspected.normalizedUrl,
            attempts: attempt + 1,
            method,
            status,
            contentType,
            bytesRead,
            error: 'empty_image_body',
          };
        }
        return {
          ok: true,
          url: inspected.normalizedUrl,
          attempts: attempt + 1,
          method,
          status,
          contentType,
          bytesRead,
          error: null,
        };
      }
      await cancelResponseBody(response);
      if (!TRANSIENT_HTTP_STATUSES.has(status) || attempt === retries) {
        return {
          ok: false,
          url: inspected.normalizedUrl,
          attempts: attempt + 1,
          method,
          status,
          error: `http_${status}`,
        };
      }
      await sleep(retryDelayMs(attempt, response));
    } catch (error) {
      if (attempt === retries) {
        return {
          ok: false,
          url: inspected.normalizedUrl,
          attempts: attempt + 1,
          method,
          status: null,
          error: clean(error?.name) ?? clean(error?.message) ?? 'request_failed',
        };
      }
      await sleep(retryDelayMs(attempt, response));
    }
  }
  throw new Error('unreachable_storage_probe_state');
}

async function queryRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function loadPublishedJapaneseVariants(supabase) {
  const pageSize = 1_000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await queryRows(
      supabase.schema('api').from('catalogue_cards')
        .select('variant_id,printing_id,set_id,catalogue_version_id')
        .eq('language_code', 'ja')
        .order('variant_id', { ascending: true })
        .range(from, from + pageSize - 1),
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function collectJapaneseSets(service) {
  const sets = [];
  const seenCursors = new Set();
  let cursor = null;
  do {
    const page = await service.sets({ language: 'ja', game: 'pokemon', limit: 250, cursor });
    sets.push(...(page.sets ?? []));
    cursor = page.pagination?.nextCursor ?? null;
    if (cursor && seenCursors.has(cursor)) throw new Error('Japanese set pagination repeated a cursor.');
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return sets;
}

async function collectJapaneseSetCards(service, setId) {
  const cards = [];
  const seenCursors = new Set();
  let cursor = null;
  do {
    const page = await service.setCards(setId, { language: 'ja', limit: 500, cursor });
    cards.push(...(page.cards ?? []));
    cursor = page.pagination?.nextCursor ?? null;
    if (cursor && seenCursors.has(cursor)) throw new Error(`Japanese card pagination repeated a cursor for set ${setId}.`);
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return cards;
}

function percentage(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

function sample(values, limit = DEFAULT_SAMPLE_LIMIT) {
  return [...values].slice(0, limit);
}

export async function verifyJapaneseCatalogue(options) {
  const service = options.service;
  const expectedRows = options.expectedRows ?? await options.loadExpectedVariants();
  const manifest = await service.manifest();
  const japaneseShard = manifest.availableLanguageShards?.find((shard) => shard.languageCode === 'ja') ?? null;
  const manifestProblems = [];
  if (!japaneseShard?.catalogueVersion || !japaneseShard?.catalogueVersionId) {
    manifestProblems.push('japanese_catalogue_not_published');
  }

  const expectedById = new Map();
  const expectedDuplicates = [];
  for (const row of expectedRows) {
    const variantId = clean(row?.variant_id);
    if (!variantId) continue;
    if (expectedById.has(variantId)) expectedDuplicates.push(variantId);
    else expectedById.set(variantId, row);
  }

  const sets = await collectJapaneseSets(service);
  const duplicateSetIds = [];
  const uniqueSetIds = new Set();
  for (const set of sets) {
    if (!clean(set?.setId)) continue;
    if (uniqueSetIds.has(set.setId)) duplicateSetIds.push(set.setId);
    uniqueSetIds.add(set.setId);
  }
  const cardPages = await mapWithConcurrency(sets, options.setConcurrency ?? 4, async (set) => ({
    set,
    cards: await collectJapaneseSetCards(service, set.setId),
  }));

  const enumeratedById = new Map();
  const duplicateVariantIds = [];
  const printingIds = new Set();
  const structuralApiErrors = [];
  const nonAppReadyVariants = [];
  const nonAppReadyVariantIds = new Set();
  const storageUrls = new Set();
  let nativeImageVariantCount = 0;
  let aliasedImageVariantCount = 0;
  let printingScopedImageVariantCount = 0;

  for (const { set, cards } of cardPages) {
    for (const card of cards) {
      if (card.languageCode !== 'ja') {
        structuralApiErrors.push({
          variantId: card.variants?.[0]?.variantId ?? null,
          reasons: ['non_japanese_card'],
        });
      }
      if (card.set?.setId !== set.setId) {
        structuralApiErrors.push({
          variantId: card.variants?.[0]?.variantId ?? null,
          reasons: ['card_returned_from_wrong_set'],
        });
      }
      if (clean(card.cardId)) printingIds.add(card.cardId);
      for (const variant of card.variants ?? []) {
        const variantId = clean(variant?.variantId);
        if (!variantId) {
          structuralApiErrors.push({ variantId: null, reasons: ['missing_variant_id'] });
          continue;
        }
        if (enumeratedById.has(variantId)) {
          duplicateVariantIds.push(variantId);
          continue;
        }
        enumeratedById.set(variantId, { set, card, variant });
        const image = inspectAppReadyImage(variant.image);
        if (!image.ok) {
          nonAppReadyVariantIds.add(variantId);
          nonAppReadyVariants.push({ variantId, reasons: image.reasons });
        }
        for (const url of image.urls) storageUrls.add(url);
        if (variant.image?.variantId === variantId) nativeImageVariantCount += 1;
        else if (clean(variant.image?.variantId)) aliasedImageVariantCount += 1;
        else printingScopedImageVariantCount += 1;
      }
    }
  }

  const missingFromApi = [...expectedById.keys()].filter((variantId) => !enumeratedById.has(variantId));
  const unexpectedInApi = [...enumeratedById.keys()].filter((variantId) => !expectedById.has(variantId));
  const versionMismatches = [...enumeratedById.entries()]
    .filter(([, entry]) => japaneseShard?.catalogueVersionId
      && entry.card.catalogueVersionId !== japaneseShard.catalogueVersionId)
    .map(([variantId]) => variantId);

  const uniqueUrls = [...storageUrls].sort();
  let probeResults = [];
  if (options.probeStorage) {
    probeResults = await mapWithConcurrency(uniqueUrls, options.probeConcurrency ?? 12, (url) => (
      probeStorageUrl(url, {
        fetchImpl: options.fetchImpl,
        sleep: options.sleep,
        retries: options.probeRetries ?? 3,
        timeoutMs: options.probeTimeoutMs ?? 15_000,
      })
    ));
  }
  const failedProbes = probeResults.filter((result) => !result.ok);
  const expectedVariantCount = expectedById.size;
  const appReadyVariantCount = [...expectedById.keys()].filter((variantId) => (
    enumeratedById.has(variantId) && !nonAppReadyVariantIds.has(variantId)
  )).length;
  const blockers = {
    manifest: manifestProblems.length,
    expectedDuplicateVariants: expectedDuplicates.length,
    duplicateSets: duplicateSetIds.length,
    duplicateApiVariants: duplicateVariantIds.length,
    missingFromApi: missingFromApi.length,
    unexpectedInApi: unexpectedInApi.length,
    versionMismatches: versionMismatches.length,
    structuralApiErrors: structuralApiErrors.length,
    nonAppReadyVariants: nonAppReadyVariantIds.size,
    failedStorageProbes: failedProbes.length,
  };
  const ok = Object.values(blockers).every((count) => count === 0)
    && expectedVariantCount > 0
    && (!options.probeStorage || probeResults.length === uniqueUrls.length);

  return {
    ok,
    stagingProject: STAGING_PROJECT_REF,
    language: 'ja',
    generatedAt: new Date().toISOString(),
    publishedCatalogueVersion: japaneseShard?.catalogueVersion ?? null,
    publishedCatalogueVersionId: japaneseShard?.catalogueVersionId ?? null,
    setCount: uniqueSetIds.size,
    printingCount: printingIds.size,
    expectedVariantCount,
    enumeratedVariantCount: enumeratedById.size,
    appReadyVariantCount,
    apiAppReadyCoveragePercent: percentage(appReadyVariantCount, expectedVariantCount),
    nativeImageVariantCount,
    nativeImageCoveragePercent: percentage(nativeImageVariantCount, expectedVariantCount),
    aliasedImageVariantCount,
    printingScopedImageVariantCount,
    uniqueStorageUrlCount: uniqueUrls.length,
    storageProbe: {
      enabled: Boolean(options.probeStorage),
      checked: probeResults.length,
      passed: probeResults.filter((result) => result.ok).length,
      failed: failedProbes.length,
      coveragePercent: options.probeStorage ? percentage(probeResults.filter((result) => result.ok).length, uniqueUrls.length) : null,
      methods: probeResults.reduce((counts, result) => {
        if (result.method) counts[result.method] = (counts[result.method] ?? 0) + 1;
        return counts;
      }, {}),
    },
    blockers,
    samples: {
      manifestProblems: sample(manifestProblems),
      expectedDuplicateVariantIds: sample(expectedDuplicates),
      duplicateSetIds: sample(duplicateSetIds),
      duplicateApiVariantIds: sample(duplicateVariantIds),
      missingFromApiVariantIds: sample(missingFromApi),
      unexpectedInApiVariantIds: sample(unexpectedInApi),
      versionMismatchVariantIds: sample(versionMismatches),
      structuralApiErrors: sample(structuralApiErrors),
      nonAppReadyVariants: sample(nonAppReadyVariants),
      failedStorageProbes: sample(failedProbes),
    },
  };
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  const serviceKey = clean(process.env.SUPABASE_SECRET_KEY)
    ?? clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const configuration = assertCanonicalStagingConfiguration({
    target: cli.target,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceKey,
  });
  const supabase = createClient(configuration.supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'stackr-ja-api-storage-verifier/1.0' } },
  });
  const service = createCatalogueV1Service({
    supabase,
    searchSupabase: supabase,
    assetSupabase: supabase,
    supabaseUrl: configuration.supabaseUrl,
    assetBaseUrl: '',
  });
  const report = await verifyJapaneseCatalogue({
    service,
    loadExpectedVariants: () => loadPublishedJapaneseVariants(supabase),
    setConcurrency: cli.setConcurrency,
    probeStorage: cli.probeStorage,
    probeConcurrency: cli.probeConcurrency,
    probeRetries: cli.probeRetries,
    probeTimeoutMs: cli.probeTimeoutMs,
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (cli.output) await writeFile(cli.output, json, 'utf8');
  process.stdout.write(json);
  if (!report.ok) process.exitCode = 1;
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && fileURLToPath(import.meta.url) === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
