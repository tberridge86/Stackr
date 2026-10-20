import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { createAccountLoadGeneration } from '../lib/accountLoadGeneration';
import { getCorocoroIssueGroup, getCorocoroPublicationSummaries, getCorocoroIssuesForPublication, corocoroIssueEvidence,
  formatCorocoroIssueGroup, getCorocoroVerifiedPrinting, validateCorocoroVerifiedPrinting, getCorocoroVerifiedPrintingArtwork } from '../lib/corocoroIssueArchive';
import { getCuratedPokemonCardById } from '../lib/curatedPokemonCatalogue';
import type { PokemonCard } from '../lib/pokemonTcg';
import type { CorocoroIssueRecord } from '../lib/corocoroIssueArchive';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function compile(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  runInNewContext(source, { module, exports: module.exports, React, console, process, URL, Error, AbortController,
    require: (name: string) => { if (!(name in dependencies)) throw Error(`Missing dependency ${name}`); return dependencies[name]; } });
  return module.exports;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const mewId = 'ja:corocoro-shining-mew-2001';
const loadedMew = getCuratedPokemonCardById(mewId, 'ja');
assert(loadedMew?.set?.id);
const mew = { ...loadedMew, set: { ...loadedMew.set, id: loadedMew.set.id } };
const inventory: readonly CorocoroIssueRecord[] = corocoroIssueEvidence.issues;
const reference = inventory.flatMap(record => record.cards as CorocoroIssueRecord['cards'][number][]).find(card => card.mappedStackrCardId === mewId)!;
const calls: { table: string; filters: Record<string, unknown>; limit: number; mutation: boolean }[] = [];
let account = 'A';
let failRead = false;
let switchDuringRead = false;
let tooMany = false;
let wrongPrintingOnly = false;
const canonical = { ...mew, id: 'canonical-mew', set: { ...mew.set, id: 'canonical-set' }, raw_data: { stackr: { canonical: true, cardId: 'canonical-mew' } } };
const helperSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: account } }, error: null }) },
  from: (table: string) => {
    const call = { table, filters: {} as Record<string, unknown>, limit: 0, mutation: false };
    calls.push(call);
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { call.filters[key] = value; return query; },
      in: (key: string, value: unknown) => { call.filters[key] = value; return query; },
      gt: (key: string, value: unknown) => { call.filters[key] = value; return query; },
      limit: (value: number) => { call.limit = value; return query; },
      then: (yes: (result: unknown) => unknown, no: (error: unknown) => unknown) => {
        if (switchDuringRead) account = 'B';
        const rows = table === 'user_card_variants'
          ? [{ card_id: canonical.id, set_id: canonical.set.id, quantity: 2 }, { card_id: mewId, set_id: 'different-set', quantity: 1 }]
          : [{ card_id: mewId, set_id: mew.set.id, binder_id: 'binder-A', language: 'ja', owned_quantity: 1 }, { card_id: mewId, set_id: mew.set.id, binder_id: 'wrong-language-binder', language: 'en', owned_quantity: 1 }];
        const data = tooMany ? Array(501).fill(rows[0]) : wrongPrintingOnly
          ? [{ card_id: canonical.id, set_id: canonical.set.id, quantity: 1 }] : rows;
        return Promise.resolve({ data, error: failRead ? Error('offline') : null }).then(yes, no);
      },
    };
    return query;
  },
};
const helper = compile('lib/corocoroIssueCollection.ts', {
  './corocoroIssueArchive': { corocoroIssueEvidence }, './curatedPokemonCatalogue': { getCuratedPokemonCardById },
  './supabase': { supabase: helperSupabase },
});

async function testReader() {
  assert.equal(helper.getCorocoroCollectionCard({ ...reference, mappedStackrCardId: null }), null);
  assert.equal(helper.getCorocoroCollectionCard(reference, { ...mew, language: 'en' }), null);
  assert.equal(helper.getCorocoroCollectionCard(reference, { ...mew, id: 'other-card' }), null);
  assert.equal(helper.getCorocoroCollectionCard(reference, { ...mew, set: { ...mew.set, id: 'other-set' } }), null);
  assert.equal(helper.getCorocoroCollectionCard(reference, { ...mew, number: '151' }), null, 'Pokédex number cannot become printing identity');
  assert.equal(helper.getCorocoroCollectionCard(reference, canonical), null, 'A Japanese canonical flag and matching name cannot bind a different printing');
  const owned = await helper.fetchCorocoroOwnedCardKeys('A');
  assert(owned.has(mewId), 'Only the established exact Japanese printing counts toward its issue');
  const destinations = helper.getCorocoroCollectionDestinations(reference, owned);
  assert.equal(destinations.variants, false, 'A binder-only copy cannot imply removable set inventory');
  assert.deepEqual([...destinations.binderIds], ['binder-A']);
  assert(calls.every(call => !call.mutation && call.limit === 501), 'Browsing performs bounded reads only');
  assert(calls.every(call => call.filters[call.table === 'binder_cards' ? 'binders.user_id' : 'user_id'] === 'A'));
  assert(calls.every(call => (call.filters.card_id as string[]).length === 2));
  wrongPrintingOnly = true;
  assert.equal((await helper.fetchCorocoroOwnedCardKeys('A')).has(mewId), false, 'Unbound canonical inventory cannot complete the established printing');
  wrongPrintingOnly = false;
  const issue = getCorocoroIssueGroup('monthly:2001-05')!;
  const partial = [{ ...issue.records[0], cards: [reference, { ...reference, name: 'Pending card', mappedStackrCardId: null }] }];
  const progress = helper.getCorocoroIssueOwnership(partial, owned);
  assert.equal(progress.owned, 1); assert.equal(progress.total, 2); assert.equal(progress.pending, 1); assert.equal(progress.complete, false);
  assert.equal(helper.getCorocoroIssueOwnership(issue.records, null).owned, null, 'Failed/loading reads cannot show unowned');
  assert.equal(helper.getCorocoroIssueOwnership([{ ...issue.records[0], confidence: 'conflicting' }], owned).owned, 0);
  failRead = true;
  await assert.rejects(helper.fetchCorocoroOwnedCardKeys('A'), /offline/);
  failRead = false; tooMany = true;
  await assert.rejects(helper.fetchCorocoroOwnedCardKeys('A'), /exceed/);
  tooMany = false; switchDuringRead = true;
  await assert.rejects(helper.fetchCorocoroOwnedCardKeys('A'), /account changed/);
  switchDuringRead = false; account = 'A';
}

let userId: string | null = 'A';
let epoch = 1;
let focused = true;
let authLoading = false;
let readFailed = false;
let runtimeSource: 'binder' | 'variant' = 'binder';
let runtimeCard: PokemonCard = mew;
let cardPending: ReturnType<typeof deferred<PokemonCard | null>> | null = null;
let routeParams: { issue?: string } = { issue: 'monthly:2001-05' };
const pushes: any[] = [];
const reviews: { owner: string; card: any }[] = [];
const authPending: ReturnType<typeof deferred<any>>[] = [];
let draftPending: ReturnType<typeof deferred<any>> | null = null;
const useAuth = () => ({ user: userId ? { id: userId } : null, loading: authLoading, error: null, cachedReadSession: { epoch } });
const useFocusEffect = (callback: () => (() => void) | void) => React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
const runtimeSupabase = { auth: { getUser: () => authPending.shift()?.promise ?? Promise.resolve({ data: { user: userId ? { id: userId } : null }, error: null }) } };
const ownershipModule = compile('lib/pokedexOwnershipState.ts', {
  react: React, 'expo-router': { useFocusEffect }, '../components/auth-context': { useAuth },
  './accountLoadGeneration': { createAccountLoadGeneration }, './supabase': { supabase: runtimeSupabase },
});
const native = { Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value: unknown) => value } };
const Link = ({ children, href }: { children: React.ReactNode; href: unknown }) => React.createElement('Link' as React.ElementType, { href }, children);
const screen = compile('app/corocoro.tsx', {
  react: React, 'react-native': native,
  'expo-router': { Link, Stack: { Screen: 'StackScreen' }, router: { push: (value: unknown) => pushes.push(value) }, useLocalSearchParams: () => routeParams, useFocusEffect },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
  '../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'StackrLoadingIndicator' },
  '../components/CorocoroIssueCover': { CorocoroIssueCover: 'CorocoroIssueCover' },
  '../components/CorocoroIssueOpening': { CorocoroIssueOpening: 'CorocoroIssueOpening' },
  '../components/StackrImage': { StackrImage: 'StackrImage' }, '../components/Text': { Text: 'Text' },
  '../components/theme-context': { useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#6938F5' }) } }) },
  '../components/auth-context': { useAuth },
  '../lib/corocoroIssueArchive': { getCorocoroIssueGroup, getCorocoroPublicationSummaries, getCorocoroIssuesForPublication,
    formatCorocoroIssueGroup, getCorocoroVerifiedPrinting, validateCorocoroVerifiedPrinting, getCorocoroVerifiedPrintingArtwork },
  '../lib/curatedPokemonCatalogue': { getCuratedPokemonCardById },
  '../lib/pokemonTcg': { fetchCardById: (id: string) => id === mewId ? cardPending?.promise ?? Promise.resolve(runtimeCard) : Promise.resolve(getCuratedPokemonCardById(id, 'ja')) },
  '../lib/corocoroIssueCollection': { ...helper, fetchCorocoroOwnedCardKeys: async () => {
    if (readFailed) throw Error('offline');
    return userId === 'A' ? new Set([mewId, runtimeSource === 'binder' ? `binder:${mewId}:binder-A` : `variant:${mewId}`]) : new Set();
  } },
  '../lib/pokedexOwnershipState': ownershipModule,
  '../lib/manualCollectionDraft': { createManualCollectionDraft: (owner: string, card: PokemonCard) => {
    reviews.push({ owner, card });
    return draftPending?.promise ?? Promise.resolve({ id: 'private-review' });
  } },
  '../lib/supabase': { supabase: runtimeSupabase },
});

async function testScreen() {
  let renderer!: ReactTestRenderer;
  const update = async () => { await act(async () => renderer.update(React.createElement(screen.default))); };
  const add = () => renderer.root.findByProps({ accessibilityLabel: 'Add Shining Mew to collection' });
  const text = () => renderer.root.findAll(node => String(node.type) === 'Text').map(node => node.children.join('')).join(' ');
  await act(async () => { renderer = create(React.createElement(screen.default)); });
  assert.equal(pushes.length, 0); assert.equal(reviews.length, 0, 'Mounting/opening an issue never creates ownership or a review');
  assert.match(text(), /1 of 1 owned/);
  const binderLink = renderer.root.findByProps({ accessibilityLabel: 'Manage Shining Mew copies in binder 1' }).parent!;
  assert.equal(binderLink.props.href.pathname, '/binder/[id]'); assert.equal(binderLink.props.href.params.id, 'binder-A');
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'Manage set Shining Mew copies' }).length, 0);
  await act(async () => { add().props.onPress(); add().props.onPress(); });
  assert.equal(reviews.length, 1, 'Repeated add taps produce one existing private review');
  assert.equal(reviews[0].owner, 'A'); assert.equal(reviews[0].card.cardId, mewId); assert.equal(reviews[0].card.setId, mew.set.id);
  assert.equal(reviews[0].card.language, 'ja'); assert.equal(reviews[0].card.quantity, undefined);
  assert.equal(pushes[0].pathname, '/collection/add-card');

  const pendingAuth = deferred<any>(); authPending.push(pendingAuth);
  await act(async () => add().props.onPress());
  const before = pushes.length;
  userId = 'B'; epoch += 1; await update(); userId = 'A'; epoch += 1; await update();
  await act(async () => pendingAuth.resolve({ data: { user: { id: 'A' } }, error: null }));
  assert.equal(pushes.length, before, 'A→B→A invalidates a pending add verification');
  assert.equal(reviews.length, 1);

  draftPending = deferred<any>();
  await act(async () => add().props.onPress());
  focused = false; await update(); focused = true; await update();
  await act(async () => draftPending!.resolve({ id: 'late-review' }));
  assert.equal(pushes.length, before, 'Leaving and returning invalidates delayed review navigation');
  draftPending = deferred<any>();
  await act(async () => add().props.onPress());
  await act(async () => draftPending!.reject(Error('Review could not be saved')));
  assert.match(text(), /Review could not be saved/); assert.equal(pushes.length, before);
  draftPending = null;

  authLoading = true; await update();
  assert.equal(add().props.disabled, true, 'Account loading cannot create a review');
  authLoading = false; userId = 'B'; epoch += 1; await update();
  assert.match(text(), /0 of 1 owned/); assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'Manage Shining Mew copies in binder 1' }).length, 0);
  readFailed = true; focused = false; await update(); focused = true; await update();
  assert.equal(add().props.disabled, true, 'Read failure retains state and disables collection actions');
  assert.match(text(), /Could not refresh ownership/);
  await act(async () => renderer.unmount());
  readFailed = false; userId = 'A'; epoch += 1; runtimeSource = 'variant';
  await act(async () => { renderer = create(React.createElement(screen.default)); });
  const setLink = renderer.root.findByProps({ accessibilityLabel: 'Manage set Shining Mew copies' }).parent!;
  assert.equal(setLink.props.href.pathname, '/set/[id]'); assert.equal(setLink.props.href.params.id, mew.set.id);
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'Manage Shining Mew copies in binder 1' }).length, 0);
  await act(async () => renderer.unmount());
  runtimeCard = canonical;
  cardPending = deferred<PokemonCard | null>();
  await act(async () => { renderer = create(React.createElement(screen.default)); });
  assert.equal(add().props.disabled, true, 'The initial curated display cannot race an unfinished runtime identity lookup');
  await act(async () => cardPending!.resolve(canonical));
  cardPending = null;
  assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'Add Shining Mew to collection' }).length, 0);
  assert.match(text(), /Exact collection match pending/); assert.match(text(), /Issue completion remains unverified/);
  await act(async () => renderer.unmount());
}

async function main() {
  await testReader();
  await testScreen();
  console.log('CoroCoro collection: bounded exact owner reads, partial progress, existing private review, account/focus invalidation and failures passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
