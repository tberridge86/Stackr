import 'dotenv/config';
import { createCataloguePriceDatabase } from './catalogue-price-database.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateMappingRepairs(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw Error('Supply 1..100 reviewed set/card mappings.');
  const mappings = input.map((m) => {
    if (!m || typeof m !== 'object' || Object.keys(m).some((k) => !['categoryId','groupId','setId','variantId','productId','subtype','note'].includes(k))
      || ![3,85].includes(m.categoryId) || !Number.isSafeInteger(m.groupId) || m.groupId <= 0 || !uuid.test(m.setId ?? '')
      || typeof m.note !== 'string' || m.note.trim().length < 5 || m.note.length > 1000) throw Error('Invalid reviewed set mapping.');
    if (m.variantId != null && (!uuid.test(m.variantId) || !Number.isSafeInteger(m.productId) || m.productId <= 0
      || !['Normal','Holofoil','Reverse Holofoil'].includes(m.subtype))) throw Error('A card repair requires exact variant/product/finish IDs.');
    if (m.variantId == null && (m.productId != null || m.subtype != null)) throw Error('Product mappings require an exact variant ID.');
    return { ...m, note: m.note.trim() };
  });
  // A promo group can span several language-specific canonical sets. A
  // provider product + finish, however, can price one published variant only.
  // The database rechecks retained feeds and catalogue rows; doing these
  // cross-entry checks here makes a reviewed batch fail before any RPC.
  const variantMappings = new Map();
  const providerIdentities = new Map();
  for (const mapping of mappings) {
    const groupKey = `${mapping.categoryId}:${mapping.groupId}`;
    const setId = mapping.setId.toLowerCase();
    if (mapping.variantId == null) continue;
    const variantId = mapping.variantId.toLowerCase();
    const variantKey = `${groupKey}:${mapping.productId}:${mapping.subtype}:${setId}`;
    // This is the actual database uniqueness key; group ID is deliberately
    // absent because TCGplayer product IDs are category-global.
    const providerKey = `${mapping.categoryId}:${mapping.productId}:${mapping.subtype}`;
    if (variantMappings.has(variantId) && variantMappings.get(variantId) !== variantKey) {
      throw Error('A canonical variant cannot be reviewed against multiple provider products, groups, categories, or canonical sets in one batch.');
    }
    if (providerIdentities.has(providerKey) && providerIdentities.get(providerKey) !== variantId) {
      throw Error('A provider product and finish cannot be reviewed against multiple canonical variants in one batch.');
    }
    variantMappings.set(variantId, variantKey);
    providerIdentities.set(providerKey, variantId);
  }
  return mappings;
}
export async function mainCataloguePriceGuide(args = process.argv.slice(2)) {
  const repairFile = args.find((a) => a.startsWith('--repair='))?.slice(9);
  const output = args.find((a) => a.startsWith('--report='))?.slice(9);
  const repairAfter = args.find((a) => a.startsWith('--repairs-after='))?.slice(16);
  const repairs = repairFile ? validateMappingRepairs(JSON.parse(await readFile(repairFile, 'utf8'))) : null;
  if (repairs && !args.includes('--apply')) { const result = { dryRun: true, databaseCalls: 0, mappings: repairs }; console.log(JSON.stringify(result)); return result; }
  if (!repairs && !args.includes('--coverage')) throw Error('Use --repair=<JSON> for an offline review, or --coverage for an approved server report.');
  if (process.env.STACKR_CATALOGUE_BULK_PRICING_ENABLED !== 'true' || (repairs && !args.includes('--apply'))) throw Error('Live price-guide access is disabled; enabling it requires explicit approval.');
  const target = resolvePricingV2SupabaseTarget(); const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw Error('Missing server database credential.');
  const db = createCataloguePriceDatabase(target.url, key); const api = db.schema('api');
  if (repairs) { const { data, error } = await api.rpc('review_catalogue_bulk_mappings', { p_mappings: repairs }); if (error) throw error; if (data !== repairs.length) throw Error('Mapping repairs were not acknowledged.'); }
  const { data: coverage, error } = await api.rpc('catalogue_bulk_price_coverage', {}); if (error) throw error;
  const { data: openRepairs, error: repairError } = await api.rpc('list_catalogue_price_repairs', { p_after: repairAfter ?? null, p_limit: 100 }); if (repairError) throw repairError;
  const result = { project: target.projectRef, repaired: repairs?.length ?? 0, coverage, openRepairs, repairPageSize: 100, nextRepairCursor: openRepairs?.length === 100 ? openRepairs.at(-1).repair_key : null };
  if (output) await writeFile(output, JSON.stringify(result, null, 2)+'\n','utf8');
  console.log(JSON.stringify(result)); return result;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) mainCataloguePriceGuide().catch((error)=>{console.error(error.message);process.exitCode=1;});
