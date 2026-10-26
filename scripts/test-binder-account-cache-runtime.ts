import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const ownerA = 'owner-a', ownerB = 'owner-b';
const stamp = '2026-10-26T00:00:00Z';
const binder = (id = 'private-a', owner = ownerA, isPublic = false) => ({ id, user_id: owner,
  name: isPublic ? 'Public A name' : owner === ownerA ? 'Private A name' : 'Private B name', color: '#123456', cover_key: owner === ownerA ? 'private-cover' : 'b-cover', type: 'custom', is_public: isPublic,
  source_set_id: null, language: 'en', card_mode: 'graded', default_condition: 'Lightly Played', edition: '1st_edition', created_at: stamp });

function fixture() {
  let owner: string | null = ownerA, sessionNumber = 1, sessionCalls = 0;
  const listeners = new Set<(event: string, session: any) => void>();
  const modules = new Map<string, Record<string, any>>();
  const tables = { binders: [binder(), binder('public-a', ownerA, true), binder('private-b', ownerB)],
    binder_cards: Array.from({ length: 103 }, (_, index) => ({ id: 'placement-' + index, binder_id: 'private-a',
      card_id: 'card-' + index, set_id: 'en:fixture', language: 'en', api_card_id: null, api_set_id: null,
      card_name: 'Saved ' + index, card_number: String(index), image_url: index % 2 ? 'https://legacy.invalid/card.webp' : 'https://r2.invalid/card.webp',
      set_name: 'Fixture', set_total: 103, slot_order: index, owned: true, owned_quantity: 1, condition: 'Near Mint',
      notes: 'owner-a note', created_at: stamp, ebay_price: null, tcg_price: null, cardmarket_price: null, last_price_update: null })) };
  const reads: { table: string; viewer: string | null; id?: unknown }[] = [];
  const writes: { viewer: string | null; id: unknown }[] = [];
  const updateAttempts: { viewer: string | null; id: unknown }[] = [];
  const alerts: unknown[][] = [], navigation: string[] = [];
  const controls: { holdRecord?: ReturnType<typeof deferred<void>>; holdRecordFor?: string; holdArt?: ReturnType<typeof deferred<string>>;
    holdSession?: ReturnType<typeof deferred<void>>; holdSessionAt?: number; holdCards?: ReturnType<typeof deferred<void>>; offline?: boolean; sessionError?: boolean; legacyWrite?: boolean; refreshOnFirstSession?: boolean; holdLegacyWrite?: ReturnType<typeof deferred<void>> } = {};
  const session = () => owner ? { user: { id: owner }, access_token: 'session-' + sessionNumber, expires_at: Date.now() / 1000 + 3600 } : null;
  const supabase = {
    auth: {
      getSession: async () => {
        const captured = session();
        sessionCalls++;
        if (controls.refreshOnFirstSession && sessionCalls === 1) {
          for (const callback of [...listeners]) callback('TOKEN_REFRESHED', captured);
        }
        if (controls.holdSession && (!controls.holdSessionAt || sessionCalls === controls.holdSessionAt)) await controls.holdSession.promise;
        return { data: { session: captured }, error: controls.sessionError ? new Error('Local session unavailable') : null };
      },
      getUser: async () => ({ data: { user: session()?.user ?? null }, error: null }),
      onAuthStateChange(callback: (event: string, session: any) => void) {
        listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
    },
    from(table: keyof typeof tables) {
      let update: Record<string, unknown> | undefined;
      let single = false, from = 0, to = 49, signal: AbortSignal | undefined;
      const filters = new Map<string, unknown>();
      const query: any = {
        select() { return query; }, update(value: Record<string, unknown>) { update = value; return query; }, eq(key: string, value: unknown) { filters.set(key, value); return query; },
        maybeSingle() { single = true; return query; }, order() { return query; },
        range(start: number, end: number) { from = start; to = end; return query; },
        abortSignal(value: AbortSignal) { signal = value; return query; },
        then(done: (value: unknown) => unknown, fail: (reason: unknown) => unknown) {
          return Promise.resolve().then(async () => {
            const viewer = owner;
            if (!update) reads.push({ table, viewer, id: filters.get('id') });
            const visible = tables.binders.filter(row => row.user_id === viewer || row.is_public);
            const rows = (table === 'binders' ? visible : tables.binder_cards.filter(row => visible.some(b => b.id === row.binder_id)))
              .filter(row => [...filters].every(([key, value]) => (row as any)[key] === value));
            if (update) updateAttempts.push({ viewer, id: filters.get('id') });
            if (update && controls.legacyWrite && 'default_condition' in update) {
              if (controls.holdLegacyWrite) await controls.holdLegacyWrite.promise;
              return { data: null, error: { code: 'PGRST204' } };
            }
            if (update) {
              writes.push({ viewer, id: filters.get('id') });
              for (const row of rows) Object.assign(row, update);
            }
            const data = single ? rows[0] ?? null : rows.slice(from, Math.min(to + 1, from + 17));
            if (table === 'binder_cards' && controls.holdCards) await controls.holdCards.promise;
            if (single && controls.holdRecord && (!controls.holdRecordFor || filters.get('id') === controls.holdRecordFor)) await controls.holdRecord.promise;
            if (signal?.aborted) throw Object.assign(new Error('Fixture aborted'), { name: 'AbortError' });
            if (controls.offline) throw new Error('Fixture offline');
            return { data, error: null };
          }).then(done, fail);
        },
      };
      return query;
    },
  };
  const pokemon = { normalizePokemonCardLanguage: (value: string) => value || 'en', fetchAllSets: async () => [],
    getPokemonSetLanguageFromPrefixedId: () => 'en', stripPokemonSetLanguagePrefix: (value: string) => value };
  const real = new Set(['binders', 'requestCache', 'personalDataRead', 'collectionSummaryInvalidation', 'binderAccountCache']);
  const unused = new Proxy({}, { get: () => () => { throw new Error('Unexpected optional fixture dependency'); } });
  function load(name: string): Record<string, any> {
    if (modules.has(name)) return modules.get(name)!;
    const module = { exports: {} as Record<string, any> }; modules.set(name, module.exports);
    runInNewContext(ts.transpileModule(readFileSync('lib/' + name + '.ts', 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { module, exports: module.exports, require(path: string) {
      const dependency = path.replace(/^\.\//, '');
      if (real.has(dependency)) return load(dependency);
      if (dependency === 'supabase') return { supabase };
      if (dependency === 'pokemonTcg' || dependency === 'pokemonSetIdentity') return pokemon;
      if (dependency === 'config') return { USD_TO_GBP: 0.79 };
      if (dependency === 'stackrQuery') return { invalidateStackrCollectionQueries() {} };
      return unused;
    }, setTimeout, clearTimeout, AbortController, Date, console });
    return module.exports;
  }
  const binders = load('binders');
  let route = 'private-a';
  const source = readFileSync('app/binder/new.tsx', 'utf8');
  const boundary = source.indexOf('  // LOADING', source.indexOf('export default function NewBinderScreen'));
  assert.ok(boundary > 0);
  const screenSource = source.slice(0, source.lastIndexOf('  // ===============================', boundary)) + `
    return React.createElement('BinderEditState', { name, coverKey, cardMode, defaultCondition, edition, loadingBinder, reload: loadBinder, rename: setName, save: saveBinder });
  }
  `;
  const module = { exports: {} as Record<string, any> };
  const dependencies: Record<string, unknown> = {
    react: React, 'react-native': { Alert: { alert: (...args: unknown[]) => alerts.push(args) } },
    'expo-router': { useLocalSearchParams: () => ({ id: route }), router: { back: () => navigation.push('back') } },
    '../../components/theme-context': { useTheme: () => ({ theme: { colors: { primary: '#123' } } }) },
    '../../components/auth-context': { useAuth: () => ({ user: session()?.user ?? null }) },
    '../../lib/supabase': { supabase }, '../../lib/binders': binders,
    '../../lib/binderAccountCache': new Proxy({}, { get: (_target, name) => (...args: unknown[]) => load('binderAccountCache')[name as string](...args) }),
    '../../lib/pokemonTcg': pokemon, '../../lib/pokemonSetIdentity': pokemon,
    '../../components/PokemonLanguageBadge': { getPokemonLanguageDescriptor: () => ({ label: 'English' }) },
    '../../lib/binderCovers': { BINDER_COVERS: [] },
    '../../lib/customBinderNameArt': { getRandomCustomBinderNameArtKey: () => 'default-art',
      getCustomBinderNameArtKeyForBinder: async () => controls.holdArt ? controls.holdArt.promise : 'private-art',
      setCustomBinderNameArtKeyForBinder: async () => {} },
  };
  runInNewContext(ts.transpileModule(screenSource, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText,
  { module, exports: module.exports, require: (name: string) => dependencies[name] ?? {}, console, setTimeout, clearTimeout, AbortController });
  const Screen = module.exports.default;
  const settle = async () => { await act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); }); };
  const editors = new Set<ReactTestRenderer>();
  return { binders, controls, reads, tables, alerts, navigation, load, settle, writes, updateAttempts, listenerCount: () => listeners.size,
    async mount() {
      let root!: ReactTestRenderer;
      await act(async () => { root = create(React.createElement(Screen)); }); await settle(); editors.add(root);
      return { state: () => root.root.findByType('BinderEditState' as any).props,
        async route(id: string) { route = id; await act(async () => root.update(React.createElement(Screen))); await settle(); },
        async close() { await act(async () => root.unmount()); editors.delete(root); } };
    },
    async auth(next: string | null, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') {
      owner = next; sessionNumber++;
      await act(async () => {
        for (const callback of [...listeners]) callback(event, session());
        for (const root of editors) root.update(React.createElement(Screen));
      }); await settle();
    },
  };
}

async function main() {
  const initialRefresh = fixture();
  initialRefresh.controls.refreshOnFirstSession = true;
  assert.equal((await initialRefresh.binders.fetchBinderById('private-a')).user_id, ownerA,
    'initial getSession token refresh must not reject the same-account read');
  const scope = fixture();
  const first = await scope.mount();
  assert.equal(first.state().name, 'Private A name');
  assert.equal(first.state().cardMode, 'graded');
  await first.close();
  const before = scope.reads.length;
  await scope.auth(null); await scope.auth(ownerB);
  const second = await scope.mount();
  console.log(JSON.stringify({ scenario: 'actual A default/assets binder edit -> logout -> B same edit route',
    leakedPrivateName: second.state().name === 'Private A name', readsForB: scope.reads.length - before }));
  assert.notEqual(second.state().name, 'Private A name', 'a new account must not receive the previous private binder from the real default/assets cache');
  assert.equal(second.state().coverKey, null);
  await second.close();
  // The complete private card cache is scoped too, not just its parent record.
  const cards = fixture();
  const [left, right] = await Promise.all([
    cards.binders.fetchBinderCards('private-a', { includePrices: false, includeAssets: false }),
    cards.binders.fetchBinderCards('private-a', { includePrices: false, includeAssets: false }),
  ]);
  assert.equal(left.length, 103); assert.equal(right.length, 103);
  assert.equal(JSON.stringify(left.map((row: any) => [row.id, row.card_id, row.set_id, row.language, row.notes, row.condition, row.owned_quantity, row.image_url])),
    JSON.stringify(cards.tables.binder_cards.map(row => [row.id, row.card_id, row.set_id, row.language, row.notes, row.condition, row.owned_quantity, row.image_url])),
    'full saved placement identity, notes, quantities and source image references remain intact');
  assert.equal(cards.reads.filter(read => read.table === 'binder_cards').length, 8, 'shared warm/inflight read retains every lower-cap page once');
  const afterCold = cards.reads.length;
  cards.controls.offline = true;
  assert.equal((await cards.binders.fetchBinderCards('private-a', { includePrices: false, includeAssets: false })).length, 103,
    'unexpired same-session cache remains usable offline without a server identity round trip');
  assert.equal(cards.reads.length, afterCold);
  cards.controls.offline = false;
  await cards.binders.fetchBinderCards('private-a', { includePrices: false, includeAssets: true });
  assert.ok(cards.reads.length > afterCold, 'facts and assets retain distinct cache modes');
  await cards.auth(ownerB);
  assert.equal((await cards.binders.fetchBinderCards('private-a', { includePrices: false, includeAssets: false })).length, 0);
  await cards.auth(ownerA);
  assert.equal((await cards.binders.fetchBinderCards('private-a', { includePrices: false, includeAssets: false })).length, 103);
  assert.equal(cards.listenerCount(), 1, 'only the shared idle account observer remains after complete reads');
  const beforeLogout = cards.reads.length;
  await cards.auth(null); await cards.auth(ownerA);
  await cards.binders.fetchBinderById('private-a');
  assert.ok(cards.reads.length > beforeLogout, 'logout/login A cannot revive a prior session entry');

  const pending = fixture(), heldRecord = deferred<void>();
  pending.controls.holdRecord = heldRecord; pending.controls.holdRecordFor = 'private-a';
  const oldRead = pending.binders.fetchBinderById('private-a');
  const rejected = assert.rejects(oldRead, { name: 'AbortError' });
  await pending.settle();
  await pending.auth(ownerB); await pending.auth(ownerA);
  heldRecord.resolve(); await rejected;
  delete pending.controls.holdRecord;
  pending.tables.binders[0].name = 'Current A after ABA';
  assert.equal((await pending.binders.fetchBinderById('private-a')).name, 'Current A after ABA', 'late prior-session response cannot fill current cache');

  const heldSession = fixture(), sessionGate = deferred<void>();
  heldSession.controls.holdSession = sessionGate; heldSession.controls.holdSessionAt = 2;
  const finalIdentity = heldSession.binders.fetchBinderById('private-a');
  const finalIdentityRejected = assert.rejects(finalIdentity, { name: 'AbortError' });
  await heldSession.settle();
  await heldSession.auth(ownerB); await heldSession.auth(ownerA);
  sessionGate.resolve(); await finalIdentityRejected;
  delete heldSession.controls.holdSession;
  assert.equal((await heldSession.binders.fetchBinderById('private-a')).user_id, ownerA);

  const pendingCards = fixture(), cardsGate = deferred<void>();
  pendingCards.controls.holdCards = cardsGate;
  const cardRead = pendingCards.binders.fetchBinderCards('private-a', { includePrices: false });
  const cardRejected = assert.rejects(cardRead, { name: 'AbortError' });
  await pendingCards.settle(); await pendingCards.auth(ownerB);
  cardsGate.resolve(); await cardRejected;
  delete pendingCards.controls.holdCards;
  assert.equal((await pendingCards.binders.fetchBinderCards('private-a', { includePrices: false })).length, 0);

  const mutation = fixture(), heldMutation = deferred<void>();
  mutation.controls.holdRecord = heldMutation;
  const oldMutation = mutation.binders.fetchBinderById('private-a');
  const mutationRejected = assert.rejects(oldMutation, { name: 'AbortError' });
  await mutation.settle(); mutation.binders.invalidateBinderCaches('private-a');
  heldMutation.resolve(); await mutationRejected; delete mutation.controls.holdRecord;
  mutation.tables.binders[0].name = 'Edited current name';
  assert.equal((await mutation.binders.fetchBinderById('private-a')).name, 'Edited current name');

  const modes = fixture();
  await modes.binders.fetchBinderById('private-a', { includeAssets: false });
  const factsReads = modes.reads.length;
  await modes.binders.fetchBinderById('private-a');
  assert.equal(modes.reads.length, factsReads + 1, 'default/assets record does not reuse facts-only entry');
  await modes.auth(null);
  assert.equal((await modes.binders.fetchBinderById('public-a')).is_public, true, 'anonymous public reads remain permitted');
  assert.equal(await modes.binders.fetchBinderById('private-a'), null);
  await modes.auth(ownerB);
  assert.equal((await modes.binders.fetchBinderById('public-a')).is_public, true, 'another account may read explicitly public binders');
  const publicEditor = await modes.mount(); await publicEditor.route('public-a');
  assert.equal(publicEditor.state().name, '', 'readable public metadata cannot populate a foreign edit form');
  await publicEditor.close();

  const art = fixture(), heldArt = deferred<string>();
  art.controls.holdArt = heldArt;
  const artEditor = await art.mount();
  assert.equal(artEditor.state().name, '', 'private fields apply together after delayed name art and owner confirmation');
  await art.auth(ownerB);
  heldArt.resolve('old-private-art'); await art.settle();
  assert.equal(artEditor.state().name, '', 'late art cannot restore A metadata into B form');
  await artEditor.close();

  const route = fixture(), heldRoute = deferred<void>();
  route.controls.holdRecord = heldRoute; route.controls.holdRecordFor = 'private-a';
  const routeEditor = await route.mount();
  await routeEditor.route('public-a');
  heldRoute.resolve(); await route.settle();
  assert.equal(routeEditor.state().name, 'Public A name', 'a late prior route cannot replace the current public binder form');
  assert.equal(routeEditor.state().loadingBinder, false);
  await routeEditor.close();
  const replaced = fixture(), replacedEditor = await replaced.mount();
  const oldRouteSave = replacedEditor.state().save;
  await replacedEditor.route('public-a');
  const routeWrites = replaced.writes.length;
  await act(async () => { assert.equal(await oldRouteSave('unlimited'), false); });
  assert.equal(replaced.writes.length, routeWrites, 'old route save callback cannot write after another binder loads');
  await replacedEditor.close();

  const edited = fixture(), editor = await edited.mount();
  await act(async () => editor.state().rename('Renamed A'));
  await act(async () => { assert.equal(await editor.state().save('unlimited'), true); });
  assert.equal((await edited.binders.fetchBinderById('private-a')).name, 'Renamed A', 'successful direct edit invalidates record/card cache');
  const heldSave = editor.state().save;
  await edited.auth(ownerB);
  const writesBefore = edited.writes.length;
  await act(async () => { assert.equal(await heldSave('unlimited'), false); });
  assert.equal(edited.writes.length, writesBefore, 'held A save callback cannot write as B');
  await editor.close();
  const legacy = fixture(); legacy.controls.legacyWrite = true;
  const legacyEditor = await legacy.mount();
  await act(async () => legacyEditor.state().rename('Legacy A renamed'));
  await act(async () => { assert.equal(await legacyEditor.state().save('unlimited'), true); });
  assert.equal((await legacy.binders.fetchBinderById('private-a')).name, 'Legacy A renamed');
  await legacyEditor.close();
  for (const boundary of ['account-aba', 'route-change']) {
    const staleRetry = fixture(), legacyGate = deferred<void>();
    staleRetry.controls.legacyWrite = true;
    staleRetry.controls.holdLegacyWrite = legacyGate;
    const staleEditor = await staleRetry.mount();
    await act(async () => staleEditor.state().rename('Obsolete legacy edit'));
    const pendingSave = staleEditor.state().save('unlimited');
    await staleRetry.settle();
    assert.equal(staleRetry.updateAttempts.length, 1, 'hold the first schema-error response');
    if (boundary === 'account-aba') {
      await staleRetry.auth(ownerB);
      await staleRetry.auth(ownerA);
    } else {
      await staleEditor.route('public-a');
    }
    legacyGate.resolve();
    await act(async () => { assert.equal(await pendingSave, false); });
    assert.equal(staleRetry.updateAttempts.length, 1, boundary + ' must prevent fallback dispatch');
    assert.equal(staleRetry.writes.length, 0, 'a stale legacy retry cannot commit the old edit');
    assert.equal(staleRetry.alerts.some(alert => alert[0] === 'Saved'), false);
    await staleEditor.close();
  }
  const noLongerOwned = fixture(), deniedEditor = await noLongerOwned.mount();
  noLongerOwned.tables.binders[0].user_id = ownerB;
  await act(async () => { assert.equal(await deniedEditor.state().save('unlimited'), false); });
  assert.equal(noLongerOwned.alerts.some(alert => alert[0] === 'Saved'), false, 'a zero-row RLS update is never reported as saved');
  assert.equal(await noLongerOwned.binders.fetchBinderById('private-a'), null, 'known ownership loss invalidates the old record');
  await deniedEditor.close();
  console.log('Binder account cache runtime passed: actual default/assets edit reproduction, private cards, A/B/A and idle logout, held responses/art/routes, warm dedup/offline, full lower-cap pages, public-read/edit split, mode isolation and mutation invalidation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
