import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { CataloguePriceCache } from '../lib/cataloguePriceCacheCore';
import * as baseline from '../lib/cataloguePriceBaseline';
import * as hash from '../lib/cataloguePriceHash';
import type { StackrCataloguePriceRow, StackrCardPrice } from '../lib/stackrApiV1';
import { createCataloguePriceRead } from '../backend/lib/marketPricing/cataloguePriceRead.js';

const id = '00000000-0000-4000-8000-000000000001';
const disk = new Map<string, string>();
const storage = { getItem: async (key: string) => disk.get(key) ?? null,
  setItem: async (key: string, value: string) => { disk.set(key, value); } };
const decision: StackrCataloguePriceRow = { reference: id, cardId: id, variantId: id, language: 'en',
  unavailableReason: 'no_defensible_market_evidence', nextRetryAt: null, revision: 'd'.repeat(64),
  price: { variantId: id, identityKey: id, productType: 'raw_card', currency: 'GBP',
    status: 'unavailable', priceType: 'unavailable', classification: 'PRICE_UNAVAILABLE', priceBasis: 'general',
    estimates: { central: null, low: null, high: null }, confidence: { score: 0, label: 'insufficient_evidence' },
    freshness: 'unknown', calculatedAt: null, staleAfter: null, sourceBreakdown: [], outliers: {},
    sample: { total: 0, sold: 0, active: 0, sources: 0, dateRange: { from: null, to: null } },
    fallbackEstimate: null, unavailableReason: 'no_defensible_market_evidence', estimateVersion: 'classified-v1' } };

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, { module, exports: module.exports, process: { env: { EXPO_PUBLIC_STACKR_API_ENABLED: 'true' } },
    Date, Map, Set, console, require: (name: string) => { assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name]; } });
  return module.exports as T;
}

function harness(options: { initialOwner?: string; fail?: boolean; backend?: (input: any) => Promise<any> } = {}) {
  let owner: string | null = options.initialOwner ?? 'a';
  let cursor = 0;
  let failed = options.fail ?? false;
  let next = decision;
  const slots: any[] = [];
  const effects: (() => void)[] = [];
  const requests: { owner: string | null; references: string[]; language: string }[] = [];
  const cache = new CataloguePriceCache(storage);
  const client = {
    getPricingCacheScope: async () => { if (!owner) throw new Error('Signed out'); return `account-hash-${owner}`; },
    cataloguePrices: async (input: any) => {
      requests.push({ owner, references: input.references, language: input.language });
      if (failed) throw Object.assign(new Error('Denied pricing'), { status: 403, code: 'access_denied' });
      if (options.backend) return { data: await options.backend(input) };
      return { data: { prices: input.references.map((reference: string) => ({ ...next, reference,
        language: input.language, price: next.price ? { ...next.price, variantId: reference } : null })),
        unchangedReferences: [], priceRevision: 'e'.repeat(64), estimateMode: input.estimateMode } };
    },
  };
  const prices = load<typeof import('../lib/cataloguePrices')>('lib/cataloguePrices.ts', {
    '@react-native-async-storage/async-storage': storage,
    './cataloguePriceCacheCore': { CataloguePriceCache: class { constructor() { return cache; } } },
    './stackrApiV1': { stackrApiClient: client }, './cataloguePriceHash': hash, './cataloguePriceBaseline': baseline,
  });
  const changed = (left: unknown[] | undefined, right: unknown[]) => !left || right.some((value, index) => !Object.is(value, left[index]));
  const react = {
    useRef(initial: unknown) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial: unknown) {
      const i = cursor++; slots[i] ??= { value: initial };
      return [slots[i].value, (update: any) => { slots[i].value = typeof update === 'function' ? update(slots[i].value) : update; }];
    },
    useMemo(compute: () => unknown, deps: unknown[]) {
      const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { value: compute(), deps }; return slots[i].value;
    },
    useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
      const i = cursor++; if (changed(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { cleanup: effect(), deps }; });
    },
  };
  const overlay = load<typeof import('../lib/useCataloguePriceOverlay')>('lib/useCataloguePriceOverlay.ts', {
    react, '../components/auth-context': { useAuth: () => ({ user: owner ? { id: owner } : null }) },
    './stackrApiV1': { stackrApiClient: client }, './cataloguePrices': prices, './cataloguePriceBaseline': baseline,
    './stackrDomainAdapter': { toStackrApiLanguage: (language: string) => language },
  });
  return { requests, cache, prices,
    owner(value: string | null) { owner = value; }, fail(value: boolean) { failed = value; }, next(row: StackrCataloguePriceRow) { next = row; },
    render(cards: any[], onReadDiagnostic?: (phase: 'complete' | 'failed') => void) {
      cursor = 0; const result = overlay.useCataloguePriceOverlay(cards, { onReadDiagnostic });
      effects.splice(0).forEach(effect => effect()); return result;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
async function main() {
const cards = [{ id, language: 'en', rarity: 'Common', set: { releaseDate: '2022-01-01' } }];
const phases: string[] = [];
const cold = harness();
assert.equal(cold.render(cards, phase => phases.push(phase))[0].runtimeCataloguePricing?.displayPrice, 0.09,
  'facts/local fallback render synchronously before price enrichment');
await settle();
const unpriced = cold.render(cards)[0].runtimeCataloguePricing;
assert.equal(unpriced?.displayPrice, null, 'actual hook respects explicit unavailable after cold read');
assert.equal(unpriced?.authoritativeUnavailable, true);
assert.deepEqual(phases, ['complete'], 'PR417 diagnostic still observes read settlement');
assert.equal(cold.requests.length, 1);
assert.equal(cold.render([{ ...cards[0], pricing: { displayPrice: 42 } }])[0].runtimeCataloguePricing, undefined,
  'a stronger embedded quote is preserved');
await cold.cache.flush(); cold.unmount();

const restart = harness({ fail: true });
restart.render(cards); await settle();
assert.equal(restart.render(cards)[0].runtimeCataloguePricing?.displayPrice, null, 'persisted authoritative unavailable suppresses fallback');
assert.equal(restart.requests.length, 0, 'fresh persisted decision uses no request');
restart.owner('b');
assert.equal(restart.render(cards)[0].runtimeCataloguePricing?.displayPrice, 0.09, 'account change cannot reuse previous unavailable decision');
await settle();
assert.equal(restart.requests.length, 1);
assert.equal(restart.render(cards)[0].runtimeCataloguePricing?.displayPrice, 0.09, 'denied read never becomes cached authoritative unavailable');
restart.owner(null);
assert.equal(restart.render(cards)[0].runtimeCataloguePricing?.displayPrice, 0.09);
restart.unmount();

const languages = harness({ initialOwner: 'language-control' });
languages.render([{ ...cards[0], language: 'zh-cn' }, { ...cards[0], language: 'zh-tw' }]); await settle();
assert.deepEqual(languages.requests.map(request => request.language), ['zh-cn', 'zh-tw']);
assert.equal(languages.render([{ ...cards[0], language: 'zh-cn' }, { ...cards[0], language: 'zh-tw' }])
  .filter(card => card.runtimeCataloguePricing?.authoritativeUnavailable).length, 2);
languages.unmount();

const realQuote: StackrCardPrice = { ...decision.price!, status: 'market_estimate', priceType: 'market_estimate',
  classification: 'MARKET_GUIDE', estimates: { central: 6.12345, low: null, high: null }, freshness: 'stale', unavailableReason: null,
  sourceBreakdown: [{ provider: 'tcgcsv', provenance: { sourceValue: 6.12345 } }],
  fallbackEstimate: { exact: false, identityKey: id, reason: 'general_card_estimate' } };
const displayed = cold.prices.cataloguePriceDisplay({ ...decision, price: realQuote });
assert.equal(displayed.displayPrice, 6.12);
assert.equal(realQuote.estimates.central, 6.12345, 'penny rounding must not mutate raw quote precision');
assert.equal(displayed.sourceLabel, 'Stale Market guide');
assert.equal(displayed.priceBasis, 'general');
assert.equal(displayed.provisional, false);
assert.deepEqual(displayed.sourceBreakdown, realQuote.sourceBreakdown);
const gapId = '00000000-0000-4000-8000-000000000002';
const exactPrice = { ...realQuote, variantId: id, classification: undefined, priceBasis: 'exact', fallbackEstimate: null,
  freshness: 'fresh' as const, staleAfter: '2099-01-01T00:00:00Z' };
const mixedBackend = createCataloguePriceRead({
  supabase: { schema: () => ({ rpc: async (name: string, args: any) => {
    if (name === 'read_catalogue_prices') return { data: args.p_references.map((reference: string) => ({ reference, candidates: [{
      variant_id: reference, printing_id: reference, set_id: id, catalogue_version_id: id, language_code: 'en',
      variant_code: 'normal', finish_code: 'normal', requested_variant_ids: [reference], is_default: true,
      estimate: reference === id ? exactPrice : null,
    }] })) };
    if (name === 'read_pricing_classifications') return { error: { code: '42501' } };
    return { data: [] };
  } }) }, toEstimatePrice: (price: any) => price, toSnapshotPrice: (price: any) => price,
  unavailablePrice: (variantId: string) => ({ ...decision.price!, variantId }),
});
const mixedCards = [...cards, { ...cards[0], id: gapId }];
const mixedPhases: string[] = [];
const mixed = harness({ initialOwner: 'mixed', backend: mixedBackend });
mixed.render(mixedCards, phase => mixedPhases.push(phase)); await settle();
const mixedResult = mixed.render(mixedCards);
assert.equal(mixedResult[0].runtimeCataloguePricing?.displayPrice, 6.12, 'actual endpoint/client publishes exact row despite failed neighboring gap');
assert.equal(mixedResult[0].runtimeCataloguePricing?.authoritativeUnavailable, false);
assert.equal(mixedResult[1].runtimeCataloguePricing?.displayPrice, 0.09, 'failed gap keeps its provisional display, never cached authoritative unavailable');
assert.deepEqual(mixedPhases, ['failed'], 'partial read failure is surfaced to the diagnostic observer');
const mixedScope = mixed.prices.cataloguePriceScope('account-hash-mixed', { language: 'en', estimateMode: 'general' });
assert.equal(mixed.cache.peek(mixedScope, [gapId]).size, 0, 'failed missing row has no cache checkpoint');
await mixed.cache.flush(); mixed.unmount();
const mixedRestart = harness({ initialOwner: 'mixed', backend: mixedBackend });
mixedRestart.render(mixedCards); await settle();
assert.equal(mixedRestart.render(mixedCards)[0].runtimeCataloguePricing?.displayPrice, 6.12, 'newly read exact quote survives disk restart');
assert.deepEqual(mixedRestart.requests[0].references, [gapId], 'retry reads the failed gap only');
const previousGap = { ...decision, reference: gapId, variantId: gapId, cardId: gapId, price: { ...exactPrice, variantId: gapId } };
await mixedRestart.cache.read(mixedScope, [gapId], async () => ({ prices: [previousGap], unchangedReferences: [], priceRevision: 'f'.repeat(64), estimateMode: 'general' }));
await assert.rejects(mixedRestart.cache.read(mixedScope, [id, gapId], refs => mixedBackend({ references: refs,
  language: 'en', estimateMode: 'general', classificationVersion: 'classified-v1' }), true), (error: any) => error.code === 'catalogue_price_partial_read');
assert.equal(mixedRestart.cache.peek(mixedScope, [id]).get(id)?.price?.freshness, 'fresh', 'successful exact row is never marked failed by the neighboring gap');
assert.equal(mixedRestart.cache.peek(mixedScope, [gapId]).get(gapId)?.price?.estimates.central, 6.12345, 'failed refresh retains previous gap evidence and precision');
assert.equal(mixedRestart.cache.peek(mixedScope, [gapId]).get(gapId)?.price?.freshness, 'stale');
mixedRestart.unmount();
console.log('Classified actual overlay passed: synchronous facts, cold/persisted unavailable, stronger quote, account/language separation, denied read, pennies/provenance and read diagnostics.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
