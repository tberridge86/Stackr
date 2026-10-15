import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { corocoroIssueEvidence } from '../lib/corocoroIssueArchive';
import { getMagazineOpening, MAGAZINE_OPENINGS } from '../lib/magazineOpenings';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const compile = (file: string, dependencies: Record<string, unknown>) => {
  const module = { exports: {} as Record<string, any> };
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, console, process,
    require: (name: string) => {
      if (/\.(png|jpg)$/.test(name)) return name;
      assert.ok(name in dependencies, `${file}: unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
};
const theme = { colors: { primary: '#6938F5', text: '#433650', textSoft: '#696373',
  surface: '#F2EFF7', card: '#FFFFFF', border: '#E4DEED' } };
const motionListeners = new Set<(value: boolean) => void>();
const appListeners = new Set<(value: string) => void>();
let reduced = false;
let preference = { loaded: true, reduced: false };
const animations: { options: any; finish: (finished?: boolean) => void }[] = [];
class Value {
  constructor(public value: number) {}
  setValue(value: number) { this.value = value; }
  stopAnimation() {}
  interpolate(config: unknown) { return config; }
}
const native = {
  View: 'View', Pressable: 'Pressable',
  Platform: { OS: 'ios' }, StyleSheet: { create: (styles: unknown) => styles },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => reduced,
    addEventListener: (_name: string, callback: (value: boolean) => void) => {
      motionListeners.add(callback); return { remove: () => motionListeners.delete(callback) };
    },
  },
  AppState: {
    currentState: 'active',
    addEventListener: (_name: string, callback: (value: string) => void) => {
      appListeners.add(callback); return { remove: () => appListeners.delete(callback) };
    },
  },
  Easing: { cubic: 'cubic', inOut: (value: unknown) => value },
  Animated: { Value, View: 'AnimatedView', timing: (_value: Value, options: unknown) => ({
    start: (callback: (event: { finished: boolean }) => void) => animations.push({ options,
      finish: (finished = true) => callback({ finished }) }),
  }) },
};
const mew = { id: 'ja:corocoro-shining-mew-2001', language: 'ja', name: 'Shining Mew', number: 'Unnumbered',
  set: { id: 'ja:corocoro-comic-may-2001-promo', name: 'CoroCoro Comic Promo (May 2001)' },
  images: { small: 'https://example.invalid/verified-test-mew.jpg' } };
let fetchResult: unknown = mew;
let fetches = 0;
const dependencies = {
  react: React, 'react-native': native,
  '../lib/cardMotionPreference': { useCardMotionPreference: () => preference },
  '../lib/curatedPokemonCatalogue': { getCuratedPokemonCardById: () => null },
  '../lib/magazineOpeningArtwork': { getMagazineOpeningArtwork: () => null, magazineOpeningCollectionCard: (cardOpening: string, card: unknown) => card },
  '../lib/magazineOpenings': { magazineOpeningAction: (kind: string) => kind === 'packet' ? 'Open paper packet' : 'Peel this card' },
  '../lib/pokemonTcg': { fetchCardById: async () => { fetches++; return fetchResult; } },
  './StackrControls': { StackrButton: 'StackrButton' }, './StackrImage': { StackrImage: 'StackrImage' },
  './Text': { Text: 'Text' }, './theme-context': { useTheme: () => ({ theme }) },
};
const Experience = compile('components/MagazineOpeningExperience.tsx', dependencies).MagazineOpeningExperience;
const button = (renderer: ReactTestRenderer, label: string) => renderer.root.findAllByProps({ label })[0];
const text = (renderer: ReactTestRenderer) => renderer.root.findAll(node => String(node.type) === 'Text')
  .flatMap(node => node.children.filter(child => typeof child === 'string')).join(' ');
const collectionActions = (renderer: ReactTestRenderer) => renderer.root.findAll(node => String(node.type) === 'CollectionAction');
const opening = MAGAZINE_OPENINGS.find(item => item.id === 'corocoro-2001-05')!;
const record = corocoroIssueEvidence.issues.find(item => item.id === opening.issueId)!;
const mount = async (profile = opening, references = record.cards) => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(Experience, {
    opening: profile, references, renderCollectionAction: (card: unknown) => React.createElement('CollectionAction', { card }),
  })); });
  return renderer;
};
const unmount = async (renderer: ReactTestRenderer) => { await act(async () => renderer.unmount()); };

async function run() {
  assert.equal(MAGAZINE_OPENINGS.length, 6);
  assert.equal(new Set(MAGAZINE_OPENINGS.map(item => item.id)).size, 6);
  for (const profile of MAGAZINE_OPENINGS) {
    assert.ok(profile.sources.length && profile.interpretation);
    profile.sources.forEach(url => assert.equal(new URL(url).protocol, 'https:'));
    if (!profile.issueId) continue;
    const original = corocoroIssueEvidence.issues.find(item => item.id === profile.issueId)!;
    assert.equal(getMagazineOpening(original)?.id, profile.id);
    assert.equal(getMagazineOpening({ ...original, distributionType: 'paid_applicant_order' }), null);
    assert.equal(getMagazineOpening({ ...original, confidence: 'conflicting' }), null);
    assert.equal(getMagazineOpening({ ...original, issueMonth: '2022-02' }), null);
    assert.equal(getMagazineOpening({ ...original, cards: [...original.cards].reverse() })?.id,
      original.cards.length === 1 ? profile.id : undefined);
  }
  const artworkModule = compile('lib/magazineOpeningArtwork.ts', {});
  const artwork = artworkModule.getMagazineOpeningArtwork;
  const withoutArtwork = { ...mew, images: {} };
  assert.match(artworkModule.magazineOpeningCollectionCard('corocoro-2001-05', withoutArtwork).images.large, /e5ugsqovgiiisj6o\/1600.jpg$/);
  assert.equal(artworkModule.magazineOpeningCollectionCard('corocoro-2001-05', mew), mew, 'Preserve an existing image');
  assert.equal(artworkModule.magazineOpeningCollectionCard('corocoro-1996-11', withoutArtwork), withoutArtwork);
  const artworkReceipt = JSON.parse(readFileSync('docs/releases/magazine-opening-artwork-20261015.json', 'utf8'));
  assert.equal(artworkReceipt.cards.length, 13);
  for (const profile of MAGAZINE_OPENINGS) {
    for (const name of profile.cards) {
      const file = artwork(profile.id, name).replace(/^\.\.\//, '');
      const source = artworkReceipt.cards.find((row: { file: string }) => row.file === file);
      assert.ok(source, `${profile.id}/${name} has a recorded source`);
      const bytes = readFileSync(file);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
      assert.equal(bytes.length, source.bytes);
      assert.equal(bytes.readUInt16BE(0), 0xffd8, 'The bundled source is a JPEG');
      assert.equal(source.generatedImage, false);
      assert.equal(source.physicalFinishVerified, false, 'A front illustration does not prove a physical finish');
    }
  }
  assert.equal(artwork('corocoro-1996-11', 'Shining Mew'), null);
  assert.equal(artwork('corocoro-2001-05', 'Mew'), null);
  const view = await mount();
  assert.equal(collectionActions(view).length, 0, 'No collection action before reveal');
  await act(async () => { button(view, 'Open paper packet').props.onPress(); button(view, 'Open paper packet').props.onPress(); });
  assert.equal(animations.length, 1, 'Double tap starts only one opening');
  assert.equal(animations[0].options.useNativeDriver, true);
  assert.equal(button(view, 'Open paper packet').props.disabled, true);
  await act(async () => button(view, 'Skip animation').props.onPress());
  assert.equal(collectionActions(view).length, 1);
  await act(async () => button(view, 'Replay opening').props.onPress());
  await act(async () => animations[0].finish());
  assert.equal(collectionActions(view).length, 0, 'Late completion cannot undo replay');
  await act(async () => button(view, 'Open paper packet').props.onPress());
  await act(async () => appListeners.forEach(callback => callback('background')));
  assert.ok(button(view, 'Replay opening'), 'Backgrounding settles the opening');
  await unmount(view);
  assert.equal(appListeners.size, 0);
  assert.equal(motionListeners.size, 0);

  reduced = true;
  const still = await mount();
  const before = animations.length;
  await act(async () => button(still, 'Open paper packet').props.onPress());
  assert.equal(animations.length, before, 'Reduced motion reveals without animation');
  assert.equal(collectionActions(still).length, 1);
  await unmount(still);
  reduced = false;

  preference = { loaded: false, reduced: false };
  const pending = await mount();
  await act(async () => button(pending, 'Open paper packet').props.onPress());
  assert.equal(animations.length, before, 'Unknown motion preference fails to still reveal');
  await unmount(pending);
  preference = { loaded: true, reduced: false };

  const pikachu = MAGAZINE_OPENINGS[0];
  const pikachuRecord = corocoroIssueEvidence.issues.find(item => item.id === pikachu.issueId)!;
  const beforeFetch = fetches;
  const sheet = await mount(pikachu, pikachuRecord.cards);
  await act(async () => sheet.root.findByProps({ accessibilityLabel: 'Choose Jigglypuff' }).props.onPress());
  await act(async () => button(sheet, 'Peel this card').props.onPress());
  await act(async () => animations[animations.length - 1].finish());
  assert.match(text(sheet), /Jigglypuff revealed/);
  assert.equal(collectionActions(sheet).length, 0, 'An unbound name cannot become ownership');
  assert.equal(fetches, beforeFetch, 'No species search or substitute-card retrieval');
  await unmount(sheet);

  fetchResult = { ...mew, language: 'en' };
  const wrongLanguage = await mount();
  await act(async () => button(wrongLanguage, 'Open paper packet').props.onPress());
  await act(async () => animations[animations.length - 1].finish());
  assert.equal(collectionActions(wrongLanguage).length, 0, 'Wrong-language response is rejected');
  assert.ok(button(wrongLanguage, 'Retry card artwork'));
  await unmount(wrongLanguage);
  fetchResult = mew;

  for (const profile of MAGAZINE_OPENINGS) {
    const references = corocoroIssueEvidence.issues.find(item => item.id === profile.issueId)?.cards
      ?? [{ name: 'Touch Change!', mappedStackrCardId: null } as any];
    const renderer = await mount(profile, references);
    await act(async () => button(renderer, profile.kind === 'packet' ? 'Open paper packet' : 'Peel this card').props.onPress());
    await act(async () => motionListeners.forEach(callback => callback(true)));
    assert.ok(button(renderer, 'Replay opening'), `${profile.id} can finish when motion is disabled mid-opening`);
    await unmount(renderer);
  }

  let user: { id: string } | null = { id: 'A' };
  let epoch = 1;
  let authResult: Promise<unknown> = Promise.resolve({ data: { user }, error: null });
  let draftCalls = 0;
  const navigations: any[] = [];
  const CollectionAction = compile('components/MagazineCollectionAction.tsx', {
    react: React, 'react-native': native, 'expo-router': { router: { push: (value: unknown) => navigations.push(value) } },
    '../lib/manualCollectionDraft': { createManualCollectionDraft: async (owner: string, card: unknown) => {
      draftCalls++; assert.equal(owner, 'A'); assert.equal((card as any).cardId, mew.id); return { id: 'draft-A' };
    } },
    '../lib/supabase': { supabase: { auth: { getUser: () => authResult } } },
    './auth-context': { useAuth: () => ({ user, cachedReadSession: { epoch } }) },
    './StackrControls': dependencies['./StackrControls'], './Text': dependencies['./Text'], './theme-context': dependencies['./theme-context'],
  }).MagazineCollectionAction;
  let collection!: ReactTestRenderer;
  await act(async () => { collection = create(React.createElement(CollectionAction, { card: mew })); });
  await act(async () => {
    button(collection, 'Add to collection').props.onPress();
    button(collection, 'Add to collection').props.onPress();
  });
  assert.equal(draftCalls, 1, 'Double tap creates one private review');
  assert.equal(navigations[0].pathname, '/collection/add-card');
  assert.equal(navigations[0].params.draftId, 'draft-A');

  let resolveAuth!: (value: unknown) => void;
  authResult = new Promise(resolve => { resolveAuth = resolve; });
  await act(async () => button(collection, 'Add to collection').props.onPress());
  user = { id: 'B' }; epoch++;
  await act(async () => collection.update(React.createElement(CollectionAction, { card: mew })));
  user = { id: 'A' }; epoch++;
  await act(async () => collection.update(React.createElement(CollectionAction, { card: mew })));
  await act(async () => resolveAuth({ data: { user: { id: 'A' } }, error: null }));
  assert.equal(draftCalls, 1, 'A→B→A cannot revive the old request');
  assert.equal(navigations.length, 1);
  authResult = Promise.resolve({ data: { user: null }, error: new Error('Offline') });
  await act(async () => button(collection, 'Add to collection').props.onPress());
  assert.match(text(collection), /Check your connection or sign in again/);
  assert.equal(draftCalls, 1, 'Auth failure does not write a review');
  user = null; epoch++;
  await act(async () => collection.update(React.createElement(CollectionAction, { card: mew })));
  await act(async () => button(collection, 'Add to collection').props.onPress());
  assert.equal(navigations[1], '/(auth)/login');
  assert.equal(draftCalls, 1);
  await unmount(collection);
  console.log('Magazine openings: six researched profiles; exact insert gates; selection, replay, skip, reduced motion, interruption, unmount, identity rejection, and account-safe collection-review handoff passed.');
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
