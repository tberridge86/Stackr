import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const requests: { language: string; includeAssets: boolean; response: ReturnType<typeof deferred<any[]>> }[] = [];
const pushes: unknown[] = [];

function compile(dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, unknown> };
  const compiled = ts.transpileModule(readFileSync('app/(tabs)/explore.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  runInNewContext(compiled, { module, exports: module.exports, React, Promise, Map, Set, Array, String, Number, Boolean, Object, RegExp, console,
    require: (name: string) => { assert.ok(name in dependencies, `Explore unexpectedly imports ${name}`); return dependencies[name]; },
  });
  return module.exports.default as React.ComponentType;
}

const native = {
  View: 'View', TouchableOpacity: 'TouchableOpacity', RefreshControl: 'RefreshControl', Image: 'Image',
  FlatList: ({ data, renderItem, ...props }: any) => React.createElement('FlatList', props, data.map((item: any, index: number) => React.createElement(React.Fragment, { key: String(index) }, renderItem({ item, index })))),
};
const dependencies: Record<string, any> = {
  react: React, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router': { router: { push: (value: unknown) => pushes.push(value) }, useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]) },
  '@expo/vector-icons': { Ionicons: 'Ionicons' }, '../../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'Loading' }, '../../components/Text': { Text: 'Text' },
  '../../components/StackrBrowseControls': { StackrBrowseToolbar: 'Toolbar', StackrBrowseFilterSheet: 'FilterSheet', StackrBrowseFilterGroup: 'FilterGroup' }, '../../components/StackrNavigationIcon': { StackrNavigationIcon: 'NavIcon' },
  '../../lib/discoverSetGroups': { groupDiscoverSets: (sets: any[]) => { const groups = new Map<string, any[]>(); sets.forEach((set) => groups.set(set.series, [...(groups.get(set.series) ?? []), set])); return [...groups].map(([series, grouped]) => ({ series, sets: grouped })); }, isDiscoverDateGroup: () => false },
  '../../lib/pokemonTcg': { fetchAllSets: (options: any) => { const response = deferred<any[]>(); requests.push({ language: options.language, includeAssets: options.includeAssets !== false, response }); return response.promise; }, getPokemonSetVisualUrl: (set: any) => set.images?.logo ?? null, getPokemonSetLogoUrl: () => null, normalizePokemonCardLanguage: (language: string | null | undefined) => language ?? 'en' },
  '../../lib/localSetArtwork': { getLocalSetArtworkSourceForSet: () => null }, '../../lib/simplifiedChineseSetLogos': { getSimplifiedChineseSetLogoSourceForSet: () => null }, '../../components/StackrBackdrop': { StackrBackdrop: 'Backdrop' }, '../../components/StackrScreen': { StackrPageTitle: 'Title' },
  '../../lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }, '../../lib/stackrSizing': { stackrTabContentPadding: { standard: 0 } }, '../../components/theme-context': { useTheme: () => ({ theme: { colors: new Proxy({}, { get: () => '#112233' }) } }) }, '../../lib/pokemonSetSeries': { DEFAULT_EXPANDED_ENGLISH_SERIES: ['Fixture'] },
  '../../components/PokemonLanguageBadge': { POKEMON_CATALOGUE_LANGUAGE_OPTIONS: [{ key: 'en', label: 'English' }, { key: 'ja', label: 'Japanese' }, { key: 'zh-cn', label: 'Simplified Chinese' }, { key: 'zh-tw', label: 'Traditional Chinese' }, { key: 'ko', label: 'Korean' }], PokemonLanguageFlagIcon: 'Flag', getPokemonLanguageDescriptor: (language: string) => ({ label: language }) },
  '../../lib/pokemonDisplayNames': { getPreferredSetDisplayName: (input: any) => input.canonicalName, getEnglishSetDisplaySupplement: () => null, getEnglishSupplementalName: () => null },
};
const ExploreScreen = compile(dependencies);
function facts(language: string, suffix = '') { return [{ id: `${language}-fixture`, name: `${language} Set${suffix}`, series: 'Fixture', total: 1, printedTotal: 1, releaseDate: '2026-10-12', language, images: { logo: `https://facts/${language}${suffix}.png` } }]; }
function request(language: string, includeAssets: boolean, occurrence = 0) { const found = requests.filter((entry) => entry.language === language && entry.includeAssets === includeAssets)[occurrence]; assert.ok(found, `missing ${language} ${includeAssets ? 'asset' : 'facts'} request #${occurrence}`); return found!; }
function nodes(renderer: ReactTestRenderer, type: string) { return renderer.root.findAll((node) => node.type === type); }
function labels(renderer: ReactTestRenderer) { return nodes(renderer, 'TouchableOpacity').map((node) => node.props.accessibilityLabel).filter(Boolean); }
async function resolveFacts(occurrence: number) { await act(async () => { for (const language of ['en', 'ja', 'zh-cn', 'zh-tw', 'ko']) request(language, false, occurrence).response.resolve(facts(language, occurrence ? '-refresh' : '')); await tick(); }); }

async function run() {
  let renderer!: ReactTestRenderer; await act(async () => { renderer = create(React.createElement(ExploreScreen)); });
  assert.equal(requests.filter((entry) => !entry.includeAssets).length, 5, 'the complete screen starts a facts request per supported language');
  await act(async () => { request('en', false).response.resolve(facts('en')); await tick(); });
  assert.ok(labels(renderer).includes('Open set en Set'), 'actual Discover exposes useful facts while optional artwork is pending');
  assert.equal(requests.filter((entry) => entry.includeAssets).length, 1, 'only resolved facts begin optional artwork enrichment');
  await resolveFacts(0);
  assert.equal(requests.filter((entry) => entry.includeAssets).length, 1, 'all five language groups share one catalogue-wide artwork reader');
  assert.equal(request('all', true).language, 'all');
  for (const [language, label] of [['en', 'English'], ['ja', 'Japanese'], ['zh-cn', 'Simplified Chinese'], ['zh-tw', 'Traditional Chinese'], ['ko', 'Korean']]) {
    await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: `${label} sets` })[0].props.onPress(); });
    assert.ok(labels(renderer).includes(`Open set ${language} Set`), `${label} flag exposes its actual factual rows`);
    for (const other of ['en', 'ja', 'zh-cn', 'zh-tw', 'ko'].filter((value) => value !== language)) {
      assert.ok(!labels(renderer).includes(`Open set ${other} Set`), `${label} excludes ${other} rows`);
    }
  }
  const japanese = renderer.root.findAllByProps({ accessibilityLabel: 'Japanese sets' })[0]; await act(async () => { japanese.props.onPress(); });
  assert.ok(labels(renderer).includes('Open set ja Set'), 'flag selection exposes Japanese rows'); assert.ok(!labels(renderer).includes('Open set en Set'), 'flag selection excludes other languages');
  await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'Open set ja Set' })[0].props.onPress(); });
  assert.equal(JSON.stringify(pushes.at(-1)), JSON.stringify({ pathname: '/set/[id]', params: { id: 'ja-fixture', language: 'ja' } }), 'route preserves language identity');
  await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: 'All sets' })[0].props.onPress(); });
  const oldImage = nodes(renderer, 'Image').find((node) => node.props.source?.uri === 'https://facts/en.png'); assert.ok(oldImage, 'facts logo renders before late assets'); const oldError = oldImage!.props.onError;
  await act(async () => { nodes(renderer, 'FlatList')[0].props.refreshControl.props.onRefresh(); }); await resolveFacts(1);
  await act(async () => { request('all', true, 0).response.resolve([{ ...facts('en')[0], images: { logo: 'https://assets/old.png' } }]); await tick(); });
  assert.ok(nodes(renderer, 'Image').some((node) => node.props.source?.uri === 'https://facts/en-refresh.png'), 'late assets from an old request cannot replace refreshed facts');
  await act(async () => { oldError(); });
  assert.ok(nodes(renderer, 'Image').some((node) => node.props.source?.uri === 'https://facts/en-refresh.png'), 'a late old-URL error cannot hide the refreshed logo');
  await act(async () => { request('all', true, 1).response.resolve([
    { ...facts('en', '-refresh')[0], images: { logo: 'https://assets/new.png' } },
    { ...facts('zh-tw', '-refresh')[0], images: { symbol: 'https://assets/tc-symbol.png' } },
    { ...facts('en', '-refresh')[0], language: 'ja', images: { logo: 'https://assets/wrong-language.png' } },
  ]); await tick(); });
  assert.ok(nodes(renderer, 'Image').some((node) => node.props.source?.uri === 'https://facts/zh-tw-refresh.png'), 'missing enriched logo preserves the usable factual mark');
  assert.ok(!nodes(renderer, 'Image').some((node) => node.props.source?.uri === 'https://assets/wrong-language.png'), 'another language cannot replace a set’s mark');
  const refreshedImage = nodes(renderer, 'Image').find((node) => node.props.source?.uri === 'https://assets/new.png'); assert.ok(refreshedImage, 'exact current assets replace only their current facts row');
  await act(async () => { refreshedImage!.props.onError(); }); assert.ok(!nodes(renderer, 'Image').some((node) => node.props.source?.uri === 'https://assets/new.png'), 'current logo failure uses the honest fallback');
  await act(async () => { renderer.unmount(); });
  console.log('Explore complete screen runtime: facts-first visibility, language filtering and route identity, stale assets, and URL-scoped failures passed.');
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
