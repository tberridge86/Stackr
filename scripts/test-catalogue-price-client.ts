import assert from 'node:assert/strict';
import * as chineseCatalogueCorrection from '../lib/chineseCatalogueCorrection';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { CataloguePriceCache } from '../lib/cataloguePriceCacheCore';
import type { StackrCardPrice } from '../lib/stackrApiV1';
import * as hash from '../lib/cataloguePriceHash';
import * as transport from '../lib/stackrApiTransportPolicy';
import * as baseline from '../lib/cataloguePriceBaseline';

// Run the actual phone modules with only native/transport dependencies replaced.
function load<T>(file: string, mocks: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, console, Date, Buffer, URL,
    require: (id: string) => { assert.ok(id in mocks, `Unexpected dependency ${id}`); return mocks[id]; } });
  return module.exports as T;
}

async function main() {
  let cacheNow = Date.now();
  class ClientFixturePriceCache extends CataloguePriceCache {
    constructor(cacheStorage: ConstructorParameters<typeof CataloguePriceCache>[0]) { super(cacheStorage, () => cacheNow); }
  }
  const disk = new Map<string, string>();
  const storage = { getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => { disk.set(key, value); } };
  const api = load<typeof import('../lib/stackrApiV1')>('lib/stackrApiV1.ts', {
    '@react-native-async-storage/async-storage': storage, './config': { STACKR_API_URL: 'https://api.example.test' },
    './stackrApiTransportPolicy': transport, './supabase': {}, buffer: { Buffer }, './cataloguePriceHash': hash,
    './stackrPreviewApiProxy': { resolveStackrApiDeviceIdForRequest: (_remote: string, _request: string, getId: () => Promise<string>) => getId(), rewriteStackrApiUrlForLoopbackPreview: () => 'http://localhost/anonymous-preview', stripStackrPreviewProxyAuthorization: (value: unknown) => value },
  });
  const jwt = (sub: string, expiry: number) => `header.${Buffer.from(JSON.stringify({ sub, iss: 'https://auth.example.test', exp: expiry })).toString('base64url')}.signature`;
  let token: string | null = jwt('owner-a', 1);
  const requests: { url: string; body: any }[] = [];
  const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  const quote = (variantId: string): StackrCardPrice => ({ variantId, identityKey: variantId, productType: 'raw_card', currency: 'GBP', status: 'market_estimate',
    priceType: 'market_estimate', estimates: { central: 12, low: null, high: null }, confidence: { label: 'low', score: 0.2 },
    calculatedAt: '2026-10-03T10:00:00Z', staleAfter: '2099-01-01T00:00:00Z', freshness: 'fresh',
    sample: { total: 1, sold: 0, active: 0, sources: 1, dateRange: { from: null, to: null } }, sourceBreakdown: [], outliers: {}, fallbackEstimate: null, unavailableReason: null,
    estimateVersion: 'fixture', provenLastSold: false, lastSoldEvidence: null });
  const client = new api.StackrApiClient({ baseUrl: 'https://api.example.test/v1', getAccessToken: async () => token,
    getDeviceId: async () => 'test-device', createIdempotencyKey: () => 'test-key', fetchImpl: async (url, init) => {
      assert.equal((init?.headers as any).Authorization, `Bearer ${token}`);
      assert.ok(String(url).startsWith('https://api.example.test/v1/'), 'authenticated reads must bypass anonymous preview proxy');
      const body = init?.body ? JSON.parse(String(init.body)) : null; requests.push({ url: String(url), body });
      let data: any;
      if (String(url).endsWith('/market/catalogue-prices')) {
        data = { prices: body.references.map((reference: string) => ({ reference, variantId: reference, cardId: reference,
          language: body.language, price: body.estimateMode === 'general' ? { ...quote(reference),
            fallbackEstimate: { identityKey: reference, reason: 'general_card_estimate', exact: false } } : quote(reference),
          unavailableReason: null, nextRetryAt: null, revision: 'a'.repeat(64) })),
          unchangedReferences: [], priceRevision: 'b'.repeat(64), estimateMode: body.estimateMode };
      } else data = { ...quote(ids[0]), priceType: 'recent_sold', provenLastSold: true,
        lastSoldObservationId: 'verified-sale', lastSoldEvidence: { observationId: 'verified-sale', soldAt: '2026-10-02T10:00:00Z' } };
      return new Response(JSON.stringify({ data, meta: {} }), { headers: { 'Content-Type': 'application/json' } });
    } });
  const prices = load<typeof import('../lib/cataloguePrices')>('lib/cataloguePrices.ts', {
    '@react-native-async-storage/async-storage': storage, './cataloguePriceCacheCore': { CataloguePriceCache: ClientFixturePriceCache },
    './stackrSetRetrieval': {},
    './stackrPreferredSetArtwork': {},
    './cardArtworkPresentation': {},
    './publishedSetLogoFallbacks': {},
    './stackrCatalogueCache': {},
    './foreignCardPresentation': {},
    './englishSetIdentity': {},
    './pokemonSetSeries': {},
    './optionalCatalogueEnrichment': {},
    './stackrApiV1': { ...api, stackrApiClient: client }, './stackrDomainMappings': { toStackrApiLanguage: (value: string) => value },
    './cataloguePriceHash': hash,
    './cataloguePriceBaseline': baseline,
  });
  const adapter = load<typeof import('../lib/stackrDomainAdapter')>('lib/stackrDomainAdapter.ts', {
    './chineseCatalogueCorrection': chineseCatalogueCorrection,
    './stackrSetRetrieval': {},
    './stackrPreferredSetArtwork': {},
    './cardArtworkPresentation': {},
    './publishedSetLogoFallbacks': {},
    './stackrCatalogueCache': {},
    './foreignCardPresentation': {},
    './englishSetIdentity': {},
    './pokemonSetSeries': {},
    './optionalCatalogueEnrichment': {},
    './stackrApiV1': { ...api, stackrApiClient: {} }, './cataloguePrices': prices, './supabase': {},
    './stackrDomainMappings': {}, './tcgdexControlledCardReference': {}, './providerSetMarkRuntimePolicy': {},
    './homePriceRefreshCore': {}, './stackrPriceIdentity': {}, './pokemonDisplayNames': {}, './cardNameTranslations.js': {},
    './pokemonSetIdentity': {}, './resilientCatalogueRead': {}, './optionalSearchEnrichment': {},
  });
  const exactSnapshots = await adapter.fetchStackrPriceSnapshots(ids, { language: 'en' }, client);
  assert.equal(exactSnapshots.size, 201);
  assert.equal(exactSnapshots.get(ids[0])?.price_basis, 'exact', 'exact quotes retain their classification');
  assert.deepEqual(requests.map((request) => request.body.references.length), [100, 100, 1]);
  assert.ok(requests.every((request) => request.url.endsWith('/market/catalogue-prices')), 'no individual identity or price requests');
  const scopeA = await client.getPricingCacheScope();
  await prices.cataloguePriceCache.flush(); prices.cataloguePriceCache.clearMemory();
  await prices.fetchCataloguePrices(ids, { language: 'en' }, client);
  assert.equal(requests.length, 3, 'a full restart hydrates saved pages without network');
  token = jwt('owner-a', 999);
  assert.equal(await client.getPricingCacheScope(), scopeA, 'token refresh preserves account cache');
  token = jwt('owner-b', 999);
  assert.notEqual(await client.getPricingCacheScope(), scopeA);
  await prices.fetchCataloguePrices([ids[0]], { language: 'en' }, client);
  assert.equal(requests.length, 4, 'a second account cannot hydrate the first account quote');
  token = null;
  await assert.rejects(prices.fetchCataloguePrices([ids[0]], { language: 'en' }, client));
  assert.equal(requests.length, 4, 'signed-out reads do not use cached prices');
  token = jwt('owner-a', 999);
  await prices.fetchCataloguePrices([ids[0]], { language: 'en', estimateMode: 'general' }, client);
  assert.equal((await adapter.fetchStackrPriceSnapshots([ids[0]], { language: 'en', estimateMode: 'general' }, client)).get(ids[0])?.price_basis,
    'general', 'general guides are never reclassified as exact by the snapshot adapter');
  await prices.fetchCataloguePrices([ids[0]], { language: 'ja' }, client);
  assert.equal(requests.length, 6, 'language and general/exact modes are isolated');
  const identity = { variantId: ids[0], cardId: ids[0], language: 'en' };
  await prices.fetchCachedRawDetailPrice(identity, { condition: 'near_mint' }, client);
  const detail = await prices.fetchCachedRawDetailPrice(identity, { condition: 'near_mint' }, client);
  assert.equal(detail.provenLastSold, true); assert.equal(detail.lastSoldEvidence?.observationId, 'verified-sale', 'detail cache preserves exact sale provenance');
  assert.equal(requests.length, 7);
  await prices.fetchCachedRawDetailPrice(identity, { condition: 'lightly_played' }, client);
  assert.equal(requests.length, 8, 'condition-specific detail quotes have separate caches');
  await prices.fetchCachedRawDetailPrice(identity, { condition: 'near_mint' }, client, true);
  assert.equal(requests.length, 9, 'manual refresh bypasses the fresh detail cache');
  const currentMarket = prices.cataloguePriceDisplay({ reference: ids[0], variantId: ids[0], cardId: ids[0], language: 'en', price: quote(ids[0]), unavailableReason: null, nextRetryAt: null, revision: 'display-current' });
  assert.equal(currentMarket.sourceLabel, 'Current market value');
  const generalMarket = prices.cataloguePriceDisplay({ reference: ids[0], variantId: ids[0], cardId: ids[0], language: 'en', price: { ...quote(ids[0]), fallbackEstimate: { identityKey: ids[0], reason: 'general_card_estimate', exact: false } }, unavailableReason: null, nextRetryAt: null, revision: 'display-general' });
  assert.equal(generalMarket.sourceLabel, 'Estimated price');
  const sold = prices.cataloguePriceDisplay({ reference: ids[0], variantId: ids[0], cardId: ids[0], language: 'en', price: { ...quote(ids[0]), priceType: 'recent_sold_value', provenLastSold: true, lastSoldEvidence: { observationId: 'verified-sale' } }, unavailableReason: null, nextRetryAt: null, revision: 'display-sold' });
  assert.equal(sold.sourceLabel, 'Last sold');
  const provisionalRow = { reference: ids[0], variantId: ids[0], cardId: ids[0], language: 'en', price: {
    ...quote(ids[0]), estimates: { central: 0.25, low: null, high: null },
    estimateVersion: 'catalogue-rarity-era-baseline-v1',
    fallbackEstimate: { identityKey: ids[0], reason: 'provisional_catalogue_baseline', exact: false as const },
  }, unavailableReason: null, nextRetryAt: null, revision: 'c'.repeat(64) };
  const generalScope = prices.cataloguePriceScope(scopeA, { language: 'en', estimateMode: 'general' });
  await prices.cataloguePriceCache.read(generalScope, [ids[1]], async () => ({
    prices: [{ ...provisionalRow, reference: ids[1], variantId: ids[1], cardId: ids[1], price: { ...provisionalRow.price, variantId: ids[1] } }],
    unchangedReferences: [], priceRevision: 'c'.repeat(64), estimateMode: 'general',
  }));
  await prices.cataloguePriceCache.flush(); prices.cataloguePriceCache.clearMemory();
  const restarted = await prices.cataloguePriceCache.read(generalScope, [ids[1]], async () => { throw new Error('Offline restart'); });
  assert.equal(prices.cataloguePriceDisplay(restarted.get(ids[1])!).displayPrice, null, 'A warm disk restart must hide retired £0.25 baseline quotes.');
  assert.equal((await adapter.fetchStackrPriceSnapshots([ids[1]], { language: 'en', estimateMode: 'general' }, client)).get(ids[1])?.price_basis,
    'general', 'a provisional baseline stays general through the actual snapshot adapter after restart');
  assert.equal(prices.cataloguePriceDisplay(provisionalRow).unavailableReason, 'retired_provisional_baseline');
  assert.equal(prices.cataloguePriceDisplay({ ...provisionalRow, price: { ...provisionalRow.price, estimateVersion: baseline.PROVISIONAL_CATALOGUE_PRICE_MODEL } }).displayPrice, 0.25,
    'Current provisional model is recognized; the overlay separately checks card eligibility.');
  assert.equal(prices.cataloguePriceDisplay({ ...provisionalRow, price: { ...quote(ids[0]), estimates: { central: 0.25, low: null, high: null } } }).displayPrice, 0.25,
    'A real low-value card is not inflated or removed merely because its price is £0.25.');
  assert.equal(prices.cataloguePriceDisplay({ ...provisionalRow, price: { ...quote(ids[0]), estimates: { central: 60.125, low: null, high: null } } }).displayPrice, 60.13,
    'display amounts round consistently to pennies while the quote retains source precision');
  const compatibilityPage = (refs: string[]) => ({ prices: refs.map(reference => ({ ...provisionalRow, reference, cardId: reference,
    variantId: reference, price: { ...quote(reference), variantId: reference } })), unchangedReferences: [],
    priceRevision: 'e'.repeat(64), estimateMode: 'general' as const });
  const compatibilityCalls: any[] = [];
  const legacyClient = { getPricingCacheScope: async () => 'legacy-server-account', cataloguePrices: async (input: any) => {
    compatibilityCalls.push(input);
    if (input.classificationVersion) throw Object.assign(new Error('Old parser'), { status: 400, code: 'invalid_price_read' });
    return { data: compatibilityPage(input.references) };
  } } as any;
  await prices.fetchCataloguePrices([ids[2]], { language: 'en', estimateMode: 'general', force: true }, legacyClient);
  await prices.fetchCataloguePrices([ids[3]], { language: 'en', estimateMode: 'general', force: true }, legacyClient);
  assert.deepEqual(compatibilityCalls.map(input => input.classificationVersion), ['classified-v1', undefined, undefined],
    'successful legacy retry remembers old-server compatibility');
  let failLegacyRetry = true;
  const retryCalls: any[] = [];
  const retryClient = { getPricingCacheScope: async () => 'retry-server-account', cataloguePrices: async (input: any) => {
    retryCalls.push(input);
    if (failLegacyRetry) throw Object.assign(new Error('Malformed request'), { status: 400, code: 'invalid_price_read' });
    return { data: compatibilityPage(input.references) };
  } } as any;
  await assert.rejects(prices.fetchCataloguePrices([ids[4]], { language: 'en', estimateMode: 'general', force: true }, retryClient));
  failLegacyRetry = false;
  await prices.fetchCataloguePrices([ids[4]], { language: 'en', estimateMode: 'general', force: true }, retryClient);
  assert.deepEqual(retryCalls.map(input => input.classificationVersion), ['classified-v1', undefined, 'classified-v1'],
    'a failed legacy retry cannot downgrade subsequent valid requests');
  for (const status of [401, 403, 503]) {
    const deniedCalls: any[] = [];
    const deniedClient = { getPricingCacheScope: async () => `denied-${status}`, cataloguePrices: async (input: any) => {
      deniedCalls.push(input); throw Object.assign(new Error('Read failure'), { status, code: 'access_denied' });
    } } as any;
    await assert.rejects(prices.fetchCataloguePrices([ids[5]], { language: 'en', estimateMode: 'general', force: true }, deniedClient));
    assert.equal(deniedCalls.length, 1, 'auth/denied/timeout failures cannot trigger a legacy fallback');
  }
  assert.ok([...disk.keys()].every((key) => !key.includes('signature') && !key.includes('owner-a')), 'cache keys contain hashed identity, never bearer tokens');
  for (const count of [101, 201]) {
    const refs = ids.slice(0, count);
    const failed = new Set([refs[0], ...(count === 201 ? [refs[101]] : [])]);
    const pageCalls: string[][] = [];
    const bulkScope = `review-multi-page-${count}`;
    const bulkClient = { getPricingCacheScope: async () => bulkScope, cataloguePrices: async (input: any) => {
      pageCalls.push(input.references);
      const page = compatibilityPage(input.references.filter((ref: string) => !failed.has(ref)));
      return { data: { ...page, readErrors: input.references.filter((ref: string) => failed.has(ref))
        .map((reference: string) => ({ reference, code: 'catalogue_price_read_timeout' })) } };
    } } as any;
    const assertCombinedErrors = (error: any) => error.code === 'catalogue_price_partial_read'
      && JSON.stringify(error.readErrors.map((failure: any) => failure.reference)) === JSON.stringify([...failed]);
    await assert.rejects(prices.fetchCataloguePrices(refs, { language: 'en', estimateMode: 'general' }, bulkClient), assertCombinedErrors);
    assert.deepEqual(pageCalls.map(page => page.length), count === 101 ? [100, 1] : [100, 100, 1],
      'a partial first page must not prevent later exact pages from being requested');
    const scope = prices.cataloguePriceScope(bulkScope, { language: 'en', estimateMode: 'general' });
    const rows = prices.cataloguePriceCache.peek(scope, refs);
    assert.equal(rows.size, count - failed.size, 'every successful independent page commits');
    assert.equal(rows.get(refs[count - 1])?.price?.estimates.central, 12, 'last exact quote remains reachable');
    for (const ref of failed) assert.equal(rows.has(ref), false, 'failed gaps never become unavailable rows or revisions');
    await prices.cataloguePriceCache.flush(); prices.cataloguePriceCache.clearMemory(); pageCalls.length = 0;
    await assert.rejects(prices.fetchCataloguePrices(refs, { language: 'en', estimateMode: 'general' }, bulkClient), assertCombinedErrors);
    assert.deepEqual(pageCalls.map(page => page.length), count === 101 ? [1] : [1, 1], 'persisted reads retry only missing gaps across all pages');
    assert.equal(prices.cataloguePriceCache.peek(scope, refs).get(refs[count - 1])?.price?.freshness, 'fresh', 'later exact page survives disk hydration');
    const previousFailedRow = { ...compatibilityPage([refs[0]]).prices[0], revision: '9'.repeat(64) };
    await prices.cataloguePriceCache.read(scope, [refs[0]], async () => ({ ...compatibilityPage([refs[0]]), prices: [previousFailedRow] }));
    await assert.rejects(prices.fetchCataloguePrices(refs, { language: 'en', estimateMode: 'general', force: true }, bulkClient), assertCombinedErrors);
    assert.equal(prices.cataloguePriceCache.peek(scope, [refs[0]]).get(refs[0])?.revision, previousFailedRow.revision,
      'a failed ref never receives a replacement revision');
    assert.equal(prices.cataloguePriceCache.peek(scope, [refs[0]]).get(refs[0])?.price?.freshness, 'stale', 'previous failed-ref evidence is retained stale');
    assert.equal(prices.cataloguePriceCache.peek(scope, [refs[count - 1]]).get(refs[count - 1])?.price?.freshness, 'fresh');
  }
  for (const allFailed of [false, true]) {
    const failed = new Set(allFailed ? ids : [...ids.slice(0, 100), ids[100]]);
    const pageCalls: string[][] = [];
    const accountScope = `review-all-failed-${allFailed}`;
    const fixtureClient = { getPricingCacheScope: async () => accountScope, cataloguePrices: async (input: any) => {
      pageCalls.push(input.references);
      return { data: { ...compatibilityPage(input.references.filter((ref: string) => !failed.has(ref))),
        readErrors: input.references.filter((ref: string) => failed.has(ref)).map((reference: string) => ({ reference, code: '42501' })) } };
    } } as any;
    await assert.rejects(prices.fetchCataloguePrices(ids, { language: 'en', estimateMode: 'general' }, fixtureClient),
      (error: any) => error.code === 'catalogue_price_partial_read' && error.readErrors.length === failed.size);
    assert.deepEqual(pageCalls.map(page => page.length), [100, 100, 1], 'an all-failed page does not block independent exact rows');
    const scope = prices.cataloguePriceScope(accountScope, { language: 'en', estimateMode: 'general' });
    assert.equal(prices.cataloguePriceCache.peek(scope, ids).size, ids.length - failed.size);
    for (const ref of failed) assert.equal(prices.cataloguePriceCache.peek(scope, [ref]).size, 0);
  }
  for (const status of [401, 403, 404]) {
    const accountScope = `review-fatal-${status}`;
    const scope = prices.cataloguePriceScope(accountScope, { language: 'en', estimateMode: 'general' });
    // A cached row on page two previously allowed a fatal error to be swallowed.
    await prices.cataloguePriceCache.read(scope, [ids[100]], async () => compatibilityPage([ids[100]]));
    const pageCalls: string[][] = [];
    const fatal = Object.assign(new Error('Fatal fixture'), { status, code: status === 404 ? 'route_not_found' : 'access_denied' });
    const fixtureClient = { getPricingCacheScope: async () => accountScope, cataloguePrices: async (input: any) => {
      pageCalls.push(input.references);
      if (pageCalls.length === 2) throw fatal;
      return { data: { ...compatibilityPage(input.references.slice(1)), readErrors: [{ reference: input.references[0], code: '57014' }] } };
    } } as any;
    await assert.rejects(prices.fetchCataloguePrices(ids, { language: 'en', estimateMode: 'general' }, fixtureClient),
      (error: any) => error === fatal, 'fatal auth/route errors must supersede accumulated partial errors');
    assert.deepEqual(pageCalls.map(page => page.length), [100, 99], 'fatal errors stop later route requests');
    assert.equal(prices.cataloguePriceCache.peek(scope, [ids[200]]).size, 0);
  }
  for (const cancellation of ['account', 'signed-out', 'generation']) {
    const accountScope = `review-cancel-${cancellation}`;
    let activeScope = accountScope;
    let signedIn = true;
    const scope = prices.cataloguePriceScope(accountScope, { language: 'en', estimateMode: 'general' });
    const pageCalls: string[][] = [];
    const fixtureClient = { getPricingCacheScope: async () => {
      if (!signedIn) throw new Error('Signed out fixture'); return activeScope;
    }, cataloguePrices: async (input: any) => {
      pageCalls.push(input.references);
      return { data: { ...compatibilityPage(input.references.slice(1)), readErrors: [{ reference: input.references[0], code: '57014' }] } };
    } } as any;
    const unsubscribe = prices.cataloguePriceCache.subscribe((updatedScope: string, refs: string[]) => {
      if (updatedScope !== scope || refs.length !== 100 || pageCalls.length !== 1) return;
      if (cancellation === 'account') activeScope = 'changed-account';
      if (cancellation === 'signed-out') signedIn = false;
      if (cancellation === 'generation') prices.cataloguePriceCache.clearMemory();
    });
    try {
      await assert.rejects(prices.fetchCataloguePrices(ids, { language: 'en', estimateMode: 'general' }, fixtureClient),
        (error: any) => error.code === (cancellation === 'generation' ? 'catalogue_price_read_cancelled' : 'pricing_account_changed'));
      assert.equal(pageCalls.length, 1, 'cancelled reads cannot issue obsolete account/generation requests');
    } finally { unsubscribe(); }
  }
  for (const persisted of [false, true]) {
    for (const failure of [401, 403, 404, 'account', 'signed-out', 'generation'] as const) {
      const accountScope = `review-stale-page-${persisted}-${failure}`;
      let activeScope = accountScope; let signedIn = true;
      const scope = prices.cataloguePriceScope(accountScope, { language: 'en', estimateMode: 'general' });
      const secondPage = ids.slice(100, 200);
      await prices.cataloguePriceCache.read(scope, secondPage, async () => compatibilityPage(secondPage));
      cacheNow += 5 * 60_000 + 1;
      if (persisted) { await prices.cataloguePriceCache.flush(); prices.cataloguePriceCache.clearMemory(); }
      const pageCalls: string[][] = [];
      const fatal = Object.assign(new Error('Fully cached stale page failed'), {
        status: typeof failure === 'number' ? failure : 0,
        code: failure === 404 ? 'route_not_found' : 'access_denied',
      });
      const fixtureClient = { getPricingCacheScope: async () => {
        if (!signedIn) throw new Error('Signed out fixture'); return activeScope;
      }, cataloguePrices: async (input: any) => {
        pageCalls.push(input.references);
        if (pageCalls.length === 1) return { data: { ...compatibilityPage(input.references.slice(1)),
          readErrors: [{ reference: input.references[0], code: '57014' }] } };
        if (pageCalls.length === 2) {
          if (typeof failure === 'number') throw fatal;
          if (failure === 'account') activeScope = 'obsolete-account';
          if (failure === 'signed-out') signedIn = false;
          if (failure === 'generation') prices.cataloguePriceCache.clearMemory();
        }
        return { data: compatibilityPage(input.references) };
      } } as any;
      await assert.rejects(prices.fetchCataloguePrices(ids, { language: 'en', estimateMode: 'general' }, fixtureClient),
        (error: any) => typeof failure === 'number' ? error === fatal
          : error.code === (failure === 'generation' ? 'catalogue_price_read_cancelled' : 'pricing_account_changed'),
        'a fully cached stale page must surface fatal/cancellation instead of the earlier partial error');
      assert.deepEqual(pageCalls.map(page => page.length), [100, 100], 'a fatal fully cached stale page prevents the third request');
      assert.equal(prices.cataloguePriceCache.peek(scope, [ids[200]]).size, 0, 'the later exact page is not cached after fatal cancellation');
      if (failure !== 'generation') {
        assert.equal(prices.cataloguePriceCache.peek(scope, [ids[1]]).get(ids[1])?.price?.freshness, 'fresh', 'earlier successful exact rows stay usable');
        assert.equal(prices.cataloguePriceCache.peek(scope, [ids[100]]).get(ids[100])?.price?.estimates.central, 12, 'the stale page retains its stronger saved amount');
        assert.equal(prices.cataloguePriceCache.peek(scope, [ids[100]]).get(ids[100])?.price?.freshness, 'stale');
        assert.equal(prices.cataloguePriceCache.peek(scope, [ids[0]]).size, 0, 'the failed gap has no invented unavailable row/revision');
      }
    }
  }
  const singleAccount = 'review-single-page-background';
  const singleScope = prices.cataloguePriceScope(singleAccount, { language: 'en', estimateMode: 'general' });
  await prices.cataloguePriceCache.read(singleScope, [ids[0]], async () => compatibilityPage([ids[0]]));
  cacheNow += 5 * 60_000 + 1;
  let releaseBackground!: (value: any) => void;
  let returnedCached = false;
  const singleClient = { getPricingCacheScope: async () => singleAccount, cataloguePrices: () => new Promise(resolve => { releaseBackground = resolve; }) } as any;
  const background = prices.fetchCataloguePrices([ids[0]], { language: 'en', estimateMode: 'general' }, singleClient)
    .then(rows => { returnedCached = true; return rows; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returnedCached, true, 'ordinary cached single-page reads still return before their background refresh');
  releaseBackground({ data: compatibilityPage([ids[0]]) });
  assert.equal((await background).get(ids[0])?.price?.estimates.central, 12);
  await new Promise(resolve => setImmediate(resolve));
  await prices.cataloguePriceCache.flush();
  console.log('Price client passed: 201 cards / 3 bulk requests, bounded requests/cache isolation, 101/201 cold/persisted partial pages, fully cached stale fatal/cancellation precedence, saved-price retention and single-page background refresh.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
