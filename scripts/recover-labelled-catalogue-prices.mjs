import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { providerSubtype, planCatalogueBulkPrices } from './refresh-catalogue-bulk-prices.mjs';
import { validateMappingRepairs } from './catalogue-price-guide.mjs';

const normal = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/&/g, 'and').replace(/[\s\p{P}\p{S}_]+/gu, '');
const collector = value => String(value ?? '').normalize('NFKC').trim().replace(/^0+(?=\d)/, '').toLowerCase();
const parts = value => String(value ?? '').normalize('NFKC').trim().split('/').map(collector);

/** Review only a numeric listing label, never a stamp, edition or finish label.
 * Both provider and canonical collector identities must independently agree. */
export function matchesNumberLabel(row, product) {
  const fields = (product.extendedData ?? []).filter(f => String(f.name).toLowerCase() === 'number');
  if (fields.length !== 1) return false;
  const provider = parts(fields[0].value), canonical = parts(row.collector_number);
  const match = String(product.name ?? '').normalize('NFKC').match(/^(.*?)\s+(?:-\s*(\d+(?:\/\d+)?)|\((\d+(?:\/\d+)?)\))$/u);
  if (!match || !canonical[0] || provider.length > 2 || canonical.length > 2) return false;
  const label = parts(match[2] ?? match[3]);
  if (label[0] !== provider[0] || canonical[0] !== provider[0]
    || (label.length === 2 && label[1] !== provider[1])
    || (canonical.length === 2 && canonical[1] !== provider[1])) return false;
  const expectedName = normal(row.card_english_display_name ?? row.card_native_name);
  return expectedName.length > 0 && normal(match[1]) === expectedName;
}

export function planNumberLabelRecovery({ candidates, products, prices, group }) {
  if (group.categoryId !== 3 || !Array.isArray(candidates) || !Array.isArray(products) || !Array.isArray(prices)) throw Error('Number-label recovery requires the English provider catalogue.');
  const printingOwners = new Map();
  for (const row of candidates) {
    const number = parts(row.collector_number)[0];
    const owners = printingOwners.get(number) ?? new Set(); owners.add(row.printing_id); printingOwners.set(number, owners);
  }
  const mappings = [], evidence = [];
  for (const row of candidates) {
    const subtype = providerSubtype(row), number = parts(row.collector_number)[0];
    if (row.language_code !== 'en' || row.provider_mapping || !subtype || row.unique_collector_number !== true
      || !row.printing_id || printingOwners.get(number)?.size !== 1) continue;
    const sameNumber = [...new Map(products.filter(p => p.categoryId === 3 && p.groupId === group.groupId
      && Number.isSafeInteger(p.productId) && p.productId > 0 && p.presaleInfo?.isPresale !== true
      && (p.extendedData ?? []).some(f => String(f.name).toLowerCase() === 'number' && parts(f.value)[0] === number))
      .map(p => [p.productId, p])).values()];
    if (sameNumber.length !== 1 || !matchesNumberLabel(row, sameNumber[0])) continue;
    const product = sameNumber[0], quotes = prices.filter(p => p.productId === product.productId && p.subTypeName === subtype);
    if (quotes.length !== 1 || !Number.isFinite(quotes[0].marketPrice) || quotes[0].marketPrice <= 0) continue;
    mappings.push({ categoryId: 3, groupId: group.groupId, setId: row.set_id, variantId: row.variant_id,
      productId: product.productId, subtype,
      note: `Reviewed numeric listing label only: ${product.name}; canonical ${row.card_english_display_name ?? row.card_native_name} #${row.collector_number}. Existing exact English set/group; unique printing and provider product; exact requested ${subtype}; no edition, stamp, pattern or language substitution.` });
    evidence.push({ variantId: row.variant_id, printingId: row.printing_id, catalogueVersionId: row.catalogue_version_id,
      canonicalName: row.card_english_display_name ?? row.card_native_name, collectorNumber: row.collector_number,
      providerName: product.name, providerNumber: product.extendedData.find(f => String(f.name).toLowerCase() === 'number').value,
      productId: product.productId, subtype, marketPriceUsd: quotes[0].marketPrice, sourceUrl: product.url });
  }
  // The database has category-global product/finish ownership. Validate the
  // complete group before splitting it into its 100-row review transactions.
  const claims = new Map();
  for (const m of mappings) { const key = `${m.productId}/${m.subtype}`; if (claims.has(key) && claims.get(key) !== m.variantId) throw Error('Provider identity collision.'); claims.set(key, m.variantId); }
  for (let offset = 0; offset < mappings.length; offset += 100) validateMappingRepairs(mappings.slice(offset, offset + 100));
  return { mappings, evidence };
}

export function numberLabelPricePlan(input, recovery) {
  const maps = new Map(recovery.mappings.map(m => [m.variantId, m]));
  const candidates = input.candidates.filter(row => maps.has(row.variant_id)).map(row => {
    const m = maps.get(row.variant_id);
    return { ...row, provider_mapping: { category_id: 3, group_id: m.groupId, product_id: m.productId, method: 'reviewed' } };
  });
  return planCatalogueBulkPrices({ ...input, candidates });
}

/** A captured plan cannot overwrite a map added by another run. Recheck the
 * complete current group and retained provider build immediately before apply. */
export async function recheckNumberLabelRecovery(api, input, recovery) {
  const candidates = []; let after = null;
  do {
    const page = await api.rpc('catalogue_bulk_group_candidates', { p_category: 3, p_group: input.group.groupId, p_after: after, p_limit: 500 });
    if (page.error) throw page.error;
    if (!Array.isArray(page.data)) throw Error('Incomplete current catalogue page.');
    if (page.data.some(row => typeof row.variant_id !== 'string' || (after && row.variant_id <= after))) throw Error('Invalid current catalogue cursor.');
    candidates.push(...page.data);
    if (candidates.length > 10000) throw Error('Current group exceeded recovery bound.');
    after = page.data.length === 500 ? page.data.at(-1).variant_id : null;
  } while (after);
  const products = await api.rpc('read_catalogue_bulk_feed', { p_key: `tcgplayer/3/${input.group.groupId}/products` });
  const prices = await api.rpc('read_catalogue_bulk_feed', { p_key: `tcgplayer/3/${input.group.groupId}/prices` });
  if (products.error) throw products.error;
  if (prices.error) throw prices.error;
  if (Date.parse(products.data?.dataset_at) !== Date.parse(input.datasetAt)
    || Date.parse(prices.data?.dataset_at) !== Date.parse(input.datasetAt)) throw Error('Provider build changed; recapture the recovery plan.');
  const currentInput = { ...input, candidates, products: products.data?.payload?.results, prices: prices.data?.payload?.results };
  const current = planNumberLabelRecovery(currentInput);
  const signature = maps => maps.map(m => [m.variantId, m.setId, m.productId, m.subtype]).sort((a, b) => a[0].localeCompare(b[0]));
  if (JSON.stringify(signature(current.mappings)) !== JSON.stringify(signature(recovery.mappings))) throw Error('Catalogue or provider mapping changed; recapture the recovery plan.');
  return { recovery: current, plan: numberLabelPricePlan(currentInput, current) };
}

export async function mainNumberLabelRecovery(args = process.argv.slice(2)) {
  if (args.includes('--apply')) throw Error('This tool creates offline recovery reports only; use the existing reviewed server pricing lane for live writes.');
  const fixture = args.find(a => a.startsWith('--fixture='))?.slice(10);
  const report = args.find(a => a.startsWith('--report='))?.slice(9);
  if (!fixture) throw Error('Supply a captured, complete provider-group fixture for review.');
  const input = JSON.parse(await readFile(fixture, 'utf8'));
  let recovery = planNumberLabelRecovery(input), plan = numberLabelPricePlan(input, recovery);
  if (plan.results.some(r => !r.quote || !r.mapping)) throw Error('Reviewed recovery must have one defensible quote per mapping.');
  const result = { dryRun: true, group: input.group, datasetAt: input.datasetAt, fx: input.fx,
    reviewed: recovery.mappings.length, stored: 0, mappings: recovery.mappings, evidence: recovery.evidence, results: plan.results };
  if (report) await writeFile(report, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ dryRun: result.dryRun, group: result.group, reviewed: result.reviewed, stored }));
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) mainNumberLabelRecovery().catch(error => { console.error(error.message); process.exitCode = 1; });
