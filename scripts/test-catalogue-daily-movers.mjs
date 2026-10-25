import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createMarketPricingService } from '../backend/lib/marketPricing/service.js';
import createV1Router from '../backend/routes/v1.js';

const migration = 'supabase/migrations/20261022064554_catalogue_daily_market_movers.sql';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
const originalFetch = globalThis.fetch;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema catalog; create schema market; create schema api;
    create table catalog.catalogue_versions(id uuid primary key,language_code text,status text default 'published',deprecated_at timestamptz,published_at timestamptz default now(),created_at timestamptz default now());
    create table catalog.sets(id uuid primary key,language_code text,deprecated_at timestamptz);
    create table catalog.card_printings(id uuid primary key,set_id uuid,language_code text,deprecated_at timestamptz);
    create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text default 'normal',finish_code text default 'normal',deprecated_at timestamptz);
    create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,printing_id uuid,set_id uuid,language_code text,primary key(catalogue_version_id,variant_id));
    create table market.catalogue_general_prices(variant_id uuid primary key,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,provider text default 'tcgcsv',
      category_id integer,group_id bigint default 1,product_id bigint,subtype text default 'Normal',original_price numeric,original_currency text default 'USD',
      exchange_rate numeric default 0.8,exchange_rate_at timestamptz,exchange_rate_source text default 'fixture-fx',central_estimate numeric,dataset_at timestamptz,stale_after timestamptz,recorded_at timestamptz default now());
    grant usage on schema catalog,market,api to service_role,anon,authenticated;
    grant select on all tables in schema catalog to service_role;
    grant select,insert,update,delete on market.catalogue_general_prices to service_role;
    insert into catalog.catalogue_versions(id,language_code) values('${id(9001)}','en'),('${id(9002)}','ja'),('${id(9003)}','zh-cn');
    insert into catalog.sets(id,language_code) values('${id(8001)}','en'),('${id(8002)}','ja'),('${id(8003)}','zh-cn');
  `);
  const now = Date.parse((await db.query('select now() at')).rows[0].at);
  const currentAt = new Date(now - 300_000).toISOString();
  const previousAt = new Date(now - 86_400_000 - 300_000).toISOString();
  const at = (days) => new Date(now - days * 86_400_000 - 300_000).toISOString();
  async function card(n, language = 'en') {
    const ordinal = { en: 1, ja: 2, 'zh-cn': 3 }[language];
    await db.query('insert into catalog.card_printings(id,set_id,language_code) values($1,$2,$3)', [id(n + 10000), id(8000 + ordinal), language]);
    await db.query('insert into catalog.card_variants(id,printing_id,language_code) values($1,$2,$3)', [id(n), id(n + 10000), language]);
    await db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5)', [id(9000 + ordinal), id(n), id(n + 10000), id(8000 + ordinal), language]);
  }
  async function quote(n, value, sourceAt, language = 'en') {
    const ordinal = { en: 1, ja: 2, 'zh-cn': 3 }[language];
    await db.query(`insert into market.catalogue_general_prices(variant_id,printing_id,set_id,language_code,catalogue_version_id,category_id,product_id,
      original_price,central_estimate,exchange_rate_at,dataset_at,stale_after) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10::timestamptz + interval '48 hours')
      on conflict(variant_id) do update set original_price=excluded.original_price,central_estimate=excluded.central_estimate,
        exchange_rate_at=excluded.exchange_rate_at,dataset_at=excluded.dataset_at,stale_after=excluded.stale_after,recorded_at=now()`,
    [id(n), id(n + 10000), id(8000 + ordinal), language, id(9000 + ordinal), language === 'ja' ? 85 : 3, n, value / 0.8, value, sourceAt]);
  }
  const read = async (limit = 100, sort = 'money') => (await db.query('select api.catalogue_daily_market_movers($1,$2) result', [limit, sort])).rows[0].result;
  await card(1); await quote(1, 10, previousAt);
  await db.exec(readFileSync(migration, 'utf8'));
  let result = await read();
  assert.equal(result.coverage.quotedVariants, 1);
  assert.equal(result.coverage.comparableVariants, 0, 'installation never invents an earlier date from the latest quote');
  assert.equal(result.coverage.state, 'insufficient_history');
  await quote(1, 11, currentAt);
  result = await read();
  assert.equal(result.movers.length, 1, 'first approved update retains both its prior and new actual provider dates');
  assert.equal(result.movers[0].comparisonDays, 1);
  assert.equal(result.movers[0].priceBasis, 'catalogue_market_guide');
  assert.equal(result.movers[0].previousEstimate, 10);
  const retained = (await db.query('select source_payload from market.catalogue_daily_price_observations order by id')).rows;
  assert.equal(retained[0].source_payload.original_currency, 'USD');
  assert.equal(retained[0].source_payload.exchange_rate_source, 'fixture-fx', 'immutable receipts retain original FX provenance');
  await quote(1, 11, currentAt);
  assert.equal((await db.query('select count(*)::int n from market.catalogue_daily_price_observations')).rows[0].n, 2, 're-reading one provider date cannot create history');
  await card(2); await quote(2, 10, currentAt); await quote(2, 12, currentAt);
  assert.equal((await read()).coverage.insufficientHistoryVariants, 1, 'multiple same-source-day prices are never daily movement');
  await card(3); await quote(3, 10, at(3)); await quote(3, 12, currentAt);
  assert.equal((await read()).coverage.insufficientHistoryVariants, 2, 'a source-date gap is not a one-day comparison');
  await card(4); await quote(4, 10, at(4)); await quote(4, 12, at(3));
  assert.equal((await read()).coverage.staleVariants, 1, 'stale guides do not appear among current daily movers');
  await card(5, 'ja'); await quote(5, 20, previousAt, 'ja'); await quote(5, 22, currentAt, 'ja');
  await card(6, 'zh-cn');
  await card(7); // supported identity with no provider quote
  await card(8); await quote(8, 10, previousAt); await quote(8, 12, currentAt);
  await db.query('update market.catalogue_general_prices set product_id=999 where variant_id=$1', [id(8)]);
  assert.equal((await read()).coverage.insufficientHistoryVariants, 3, 'remapped provider identities cannot borrow the old product comparison');
  await card(9); await quote(9, 10, previousAt); await quote(9, 12, currentAt);
  await db.query('update market.catalogue_general_prices set central_estimate=999 where variant_id=$1', [id(9)]);
  assert.equal((await read()).coverage.unquotedVariants, 2, 'conflicting original-currency/FX amounts are not usable quotes');
  await card(10); await quote(10, 20, previousAt); await quote(10, 20, currentAt);
  assert.equal((await read()).coverage.comparableVariants, 3, 'unchanged valid pairs count in coverage but not movers');
  await card(11); await quote(11, 10, previousAt);
  await quote(11, 12, new Date(now + 60_000).toISOString());
  assert.equal((await read()).coverage.unquotedVariants, 3, 'future source times are not current quotes');
  // More than an old endpoint page of cheap percentage leaders cannot hide
  // large cash movements when ranking the complete catalogue by money.
  for (let n = 20; n < 240; n++) { await card(n); await quote(n, n % 2 ? 1 : 2, previousAt); await quote(n, n % 2 ? 2 : 1, currentAt); }
  await card(250); await quote(250, 1000, previousAt); await quote(250, 1100, currentAt);
  await card(251); await quote(251, 2000, previousAt); await quote(251, 1800, currentAt);
  result = await read(10, 'money');
  assert.equal(result.movers.length, 10);
  assert.ok(result.movers.some(row => row.variantId === id(250)) && result.movers.some(row => row.variantId === id(251)), 'global cash ranking preserves both actual tails');
  const percentages = await read(10, 'percent');
  assert.ok(!percentages.movers.some(row => [id(250), id(251)].includes(row.variantId)), 'percentage mode genuinely changes the server ranking');
  assert.ok(percentages.movers.some(row => row.percentageChange > 0) && percentages.movers.some(row => row.percentageChange < 0));
  assert.equal(result.coverage.unsupportedVariants, 1);
  assert.ok(result.coverage.comparableVariants > result.movers.length, 'coverage describes the complete catalogue before output caps');
  const before = result.coverage.publishedVariants;
  await db.query('update catalog.card_variants set deprecated_at=now() where id=$1', [id(250)]);
  assert.equal((await read()).coverage.publishedVariants, before - 1, 'retired variants cannot reappear through retained history');
  assert.ok(!(await read()).movers.some(row => row.variantId === id(250)));
  const tokyo = value => new Date(Date.parse(value) + 9 * 3_600_000).toISOString().replace('Z', '+09:00');
  await card(12); await quote(12, 30, tokyo(previousAt)); await quote(12, 33, tokyo(currentAt));
  assert.ok((await read()).movers.some(row => row.variantId === id(12)), 'offset timestamps compare by actual UTC source day');
  assert.equal(String((await db.query('select source_day::text as source_day_text from market.catalogue_daily_price_observations where variant_id=$1 order by source_at desc limit 1', [id(12)])).rows[0].source_day_text), currentAt.slice(0, 10));
  await card(13); await quote(13, 10, previousAt); await quote(13, 11, previousAt); await quote(13, 12, currentAt);
  assert.equal((await read()).movers.find(row => row.variantId === id(13)).previousEstimate, 11, 'latest retained correction within the prior source day wins without fabricating another day');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(read(), /permission denied/);
    await assert.rejects(db.query('select * from market.catalogue_daily_price_observations'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.ok((await read()).coverage.comparableVariants > 0, 'service role can execute the read with invoker permissions');
  await assert.rejects(db.query('delete from market.catalogue_daily_price_observations'), /permission denied/, 'backend cannot erase immutable receipts');
  await quote(1, 12, currentAt); // actual trigger/helper permission path
  await db.exec('reset role');
  let rpcCalls = 0;
  const service = createMarketPricingService({ supabase: { schema(schema) { assert.equal(schema, 'api'); return { rpc: async (name, args) => {
    rpcCalls++; assert.equal(name, 'catalogue_daily_market_movers'); return { data: await read(args.p_limit, args.p_sort), error: null };
  } }; } }, fetchTcgdexNormalCardPrice: () => { throw Error('Provider forbidden'); } });
  // PGlite WASM is initialized before forbidding external fetches.
  globalThis.fetch = async () => { throw Error('Network forbidden in daily mover tests'); };
  const response = await service.marketMovers({ scope: 'catalogue_daily', sortBy: 'money', currency: 'GBP', productType: 'raw_card', limit: 10 });
  assert.equal(response.coverage.scope, 'catalogue_daily'); assert.equal(response.movers.length, 10);
  assert.equal(rpcCalls, 1, 'one bounded read replaces per-card market/collection requests');
  const query = { scope: 'catalogue_daily', sortBy: 'money', productType: 'raw_card', currency: 'GBP', limit: '10' };
  const router = createV1Router({ env: { STACKR_PRICING_ACCESS_MODE: 'public' }, service: {}, pricingService: {
    marketMovers: async (actual) => { assert.equal(actual, query); return response; },
  } });
  const handler = router.stack.find(layer => layer.route?.path === '/market/movers').route.stack[0].handle;
  let body; let status; const headers = {};
  const res = { locals: { personalPricing: true }, setHeader: (key, value) => { headers[key] = value; }, vary() {},
    status(code) { status = code; return this; }, json(value) { body = value; }, end() {} };
  await handler({ query, headers: {}, stackrRequestId: 'daily-fixture' }, res);
  assert.equal(status, 200);
  assert.equal(body.data.coverage.scope, 'catalogue_daily', 'the actual route forwards global coverage into the response envelope');
  assert.match(headers['Cache-Control'], /private.*no-store/, 'personal route responses retain their private cache boundary');
  for (const query of [{ currency: 'USD' }, { productType: 'graded_card' }, { sortBy: 'random' }, { scope: 'random' }]) {
    await assert.rejects(service.marketMovers({ scope: 'catalogue_daily', ...query }), error => error.status === 400);
  }
  assert.equal(rpcCalls, 1, 'invalid scopes/products/currencies never query data');
  const missing = createMarketPricingService({ supabase: { schema: () => ({ rpc: async () => ({ error: { code: 'PGRST202' } }) }) } });
  await assert.rejects(missing.marketMovers({ scope: 'catalogue_daily' }), error => error.code === 'catalogue_daily_movers_unavailable', 'old deployments cannot silently fall back to a legacy sample');
  const malformed = createMarketPricingService({ supabase: { schema: () => ({ rpc: async () => ({ data: { ...response, coverage: { ...response.coverage, comparableVariants: -1 } } }) }) } });
  await assert.rejects(malformed.marketMovers({ scope: 'catalogue_daily' }), error => error.code === 'catalogue_daily_movers_invalid');
  console.log('Daily catalogue movers: real SQL triggers/history, consecutive source dates, global money/percent tails, coverage, provenance, remaps, staleness, roles and API validation passed.');
} finally { globalThis.fetch = originalFetch; await db.close(); }
