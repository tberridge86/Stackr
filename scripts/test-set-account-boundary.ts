import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Complete Set Detail consumer regression. It runs the real TSX with synthetic
// catalogue/auth rows and deliberately defers effects at the privacy boundary.
const baseline = process.env.SET_ACCOUNT_BOUNDARY_BASELINE === '1';
const source = baseline ? execFileSync('git', ['show', '16031bfa4f61d0b437077f2862afd559455ac82f:app/set/[id].tsx'], { encoding: 'utf8' }) : readFileSync('app/set/[id].tsx', 'utf8');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }
const card = { id: 'card-a', name: 'Fixture Pikachu', number: '001', rarity: 'Common', set: { id: 'set-a' }, images: { small: 'fixture.png' }, tcgplayer: { prices: { normal: {} } }, raw_data: {} };
const set = { id: 'set-a', name: 'Fixture Set', series: 'Fixture', printedTotal: 2, total: 2, language: 'en' };

function compile(dependencies: Record<string, unknown>) {
  const exports: any = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, AbortController, Map, Set, Intl, Number, String, Object, Array, Boolean, RegExp, Promise,
    console, require: (name: string) => { assert.ok(name in dependencies, `unexpected Set Detail dependency: ${name}`); return dependencies[name]; },
  });
  return exports.default;
}

function walk(value: any): any[] { return !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children), ...walk(value.props?.ListHeaderComponent)]; }
function text(value: any) { return walk(value).filter((node) => node.type === 'Text').flatMap((node) => node.props.children.flat(Infinity)).join(' '); }

function harness(initialCard = card) {
  let auth: any = { user: { id: 'A' }, loading: false, error: null };
  const userResponses: any[] = []; const ownershipResponses: any[] = []; const artworkResponses: any[] = []; const alerts: any[] = []; const upserts: any[] = []; const activities: any[] = []; const activityResponses: any[] = [];
  let cursor = 0; const slots: any[] = []; let queued: (() => void)[] = []; let tree: any;
  const same = (a?: any[], b?: any[]) => Boolean(a && b && a.length === b.length && a.every((v, i) => v === b[i]));
  const React: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), memo: (component: any) => component,
    useState: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, (v: any) => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
    useRef: (value: any) => { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useMemo: (factory: any, deps: any[]) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() }; return slots[i].value; },
    useCallback: (callback: any, deps: any[]) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: callback }; return slots[i].value; },
    useEffect: (callback: any, deps: any[]) => { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const previous = slots[i]; const slot = slots[i] = { deps, callback, cleanup: previous?.cleanup }; queued.push(() => { slot.cleanup?.(); slot.cleanup = callback(); }); } },
  };
  const query = () => { const chain: any = { select: () => chain, eq: () => chain, upsert: (...args: any[]) => { upserts.push(args); return chain; }, delete: () => chain, then: (resolve: any, reject: any) => Promise.resolve(ownershipResponses.shift() ?? { data: auth.user?.id === 'A' ? [{ card_id: 'card-a', variant: 'normal', quantity: 2 }] : [], error: null }).then(resolve, reject) }; return chain; };
  const native = Object.fromEntries(['View', 'FlatList', 'TextInput', 'TouchableOpacity'].map((name) => [name, name]));
  const dependencies: Record<string, any> = {
    react: React, 'react-native': { ...native, StyleSheet: { create: (x: any) => x, absoluteFill: {} }, Alert: { alert: (...args: any[]) => alerts.push(args) } }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { Stack: { Screen: 'StackScreen' }, router: { back() {}, push() {} }, useLocalSearchParams: () => ({ id: 'set-a', language: 'en' }) }, '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Spinner' }, '../../components/theme-context': { useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#123456' }) } }) }, '../../lib/haptics': { stackrHaptics: { selection: async () => {}, cardPreview: async () => {} } }, '../../components/Text': { Text: 'Text' }, '../../lib/corocoroIssueArchive': { getCorocoroIssuesForSet: () => [], formatCorocoroIssueMonth: () => '' },
    '../../lib/pokemonTcg': { fetchPokemonSetForDetail: async () => set, fetchAllSets: async () => [set], fetchCardsForSet: async () => [initialCard], getExactPokemonSetCardTotal: () => 2, getKnownPokemonSetTotal: () => 2, getPokemonSetVisualUrl: () => null, mergeSetCardArtwork: (_old: any, next: any) => next }, '../../lib/stackrDomainAdapter': { enrichStackrCardArtworkFromFacts: async () => artworkResponses.length ? await artworkResponses.shift() : [initialCard] }, '../../lib/pokemonSetIdentity': { getPokemonSetLanguageFromPrefixedId: () => null, stripPokemonSetLanguagePrefix: (x: string) => x }, '../../lib/localSetArtwork': { getLocalSetArtworkSourceForSet: () => null }, '../../lib/englishSetIdentity': { matchesEnglishSetReference: () => false }, '../../lib/supabase': { supabase: { auth: { getUser: async () => (userResponses.length ? userResponses.shift() : { data: { user: auth.user } }) }, from: query } },
    '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' }, '../../components/StackrBackButton': { StackrBackButton: 'Back' }, '../../components/StackrBrowseControls': { StackrBinderButton: 'Binder', StackrBrowseToolbar: 'Toolbar', StackrBrowseSummary: 'Summary', StackrBrowseFilterGroup: 'FilterGroup', StackrBrowseFilterSheet: 'FilterSheet' }, '../../components/StackrImage': { StackrImage: 'Image' }, '../../components/RaritySymbol': { RARITY_SYMBOL_CARD_OVERLAY: {}, RaritySymbol: 'Rarity' }, '../../lib/activity': { createActivityPost: async () => ({ status: 'created' }) }, '../../lib/directCollectionHistoryRecovery': { createDirectCollectionHistoryIntent: (input: any) => input, recordDirectCollectionHistory: async (intent: any) => { activities.push([intent.activity, { expectedUserId: intent.ownerUserId }]); try { return activityResponses.length ? await activityResponses.shift() : { status: 'created' }; } catch { return { status: 'pending' }; } }, recoverDirectCollectionHistory: async () => ({ attempted: 0, completed: 0, pending: 0, invalid: 0 }) }, '../../lib/performance': { getIncrementalListWindow: () => ({ initialCount: 16, pageSize: 12 }) }, '../../lib/stackrSizing': { stackrTabContentPadding: { standard: 0 } }, '../../lib/pokemonDisplayNames': { getPreferredCardDisplayName: (x: any) => x.fallbackName }, '../../lib/setVariantRemoval': { isSetVariantQuantitySchemaUnavailable: () => false }, '../../lib/catalogueVariantPresentation': { getCatalogueVariantKeys: () => null, catalogueVariantLabel: (x: string) => x }, '../../components/auth-context': { useAuth: () => auth }, '../../components/StackrModalSystem': { StackrBottomSheet: 'BottomSheet' }, '../../lib/useCataloguePriceOverlay': { cataloguePriceReadWindow: (x: any) => x, useCataloguePriceOverlay: (x: any) => x },
  };
  const Screen = compile(dependencies); const render = () => { cursor = 0; tree = Screen(); return tree; }; const flush = async () => { const effects = queued; queued = []; effects.forEach((run) => run()); for (let i = 0; i < 8; i += 1) await tick(); render(); };
  const node = (type: string) => walk(tree).find((entry) => entry.type === type);
  return { render, flush, grid: () => node('FlatList'), summary: () => text(tree), toolbar: () => node('Toolbar'), sheet: () => node('BottomSheet'), item: () => { const item = node('FlatList').props.renderItem({ item: node('FlatList').props.data[0] }); return item.type(item.props); }, setAuth: (id: string | null) => { auth = { ...auth, user: id ? { id } : null }; }, setAuthState: (id: string | null, loading: boolean, error: any = null) => { auth = { user: id ? { id } : null, loading, error }; }, queueUser: (value: any) => userResponses.push(value), queueOwnership: (value: any) => ownershipResponses.push(value), queueArtwork: (value: any) => artworkResponses.push(value), alerts: () => alerts, upserts: () => upserts, activities: () => activities, queueActivity: (value: any) => activityResponses.push(value) };
}

async function run() {
  // The complete Set Detail consumer paints facts promptly, names only the
  // pending exact-artwork state, then swaps in the matching artwork response.
  const lateArtwork = deferred<any>();
  const artwork = harness({ ...card, images: undefined } as any); artwork.queueArtwork(lateArtwork.promise);
  artwork.render(); await artwork.flush(); await artwork.flush();
  const pendingImage = walk(artwork.item()).find((node) => node.type === 'Image');
  assert.match(text(pendingImage?.props.fallback), /Loading artwork/, 'a factual card without an image reports pending artwork only while exact enrichment is open');
  lateArtwork.resolve([{ ...card, images: { small: 'recovered-exact.png' } }]); await artwork.flush(); await artwork.flush();
  const recoveredImage = walk(artwork.item()).find((node) => node.type === 'Image');
  assert.equal(recoveredImage?.props.uri, 'recovered-exact.png', 'the real Set Detail component replaces its pending placeholder with the exact enriched card image');

  const staleArtwork = deferred<any>();
  const staleArtworkScreen = harness({ ...card, images: undefined } as any); staleArtworkScreen.queueArtwork(staleArtwork.promise);
  staleArtworkScreen.render(); await staleArtworkScreen.flush();
  staleArtworkScreen.setAuth('B'); staleArtworkScreen.render(); await staleArtworkScreen.flush();
  staleArtwork.resolve([{ ...card, images: { small: 'old-account-artwork.png' } }]); await staleArtworkScreen.flush(); await staleArtworkScreen.flush();
  const staleImage = walk(staleArtworkScreen.item()).find((node) => node.type === 'Image');
  assert.notEqual(staleImage?.props.uri, 'old-account-artwork.png', 'late artwork from the earlier account generation cannot repaint the current Set Detail component');

  const h = harness(); h.render(); await h.flush(); await h.flush();
  assert.match(h.summary(), /1 catalogue entries owned/); assert.equal(h.grid().props.data.length, 1, `catalogue rows render independently of ownership; ${h.summary()}`);
  const aItem = h.item(); assert.match(text(aItem), /x\s*2/, 'actual CardItem renders A quantity');
  const touchActions = walk(aItem).filter((node) => node.type === 'TouchableOpacity' && typeof node.props.onPress === 'function'); const quantitySlice = touchActions[1]; assert.ok(quantitySlice, 'CardItem exposes its quantity touch action'); quantitySlice.props.onPress(); h.render(); assert.equal(h.sheet().props.visible, true, 'A quantity editor opens from CardItem');
  h.setAuth('B'); h.render(); // Explicitly before effect cleanup/load.
  assert.match(h.summary(), /Checking ownership/, 'B does not receive A summary before effects'); assert.equal(h.grid().props.data.length, 1, 'B still browses public catalogue'); assert.doesNotMatch(text(h.item()), /x\s*2/, 'B CardItem tree has no A quantity'); assert.equal(h.sheet().props.visible, false, 'B cannot inherit A quantity editor'); assert.equal(h.toolbar().props.choices.map((choice: any) => choice.label).join(','), 'All,Owned,Missing', 'real owned/missing toolbar consumer remains mounted');
  h.setAuth('A'); h.render(); assert.match(h.summary(), /Checking ownership/, 'A-to-B-to-A before effects must not re-expose the old A generation'); assert.doesNotMatch(text(h.item()), /x\s*2/, 'same-user ABA keeps the old tile quantity masked until the new generation resolves'); assert.equal(h.sheet().props.visible, false, 'same-user ABA keeps the old editor closed');
  h.setAuth('B'); h.render();
  await h.flush(); assert.match(h.summary(), /0 catalogue entries owned/, 'B valid empty read becomes an honest empty collection'); h.setAuth(null); h.render(); assert.match(h.summary(), /Sign in to track ownership/);

  // Public catalogue facts stay available while private auth is loading or has failed.
  const authPending = harness(); authPending.setAuthState('A', true); authPending.render(); await authPending.flush(); await authPending.flush(); assert.equal(authPending.grid().props.data.length, 1, 'initial auth loading does not block public set cards'); assert.match(authPending.summary(), /Checking ownership/);
  const authFailed = harness(); authFailed.setAuthState('A', false, new Error('auth unavailable')); authFailed.render(); await authFailed.flush(); await authFailed.flush(); assert.equal(authFailed.grid().props.data.length, 1, 'initial auth error does not block public set cards'); assert.doesNotMatch(text(authFailed.item()), /x\s*2/, 'auth error keeps private quantities masked');

  // A deferred variant read is ignored after its account is no longer current.
  const delayedVariant = deferred<any>(); const delayed = harness(); delayed.queueOwnership(delayedVariant.promise); delayed.render(); await delayed.flush();
  delayed.setAuth('B'); delayed.render(); delayedVariant.resolve({ data: [{ card_id: 'card-a', variant: 'normal', quantity: 9 }], error: null }); await delayed.flush();
  assert.doesNotMatch(text(delayed.item()), /x\s*9/, 'late A variant rows cannot paint B');

  // The old A request must never publish after A→B→A, even though the user id returns to A.
  const staleA = deferred<any>();
  h.setAuth('A'); h.queueUser(staleA.promise); h.render(); await h.flush();
  h.setAuth('B'); h.render(); await h.flush();
  h.setAuth('A'); h.queueOwnership({ data: [{ card_id: 'card-a', variant: 'normal', quantity: 3 }], error: null }); h.render(); await h.flush();
  assert.match(h.summary(), /1 catalogue entries owned/); assert.match(text(h.item()), /x\s*3/, 'only the current A generation publishes its ownership row');
  staleA.resolve({ data: { user: { id: 'A' } } }); await h.flush();
  assert.match(text(h.item()), /x\s*3/, 'a delayed earlier A response cannot repaint the later A generation');

  // A current ownership failure stays masked and has a real retry route; a valid empty retry is distinguishable from unknown.
  const failed = harness(); failed.queueOwnership({ data: null, error: { message: 'offline' } }); failed.render(); await failed.flush(); await failed.flush();
  assert.match(failed.summary(), /Could not check ownership/); const retry = walk((failed as any).render()).find((node) => node.type === 'Summary')?.props.action?.props.children?.[1]; assert.ok(retry, 'current ownership failure exposes a retry control');
  failed.queueOwnership({ data: [], error: null }); retry.props.onPress(); await failed.flush(); await failed.flush(); assert.match(failed.summary(), /0 catalogue entries owned/, 'a successful empty retry is not treated as an unknown ownership state');

  // A current failure remains visible and rolls its optimistic quantity back.
  const currentFailure = harness(); currentFailure.render(); await currentFailure.flush(); await currentFailure.flush(); currentFailure.queueOwnership({ data: null, error: new Error('current write failure') }); walk(currentFailure.item()).filter((node) => node.type === 'TouchableOpacity' && typeof node.props.onPress === 'function').at(-1)?.props.onPress(); await tick(); await tick(); currentFailure.render(); assert.equal(currentFailure.alerts().length, 1, 'current write failure alerts the initiating account'); assert.doesNotMatch(text(currentFailure.item()), /x\s*3/, 'current write failure rolls back its optimistic quantity');

  // An old write cannot roll back or alert after the account boundary moves.
  const write = harness(); write.render(); await write.flush(); await write.flush(); const pendingWrite = deferred<any>(); write.queueOwnership(pendingWrite.promise);
  const writeActions = walk(write.item()).filter((node) => node.type === 'TouchableOpacity' && typeof node.props.onPress === 'function'); writeActions.at(-1)?.props.onPress(); await tick(); assert.equal(write.upserts().length, 1, 'actual CardItem quick-add starts exactly one upsert before the account changes'); write.setAuth('B'); write.render(); pendingWrite.resolve({ data: null, error: new Error('late write failure') }); await tick(); await tick(); write.render();
  assert.doesNotMatch(text(write.item()), /x\s*3/, 'a late A write rollback cannot paint B'); assert.equal(write.alerts().length, 0, 'a late A write failure cannot alert B');

  // A current history write belongs to its initiating account, then becomes silent after ABA.
  const history = harness(); history.render(); await history.flush(); await history.flush(); const deferredHistory = deferred<any>(); history.queueOwnership({ data: null, error: null }); history.queueActivity(deferredHistory.promise); walk(history.item()).filter((node) => node.type === 'TouchableOpacity' && typeof node.props.onPress === 'function').at(-1)?.props.onPress(); await tick(); await tick(); assert.equal(history.activities().length, 1, 'current success starts one history activity'); assert.equal(history.activities()[0][1].expectedUserId, 'A', 'history is explicitly bound to the initiating account'); history.setAuth('B'); history.render(); history.setAuth('A'); history.render(); deferredHistory.reject(new Error('late history failure')); await tick(); await tick(); assert.equal(history.alerts().length, 0, 'late history failure after ABA cannot alert the later generation');

  // A stale successful write cannot create A activity after the account boundary.
  const staleSuccess = harness(); staleSuccess.render(); await staleSuccess.flush(); await staleSuccess.flush(); const oldSuccess = deferred<any>(); staleSuccess.queueOwnership(oldSuccess.promise); walk(staleSuccess.item()).filter((node) => node.type === 'TouchableOpacity' && typeof node.props.onPress === 'function').at(-1)?.props.onPress(); await tick(); staleSuccess.setAuth('B'); staleSuccess.render(); oldSuccess.resolve({ data: null, error: null }); await tick(); await tick(); assert.equal(staleSuccess.activities().length, 0, 'late old success does not post activity under a new account'); assert.equal(staleSuccess.alerts().length, 0, 'late old success does not alert a new account');

  // The generation-scoped lock permits B while A is pending, then keeps B locked when A settles.
  const locks = harness(); locks.render(); await locks.flush(); await locks.flush(); const oldLock = deferred<any>(); locks.queueOwnership(oldLock.promise); const quick = () => walk(locks.item()).filter((node) => node.type === 'TouchableOpacity' && typeof node.props.onPress === 'function').at(-1)?.props.onPress(); quick(); await tick(); assert.equal(locks.upserts().length, 1); const [aPayload, aOptions] = locks.upserts()[0]; assert.equal(aPayload.user_id, 'A'); assert.equal(aPayload.card_id, 'card-a'); assert.equal(aPayload.set_id, 'set-a'); assert.equal(aPayload.variant, 'normal'); assert.equal(aPayload.quantity, 3); assert.equal(aOptions.onConflict, 'user_id,card_id,set_id,variant', 'A upsert keeps exact owner/card/set/variant/quantity identity'); locks.setAuth('B'); locks.render(); await locks.flush(); const currentLock = deferred<any>(); locks.queueOwnership(currentLock.promise); quick(); await tick(); assert.equal(locks.upserts().length, 2, 'B starts its own same-key generation while A is pending'); oldLock.resolve({ data: null, error: null }); await tick(); quick(); await tick(); assert.equal(locks.upserts().length, 2, 'old finally cannot unlock B current-generation mutation'); currentLock.resolve({ data: null, error: null }); await tick(); await tick(); quick(); await tick(); assert.equal(locks.upserts().length, 3, 'current lock releases after its own settlement');
  console.log(JSON.stringify({ baseline, completeTsxConsumer: true, passed: ['A/B immediate and ABA privacy masking', 'public cards during auth pending/error', 'deferred user and variant reads current-only', 'unknown/failure retry versus explicit empty', 'current/stale write rollback and alerts', 'history expected-user and stale ABA suppression', 'generation-scoped same-key mutation lock', 'pending and exact artwork replacement, plus stale artwork suppression'] }, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
