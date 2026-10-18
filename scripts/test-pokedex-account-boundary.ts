import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/pokedexCollectionCore';
import { readOptionalCatalogueEnrichment } from '../lib/optionalCatalogueEnrichment';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const cards = [{ id: 'printing-a', set_id: 'set-a', name: 'Pikachu', raw_data: {} },
  { id: 'printing-b', set_id: 'set-b', name: 'Pikachu ex', raw_data: {} }];
const key = 'set-a:printing-a';
const sourceFor = (path: string) => process.env.PDX_BASELINE === '1' && path !== 'lib/pokedexOwnershipState.ts'
  ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : readFileSync(path, 'utf8');

function compile(path: string, dependencies: Record<string, any>, extra: Record<string, unknown> = {}) {
  const exports: any = {};
  runInNewContext(ts.transpileModule(sourceFor(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, console: { log() {} }, Set, Map, URLSearchParams, AbortController,
    require: (name: string) => {
      assert.ok(name in dependencies || name.endsWith('.png'), `${path}: unexpected dependency ${name}`);
      return dependencies[name] ?? 'fixture-asset';
    }, ...extra });
  return exports;
}

// Execute the complete TSX consumers and shared hook with deterministic hooks.
// Effects are explicit so the first render after auth changes can be inspected.
function screenHarness(kind: 'list' | 'detail') {
  let auth: any = { user: { id: 'A' }, loading: false, error: null, refreshAuth: async () => {} };
  let routeParams: Record<string, string> = { id: '25', name: 'pikachu' };
  let pokemonRows = [
    { name: 'pikachu', url: '/pokemon/25', speciesId: 25, speciesName: 'pikachu', routeId: 25, routeName: 'pikachu' },
    { name: 'mew', url: '/pokemon/151', speciesId: 151, speciesName: 'mew', routeId: 151, routeName: 'mew' },
  ];
  const slots: any[] = [];
  let cursor = 0;
  let pendingEffects: (() => void)[] = [];
  let tree: any;
  const reads: string[] = [];
  const writes: any[] = [];
  const alerts: any[] = [];
  const alertAccounts: (string | null)[] = [];
  const routes: any[] = [];
  const cardQueries: string[] = [];
  let reader: (account: string) => Promise<Set<string>> = async () => new Set();
  let writer: (intent: any) => Promise<void> = async () => {};
  let mutationHandoff: (() => Promise<void>) | null = null;
  const depsEqual = (left: any[], right: any[]) => left?.length === right?.length && left.every((item, i) => item === right[i]);
  const memoizeFixtureValue = (factory: () => any, deps: any[]) => {
    const index = cursor++;
    if (!slots[index] || !depsEqual(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const effect = (callback: () => (() => void) | void, deps: any[], focus = false) => {
    const index = cursor++;
    if (!slots[index] || !depsEqual(slots[index].deps, deps)) {
      const previous = slots[index];
      const slot = { deps, cleanup: previous?.cleanup, focus, callback };
      slots[index] = slot;
      pendingEffects.push(() => { slot.cleanup?.(); slot.cleanup = callback(); });
    }
  };
  const React: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value: any) => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef: (value: any) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index]; },
    useMemo: memoizeFixtureValue, useCallback: (callback: any, deps: any[]) => memoizeFixtureValue(() => callback, deps), useEffect: effect,
  };
  const accountGeneration = compile('lib/accountLoadGeneration.ts', {});
  const authResult = () => ({ data: { user: auth.user }, error: null });
  const router = { push: (route: any) => routes.push(route) };
  const expo = { router, useLocalSearchParams: () => routeParams,
    useFocusEffect: (callback: any) => effect(callback, [callback], true) };
  const sharedModule = compile('lib/pokedexOwnershipState.ts', {
    react: React, 'expo-router': expo, '../components/auth-context': { useAuth: () => auth },
    './accountLoadGeneration': accountGeneration, './supabase': { supabase: { auth: { getUser: async () => authResult() } } },
  });
  const shared = { usePokedexOwnership: (read: any) => {
    const actual = sharedModule.usePokedexOwnership(read);
    return { ...actual, changeOwnership: async (...args: any[]) => {
      let value: any;
      try { value = await actual.changeOwnership(...args); }
      catch (error) { await mutationHandoff?.(); throw error; }
      await mutationHandoff?.();
      return value;
    } };
  } };
  const theme = { colors: new Proxy({}, { get: () => '#ffffff' }) };
  const collection = {
    fetchOwnedPokemonNameSet: async (account = auth.user?.id) => { reads.push(account); return reader(account); },
    fetchOwnedPokedexCards: async (account = auth.user?.id) => { reads.push(account); return new Map([...(await reader(account))].map((id) => [id, {}])); },
    pokemonNameMatchesCardName: (name: string, title: string) => name === title,
    fetchCardsForPokemon: async (name: string, options: any) => { cardQueries.push(name); const result = { cards, complete: true }; options.onProgress(result); return result; },
    hydratePokedexCardArtwork: async () => [], formatPokedexName: (value: string) => value,
    setPokedexCardOwned: async (_card: any, owned: boolean, intent: any) => { writes.push({ owned, intent }); await writer(intent); },
  };
  const screen = compile(kind === 'list' ? 'app/(tabs)/pokedex.tsx' : 'app/pokemon/[id].tsx', {
    react: React, 'expo-router': expo,
    '../../components/theme-context': { useTheme: () => ({ theme }) },
    '../../components/Text': { Text: 'Text' }, '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Spinner' },
    '../../components/StackrImage': { StackrImage: 'StackrImage' },
    '../../components/StackrFunctionalIcon': { StackrFunctionalIcon: 'Image' },
    '../../components/FeatureTipModal': { FeatureTipGate: 'Tip' },
    'react-native': { ...Object.fromEntries(['FlatList', 'Image', 'Pressable', 'ScrollView', 'TextInput', 'View'].map((name) => [name, name])),
      StyleSheet: { create: (styles: any) => styles }, useWindowDimensions: () => ({ width: 390 }), Alert: { alert: (...args: any[]) => { alerts.push(args); alertAccounts.push(auth.user?.id ?? null); } } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    '../../lib/pokedexCollection': collection,
    '../../lib/pokedexOwnershipState': shared,
    '../../lib/optionalCatalogueEnrichment': { readOptionalCatalogueEnrichment },
    '../../lib/stackrApiV1': { stackrApiClient: { pokemonIndex: async () => ({ data: { count: pokemonRows.length, indexVersion: 'fixture', results: pokemonRows } }) } },
    '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' },
    '../../components/StackrScreen': { PokemonArtworkGlow: 'Glow', StackrScreen: 'Screen' }, '../../lib/stackrIcons': { stackrIcons: {} },
    '../../components/RaritySymbol': { RaritySymbol: 'Rarity', RARITY_SYMBOL_CARD_OVERLAY: {} },
    '../../lib/setDisplay': { getDisplaySetName: () => 'Fixture set' }, '../../lib/stackrSizing': { stackrCardImageSizes: {} },
    '../../lib/haptics': { stackrHaptics: { selection: async () => {}, cardPreview: async () => {} } },
    '../../lib/supabase': { supabase: { auth: { getUser: async () => authResult() } } },
    '../../lib/accountLoadGeneration': accountGeneration,
    '../../components/CardInspectionProvider': { useCardInspection: () => ({ inspectCard() {} }) },
    '../../lib/cardInspection': { CARD_INSPECTION_LONG_PRESS_MS: 300 }, '../../lib/useCataloguePriceOverlay': { useCataloguePriceOverlay: (value: any) => value },
  }, { fetch: async () => ({ ok: true, json: async () => ({ id: 25, name: 'pikachu', types: [] }) }) }).default;
  const render = () => { cursor = 0; tree = screen(); return tree; };
  const flush = async () => { const effects = pendingEffects; pendingEffects = []; effects.forEach((run) => run()); await tick(); render(); };
  const nodes = (value: any): any[] => !value || typeof value !== 'object' ? []
    : Array.isArray(value) ? value.flatMap((item) => nodes(item))
      : [value, ...nodes(value.props?.children), ...nodes(value.props?.ListHeaderComponent)];
  const flatList = () => nodes(tree).find((node) => node.type === 'FlatList');
  const text = () => nodes(tree).filter((node) => node.type === 'Text').flatMap((node) => node.props.children.flat(Infinity)).join(' ');
  const press = (label: string) => {
    const node = nodes(tree).find((item) => item.type === 'Pressable' && item.props.accessibilityLabel === label);
    assert.ok(node, `missing action ${label}`); return node.props.onPress();
  };
  const tile = () => flatList().props.renderItem({ item: flatList().props.data[0] });
  const blur = () => { slots.filter((slot) => slot?.focus).forEach((slot) => slot.cleanup?.()); };
  const focus = async () => { slots.filter((slot) => slot?.focus).forEach((slot) => { slot.cleanup = slot.callback(); }); await tick(); render(); };
  return { render, flush, text, flatList, tile, press, blur, focus, reads, writes, alerts, alertAccounts, routes,
    setAccount: (id: string | null) => { auth = { ...auth, user: id ? { id } : null }; },
    setAuthState: (loading: boolean, error: string | null) => { auth = { ...auth, loading, error }; },
    setReader: (next: typeof reader) => { reader = next; }, setWriter: (next: typeof writer) => { writer = next; },
    setMutationHandoff: (next: typeof mutationHandoff) => { mutationHandoff = next; },
    setRouteParams: (next: Record<string, string>) => { routeParams = next; },
    setPokemonRows: (next: typeof pokemonRows) => { pokemonRows = next; },
    cardQueries,
    unmount: () => { slots.forEach((slot) => slot?.cleanup?.()); }, nodes: () => nodes(tree) };
}

const results: string[] = [];
async function testConsumers(kind: 'list' | 'detail') {
  const ownedValue = kind === 'list' ? 'pikachu' : key;
  const h = screenHarness(kind);
  h.setReader(async () => new Set([ownedValue]));
  h.render(); await h.flush();
  assert.match(h.text(), kind === 'list' ? /1\/2 owned/ : /1 \/ 2/);
  const b = deferred<Set<string>>();
  h.setAccount('B'); h.setReader(() => b.promise); h.render();
  assert.match(h.text(), /Ownership unknown/, `${kind}: render before account effects masks A`);
  if (kind === 'list') assert.match(h.tile().props.accessibilityLabel, /ownership unknown/);
  if (kind === 'detail') {
    const unknownTile = h.tile();
    assert.match(unknownTile.props.accessibilityLabel, /Ownership changes unavailable/);
    unknownTile.props.onPress(); assert.equal(h.writes.length, 0); assert.equal(h.routes.length, 1);
    const filters = h.nodes().filter((node) => node.type === 'Pressable' && node.props.disabled === true);
    assert.equal(filters.length, 2, 'Owned/Missing filters disabled while status unknown');
  }
  await h.flush(); b.reject(new Error('B offline')); await tick(); h.render();
  assert.match(h.text(), /Ownership unavailable/); assert.match(h.text(), /Ownership unknown/);
  assert.doesNotMatch(h.text(), kind === 'list' ? /1\/2 owned/ : /1 \/ 2/);
  h.setReader(async () => new Set());
  h.press(kind === 'list' ? 'Retry Pokédex ownership' : 'Retry Pokémon ownership'); await tick(); h.render();
  assert.match(h.text(), kind === 'list' ? /0\/2 owned/ : /0 \/ 2/, 'valid empty read is known');
  h.setReader(async () => new Set([ownedValue])); await h.focus();
  h.setReader(async () => { throw new Error('same account offline'); }); await h.focus();
  assert.match(h.text(), /Showing saved ownership/);
  assert.match(h.text(), kind === 'list' ? /1\/2 owned/ : /1 \/ 2/);
  if (kind === 'detail') { h.tile().props.onPress(); assert.equal(h.writes.length, 0, 'stale snapshot is read-only'); }
  h.setReader(async () => new Set()); h.press(kind === 'list' ? 'Retry Pokédex ownership' : 'Retry Pokémon ownership'); await tick(); h.render();
  assert.doesNotMatch(h.text(), /Showing saved ownership/);
  h.setAccount(null); h.render(); assert.match(h.text(), /Ownership unknown/); await h.flush(); assert.match(h.text(), /Sign in to view ownership/);
  results.push(`${kind}: pre-effect A->B masking, failed B, unknown controls, valid empty, same-account stale/retry, sign-out`);

  for (const boundary of ['account', 'blur', 'unmount'] as const) {
    const late = screenHarness(kind); const pending = deferred<Set<string>>();
    late.setReader(() => pending.promise); late.render(); await late.flush();
    if (boundary === 'account') { late.setAccount('B'); late.render(); }
    else if (boundary === 'blur') late.blur(); else late.unmount();
    pending.resolve(new Set([ownedValue])); await tick(); late.render();
    assert.match(late.text(), /Ownership unknown/, `${kind}: ${boundary} invalidates late A read`);
  }
  results.push(`${kind}: late read rejected after account render, blur and unmount`);
  const first = screenHarness(kind); first.setReader(async () => { throw new Error('first read failed'); });
  first.render(); await first.flush(); assert.match(first.text(), /Ownership unavailable/); assert.match(first.text(), /Ownership unknown/);
  if (kind === 'detail') assert.equal(first.flatList().props.data.length, 2, 'unknown ownership keeps catalogue browsing');
  results.push(`${kind}: failed first read remains unknown and browsable`);
}

async function testMarkerConsumers() {
  for (const fails of [false, true]) {
    const h = screenHarness('detail'); const write = deferred<void>();
    h.render(); await h.flush(); h.setWriter(() => write.promise);
    h.tile().props.onPress(); h.render(); assert.match(h.text(), /1 \/ 2/, 'A add is optimistic');
    assert.equal(h.writes[0].intent.expectedAccountId, 'A');
    h.setAccount('B'); h.setReader(async () => new Set([key])); h.render(); await h.flush();
    const bWrite = deferred<void>();
    h.setWriter(() => bWrite.promise); const bTile = h.tile(); bTile.props.onPress(); h.render();
    assert.equal(h.writes[1].intent.expectedAccountId, 'B');
    const readsBefore = h.reads.length;
    assert.equal(h.writes[0].intent.isCurrentAccount(), false);
    if (fails) write.reject(new Error('late A mutation failure')); else write.resolve();
    await tick(); h.render();
    assert.match(h.text(), /1 \/ 2/, 'B exact printing survives old A completion/rollback');
    assert.equal(h.reads.length, readsBefore, 'old mutation cannot reload B'); assert.equal(h.alerts.length, 0);
    assert.equal(h.tile().props.children[0].props.children[1].props.children[0].type, 'Spinner', 'old finally cannot clear a newer B mutation');
    bTile.props.onPress();
    assert.equal(h.writes.length, 2, 'old A finally cannot unlock the pending B mutation');
    assert.equal(h.writes[1].intent.isCurrentAccount(), true);
    h.setReader(async () => new Set()); bWrite.resolve(); await tick(); h.render();
    assert.match(h.text(), /0 \/ 2/, 'the valid B mutation completes independently');
  }
  results.push('markers: late A success/failure cannot roll back, reload, alert or clear a newer B mutation');
  for (const boundary of ['blur', 'unmount'] as const) {
    const h = screenHarness('detail'); const write = deferred<void>(); h.render(); await h.flush();
    h.setWriter(() => write.promise); h.tile().props.onPress();
    if (boundary === 'blur') h.blur(); else h.unmount();
    const readsBefore = h.reads.length;
    assert.equal(h.writes[0].intent.isCurrentAccount(), false);
    write.reject(new Error('late mutation after leaving screen')); await tick();
    assert.equal(h.reads.length, readsBefore); assert.equal(h.alerts.length, 0);
  }
  results.push('markers: blur and unmount invalidate mutation intent and suppress late reload/alert');
  for (const fails of [false, true]) {
    const h = screenHarness('detail'); h.render(); await h.flush();
    h.setWriter(async () => { if (fails) throw new Error('marker rejected'); h.setReader(async () => new Set([key])); });
    h.tile().props.onPress(); await tick(); h.render();
    assert.match(h.text(), fails ? /0 \/ 2/ : /1 \/ 2/); assert.equal(h.alerts.length, fails ? 1 : 0);
  }
  results.push('markers: same-account write success reloads and failure rolls back with an alert');
}

async function testServiceIntents() {
  let user = 'A'; let current = true; let authRead = async () => ({ data: { user: { id: user } }, error: null });
  const writes: string[] = []; const filters: any[] = []; let physical = false; let binderOwned = false;
  const query = (table: string) => {
    const chain: any = { select: () => chain, order: () => chain, limit: () => chain,
      eq: (column: string, value: any) => { filters.push([table, column, value]); return chain; },
      is: (column: string, value: any) => { filters.push([table, column, value]); return chain; }, in: () => chain,
      upsert: () => { writes.push(`${table}:upsert`); return chain; }, delete: () => { writes.push(`${table}:delete`); return chain; },
      then: (resolve: any) => Promise.resolve({ data: table === 'binders' ? [{ id: 'binder-a' }]
        : table === 'user_card_variants' && physical || table === 'binder_cards' && binderOwned ? [{ id: 'owned' }] : [], error: null }).then(resolve) };
    return chain;
  };
  const service = compile('lib/pokedexCollection.ts', {
    './supabase': { supabase: { auth: { getUser: () => authRead() }, from: query } },
    './pokedexCollectionCore': core, './cardSearch': {}, './pokemonDisplayNames': {}, './stackrDomainAdapter': {}, './stackrApiV1': {},
  });
  const intent = { expectedAccountId: 'A', isCurrentAccount: () => current };
  user = 'B';
  await assert.rejects(service.setPokedexCardOwned(cards[0], true, intent), /account changed/);
  await assert.rejects(service.fetchOwnedPokedexCards('A'), /account changed/); assert.equal(writes.length, 0);
  user = 'A'; const getUser = deferred<any>(); authRead = () => getUser.promise;
  const mutation = service.setPokedexCardOwned(cards[0], true, intent); current = false;
  getUser.resolve({ data: { user: { id: 'A' } }, error: null }); await assert.rejects(mutation, /account changed/); assert.equal(writes.length, 0);
  current = true; let count = 0;
  authRead = async () => ({ data: { user: { id: ++count === 1 ? 'A' : 'B' } }, error: null });
  await assert.rejects(service.setPokedexCardOwned(cards[0], true, intent), /account changed/); assert.equal(writes.length, 0);
  results.push('service: expected-account mismatch, pending auth invalidation and pre-write auth switch produce zero writes');
  authRead = async () => ({ data: { user: { id: 'A' } }, error: null });
  for (const source of ['physical', 'binder']) {
    physical = source === 'physical'; binderOwned = source === 'binder';
    await assert.rejects(service.setPokedexCardOwned(cards[0], false, intent), /collection card controls/); assert.equal(writes.length, 0);
  }
  physical = false; binderOwned = false;
  await service.setPokedexCardOwned(cards[0], true, intent);
  await service.setPokedexCardOwned(cards[0], false, intent);
  await service.setPokedexCardOwned({ ...cards[0], set_id: null }, false, intent);
  assert.deepEqual(writes, ['user_pokedex_cards:upsert', 'user_pokedex_cards:delete', 'user_pokedex_cards:delete']);
  assert.ok(filters.some(([table, column, value]) => table === 'user_pokedex_cards' && column === 'user_id' && value === 'A'));
  assert.ok(filters.some(([table, column, value]) => table === 'user_pokedex_cards' && column === 'set_id' && value === 'set-a'));
  assert.ok(filters.some(([table, column, value]) => table === 'user_pokedex_cards' && column === 'set_id' && value === null));
  results.push('service: physical/binder guard, current-account manual add/delete and null-set scope remain intact');
}

async function testReviewedMarkerRaces() {
  for (const transition of ['auth-error', 'loading-ready', 'account-return', 'blur-focus'] as const) {
    const h = screenHarness('detail'); const write = deferred<void>();
    h.render(); await h.flush(); h.setWriter(() => write.promise);
    h.tile().props.onPress(); h.render(); assert.match(h.text(), /1 \/ 2/);
    if (transition === 'auth-error') h.setAuthState(false, 'Account check failed');
    else if (transition === 'loading-ready') { h.setAuthState(true, null); h.render(); h.setAuthState(false, null); }
    else if (transition === 'account-return') { h.setAccount('B'); h.render(); h.setAccount('A'); }
    else h.blur();
    h.render();
    assert.equal(h.writes[0].intent.isCurrentAccount(), false);
    assert.match(h.text(), /0 \/ 2/, `${transition}: invalid optimism cannot become saved ownership before effects`);
    assert.doesNotMatch(h.text(), /1 \/ 2/);
    if (transition === 'blur-focus') await h.focus(); else await h.flush();
    write.reject(new Error('invalidated old marker')); await tick(); h.render();
    assert.match(h.text(), /0 \/ 2/); assert.equal(h.alerts.length, 0);
  }
  results.push('review: auth error, loading/ready, A->B->A and blur invalidate optimistic overlays before effects');

}

async function testReviewedDuplicateTaps() {
  const h = screenHarness('detail'); const write = deferred<void>();
  h.render(); await h.flush(); h.setWriter(() => write.promise);
  const sameTile = h.tile(); sameTile.props.onPress(); sameTile.props.onPress();
  assert.equal(h.writes.length, 1, 'duplicate invocation before rerender starts only one persist');
  assert.equal(h.writes[0].intent.isCurrentAccount(), true, 'duplicate tap cannot invalidate the first valid intent');
  write.resolve(); await tick(); h.render();
  h.tile().props.onPress(); assert.equal(h.writes.length, 2, 'matching completion releases the synchronous lock');
  results.push('review: duplicate same-tile tap before rerender is locked, preserving first intent and later unlock');
}

async function testReviewedErrorHandoff() {
  for (const transition of ['current', 'account', 'account-return', 'new-mutation', 'blur', 'auth-error', 'success'] as const) {
    const h = screenHarness('detail'); h.render(); await h.flush();
    h.setWriter(async () => {
      if (transition === 'success') h.setReader(async () => new Set([key]));
      else throw new Error('old A marker rejected');
    });
    const handoff = deferred<void>(); const release = deferred<void>();
    h.setMutationHandoff(async () => { handoff.resolve(); await release.promise; });
    h.tile().props.onPress(); await handoff.promise;
    // The actual hook has finished failure/recovery. Hold only its promise
    // exposure to the caller, then change auth before the TSX continuation.
    if (transition === 'account' || transition === 'success') { h.setAccount('B'); h.render(); }
    else if (transition === 'account-return') { h.setAccount('B'); h.render(); h.setAccount('A'); h.render(); }
    else if (transition === 'new-mutation') {
      h.render(); h.setWriter(() => new Promise<void>(() => {})); h.tile().props.onPress();
    }
    else if (transition === 'blur') h.blur();
    else if (transition === 'auth-error') { h.setAuthState(false, 'auth check failed'); h.render(); }
    release.resolve(); await tick(); h.render();
    assert.equal(h.alerts.length, transition === 'current' ? 1 : 0,
      `${transition}: final screen error presentation must retain the initiating intent guard`);
    if (transition === 'current') assert.deepEqual(h.alertAccounts, ['A']);
    assert.ok(!h.alertAccounts.includes('B'), 'A rejection must never alert account B');
    h.unmount();
  }
  results.push('review: controlled screen handoff alerts current A, suppresses B/ABA/new-generation/blur/auth-error side effects and late success');
}

async function testSpeciesRouteConsumerHandoff() {
  const giratina = { name: 'giratina-altered', url: '/pokemon/487', speciesId: 487, speciesName: 'giratina', routeId: 487, routeName: 'giratina-altered' };
  const list = screenHarness('list');
  list.setPokemonRows([giratina]);
  list.setReader(async () => new Set(['giratina']));
  list.render(); await list.flush();
  assert.match(list.tile().props.accessibilityLabel, /giratina.*owned/i,
    'species ownership marks Giratina without requiring the provider default-form label');
  list.tile().props.onPress();
  assert.deepEqual({ ...list.routes[0]?.params }, {
    id: '487', name: 'giratina-altered', speciesId: '487', speciesName: 'giratina',
  }, 'the actual list carries distinct route and species identities into detail');

  for (const entry of [
    list.routes[0].params,
    { id: '413', name: 'wormadam-plant', speciesId: '413', speciesName: 'wormadam' },
    { id: '964', name: 'palafin-zero', speciesId: '964', speciesName: 'palafin' },
    { id: '386', name: 'deoxys-normal', speciesId: '386', speciesName: 'deoxys' },
    { id: '29', name: 'nidoran-f', speciesId: '29', speciesName: 'nidoran-f' },
    { id: '32', name: 'nidoran-m', speciesId: '32', speciesName: 'nidoran-m' },
  ]) {
    const detail = screenHarness('detail');
    detail.setRouteParams(entry);
    detail.render(); await detail.flush();
    assert.equal(detail.cardQueries[0], entry.speciesName,
      `${entry.name}: card retrieval uses the selected species and not the provider form route`);
  }

  const directForm = screenHarness('detail');
  directForm.setRouteParams({ id: '487', name: 'giratina-altered' });
  directForm.render(); await directForm.flush();
  assert.equal(directForm.cardQueries[0], 'giratina-altered',
    'a direct legacy form route preserves its exact card query when no species identity was supplied');
  results.push('species route handoff: list ownership/navigation and detail catalogue queries separate species from provider form routes');
}

async function run() {
  await testReviewedErrorHandoff();
  await testReviewedDuplicateTaps();
  await testReviewedMarkerRaces();
  await testConsumers('list'); await testConsumers('detail'); await testMarkerConsumers(); await testServiceIntents();
  await testSpeciesRouteConsumerHandoff();
  console.log(JSON.stringify({ fixtureAccountsOnly: true, actualConsumersAndService: true, passedGroups: results.length, results }, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
