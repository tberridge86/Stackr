import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { toCardmarketGeneralEstimate, validateCardmarketPublicGuide } from './cardmarket-public-guide.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 500;
const safeId = value => Number.isSafeInteger(value) && value > 0;
const normalizeText = value => typeof value === 'string' ? value.trim() : '';

/**
 * The mapping ledger is deliberately separate from a price assertion. A Cardmarket
 * row never carries language, condition, grade, or finish pricing identity.
 */
export function validateCardmarketMappingLedger(payload) {
  if (!payload || typeof payload !== 'object' || payload.schemaVersion !== 1 || !Array.isArray(payload.mappings)) throw new Error('Invalid Cardmarket mapping ledger.');
  return payload.mappings.map((mapping, index) => ({ ...mapping, _index: index }));
}

function mappingIssue(mapping) {
  if (!mapping || typeof mapping !== 'object' || !safeId(mapping.cardmarketProductId) || !safeId(mapping.cardmarketCategoryId)) return 'invalid_mapping_identity';
  if (!UUID.test(mapping.printingId ?? '') || !UUID.test(mapping.catalogueVersionId ?? '')) return 'missing_printing_or_catalogue_version';
  if (mapping.method !== 'reviewed_exact') return 'mapping_not_reviewed_exact';
  if (!mapping.languageEvidence || typeof mapping.languageEvidence !== 'object' || Array.isArray(mapping.languageEvidence) || !Object.keys(mapping.languageEvidence).length || !mapping.variantEvidence || typeof mapping.variantEvidence !== 'object' || Array.isArray(mapping.variantEvidence) || !Object.keys(mapping.variantEvidence).length || !mapping.finishEvidence || typeof mapping.finishEvidence !== 'object' || Array.isArray(mapping.finishEvidence) || !Object.keys(mapping.finishEvidence).length || !normalizeText(mapping.reviewReference)) return 'mapping_missing_language_variant_finish_evidence';
  return null;
}

function mappingKey(productId, categoryId) { return `${categoryId}:${productId}`; }
function review(product, reason, detail = {}) {
  return { key: `cardmarket:${product.idCategory}:${product.idProduct}`, reason, providerProductId: product.idProduct, providerCategoryId: product.idCategory, detail };
}

/**
 * Produces a bounded, deterministic page from already-cached public files. It never
 * downloads, writes a database, or turns an asking floor into a market estimate.
 */
export function planCardmarketCachedIngestion({ productsPayload, priceGuidePayload, mappingLedger, sourceMetadata = {}, afterProductId = 0, limit = MAX_PAGE_SIZE } = {}) {
  if (!Number.isSafeInteger(afterProductId) || afterProductId < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new Error(`Use afterProductId >= 0 and limit 1..${MAX_PAGE_SIZE}.`);
  const products = validateCardmarketPublicGuide('products', productsPayload);
  const guide = validateCardmarketPublicGuide('priceGuide', priceGuidePayload);
  const mappings = validateCardmarketMappingLedger(mappingLedger);
  const guides = new Map(guide.map(row => [mappingKey(row.idProduct, row.idCategory), row]));
  const mappingByProvider = new Map();
  for (const mapping of mappings) {
    if (!safeId(mapping.cardmarketProductId) || !safeId(mapping.cardmarketCategoryId)) continue;
    const key = mappingKey(mapping.cardmarketProductId, mapping.cardmarketCategoryId);
    const entries = mappingByProvider.get(key) ?? []; entries.push(mapping); mappingByProvider.set(key, entries);
  }
  const targetCounts = new Map();
  for (const mapping of mappings) if (UUID.test(mapping?.printingId ?? '')) targetCounts.set(mapping.printingId, (targetCounts.get(mapping.printingId) ?? 0) + 1);
  const page = [...products].filter(row => row.idProduct > afterProductId).sort((a, b) => a.idProduct - b.idProduct).slice(0, limit);
  const estimates = [];
  const reviewQueue = [];
  for (const product of page) {
    const key = mappingKey(product.idProduct, product.idCategory);
    const quote = guides.get(key);
    const candidates = mappingByProvider.get(key) ?? [];
    if (!quote) { reviewQueue.push(review(product, 'missing_price_guide_row')); continue; }
    if (candidates.length !== 1) { reviewQueue.push(review(product, candidates.length ? 'ambiguous_provider_mapping' : 'missing_exact_mapping', { mappingCount: candidates.length })); continue; }
    const mapping = candidates[0];
    const invalid = mappingIssue(mapping);
    if (invalid) { reviewQueue.push(review(product, invalid, { mappingIndex: mapping._index })); continue; }
    if (targetCounts.get(mapping.printingId) !== 1) { reviewQueue.push(review(product, 'duplicate_canonical_target', { printingId: mapping.printingId })); continue; }
    const estimate = toCardmarketGeneralEstimate(product, quote, { sourceCreatedAt: priceGuidePayload.createdAt, sourceEtag: sourceMetadata.priceGuideEtag, sourceSha256: sourceMetadata.priceGuideSha256 });
    if (!estimate) { reviewQueue.push(review(product, 'no_market_guide_value')); continue; }
    estimates.push({
      provider: 'cardmarket_public',
      providerProductId: product.idProduct,
      providerCategoryId: product.idCategory,
      printingId: mapping.printingId,
      catalogueVersionId: mapping.catalogueVersionId,
      mappingMethod: mapping.method,
      mappingEvidence: { language: mapping.languageEvidence, variant: mapping.variantEvidence, finish: mapping.finishEvidence, reviewReference: mapping.reviewReference },
      // The mapping targets a printing only; the public quote remains unscoped.
      quote: estimate,
    });
  }
  const last = page.at(-1)?.idProduct ?? afterProductId;
  return {
    source: 'cardmarket_public',
    sourceDates: { productCatalogue: productsPayload.createdAt, priceGuide: priceGuidePayload.createdAt },
    sourceRevisions: { productsEtag: sourceMetadata.productsEtag ?? null, productsSha256: sourceMetadata.productsSha256 ?? null, priceGuideEtag: sourceMetadata.priceGuideEtag ?? null, priceGuideSha256: sourceMetadata.priceGuideSha256 ?? null },
    afterProductId,
    nextAfterProductId: page.length === limit ? last : null,
    scanned: page.length,
    estimates,
    reviewQueue,
  };
}


/** Converts an offline plan to the service RPC batch. Caller must provide current FX; no rate is fetched or defaulted. */
export function toCardmarketBlendedStoreResults(plan, { exchangeRate, exchangeRateAt, exchangeRateSource } = {}, now = Date.now()) {
  if (!plan || !Array.isArray(plan.estimates) || !Number.isFinite(exchangeRate) || exchangeRate <= 0 || !normalizeText(exchangeRateSource)) throw new Error('Supply positive Cardmarket EUR/GBP FX evidence.');
  const fxAt = Date.parse(exchangeRateAt ?? '');
  if (!Number.isFinite(fxAt) || fxAt > now || fxAt < now - 7 * 24 * 60 * 60 * 1000) throw new Error('Cardmarket FX evidence must be dated within the last seven days and not future-dated.');
  return plan.estimates.filter(({ quote }) => Number.isFinite(quote.value) && quote.value > 0
    && Math.round(quote.value * exchangeRate * 100) > 0).map(({ printingId, catalogueVersionId, providerProductId, providerCategoryId, quote }) => ({
    printingId, catalogueVersionId, providerProductId, providerCategoryId,
    price: quote.value, selectedField: quote.selectedField,
    exchangeRate, exchangeRateAt, exchangeRateSource: normalizeText(exchangeRateSource),
  }));
}
export async function loadCardmarketCachedFeed(path, kind) {
  const text = await readFile(path, 'utf8');
  const payload = JSON.parse(text);
  validateCardmarketPublicGuide(kind, payload);
  return { payload, sha256: createHash('sha256').update(text).digest('hex') };
}

function argValue(args, name) { return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

/** Offline CLI. The caller supplies prior-downloaded JSON, so no network access exists here. */
export async function mainCardmarketCachedIngestion(args = process.argv.slice(2)) {
  if (args.includes('--apply')) throw new Error('This adapter produces an offline plan only; no database apply mode exists.');
  const productsPath = argValue(args, '--products'); const guidePath = argValue(args, '--price-guide'); const mappingPath = argValue(args, '--mapping');
  if (!productsPath || !guidePath || !mappingPath) throw new Error('Use --products=<cached JSON> --price-guide=<cached JSON> --mapping=<reviewed ledger JSON>.');
  const limit = Number(argValue(args, '--limit') ?? MAX_PAGE_SIZE); const afterProductId = Number(argValue(args, '--after-product-id') ?? 0);
  const [products, guide, mappings] = await Promise.all([
    loadCardmarketCachedFeed(productsPath, 'products'), loadCardmarketCachedFeed(guidePath, 'priceGuide'), readFile(mappingPath, 'utf8').then(JSON.parse),
  ]);
  const plan = planCardmarketCachedIngestion({ productsPayload: products.payload, priceGuidePayload: guide.payload, mappingLedger: mappings, sourceMetadata: { productsSha256: products.sha256, priceGuideSha256: guide.sha256 }, afterProductId, limit });
  const report = { ...plan, input: { productsSha256: products.sha256, priceGuideSha256: guide.sha256 } };
  const reportPath = argValue(args, '--report');
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) mainCardmarketCachedIngestion().catch(error => { console.error(error.message); process.exitCode = 1; });
