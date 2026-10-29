import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as upcoming from '../lib/upcomingPokemonSets';

const { UPCOMING_POKEMON_SETS, selectUpcomingPokemonSets, upcomingPokemonSetStatus, isFuturePokemonSetRelease } = upcoming;
const beforeRelease = new Date('2026-11-05T23:59:59.999Z');
const onRelease = new Date('2026-11-06T00:00:00.000Z');
assert.equal(upcomingPokemonSetStatus('2026-11-06', beforeRelease), 'Coming soon');
assert.equal(upcomingPokemonSetStatus('2026-11-06', onRelease), 'Checklist pending');
assert.equal(upcomingPokemonSetStatus('2026-11-06', new Date('2026-11-07T12:00:00Z')), 'Checklist pending');
assert.equal(isFuturePokemonSetRelease('2026/11/06', beforeRelease), true, 'existing slash-formatted published dates work');
for (const invalid of [null, undefined, '', 'invalid', '2026-02-30', '2026-13-06', '2026-11-31', '2026-11-06T00:00:00Z']) {
  assert.equal(upcomingPokemonSetStatus(invalid, beforeRelease), 'Checklist pending', `invalid date ${invalid} cannot claim a future release`);
}
assert.equal(isFuturePokemonSetRelease('2026-11-06', new Date('invalid')), false);
assert.equal(isFuturePokemonSetRelease('2028-02-29', beforeRelease), true);
const [delta, gem] = UPCOMING_POKEMON_SETS;
assert.equal(UPCOMING_POKEMON_SETS.length, 2, 'only the two reviewed announcements are included');
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [] }), [delta, gem]);
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [], language: 'zh-cn' }), [gem]);
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [], language: 'ja' }), []);
for (const query of ['宝石包', '宝石包第七弹', 'Gem Pack Vol 7', 'Pokémon宝石包', 'VOL.７']) {
  assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [], query }), [gem], `native/alias query ${query}`);
}
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [], query: 'delta reign' }), [delta]);
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [], query: 'DLR', language: 'zh-cn' }), []);
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [], query: '不存在的系列' }), []);
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [{ id: gem.id, language: 'zh-cn' }] }), [delta], 'the actual canonical publication replaces its announcement');
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [{ id: gem.id, language: 'ja' }, { id: 'other', language: 'zh-cn' }] }), [delta, gem], 'language and canonical ID both have to match');
assert.deepEqual(selectUpcomingPokemonSets({ publishedSets: [], announcements: [delta, gem, { ...gem }] }), [delta, gem], 'exact duplicate announcements render once');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const facts = [
  // Synthetic publication fixture; this is not a claim about Delta's checklist.
  { ...delta, series: 'Fixture', total: 1, printedTotal: 1, images: {} },
  { id: '903d5baa-27c7-5690-b1d7-2395c770204a', name: 'ストームエメラルダ', language: 'ja', series: 'Fixture', releaseDate: '2026-07-31', total: 113, printedTotal: 76, images: {} },
];
const native = {
  View: 'View', TouchableOpacity: 'TouchableOpacity', Image: 'Image', RefreshControl: 'RefreshControl',
  FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: any) => React.createElement('FlatList', { ...props, data },
    data.length ? data.map((item: any, index: number) => React.createElement(React.Fragment, { key: String(index) }, renderItem({ item, index }))) : ListEmptyComponent),
};
const dependencies: Record<string, unknown> = {
  react: React, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': { router: { push: () => { throw new Error('An announcement must not navigate'); } }, useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]) },
  '@expo/vector-icons': { Ionicons: 'Ionicons' }, '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Loading' }, '../../components/Text': { Text: 'Text' },
  '../../components/StackrBrowseControls': { StackrBrowseToolbar: 'Toolbar', StackrBrowseFilterSheet: 'FilterSheet', StackrBrowseFilterGroup: 'FilterGroup' }, '../../components/StackrNavigationIcon': { StackrNavigationIcon: 'NavIcon' },
  '../../lib/upcomingPokemonSets': { ...upcoming, upcomingPokemonSetStatus: (date: string) => upcomingPokemonSetStatus(date, beforeRelease), isFuturePokemonSetRelease: (date: string) => isFuturePokemonSetRelease(date, beforeRelease) },
  '../../lib/discoverSetGroups': { groupDiscoverSets: (sets: unknown[]) => sets.length ? [{ series: 'Fixture', sets }] : [], isDiscoverDateGroup: () => false },
  '../../lib/pokemonTcg': { fetchAllSets: async ({ language, includeAssets }: any) => includeAssets ? [] : facts.filter((set) => set.language === language), getPokemonSetVisualUrl: () => null, getPokemonSetLogoUrl: () => null, normalizePokemonCardLanguage: (language: string) => language ?? 'en' },
  '../../lib/localSetArtwork': { getLocalSetArtworkSourceForSet: () => null }, '../../lib/simplifiedChineseSetLogos': { getSimplifiedChineseSetLogoSourceForSet: () => null }, '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' }, '../../components/StackrScreen': { StackrPageTitle: 'Title' },
  '../../lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }, '../../lib/stackrSizing': { stackrTabContentPadding: { standard: 0 } }, '../../components/theme-context': { useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#112233' }) } }) }, '../../lib/pokemonSetSeries': { DEFAULT_EXPANDED_ENGLISH_SERIES: ['Fixture'] },
  '../../components/PokemonLanguageBadge': { POKEMON_CATALOGUE_LANGUAGE_OPTIONS: [{ key: 'en', label: 'English' }, { key: 'ja', label: 'Japanese' }, { key: 'zh-cn', label: 'Simplified Chinese' }, { key: 'zh-tw', label: 'Traditional Chinese' }, { key: 'ko', label: 'Korean' }], PokemonLanguageFlagIcon: 'Flag', getPokemonLanguageDescriptor: (language: string) => ({ label: language }) },
  '../../lib/pokemonDisplayNames': { getPreferredSetDisplayName: (input: any) => input.canonicalName, getEnglishSetDisplaySupplement: () => null, getEnglishSupplementalName: () => null },
};
const module = { exports: {} as Record<string, unknown> };
runInNewContext(ts.transpileModule(readFileSync('app/(tabs)/explore.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, { module, exports: module.exports, console, require: (name: string) => {
  assert.ok(name in dependencies, `Unexpected Discover import ${name}`);
  return dependencies[name];
} });
const ExploreScreen = module.exports.default as React.ComponentType;
// The VM uses named host mocks, rather than React Native component functions.
const isMockHost = (node: { type: unknown }, name: string) => node.type === name;

async function run() {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(ExploreScreen)); await tick(); });
  const list = () => renderer.root.findByType('FlatList' as React.ElementType);
  const toolbar = () => renderer.root.findByType('Toolbar' as React.ElementType);
  const hasEmptyMessage = () => renderer.root.findAll((node) => isMockHost(node, 'Text') && node.props.children === 'No sets match your filters.').length > 0;
  const announcementRows = () => renderer.root.findAll((node) => isMockHost(node, 'View') && node.props.accessibilityLabel?.startsWith(gem.name));
  assert.equal(announcementRows().length, 1, 'the real screen shows the unpublished Chinese announcement');
  const announcement = announcementRows()[0];
  assert.equal(announcement.findAll((node) => isMockHost(node, 'TouchableOpacity') || Boolean(node.props.onPress)).length, 0, 'announcements have no set/binder actions');
  assert.equal(announcement.findAll((node) => isMockHost(node, 'Image')).length, 0, 'announcements do not invent artwork');
  assert.ok(!/\d+ cards/.test(announcement.findAll((node) => isMockHost(node, 'Text')).map((node) => node.props.children).join(' ')), 'announcements do not invent card counts');
  assert.equal(list().props.data.filter((row: any) => row.type === 'upcoming' && row.set.id === delta.id).length, 0, 'published canonical Delta replaces the announcement');
  const deltaCard = renderer.root.findAll((node) => isMockHost(node, 'TouchableOpacity') && node.props.accessibilityLabel === `Open set ${delta.name}`)[0];
  assert.ok(deltaCard.findAll((node) => isMockHost(node, 'Text') && node.props.children === 'Coming soon').length, 'future published sets retain a Coming soon tag');
  await act(async () => { toolbar().props.onSearchChange('宝石包'); });
  assert.equal(list().props.data.length, 1, 'native search returns the announcement rather than every published set');
  assert.match(toolbar().props.resultLabel, /0 sets · 1 announcement/);
  assert.equal(hasEmptyMessage(), false, 'an announcement result never shows the empty-state message');
  await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'English sets' })[0].props.onPress(); });
  assert.equal(list().props.data.length, 0, 'the language flag applies to announcement search results');
  assert.equal(hasEmptyMessage(), true);
  await act(async () => { toolbar().props.onSearchChange(''); });
  await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'Japanese sets' })[0].props.onPress(); });
  const storm = list().props.data.find((row: any) => row.type === 'set');
  assert.equal(storm.set.id, facts[1].id);
  assert.equal(storm.set.total, 113, 'Storm retains its published 113-card row');
  assert.equal(list().props.data.filter((row: any) => row.type === 'upcoming').length, 0);
  await act(async () => { renderer.unmount(); });
  console.log('Upcoming Pokémon sets: date boundaries, invalid dates, native search, language/identity deduplication, informational UI and published-set handoff passed.');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
