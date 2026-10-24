import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient } from '@tanstack/react-query';
import ts from 'typescript';
import * as pricingState from '../lib/collectionPricingState';
import * as collectionRequestHash from '../lib/collectionRequestHash';
import * as uiCollectionPages from '../lib/uiCollectionPages';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const source = readFileSync('app/(tabs)/binder.tsx', 'utf8');
const renderStart = source.indexOf('  // MAIN RENDER');
assert.ok(renderStart > 0);
const screenCode = compile(`${source.slice(0, renderStart)}
  return React.createElement('BinderState', { visibleBinders, counts, values, loading, libraryError, reload: load });
}
`);
const deadlineCode = compile(readFileSync('lib/personalDataRead.ts', 'utf8'));
const enrichmentCode = compile(readFileSync('lib/optionalCatalogueEnrichment.ts', 'utf8'));

async function harness(options: { delayedMetadata?: boolean; delayedCards?: boolean; masterSet?: boolean; serverCap?: number } = {}) {
  let owner = 'owner-a', now = 0, nextTimer = 0, quantity = 3;
  const timers = new Map<number, { due: number; action: () => void }>();
  const setTimer = (action: () => void, delay = 0) => {
    const id = ++nextTimer; timers.set(id, { due: now + delay, action }); return id;
  };
  const clearTimer = (id: number) => timers.delete(id);
  const services: Record<string, any> = {};
  for (const [name, code] of [['../../lib/personalDataRead', deadlineCode], ['../../lib/optionalCatalogueEnrichment', enrichmentCode]]) {
    const module = { exports: {} };
    runInNewContext(code, { module, exports: module.exports, AbortController, setTimeout: setTimer, clearTimeout: clearTimer });
    services[name] = module.exports;
  }
  const pendingPrices = deferred<void>(), pendingCards = deferred<void>();
  const never = new Promise<never>(() => {});
  const rows = (account: string) => [
    { id: `${account}-official`, user_id: account, name: 'Base Set', color: '#fff', type: 'official', language: 'en', source_set_id: 'base1', created_at: '2026-10-12' },
    { id: `${account}-custom`, user_id: account, name: 'Custom', color: '#fff', type: 'custom', source_set_id: null, created_at: '2026-10-12' },
  ];
  const savedCards = (account: string) => Array.from({ length: 1702 }, (_, index) => ({
    id: `card-${index}`, binder_id: index === 0 ? `${account}-official` : `${account}-custom`,
    card_id: `base1-${index + 1}`, set_id: 'base1', language: 'en', owned: true, owned_quantity: index === 0 ? quantity : 1,
    // Legacy snapshots must not replace the exact price service or a failed read.
    ebay_price: 999, tcg_price: 888, cardmarket_price: 777,
  }));
  let brandingReads = 0, priceReads = 0;
  const pages: [number, number][] = [];
  const authListeners = new Set<(...args: any[]) => void>();
  const supabase = { auth: { onAuthStateChange: (listener: (...args: any[]) => void) => {
    authListeners.add(listener); return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
  }, getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }) },
    from(table: string) {
      let ids: string[] = [], from = 0, to = 49, filterField = '';
      const serverCap = options.serverCap ?? 50;
      const requestOwner = owner;
      const query: any = {
        select: () => query, eq: () => query, order: () => query, abortSignal: () => query,
        in: (field: string, values: string[]) => { assert.ok(values.length <= 50); filterField = field; ids = values; return query; },
        range: (start: number, end: number) => { assert.equal(end - start, 49); from = start; to = end; return query; },
        then(resolve: (value: unknown) => unknown) {
          if (table === 'binder_cards') {
            pages.push([from, to]);
            return (options.delayedCards ? pendingCards.promise : Promise.resolve()).then(() => ({
              data: savedCards(requestOwner).filter(row => ids.includes(row.binder_id)).slice(from, Math.min(to + 1, from + serverCap)), error: null,
            })).then(resolve);
          }
          if (options.delayedMetadata) return never.then(resolve);
          const data = table === 'pokemon_sets' ? [{ id: 'base1', language: 'en', printed_total: 102, total: 102 }]
            : options.masterSet && table === 'tcg_cards' ? Array.from({ length: 102 }, (_, index) => ({
              id: `base1-${index + 1}`, set_id: 'base1', language: 'en', canonical_name: `Card ${index + 1}`,
              raw_payload: { tcgplayer: { prices: { normal: {}, holofoil: {} } } },
            }))
            : options.masterSet && table === 'user_card_variants' ? [
              { id: 'variant-normal', user_id: requestOwner, card_id: 'base1-1', set_id: 'base1', variant: 'normal' },
              { id: 'variant-holofoil', user_id: requestOwner, card_id: 'base1-1', set_id: 'base1', variant: 'holofoil' },
            ] : [];
          const page = data.filter((row: any) => ids.includes(row[filterField])).slice(from, Math.min(to + 1, from + serverCap));
          return Promise.resolve({ data: page, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const generic: any = new Proxy(function () {}, { get: () => generic, apply: () => generic });
  const deps: Record<string, any> = {
    ...services, react: React, '../../lib/uiCollectionPages': uiCollectionPages,
    'expo-router': { router: {}, useLocalSearchParams: () => ({}), useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]) },
    'react-native': { useWindowDimensions: () => ({ width: 390 }) },
    '@react-native-async-storage/async-storage': { getItem: async () => options.masterSet ? 'true' : null },
    '../../components/theme-context': { useTheme: () => ({ theme: { colors: {} } }) },
    '../../components/profile-context': { useProfile: () => ({ profile: null }) },
    '../../components/auth-context': { useAuth: () => ({ user: { id: owner }, loading: false, cachedReadSession: null }),
      isKnownAuthDenial: (error: { status?: number }) => error?.status === 401 || error?.status === 403 },
    '../../hooks/useStartedBinderPreload': { useStartedBinderPreload() {} },
    '../../lib/supabase': { supabase },
    '../../lib/ownership': { fetchOwnedCardRows: async () => [] },
    '../../lib/binders': { fetchBinders: async (options?: { enrich?: boolean }) => {
      if (options?.enrich === false) return rows(owner);
      brandingReads++; return never;
    }, invalidateBinderCaches() {} },
    '../../lib/binderLibraryCache': { isBinderLibraryOverviewForUser: () => false, readPersistedBinderOverview: async () => null, writePersistedBinderOverview: async () => {} },
    '../../lib/customBinderNameArt': { getCustomBinderNameArtKeyForBinder: async () => null },
    '../../lib/pokemonTcg': { normalizePokemonCardLanguage: (language?: string) => language ?? 'en', normalizePokemonSetId: (id: string) => id,
      getKnownPokemonSetTotal: () => 102 },
    '../../lib/pokemonSetIdentity': { stripPokemonSetLanguagePrefix: (id?: string) => id ?? '', getPokemonSetLanguageFromPrefixedId: () => null },
    '../../lib/collectionPricingState': pricingState,
    '../../lib/collectionRequestHash': collectionRequestHash,
    '../../lib/collectionPricingApi': { loadCollectionPrices: async (inputs: any[]) => {
      priceReads++; await pendingPrices.promise;
      return inputs.map(input => ({ key: input.key, quantity: input.quantity, central: 7, status: 'available', freshness: 'fresh', pricingKind: 'exact', calculatedAt: '2026-10-17T00:00:00Z' }));
    } },
    '../../lib/stackrQuery': { stackrQueryClient: queryClient, stackrQueryKeys: { binderLibrary: (id: string) => ['library', id], binderLibraryRoot: ['library'],
      binderLibrarySummaries: (id: string, signature: string) => ['library', id, 'summary', signature] }, stackrQueryTiming: { hotPathStaleMs: 30_000 } },
    '../../lib/stackrIcons': { stackrIcons: {} }, '../../components/BinderModeBadge': { BINDER_MODE_BADGE_SOURCES: {} },
  };
  const module = { exports: {} as Record<string, any> };
  runInNewContext(screenCode, { module, exports: module.exports, AbortController, setTimeout: setTimer, clearTimeout: clearTimer,
    console: { log() {} }, require: (name: string) => deps[name] ?? generic });
  const Screen = module.exports.default;
  let root!: ReactTestRenderer;
  const settle = async () => { await act(async () => { for (let i = 0; i < 2500; i++) await Promise.resolve(); }); };
  await act(async () => { root = create(React.createElement(Screen)); }); await settle();
  return { pages, settle, prices: pendingPrices, cards: pendingCards,
    state: () => root.root.findByType('BinderState' as any).props,
    get brandingReads() { return brandingReads; }, get priceReads() { return priceReads; },
    changeQuantity(value: number) { quantity = value; },
    expireFactsOnly() {
      for (const query of queryClient.getQueryCache().getAll()) if (query.queryKey.at(-1) === 'facts') {
        queryClient.setQueryData(query.queryKey, query.state.data, { updatedAt: Date.now() - 31_000 });
      }
    },
    async advance(ms: number) { now += ms; await act(async () => {
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.action(); }
    }); await settle(); },
    async account(id: string) { owner = id; for (const listener of authListeners) listener('SIGNED_IN', { user: { id } }); await act(async () => root.update(React.createElement(Screen))); await settle(); },
    async close() { await act(async () => root.unmount()); queryClient.clear(); },
  };
}

async function main() {
  const h = await harness();
  assert.equal(h.state().loading, false);
  assert.equal(h.state().visibleBinders.length, 2);
  assert.equal(h.brandingReads, 1, 'optional branding remains pending without blocking saved collection facts');
  assert.equal(h.priceReads, 1, 'stored-price reads started independently');
  assert.equal(h.state().counts['owner-a-official'].owned, 1);
  assert.equal(h.state().counts['owner-a-official'].total, 102);
  assert.equal(h.state().counts['owner-a-custom'].owned, 1701, 'counts include the second database page');
  assert.equal(h.pages.length, 36, '1702 rows require 35 nonempty 50-row pages plus an empty terminal page');
  assert.ok(h.pages.every(([from, to]) => to - from === 49));
  assert.deepEqual(h.pages.at(-1), [1702, 1751]);
  assert.equal(h.state().values['owner-a-official'], undefined, 'a pending price never becomes zero');
  await h.advance(10_000);
  assert.match(h.state().libraryError, /try again/i, 'a hung price lookup ends with a visible retry');
  assert.equal(h.state().counts['owner-a-custom'].owned, 1701, 'price failure retains the proven quantities');
  h.prices.resolve(); await h.settle();
  assert.equal(h.state().values['owner-a-official'], undefined, 'a late timed-out price cannot silently replace the failed state');
  await act(async () => { await h.state().reload(true); }); await h.settle();
  assert.equal(h.state().values['owner-a-official'].total, 21, 'retry preserves the saved quantity of three at the exact unit price');
  assert.equal(h.state().libraryError, null);
  const beforePriceRefresh = h.priceReads;
  h.changeQuantity(4); h.expireFactsOnly();
  await act(async () => { await h.state().reload(); }); await h.settle();
  assert.equal(h.priceReads, beforePriceRefresh + 1, 'new ownership facts cannot reuse a newer price aggregate based on the old units');
  assert.equal(h.state().values['owner-a-official'].total, 28, 'the value follows the refreshed quantity while the previous aggregate cache is still fresh');
  await h.close();

  const smallerCap = await harness({ serverCap: 17 });
  assert.equal(smallerCap.state().counts['owner-a-custom'].owned, 1701);
  assert.equal(smallerCap.pages.length, 102, 'A 17-row API cap preserves all 1702 saved cards');
  smallerCap.prices.resolve(); await smallerCap.settle();
  assert.equal(smallerCap.state().values['owner-a-official'].total, 21);
  await smallerCap.close();

  const metadata = await harness({ delayedMetadata: true });
  assert.equal(metadata.state().counts['owner-a-official'], undefined);
  await metadata.advance(2_000);
  assert.equal(metadata.state().counts['owner-a-official'].owned, 1, 'optional metadata cannot hang saved ownership');
  assert.equal(metadata.state().counts['owner-a-official'].total, 102, 'the known set total remains a valid fallback');
  await metadata.close();

  const master = await harness({ delayedMetadata: true, masterSet: true });
  await master.advance(2_000);
  assert.equal(master.state().counts['owner-a-official'].owned, 1);
  assert.equal(master.state().counts['owner-a-official'].total, null, 'missing master-finish facts cannot become the regular set denominator');
  assert.equal(master.state().counts['owner-a-official'].totalKnown, false);
  await master.close();

  const completeMaster = await harness({ masterSet: true });
  assert.equal(completeMaster.state().counts['owner-a-official'].owned, 2, 'canonical master ownership counts the two verified finishes');
  assert.equal(completeMaster.state().counts['owner-a-official'].total, 204, 'canonical catalogue rows establish the full two-finish master denominator');
  assert.equal(completeMaster.state().counts['owner-a-official'].totalKnown, true);
  await completeMaster.close();

  const switched = await harness({ delayedCards: true });
  await switched.account('owner-b');
  switched.cards.resolve(); await switched.settle();
  assert.equal(switched.state().counts['owner-a-custom'], undefined, 'late account A rows cannot publish after account B opens');
  assert.equal(switched.state().counts['owner-b-custom'].owned, 1701);
  switched.prices.resolve(); await switched.settle();
  assert.equal(switched.state().values['owner-a-official'], undefined);
  assert.equal(switched.state().values['owner-b-official'].total, 21);
  await switched.close();
  console.log('Binder library runtime passed: saved facts before branding/prices, 1,702-row pagination, price timeout/retry, optional metadata deadline and account isolation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
