import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createMarketPricingService } from '../backend/lib/marketPricing/service.js';
import { CataloguePriceCache } from '../lib/cataloguePriceCacheCore';
import type { StackrCataloguePricePage } from '../lib/stackrApiV1';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const json = JSON.stringify;

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog; create schema market;
      create table catalog.catalogue_versions(id uuid primary key, status text not null default 'published', deprecated_at timestamptz);
      create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,primary key(catalogue_version_id,variant_id));
      create table catalog.sets(id uuid primary key, deprecated_at timestamptz); create table catalog.languages(code text primary key);
      create table catalog.card_printings(id uuid primary key, collector_number text, language_code text, set_id uuid, deprecated_at timestamptz);
      create table catalog.card_variants(id uuid primary key, printing_id uuid references catalog.card_printings, language_code text, variant_code text, finish_code text, deprecated_at timestamptz, is_default boolean);
      create table api.catalogue_cards(variant_id uuid primary key, printing_id uuid, set_id uuid, language_code text, variant_code text, finish_code text, catalogue_version_id uuid);
      create table catalog.catalogue_version_external_identifiers(external_id text, language_code text, catalogue_version_id uuid, printing_id uuid, variant_id uuid);
      create view api.catalogue_external_identifiers as select * from catalog.catalogue_version_external_identifiers;
      create table api.market_price_estimates(price_estimate_id uuid primary key, variant_id uuid, language_code text, product_kind text, display_currency_code text, condition_code text, grader_code text, grade_value numeric, fallback_identity_key text, calculated_at timestamptz, stale_after timestamptz, central_estimate numeric, low_estimate numeric, high_estimate numeric, evidence_status text, identity_key text, sample_count integer, source_breakdown jsonb, freshness text);
      create table public.market_price_snapshots(id bigint generated always as identity primary key, card_id text, language text, set_id text, user_id uuid, calculated_at timestamptz, snapshot_at timestamptz, pricing_identity_json jsonb, market_price_gbp numeric, primary_source text, price_type text, stale_after timestamptz);
      insert into catalog.catalogue_versions values('${id(1)}','published',null); insert into catalog.languages values('en'),('ja'),('ko'),('zh-cn'),('zh-tw');
      insert into catalog.sets values('${id(2)}',null);
      insert into catalog.card_printings values('${id(3)}','001/165','en','${id(2)}',null);
      insert into catalog.card_variants values('${id(4)}','${id(3)}','en','normal','normal',null,true),('${id(5)}','${id(3)}','en','reverse_holo','reverse_holo',null,false); insert into catalog.catalogue_version_variants values('${id(1)}','${id(4)}'),('${id(1)}','${id(5)}');
      insert into api.catalogue_cards values('${id(4)}','${id(3)}','${id(2)}','en','normal','normal','${id(1)}'),('${id(5)}','${id(3)}','${id(2)}','en','reverse_holo','reverse_holo','${id(1)}');
      insert into api.market_price_estimates values('${id(6)}','${id(4)}','en','raw_card','GBP','raw_near_mint',null,null,null,now(),now()+interval '1 day',10,null,null,'market_estimate',null,1,'[]','fresh');
      grant usage on schema api,catalog,market,public to service_role;
      grant select on all tables in schema api,catalog,public to service_role;
    `);
    await db.exec(`begin; ${readFileSync('supabase/migrations/20261003224016_catalogue_price_bulk_cache.sql', 'utf8')} commit;`);
    await db.exec(`begin; ${readFileSync('supabase/migrations/20261003231006_batch_catalogue_price_identity_reads.sql', 'utf8')} commit;`);
    await db.exec(`begin; ${readFileSync('supabase/migrations/20261003234257_bounded_published_price_read.sql', 'utf8')} commit;`);
    await db.exec(`begin; ${readFileSync('supabase/migrations/20261003234442_cover_general_price_foreign_keys.sql', 'utf8')} commit;`);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from api.read_catalogue_prices($1::text[],$2)', [[id(4)], 'en']), /permission denied/);
    await db.exec('reset role; set role service_role');
    const repeated = (await db.query<any>('select * from api.read_catalogue_prices($1::text[],$2)', [Array.from({ length: 100 }, () => id(4)), 'en'])).rows;
    assert.equal(repeated.length, 100, 'bulk reads preserve the order and count of repeated input references');
    assert.ok(repeated.every((row) => row.reference === id(4) && row.candidates.length === 2));
    assert.equal(repeated[0].candidates[0].card_native_name, undefined, 'prices must not serialize the full catalogue record');
    await assert.rejects(db.query('select * from api.read_catalogue_prices($1::text[],$2)', [Array.from({ length: 101 }, () => id(4)), 'en']), /invalid catalogue price references/);
    assert.deepEqual((await db.query<any>('select * from api.read_catalogue_prices($1::text[],$2)', [[id(4)], 'ja'])).rows[0].candidates, [], 'English variant references never cross into Japanese cards');
    const candidates = async () => (await db.query<any>('select * from api.read_catalogue_prices($1::text[],$2)', [[id(4)], 'en'])).rows[0].candidates;
    await db.exec('reset role'); await db.query('update catalog.card_variants set deprecated_at=now() where id=$1',[id(4)]); await db.exec('set role service_role');
    assert.deepEqual((await candidates()).map((row: any) => row.variant_id), [id(5)], 'deprecated variants are excluded while other published variants remain');
    await db.exec('reset role'); await db.query('update catalog.card_variants set deprecated_at=null where id=$1',[id(4)]); await db.exec('set role service_role'); assert.equal((await candidates()).length, 2);
    await db.exec('reset role'); await db.query('update catalog.card_printings set deprecated_at=now() where id=$1',[id(3)]); await db.exec('set role service_role');
    assert.deepEqual(await candidates(), [], 'deprecated printings are not published price candidates');
    await db.exec('reset role'); await db.query('update catalog.card_printings set deprecated_at=null where id=$1',[id(3)]); await db.exec('set role service_role'); assert.equal((await candidates()).length, 2);
    await db.exec('reset role'); await db.query('update catalog.sets set deprecated_at=now() where id=$1',[id(2)]); await db.exec('set role service_role');
    assert.deepEqual(await candidates(), [], 'deprecated sets are not published price candidates');
    await db.exec('reset role'); await db.query('update catalog.sets set deprecated_at=null where id=$1',[id(2)]); await db.exec('set role service_role'); assert.equal((await candidates()).length, 2);
    await db.exec('reset role'); await db.query("update catalog.catalogue_versions set status='draft' where id=$1",[id(1)]); await db.exec('set role service_role');
    assert.deepEqual(await candidates(), [], 'draft catalogue versions are not published price candidates');
    await db.exec('reset role'); await db.query("update catalog.catalogue_versions set status='published' where id=$1",[id(1)]); await db.exec('set role service_role'); assert.equal((await candidates()).length, 2);
    await db.exec('reset role'); await db.query('update catalog.catalogue_versions set deprecated_at=now() where id=$1',[id(1)]); await db.exec('set role service_role');
    assert.deepEqual(await candidates(), [], 'deprecated catalogue versions are not published price candidates');
    await db.exec('reset role'); await db.query('update catalog.catalogue_versions set deprecated_at=null where id=$1',[id(1)]); await db.exec('set role service_role'); assert.equal((await candidates()).length, 2);
    let catalogueReads = 0;
    let cardmarketReads = 0;
    let cardmarketQuote: Record<string, unknown> | null = null;
    const supabase = { schema: () => ({ rpc: async (name: string, args: any) => {
      if (name === 'read_catalogue_prices') {
        catalogueReads++;
        try { return { data: (await db.query('select * from api.read_catalogue_prices($1::text[],$2)', [args.p_references, args.p_language])).rows, error: null }; }
        catch (error) { return { data: null, error }; }
      }
      if (name === 'read_cardmarket_blended_general_prices') {
        cardmarketReads++;
        assert.deepEqual(args.p_printing_ids, [id(3)], 'Cardmarket is queried only by the resolved printing identity');
        return { data: cardmarketQuote ? [{ printing_id: id(3), quote: cardmarketQuote }] : [], error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    } }) };
    const service = createMarketPricingService({ supabase: supabase as any });
    const exact = await service.cataloguePrices({ references: [id(4), id(5)], language: 'en', estimateMode: 'exact' });
    assert.equal(catalogueReads, 1, 'one visible page is one catalogue database read');
    assert.equal(cardmarketReads, 0, 'exact reads never consult Cardmarket');
    assert.equal(exact.prices[0].price?.estimates.central, 10);
    assert.equal(exact.prices[1].price?.estimates.central, null, 'normal evidence cannot become a reverse-holo quote');
    const known = Object.fromEntries(exact.prices.map((row: any) => [row.reference, row.revision]));
    const unchanged = await service.cataloguePrices({ references: [id(4), id(5)], language: 'en', knownRevisions: known });
    assert.equal(unchanged.prices.length, 0); assert.equal(unchanged.unchangedReferences.length, 2);
    await db.exec('reset role');
    const result = { variantId: id(4), catalogueVersionId: id(1), reason: 'priced', nextRetryAt: new Date(Date.now() + 86_400_000).toISOString(), quote: { productId: 12, groupId: 44, price: 20, currency: 'USD', datasetAt: new Date(Date.now() - 3_600_000).toISOString(), exchangeRate: 0.75, exchangeRateAt: new Date(Date.now() - 3_600_000).toISOString(), exchangeRateSource: 'fixture' } };
    await db.query('delete from api.market_price_estimates where variant_id=$1', [id(4)]);
    await db.query('select api.store_catalogue_bulk_prices($1::jsonb)', [json([result])]);
    const general = await service.cataloguePrices({ references: [id(4)], language: 'en', estimateMode: 'general' });
    assert.equal(general.prices[0].price?.estimates.central, 15);
    assert.equal(general.prices[0].price?.fallbackEstimate?.reason, 'general_card_estimate');
    assert.equal(cardmarketReads, 1, 'general reads may safely check the printing-level fallback once');

    await db.query('delete from market.catalogue_general_prices');
    const sourceAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const fxAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const staleAt = new Date(Date.now() - 86_400_000).toISOString();
    const validCardmarketQuote = {
      provider: 'cardmarket_public', priceScope: 'blended_general_estimate', currency: 'GBP', centralEstimate: 8.5,
      originalCurrency: 'EUR', originalPrice: 10, exchangeRate: 0.85, exchangeRateAt: fxAt, exchangeRateSource: 'ECB fixture',
      selectedField: 'trend', sourceCreatedAt: sourceAt, staleAfter: staleAt, freshness: 'stale', providerCategoryId: 6, providerProductId: 12,
      language: null, condition: null, finish: null, grade: null, usableForExactVariant: false, usableForHoldingsValuation: false,
    };
    cardmarketQuote = validCardmarketQuote;
    const cardmarketFallback = await service.cataloguePrices({ references: [id(4)], language: 'en', estimateMode: 'general' });
    assert.equal(cardmarketFallback.prices[0].price?.estimates.central, 8.5, 'a reviewed blended quote is a general fallback only');
    assert.equal(cardmarketFallback.prices[0].price?.freshness, 'stale', 'an older but valid FX observation remains usable on a stale quote');
    assert.equal(cardmarketFallback.prices[0].price?.sourceBreakdown[0]?.originalCurrency, 'EUR');
    for (const [label, quote] of [
      ['missing amount', { ...validCardmarketQuote, centralEstimate: null }],
      ['blank original', { ...validCardmarketQuote, originalPrice: ' ' }],
      ['future source date', { ...validCardmarketQuote, sourceCreatedAt: new Date(Date.now() + 60_000).toISOString() }],
      ['future FX date', { ...validCardmarketQuote, exchangeRateAt: new Date(Date.now() + 60_000).toISOString() }],
      ['scoped language', { ...validCardmarketQuote, language: 'en' }],
      ['inconsistent conversion', { ...validCardmarketQuote, centralEstimate: 8.6 }],
    ] as [string, Record<string, unknown>][]) {
      cardmarketQuote = quote;
      const rejected = await service.cataloguePrices({ references: [id(4)], language: 'en', estimateMode: 'general' });
      assert.equal(rejected.prices[0].price?.estimates.central, null, `${label} Cardmarket quote is rejected`);
    }
    cardmarketQuote = validCardmarketQuote;

    const storage = new Map<string, string>(); let now = Date.now(); let calls = 0;
    const cache = new CataloguePriceCache({ getItem: async (key) => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } }, () => now);
    const response = async (_refs: string[], revisions: Record<string, string>): Promise<StackrCataloguePricePage> => {
      calls++; return service.cataloguePrices({ references: [id(4)], language: 'en', estimateMode: 'general', knownRevisions: revisions }) as any;
    };
    const scope = 'test-account|en|general';
    assert.equal((await cache.read(scope, [id(4)], response)).get(id(4))?.price?.estimates.central, 8.5);
    await cache.flush();
    const restarted = new CataloguePriceCache({ getItem: async (key) => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } }, () => now);
    await restarted.read(scope, [id(4)], response); assert.equal(calls, 1, 'a fresh persistent row survives restart');
    now += 6 * 60_000;
    await assert.rejects(restarted.read(scope, [id(4)], async () => { throw new Error('offline'); }, true));
    assert.equal(restarted.peek(scope, [id(4)]).get(id(4))?.price?.estimates.central, 8.5, 'a failed refresh retains the last quote');
    assert.equal(restarted.peek(scope, [id(4)]).get(id(4))?.price?.freshness, 'stale');
    console.log('Catalogue price guide/cache passed: service-only SQL, exact/general separation, revisions, restart and stale retention.');
  } finally { await db.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
