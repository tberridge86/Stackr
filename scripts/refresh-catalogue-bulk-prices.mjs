import 'dotenv/config';
import { createCataloguePriceDatabase } from './catalogue-price-database.mjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';
import { fetchEcbCatalogueFx } from './catalogue-price-fx.mjs';
import { readPagedCatalogueBulkCoverage } from './catalogue-bulk-coverage-report.mjs';

// TCGCSV's supported Pokemon identity boundaries. Never cross a category/language.
export const TCGCSV_CATALOGUES = Object.freeze([{ categoryId: 3, language: 'en' }, { categoryId: 85, language: 'ja' }]);
const keyOf = (categoryId, groupId, suffix) => `tcgplayer/${categoryId}/${groupId}${suffix ? `/${suffix}` : ''}`;
const normal = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/&/g, 'and').replace(/[\s\p{P}\p{S}_]+/gu, '');
const number = (value) => String(value ?? '').normalize('NFKC').trim().split('/')[0].replace(/^0+(?=\d)/, '');
const later = (reason, now) => new Date(now + (reason === 'provider_backoff' ? 600_000 : reason.startsWith('unsupported_') ? 604800000 : 86400000)).toISOString();

export function validateBulkFx(fx, now = Date.now()) {
  const at = Date.parse(fx?.at ?? '');
  if (!Number.isFinite(fx?.rate) || fx.rate <= 0 || fx.rate > 10 || !fx?.source || !Number.isFinite(at) || at > now + 300000 || at < now - 604800000) throw Error('A recent, attributed USD/GBP exchange rate is required.');
  return fx;
}
export function providerSubtype(row) {
  if (['normal', 'standard', 'default'].includes(row.variant_code) && ['normal', 'standard', 'default', 'non_holo'].includes(row.finish_code)) return 'Normal';
  if (row.variant_code === 'holo' && row.finish_code === 'holo') return 'Holofoil';
  if (row.variant_code === 'reverse_holo' && row.finish_code === 'reverse_holo') return 'Reverse Holofoil';
  return null;
}

/** Existing maps are authoritative only after the SQL contract has validated the
 * card's language, set, printing and variant. English candidates require an
 * exact name and number. Japanese candidates may use a provider-set mapping
 * created from an exact shared set code, but only after SQL has proved that the
 * catalogue collector number is unique for that set; names are never translated
 * or guessed. */
export function selectBulkProduct(row, group, products) {
  const mapped = row.provider_mapping;
  const collector = number(row.collector_number);
  if (!collector) return null;
  const valid = (p) => p && p.categoryId === group.categoryId && p.groupId === group.groupId && p.presaleInfo?.isPresale !== true
    && Number.isInteger(p.productId) && p.productId > 0 && (p.extendedData ?? []).some((field) => String(field.name).toLocaleLowerCase() === 'number' && number(field.value) === collector);
  const hasUniqueCollector = row.unique_collector_number === true
    || row.unique_collector_number === 1
    || row.unique_collector_number_count === 1;
  const exactNumberProducts = [...new Map(products.filter(valid).map((p) => [p.productId, p])).values()];
  // A stale or cross-category durable map is an integrity failure, not a cue to
  // rediscover another product by name.
  if (mapped && (mapped.category_id !== group.categoryId || mapped.group_id !== group.groupId || !['reviewed', 'exact_name_number', 'exact_set_code_number'].includes(mapped.method))) return null;
  if (mapped?.product_id) {
    // Recheck both sides on every run. A later catalogue duplicate or provider
    // duplicate must quarantine an old exact-code map rather than keep pricing
    // an identity that is no longer uniquely established.
    if (mapped.method === 'exact_set_code_number') {
      if (row.language_code !== 'ja' || row.provider_set_method !== 'exact_set_code' || !hasUniqueCollector || exactNumberProducts.length !== 1) return null;
      return exactNumberProducts[0].productId === mapped.product_id ? exactNumberProducts[0] : null;
    }
    return products.find((p) => p.productId === mapped.product_id && valid(p)) ?? null;
  }
  // This is deliberately narrower than the ordinary name path. The provider
  // group and catalogue set were already bound by the RPC through one unique
  // shared JA set code, and the RPC independently proves the collector number
  // has only one current printing in that set. A single provider product with
  // that same exact number is therefore sufficient; any multiplicity remains
  // an explicit repair instead of an inferred English-name translation.
  if (row.language_code === 'ja' && row.provider_set_method === 'exact_set_code' && hasUniqueCollector) {
    return exactNumberProducts.length === 1 ? { ...exactNumberProducts[0], mappingMethod: 'exact_set_code_number' } : null;
  }
  const name = normal(row.card_english_display_name ?? row.card_native_name);
  if (!name) return null;
  const matches = products.filter((p) => valid(p) && normal(p.name) === name);
  const unique = [...new Map(matches.map((p) => [p.productId, p])).values()];
  return unique.length === 1 ? { ...unique[0], mappingMethod: 'exact_name_number' } : null;
}

/** Pure, one-provider-set page planner. `mapping` remains on noquote results so
 * prices and permanent identity maps are committed atomically by the database. */
export function planCatalogueBulkPrices({ candidates, group, products, prices, blockedMappingKeys = new Set(), datasetAt, fx, now = Date.now() }) {
  validateBulkFx(fx, now);
  if (!Number.isFinite(Date.parse(datasetAt ?? '')) || Date.parse(datasetAt) > now + 300000 || !Array.isArray(candidates) || candidates.length > 500) throw Error('Invalid bulk page.');
  const results = candidates.map((row) => {
    const subtype = providerSubtype(row);
    const category = TCGCSV_CATALOGUES.find((c) => c.language === row.language_code)?.categoryId;
    let reason = !category ? 'unsupported_provider_language' : category !== group.categoryId ? 'unresolved_provider_identity' : !subtype ? 'unsupported_provider_finish' : 'unresolved_provider_identity';
    let quote = null; let mapping = null;
    if (reason === 'unresolved_provider_identity' && category === group.categoryId && subtype) {
      const product = selectBulkProduct(row, group, products);
      if (!product) reason = 'unresolved_provider_identity';
      else {
        mapping = { categoryId: group.categoryId, groupId: group.groupId, productId: product.productId, subtype, method: product.mappingMethod ?? row.provider_mapping.method };
        const providerKey = `${mapping.categoryId}/${mapping.groupId}/${mapping.productId}/${mapping.subtype}`;
        const candidates = prices.filter((price) => price.productId === product.productId && price.subTypeName === subtype);
        if (blockedMappingKeys.has(providerKey)) { mapping = null; reason = 'ambiguous_provider_identity'; }
        else if (candidates.length === 1 && Number.isFinite(candidates[0].marketPrice) && candidates[0].marketPrice >= 0) {
          reason = 'priced'; quote = { ...mapping, currency: 'USD', price: candidates[0].marketPrice, datasetAt, exchangeRate: fx.rate, exchangeRateAt: fx.at, exchangeRateSource: fx.source };
        } else reason = 'no_provider_quote';
      }
    }
    return { variantId: row.variant_id, catalogueVersionId: row.catalogue_version_id, reason, nextRetryAt: later(reason, now), mapping, quote };
  });
  // A price subtype is a provider identity. Two canonical variants claiming it
  // in the same page is a repair case, never a last-write-wins map.
  const duplicates = new Set(); const seen = new Map();
  for (const result of results) if (result.mapping) { const key = `${result.mapping.categoryId}/${result.mapping.groupId}/${result.mapping.productId}/${result.mapping.subtype}`; if (seen.has(key)) { duplicates.add(key); } else seen.set(key, result); }
  for (const result of results) if (result.mapping && duplicates.has(`${result.mapping.categoryId}/${result.mapping.groupId}/${result.mapping.productId}/${result.mapping.subtype}`)) { result.mapping = null; result.quote = null; result.reason = 'ambiguous_provider_identity'; result.nextRetryAt = later(result.reason, now); }
  return { results, priced: results.filter((r) => r.quote).length, mapped: results.filter((r) => r.mapping).length };
}

export function preflightBlockedMappingKeys({ candidates, group, products }) {
  const keys = new Map(); const blocked = new Set();
  for (const row of candidates) {
    if (TCGCSV_CATALOGUES.find((c) => c.language === row.language_code)?.categoryId !== group.categoryId) continue;
    const subtype = providerSubtype(row); const product = subtype && selectBulkProduct(row, group, products);
    if (!product) continue;
    const key = `${group.categoryId}/${group.groupId}/${product.productId}/${subtype}`;
    const previous = keys.get(key); if (previous && previous !== row.variant_id) blocked.add(key); else keys.set(key, row.variant_id);
  }
  return blocked;
}

async function rpc(db, name, args) {
  const { data, error } = await db.schema('api').rpc(name, args);
  if (error) {
    // Jobs need the durable RPC boundary in their logs: PostgREST otherwise
    // reduces a database timeout to an unhelpful generic message.
    error.rpcName = name;
    throw error;
  }
  return data;
}
export function createBulkFeedLoader(db, fetchImpl = fetch) {
  let datasetAt = null;
  return { setDataset: (value) => { datasetAt = value; }, async load(key) {
    const cached = await rpc(db, 'read_catalogue_bulk_feed', { p_key: key });
    if (cached?.payload != null) {
      // Metadata is intentionally rechecked hourly. Set files are immutable for
      // a provider build, so retain them indefinitely until metadata advances.
      if (key === 'last-updated' && Date.parse(cached.fetched_at) > Date.now() - 3600000) return cached.payload;
      if (key !== 'last-updated' && Date.parse(cached.dataset_at) === Date.parse(datasetAt)) return cached.payload;
    }
    let token = null; for (let i = 0; i < 12 && !token; i++) { token = await rpc(db, 'claim_catalogue_bulk_feed_revision', { p_key: key, p_dataset: key === 'last-updated' ? null : datasetAt }); if (!token && i < 11) await delay(1100); }
    if (!token) throw Object.assign(Error('Provider feed is leased, cooling down or at its daily budget.'), { retryAfter: 600 });
    const url = key === 'last-updated' ? 'https://tcgcsv.com/last-updated.txt' : `https://tcgcsv.com/${key}`;
    try {
      const response = await fetchImpl(url, { headers: { 'User-Agent': 'StackrCataloguePricing/1.0' }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) { const retry = response.headers.get('Retry-After'); const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : 0; throw Object.assign(Error(`TCGCSV returned ${response.status}.`), { retryAfter: Math.max(seconds || 0, response.status === 429 ? 600 : 300) }); }
      const payload = key === 'last-updated' ? (await response.text()).trim() : await response.json();
      if (key !== 'last-updated' && (payload?.success !== true || !Array.isArray(payload.results) || payload.errors?.length)) throw Error('Invalid TCGCSV feed.');
      const timestamp = key === 'last-updated' ? payload : datasetAt; if (!Number.isFinite(Date.parse(timestamp))) throw Error('Invalid TCGCSV build timestamp.');
      if (!await rpc(db, 'finish_catalogue_bulk_feed', { p_key: key, p_token: token, p_dataset: timestamp, p_payload: payload, p_retry_seconds: 0 })) throw Error('Provider feed lease expired.'); return payload;
    } catch (error) { await rpc(db, 'finish_catalogue_bulk_feed', { p_key: key, p_token: token, p_dataset: datasetAt, p_payload: null, p_retry_seconds: Math.min(86400, Math.max(60, Number(error.retryAfter) || 300)) }); throw error; }
  } };
}

/** Claims durable provider-set checkpoints until exhausted. A group is only
 * complete after every 500-card page is stored. Unmapped sets end as explicit
 * gaps (`needs_mapping` at run level), never as a silently skipped cursor. */
export async function runCatalogueBulkSweep({ begin, seedOutcomes = async () => ({ complete: true, deferred: false, scanned: 0, written: 0 }), claim, resolveSet, candidates, store, finish, loader, groups, datasetAt, fx, maxGroups = 5000, now = Date.now(), onProgress = () => {}, requeueEnglishExactTitles = async (_run) => 0 }) {
  if (!Number.isInteger(maxGroups) || maxGroups < 1 || maxGroups > 5000) throw Error('maxGroups must be 1..5000.');
  const run = await begin({ datasetAt, groups });
  const outcomeSeed = { pages: 0, scanned: 0, written: 0, complete: false };
  // Publication-wide outcome initialisation is deliberately chunked in SQL.
  // A completed catalogue revision is a no-op on later daily runs.
  for (; outcomeSeed.pages < 500 && !outcomeSeed.complete; outcomeSeed.pages++) {
    const page = await seedOutcomes({ limit: 500 });
    if (!page || !Number.isInteger(page.scanned) || page.scanned < 0 || !Number.isInteger(page.written) || page.written < 0 || typeof page.complete !== 'boolean') throw Error('Invalid bulk outcome seed page.');
    outcomeSeed.scanned += page.scanned; outcomeSeed.written += page.written;
    if (page.deferred) break;
    outcomeSeed.complete = page.complete;
  }
  if (!outcomeSeed.complete && outcomeSeed.pages >= 500) throw Error('Bulk outcome seed safety limit exceeded.');
  const requeued = await requeueEnglishExactTitles({ runId: run.runId });
  if (!Number.isInteger(requeued) || requeued < 0) throw Error('Invalid English exact-title requeue result.');
  const summary = { runId: run.runId, requeued, outcomeSeed, setsClaimed: 0, complete: 0, unmapped: 0, deferred: 0, cards: 0, priced: 0, status: 'complete' }; let exhausted = false;
  while (summary.setsClaimed < maxGroups) {
    const job = await claim({ runId: run.runId }); if (!job) { exhausted = true; break; } summary.setsClaimed++;
    try {
      // Import both files even for an unmapped set. The cached full guide is
      // evidence for repair and makes a later reviewed mapping immediately usable.
      const feed = { products: (await loader.load(keyOf(job.categoryId, job.groupId, 'products'))).results, prices: (await loader.load(keyOf(job.categoryId, job.groupId, 'prices'))).results };
      const map = await resolveSet({ categoryId: job.categoryId, groupId: job.groupId, languageCode: job.language, name: job.group?.name, abbreviation: job.group?.abbreviation });
      if (map.status !== 'mapped') { if (!await finish({ runId: run.runId, categoryId: job.categoryId, groupId: job.groupId, token: job.leaseToken, status: 'unmapped', stats: { mappingStatus: map.status, products: feed.products.length, prices: feed.prices.length } })) throw Error('Sweep checkpoint lease expired.'); summary.unmapped++; await onProgress({ ...summary }); continue; }
      let after = null; const allCandidates = [];
      do {
        const page = await candidates({ categoryId: job.categoryId, groupId: job.groupId, after, limit: 500 });
        if (!Array.isArray(page) || page.length > 500) throw Error('Invalid provider group candidate page.');
        if (!page.length) break;
        const next = page.at(-1)?.variant_id; if (!next || next === after || page.some((row) => !row.variant_id)) throw Error('Candidate pagination did not advance.');
        allCandidates.push(...page); if (allCandidates.length > 100000) throw Error('Provider group candidate safety limit exceeded.'); after = next;
        if (page.length < 500) break;
      } while (true);
      const group = { categoryId: job.categoryId, groupId: job.groupId }; const blockedMappingKeys = preflightBlockedMappingKeys({ candidates: allCandidates, group, products: feed.products });
      let pages = 0; let groupCards = 0; let groupPriced = 0;
      for (let offset = 0; offset < allCandidates.length; offset += 500) {
        const page = allCandidates.slice(offset, offset + 500); const plan = planCatalogueBulkPrices({ candidates: page, group, products: feed.products, prices: feed.prices, blockedMappingKeys, datasetAt, fx, now });
        const stored = await store({ results: plan.results }); if (stored !== page.length) throw Error('Price storage did not acknowledge the complete candidate page.');
        pages++; groupCards += page.length; groupPriced += plan.priced;
      }
      if (!await finish({ runId: run.runId, categoryId: job.categoryId, groupId: job.groupId, token: job.leaseToken, status: 'complete', stats: { pages, cards: groupCards, priced: groupPriced } })) throw Error('Sweep checkpoint lease expired.'); summary.complete++; summary.cards += groupCards; summary.priced += groupPriced;
    } catch (error) { const saved = await finish({ runId: run.runId, categoryId: job.categoryId, groupId: job.groupId, token: job.leaseToken, status: 'failed', retrySeconds: Math.min(86400, Math.max(60, Number(error.retryAfter) || 600)), stats: { error: String(error.message ?? error).slice(0, 500), rpc: error?.rpcName ?? null } }); if (!saved) throw error; summary.deferred++; }
    await onProgress({ ...summary });
  }
  summary.status = summary.deferred || !exhausted ? 'partial' : summary.unmapped ? 'needs_mapping' : 'complete';
  return summary;
}

export function durableSweepExitCode(health) {
  if (!health || !['complete', 'needs_mapping'].includes(health.runStatus) || !Array.isArray(health.groups) || !health.groups.length) return 1;
  const terminal = new Set(['complete', 'unmapped']); let total = 0;
  for (const group of health.groups) {
    if (!group || !terminal.has(group.status) || !Number.isInteger(group.total) || group.total <= 0) return 1;
    total += group.total;
  }
  return total > 0 ? 0 : 1;
}

export async function mainCatalogueBulkPrices(args = process.argv.slice(2)) {
  const fixturePath = args.find((arg) => arg.startsWith('--fixture='))?.slice(10);
  if (fixturePath) { if (args.includes('--apply')) throw Error('Fixtures cannot write prices.'); const fixture = JSON.parse(await readFile(fixturePath, 'utf8')); const plan = planCatalogueBulkPrices(fixture); console.log(JSON.stringify({ dryRun: true, providerCalls: 0, ...plan })); return plan; }
  if (!args.includes('--apply') || process.env.STACKR_CATALOGUE_BULK_PRICING_ENABLED !== 'true') throw Error('Catalogue bulk pricing is disabled. Use --fixture for an offline plan; application requires explicit approval and the server enable flag.');
  const maxGroups = Number(args.find((arg) => arg.startsWith('--max-groups='))?.slice(13) ?? 5000); if (!Number.isInteger(maxGroups) || maxGroups < 1 || maxGroups > 5000) throw Error('max-groups must be 1..5000.');
  const target = resolvePricingV2SupabaseTarget(); const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY; if (!key) throw Error('Missing server database credential.');
  const fx = validateBulkFx(process.env.STACKR_USD_GBP_RATE_AT || process.env.STACKR_USD_GBP_RATE_SOURCE
    ? { rate: Number(process.env.USD_TO_GBP), at: process.env.STACKR_USD_GBP_RATE_AT, source: process.env.STACKR_USD_GBP_RATE_SOURCE }
    : await fetchEcbCatalogueFx());
  const db = createCataloguePriceDatabase(target.url, key); const loader = createBulkFeedLoader(db); const datasetAt = await loader.load('last-updated'); loader.setDataset(datasetAt);
  const groups = (await Promise.all(TCGCSV_CATALOGUES.map(async ({ categoryId, language }) => (await loader.load(`tcgplayer/${categoryId}/groups`)).results.map((g) => ({ ...g, language }))))).flat();
  const result = await runCatalogueBulkSweep({ datasetAt, fx, loader, groups, maxGroups,
    onProgress: (progress) => { if (progress.setsClaimed % 10 === 0) console.info(JSON.stringify({ event: 'catalogue_bulk_price_progress', project: target.projectRef, datasetAt, ...progress, status: 'running' })); },
    begin: ({ datasetAt, groups }) => rpc(db, 'begin_catalogue_bulk_sweep', { p_dataset: datasetAt, p_groups: groups }),
    seedOutcomes: ({ limit }) => rpc(db, 'seed_catalogue_bulk_price_outcomes', { p_limit: limit }),
    requeueEnglishExactTitles: ({ runId }) => rpc(db, 'requeue_english_exact_title_groups', { p_run: runId }), claim: ({ runId }) => rpc(db, 'claim_catalogue_bulk_sweep_group', { p_run: runId }),
    resolveSet: ({ categoryId, groupId, languageCode, name, abbreviation }) => rpc(db, 'resolve_catalogue_bulk_set', { p_category: categoryId, p_group: groupId, p_language: languageCode, p_name: name ?? '', p_abbreviation: abbreviation ?? '' }),
    candidates: ({ categoryId, groupId, after, limit }) => rpc(db, 'catalogue_bulk_group_candidates', { p_category: categoryId, p_group: groupId, p_after: after, p_limit: limit }), store: ({ results }) => rpc(db, 'store_catalogue_bulk_prices', { p_results: results }),
    finish: ({ runId, categoryId, groupId, token, status, stats, retrySeconds = 0 }) => rpc(db, 'finish_catalogue_bulk_sweep_group', { p_run: runId, p_category: categoryId, p_group: groupId, p_token: token, p_status: status, p_stats: stats, p_retry_seconds: retrySeconds }), });
  // Health is a bounded ledger read: group checkpoints are authoritative for
  // run state even when the optional full catalogue coverage report is slow.
  const health = await rpc(db, 'catalogue_bulk_sweep_health', { p_run: result.runId });
  let coverage = null; let coverageError = null;
  try {
    coverage = await readPagedCatalogueBulkCoverage({
      runId: result.runId, health,
      readPage: ({ runId, after, limit }) => rpc(db, 'catalogue_bulk_price_coverage_page', {
        p_run: runId, p_after: after, p_limit: limit,
      }),
    });
  }
  catch (error) {
    // Provider checkpoints are already durable. Do not report a successful
    // sweep as failed solely because the broad reporting query is unavailable;
    // retain the boundary and error explicitly for the next optimisation pass.
    coverageError = { rpc: error?.rpcName ?? error?.cause?.rpcName ?? 'catalogue_bulk_price_coverage_page', message: String(error?.message ?? error) };
    console.warn(JSON.stringify({ event: 'catalogue_bulk_price_coverage_deferred', project: target.projectRef, datasetAt, runId: result.runId, ...coverageError }));
  }
  const reported = { project: target.projectRef, datasetAt, ...result, status: coverage?.runStatus ?? health?.runStatus ?? result.status, health, coverage, coverageError };
  console.log(JSON.stringify(reported)); process.exitCode = durableSweepExitCode(health); return reported;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) mainCatalogueBulkPrices().catch((error) => {
  console.error(JSON.stringify({
    event: 'catalogue_bulk_price_failed',
    rpc: error?.rpcName ?? null,
    message: String(error?.message ?? error),
  }));
  process.exitCode = 1;
});
