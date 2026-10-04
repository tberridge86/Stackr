import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { downloadCardmarketPublicGuide, validateCardmarketPublicGuide } from './cardmarket-public-guide.mjs';
import { planCardmarketCachedIngestion, toCardmarketBlendedStoreResults, validateCardmarketMappingLedger } from './cardmarket-cached-ingestion.mjs';
import { fetchEcbCatalogueFx } from './catalogue-price-fx.mjs';
import { createCataloguePriceDatabase } from './catalogue-price-database.mjs';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

const KINDS = ['products', 'priceGuide'];
const MAX_PAGE_SIZE = 500;
const HOUR = 60 * 60 * 1000;
const REVIEW_CONCURRENCY = 24;
const allowedRepairReasons = new Set(['missing_exact_mapping', 'ambiguous_provider_mapping', 'mapping_missing_language_variant_finish_evidence', 'duplicate_canonical_target', 'missing_price_guide_row', 'no_market_guide_value', 'provider_category_mismatch']);

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = text => createHash('sha256').update(text).digest('hex');
const fileName = (kind, hash) => `${kind}-${hash}.json`;
function positiveInteger(value, label) { if (!Number.isInteger(value) || value < 1) throw Error(`Invalid ${label}.`); return value; }
function validManifestEntry(entry, kind) {
  return entry && entry.kind === kind && typeof entry.file === 'string' && /^[A-Za-z]+-[a-f0-9]{64}\.json$/.test(entry.file)
    && /^[a-f0-9]{64}$/.test(entry.sha256 ?? '') && Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0
    && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt))
    && typeof entry.retrievedAt === 'string' && Number.isFinite(Date.parse(entry.retrievedAt));
}

export async function readCardmarketRetainedManifest(cacheDir) {
  try {
    const manifest = await json(join(cacheDir, 'manifest.json'));
    if (!manifest || manifest.schemaVersion !== 1 || !manifest.feeds || !KINDS.every(kind => validManifestEntry(manifest.feeds[kind], kind))) return null;
    return manifest;
  } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

/** Reads the already retained public pair without making a network request. */
export async function loadCardmarketRetainedFeeds(cacheDir) {
  const manifest = await readCardmarketRetainedManifest(resolve(cacheDir));
  if (!manifest) throw Error('No valid retained Cardmarket manifest exists. Use the daily retention workflow first.');
  const feeds = Object.fromEntries(await Promise.all(KINDS.map(async kind => [kind, await readVerifiedRetainedFeed(resolve(cacheDir), manifest.feeds[kind], kind)])));
  return { manifest, feeds };
}

async function readVerifiedRetainedFeed(cacheDir, entry, kind) {
  const text = await readFile(join(cacheDir, entry.file), 'utf8');
  if (Buffer.byteLength(text) !== entry.byteLength || sha256(text) !== entry.sha256) throw Error(`Retained Cardmarket ${kind} payload does not match its manifest.`);
  const payload = JSON.parse(text); validateCardmarketPublicGuide(kind, payload);
  if (payload.createdAt !== entry.createdAt) throw Error(`Retained Cardmarket ${kind} source date does not match its manifest.`);
  return payload;
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, value, 'utf8'); await rename(temp, path);
}

/**
 * Retains one dated pair of public files. A retained successful pair is never fetched
 * again within the same UTC day; later requests are conditional on its saved ETag.
 */
export async function refreshCardmarketDailyFeeds({ cacheDir, fetchImpl = fetch, now = Date.now(), download = downloadCardmarketPublicGuide } = {}) {
  if (!cacheDir) throw Error('A Cardmarket cache directory is required.');
  const absoluteCache = resolve(cacheDir); const prior = await readCardmarketRetainedManifest(absoluteCache);
  const today = new Date(now).toISOString().slice(0, 10);
  const checkedToday = prior && today === new Date(Date.parse(prior.retrievedAt)).toISOString().slice(0, 10);
  const guidePublishedToday = prior && today === new Date(Date.parse(prior.feeds.priceGuide.createdAt)).toISOString().slice(0, 10);
  // Recheck yesterday's unchanged guide hourly until today's provider build
  // arrives; a midnight 304 must not freeze yesterday's guide for another day.
  if (checkedToday && (guidePublishedToday || now - Date.parse(prior.retrievedAt) < HOUR)) {
    const feeds = Object.fromEntries(await Promise.all(KINDS.map(async kind => [kind, await readVerifiedRetainedFeed(absoluteCache, prior.feeds[kind], kind)])));
    return { refreshed: false, reason: 'daily_cache_fresh', manifest: prior, feeds };
  }
  await mkdir(absoluteCache, { recursive: true });
  const next = { schemaVersion: 1, retrievedAt: new Date(now).toISOString(), feeds: {} };
  const feeds = {};
  for (const kind of KINDS) {
    const existing = prior?.feeds[kind];
    const result = await download(kind, { fetchImpl, previousEtag: existing?.etag ?? null });
    if (result.unchanged) {
      if (!existing) throw Error(`Cardmarket ${kind} returned 304 without a retained payload.`);
      feeds[kind] = await readVerifiedRetainedFeed(absoluteCache, existing, kind);
      next.feeds[kind] = { ...existing, etag: result.etag ?? existing.etag, retrievedAt: next.retrievedAt };
      continue;
    }
    if (!result.payload || !Number.isSafeInteger(result.byteLength) || result.byteLength < 1) throw Error(`Cardmarket ${kind} download did not return a retainable payload.`);
    const text = result.rawPayload;
    if (typeof text !== 'string') throw Error(`Cardmarket ${kind} download did not preserve its raw payload.`);
    if (sha256(text) !== result.sha256 || Buffer.byteLength(text) !== result.byteLength) throw Error(`Cardmarket ${kind} payload serialization changed before retention.`);
    const file = fileName(kind, result.sha256);
    await writeAtomic(join(absoluteCache, file), text);
    feeds[kind] = result.payload;
    next.feeds[kind] = { kind, file, sha256: result.sha256, etag: result.etag, byteLength: result.byteLength, createdAt: result.createdAt, retrievedAt: next.retrievedAt, sourceUrl: result.url };
  }
  await writeAtomic(join(absoluteCache, 'manifest.json'), `${JSON.stringify(next, null, 2)}\n`);
  return { refreshed: true, reason: prior ? 'conditional_refresh' : 'initial_retention', manifest: next, feeds };
}

function reviewPayload(mapping) {
  return { printingId: mapping.printingId, catalogueVersionId: mapping.catalogueVersionId, providerCategoryId: mapping.cardmarketCategoryId, providerProductId: mapping.cardmarketProductId, method: mapping.method, languageEvidence: mapping.languageEvidence, variantEvidence: mapping.variantEvidence, finishEvidence: mapping.finishEvidence, reviewReference: mapping.reviewReference };
}
function sanitizeRepairs(items) {
  return items.map(item => allowedRepairReasons.has(item.reason) ? item : { ...item, reason: 'mapping_missing_language_variant_finish_evidence', detail: { ...item.detail, originalReason: item.reason } });
}
async function rpc(api, name, args) {
  const { data, error } = await api.rpc(name, args); if (error) throw error; return data;
}

/**
 * Produces review material only. Provenance is current and unambiguous at the
 * printing/language boundary; a reviewer must still attest that the official
 * retained Cardmarket product is the intended product before it can be applied.
 */
export async function exportCardmarketReviewCandidates({ api, retained, provenanceRunId = null, afterProductId = 0, limit = 100 } = {}) {
  if (!api || !retained?.feeds?.products || !Number.isSafeInteger(afterProductId) || afterProductId < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw Error('Invalid Cardmarket provenance candidate request.');
  if (provenanceRunId !== null && (typeof provenanceRunId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(provenanceRunId))) throw Error('Invalid completed Cardmarket provenance run id.');
  const providerRows = provenanceRunId
    ? await rpc(api, 'list_cardmarket_completed_provenance_candidates', { p_run: provenanceRunId, p_after_product_id: afterProductId, p_limit: limit })
    : await rpc(api, 'list_cardmarket_current_provenance_candidates', { p_after_product_id: afterProductId, p_limit: limit });
  const byProduct = new Map();
  for (const product of retained.feeds.products.products) {
    const values = byProduct.get(product.idProduct) ?? []; values.push(product); byProduct.set(product.idProduct, values);
  }
  const candidates = [];
  const skipped = [];
  for (const row of providerRows ?? []) {
    const products = byProduct.get(Number(row.provider_product_id)) ?? [];
    if (products.length !== 1) { skipped.push({ providerProductId: row.provider_product_id, reason: products.length ? 'ambiguous_official_product_id' : 'missing_official_product_id' }); continue; }
    const product = products[0];
    candidates.push({
      providerProductId: row.provider_product_id, providerCategoryId: product.idCategory, providerProductName: product.name,
      printingId: row.printing_id, languageCode: row.language_code, catalogueVersionId: row.catalogue_version_id,
      provenance: row.provenance, reviewRequired: true,
      mappingTemplate: {
        cardmarketProductId: row.provider_product_id, cardmarketCategoryId: product.idCategory,
        printingId: row.printing_id, catalogueVersionId: row.catalogue_version_id,
        languageEvidence: { type: 'current_tcgdex_canonical_language', languageCode: row.language_code, provenance: row.provenance },
        variantEvidence: { type: 'current_tcgdex_canonical_printing', variantIds: row.provenance?.variantIds ?? [], externalIds: row.provenance?.externalIds ?? [] },
        finishEvidence: { type: 'blended_public_guide_not_exact_finish', finishCodes: row.provenance?.finishCodes ?? [] },
      },
    });
  }
  return { afterProductId, nextAfterProductId: providerRows?.length === limit ? providerRows.at(-1).provider_product_id : null, candidates, skipped };
}

/** Applies only an externally reviewed ledger and persists a cursor after every acknowledged operation. */
export async function applyCardmarketDailyGuide({ api, retained, mappingLedger, checkpointPath, exchangeRate, exchangeRateAt, exchangeRateSource, maxPages = 1, now = Date.now() } = {}) {
  if (!api || !retained?.manifest || !retained?.feeds || !mappingLedger || !checkpointPath) throw Error('Cardmarket apply requires retained feeds, reviewed ledger, checkpoint and service API.');
  positiveInteger(maxPages, 'max pages');
  const products = retained.feeds.products; const priceGuide = retained.feeds.priceGuide;
  validateCardmarketPublicGuide('products', products); validateCardmarketPublicGuide('priceGuide', priceGuide);
  const ledger = validateCardmarketMappingLedger(mappingLedger);
  const productsByKey = new Set(products.products.map(row => `${row.idCategory}:${row.idProduct}`));
  for (const mapping of ledger) {
    if (!productsByKey.has(`${mapping.cardmarketCategoryId}:${mapping.cardmarketProductId}`)) throw Error('Reviewed Cardmarket mapping is absent from the retained product catalogue.');
  }
  let checkpoint;
  try { checkpoint = await json(checkpointPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; checkpoint = { schemaVersion: 3, reviewedKeys: [], afterProductId: 0, priceGuideSha256: null, revisions: null }; }
  if (checkpoint.schemaVersion === 1 || checkpoint.schemaVersion === 2) checkpoint = { schemaVersion: 3, reviewedKeys: checkpoint.reviewedKeys, afterProductId: checkpoint.afterProductId, priceGuideSha256: checkpoint.priceGuideSha256 ?? null, revisions: null };
  if (checkpoint.schemaVersion !== 3 || !Array.isArray(checkpoint.reviewedKeys) || !Number.isSafeInteger(checkpoint.afterProductId) || (checkpoint.priceGuideSha256 !== null && !/^[a-f0-9]{64}$/.test(checkpoint.priceGuideSha256)) || (checkpoint.revisions !== null && (typeof checkpoint.revisions !== 'object' || (checkpoint.revisions.products !== null && typeof checkpoint.revisions.products !== 'string') || (checkpoint.revisions.priceGuide !== null && typeof checkpoint.revisions.priceGuide !== 'string')))) throw Error('Invalid Cardmarket apply checkpoint.');
  const save = async () => writeAtomic(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  if (checkpoint.priceGuideSha256 !== retained.manifest.feeds.priceGuide.sha256) {
    checkpoint.afterProductId = 0;
    checkpoint.priceGuideSha256 = retained.manifest.feeds.priceGuide.sha256;
    checkpoint.revisions = null;
    await save();
  }
  const pendingReviews = ledger.filter(mapping => !checkpoint.reviewedKeys.includes(`${mapping.cardmarketCategoryId}:${mapping.cardmarketProductId}`));
  for (let offset = 0; offset < pendingReviews.length; offset += REVIEW_CONCURRENCY) {
    const batch = pendingReviews.slice(offset, offset + REVIEW_CONCURRENCY);
    const accepted = await Promise.all(batch.map(mapping => rpc(api, 'review_cardmarket_printing_mapping', { p_mapping: reviewPayload(mapping) })));
    if (accepted.some(value => value !== true)) throw Error('Cardmarket reviewed mapping was not acknowledged.');
    checkpoint.reviewedKeys.push(...batch.map(mapping => `${mapping.cardmarketCategoryId}:${mapping.cardmarketProductId}`));
    await save();
  }
  const revisions = checkpoint.revisions ?? { products: null, priceGuide: null };
  if (!revisions.products || !revisions.priceGuide) {
    for (const [kind, manifestKind] of [['products', 'products'], ['priceGuide', 'price_guide']]) {
      if (revisions[kind]) continue;
      const entry = retained.manifest.feeds[kind];
      const existingRevision = await rpc(api, 'read_cardmarket_retained_feed_revision', { p_kind: manifestKind, p_sha256: entry.sha256 });
      if (existingRevision) { revisions[kind] = existingRevision; continue; }
      const token = await rpc(api, 'claim_cardmarket_source_revision', { p_kind: manifestKind, p_source_created_at: entry.createdAt, p_sha256: entry.sha256 });
      if (!token) throw Error(`Cardmarket ${kind} source revision lease was not available (${entry.createdAt}; ${entry.sha256.slice(0, 12)}).`);
      try { revisions[kind] = await rpc(api, 'finish_cardmarket_public_feed', { p_kind: manifestKind, p_token: token, p_source_created_at: entry.createdAt, p_etag: entry.etag, p_sha256: entry.sha256, p_byte_length: entry.byteLength, p_source_url: entry.sourceUrl, p_retry_seconds: 0 }); }
      catch (error) { await rpc(api, 'fail_cardmarket_public_feed', { p_kind: manifestKind, p_token: token, p_retry_seconds: 3600 }).catch(() => {}); throw error; }
    }
    checkpoint.revisions = revisions; await save();
  }
  const sourceMetadata = { productsEtag: retained.manifest.feeds.products.etag, productsSha256: retained.manifest.feeds.products.sha256, priceGuideEtag: retained.manifest.feeds.priceGuide.etag, priceGuideSha256: retained.manifest.feeds.priceGuide.sha256 };
  const summary = { revisions, reviewedMappings: checkpoint.reviewedKeys.length, stored: 0, repairs: 0, pages: 0, complete: false };
  while (summary.pages < maxPages) {
    const plan = planCardmarketCachedIngestion({ productsPayload: products, priceGuidePayload: priceGuide, mappingLedger, sourceMetadata, afterProductId: checkpoint.afterProductId, limit: MAX_PAGE_SIZE });
    if (!plan.scanned) { summary.complete = true; break; }
    const repairs = sanitizeRepairs(plan.reviewQueue);
    for (let offset = 0; offset < repairs.length; offset += MAX_PAGE_SIZE) {
      const batch = repairs.slice(offset, offset + MAX_PAGE_SIZE); const count = await rpc(api, 'queue_cardmarket_mapping_repairs', { p_repairs: batch });
      if (count !== batch.length) throw Error('Cardmarket repair batch was not acknowledged.'); summary.repairs += count;
    }
    const results = toCardmarketBlendedStoreResults(plan, { exchangeRate, exchangeRateAt, exchangeRateSource }, now);
    for (let offset = 0; offset < results.length; offset += MAX_PAGE_SIZE) {
      const batch = results.slice(offset, offset + MAX_PAGE_SIZE); const count = await rpc(api, 'store_cardmarket_blended_general_prices', { p_price_guide_revision: revisions.priceGuide, p_product_catalogue_revision: revisions.products, p_results: batch });
      if (count !== batch.length) throw Error('Cardmarket price batch was not acknowledged.'); summary.stored += count;
    }
    checkpoint.afterProductId = plan.nextAfterProductId ?? plan.afterProductId + plan.scanned; await save(); summary.pages += 1;
    if (plan.nextAfterProductId == null) { summary.complete = true; break; }
  }
  return summary;
}

function option(args, name) { return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1); }
export async function mainCardmarketDailyGuide(args = process.argv.slice(2)) {
  const apply = args.includes('--apply'); const cacheDir = option(args, '--cache-dir'); const ledgerPath = option(args, '--mapping'); const checkpointPath = option(args, '--checkpoint');
  if (!cacheDir) throw Error('Use --cache-dir=<ignored retained-feed directory>.');
  if (!args.includes('--retain')) return { dryRun: true, databaseCalls: 0, providerCalls: 0, message: 'Pass --retain to make the once-daily conditional public-file request.' };
  if (!apply) return refreshCardmarketDailyFeeds({ cacheDir });
  if (process.env.STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED !== 'true') throw Error('Cardmarket apply is disabled.');
  if (!ledgerPath || !checkpointPath) throw Error('Apply requires --mapping=<reviewed ledger> and --checkpoint=<ignored checkpoint>.');
  const retained = await refreshCardmarketDailyFeeds({ cacheDir });
  const fx = await fetchEcbCatalogueFx({ baseCurrency: 'EUR' }); const target = resolvePricingV2SupabaseTarget(); const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw Error('Missing server database credential.');
  const result = await applyCardmarketDailyGuide({ api: createCataloguePriceDatabase(target.url, key).schema('api'), retained, mappingLedger: await json(ledgerPath), checkpointPath, exchangeRate: fx.rate, exchangeRateAt: fx.at, exchangeRateSource: fx.source, maxPages: Number(option(args, '--max-pages') ?? 1) });
  console.log(JSON.stringify({ project: target.projectRef, ...result })); return result;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) mainCardmarketDailyGuide().catch(error => { console.error(error.message); process.exitCode = 1; });
