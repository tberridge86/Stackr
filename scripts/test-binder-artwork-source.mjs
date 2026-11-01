import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceRoot = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadModule(relative, dependencies) {
  const filename = relative === 'components/BinderArtwork.tsx' && process.argv[3]
    ? path.resolve(process.argv[3]) : path.join(sourceRoot, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const api = {};
  vm.runInNewContext(compiled, { exports: api, URL, process: { env: {} }, console,
    require: (name) => {
      if (name.endsWith('.png')) return name;
      assert.ok(name in dependencies, `Unexpected dependency ${name} in ${relative}`);
      return dependencies[name];
    },
  }, { filename });
  return api;
}

const local = { uri: 'bundled-reviewed-logo' };
const magazine = { uri: 'exact-magazine-cover' };
const japanese = loadModule('lib/japaneseSetLogos.ts', {});
const policy = loadModule('lib/providerSetMarkRuntimePolicy.ts', {});
const helpers = loadModule('lib/localSetArtwork.ts', {
  './englishSetLogos': { getEnglishSetLogoSourceForSet: (input) => input?.language === 'en' ? local : null },
  './japaneseSetLogos': japanese,
  './magazineSetCovers': { getMagazineSetCoverSourceForSet: (input) => input?.id === 'magazine' ? magazine : null },
  './simplifiedChineseSetLogos': { getSimplifiedChineseSetLogoSourceForSet: () => null },
  './traditionalChineseSetLogos': {
    getTraditionalChineseSetArtworkSourceForSet: (input) => input?.id === 'unpublished-tc' ? local : null,
    getTraditionalChineseSetLogoSourceForSet: () => null,
  },
  './providerSetMarkRuntimePolicy': policy,
});
const current = 'https://assets.stackrtcg.com/fixture/recorded/detail.webp';
const saved = 'https://fixture.invalid/previous-original.png';
const input = { id: 'ordinary', language: 'en' };
const select = helpers.getSetArtworkPresentation;
assert.equal(select(input, { publishedUrl: current, savedUrl: saved }).url, current);
assert.equal(select(input, { publishedUrl: current }).source, null);
assert.equal(select(input).source, local, 'missing canonical delivery retains bundled art');
assert.equal(select(input, { publishedUrl: current, failedUrl: current }).source, local);
assert.equal(select(input, { publishedUrl: current, failedUrl: saved }).url, current, 'late old error cannot hide current URL');
assert.equal(select(input, { publishedUrl: current, failedSource: local }).url, current);
assert.equal(select(input, { failedSource: local }).source, null, 'failed fallback yields honest absence');
assert.equal(select(input, { publishedUrl: 'https://assets.tcgdex.net/en/invalid/logo.webp', savedUrl: saved }).url,
  saved, 'denied provider pointer cannot suppress an allowed saved pointer');
assert.equal(select({ id: 'magazine', language: 'ja' }, { publishedUrl: current }).source, magazine);
assert.equal(select({ id: 'unpublished-tc', language: 'zh-tw' }).source, local);

for (const [id, code, name] of [
  ['e8e16a23-fc7a-4ec8-abfe-b74448fa5f27', 'l1b', 'SoulSilver Collection'],
  ['7dbeff79-cfb7-4ac8-8a4f-d7c73a523349', 'll', 'Lost Link'],
]) {
  const expected = japanese.getJapaneseSetLogoMatchForSet({ id: code, language: 'ja' }).source;
  for (const identity of [{ id, language: 'ja' }, { id: `jp:${id}` }, { id: `ja:${code}` }, { id: code.toUpperCase(), language: 'Japanese' }, { name, language: 'ja' }]) {
    assert.equal(select(identity, { publishedUrl: current, savedUrl: saved }).url, current,
      `published crop takes priority for ${JSON.stringify(identity)}`);
    assert.equal(select(identity, { publishedUrl: current }).source, null);
    assert.equal(select(identity).source, expected, 'exact reviewed crop remains available offline');
    assert.equal(select(identity, { publishedUrl: current, failedUrl: current }).source, expected,
      'failed published delivery recovers the exact reviewed crop');
  }
  assert.equal(select({ id, language: 'en' }, { publishedUrl: current }).url, current, 'Japanese fallback never overrides an English published logo');
  for (const unrelated of ['01234567-1234-4123-8123-0123456789ab', 'ja:01234567-1234-4123-8123-0123456789ab']) {
    const contradictory = { id: unrelated, language: 'ja', name, setCode: code };
    assert.equal(select(contradictory, { publishedUrl: current }).url,
      current, 'conflicting legacy name/code cannot override another exact canonical set');
    assert.equal(select(contradictory).source, null, 'an absent URL cannot turn stale metadata into another set crop');
    assert.equal(select(contradictory, { publishedUrl: current, failedUrl: current }).source, null,
      'a failed URL cannot turn stale metadata into another set crop');
    assert.equal(select(contradictory, { fallbackSource: expected }).source, null,
      'caller-supplied local logo cannot bypass the same exact-identity guard');
    assert.equal(select(contradictory, { fallbackSource: local }).source, local,
      'a separate custom fallback is retained');
  }
}

function renderer() {
  const states = [];
  let cursor = 0;
  const hooks = {
    useState: (initial) => {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (next) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
    },
    useMemo: (fn) => fn(), useEffect: () => {}, useRef: (initial) => ({ current: initial }),
  };
  const element = (type, props) => ({ type, props });
  const published = new Map([['ordinary', current], ['e8e16a23-fc7a-4ec8-abfe-b74448fa5f27', current]]);
  const reads = [];
  const component = loadModule('components/BinderArtwork.tsx', {
    react: { ...hooks, default: hooks },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': {
      View: 'View', Text: 'Text', Image: 'Image',
      Animated: { View: 'AnimatedView', Value: class { constructor(value) { this.value = value; } }, timing: () => ({ start() {} }) },
      StyleSheet: { create: (value) => value, absoluteFill: {} },
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    '../lib/binderCovers': { getBinderCover: (key) => key === 'custom' ? { image: 'custom-cover' } : null },
    '../lib/localSetArtwork': helpers,
    '../lib/providerSetMarkRuntimePolicy': policy,
    '../lib/magazineSetCovers': { getMagazineSetCoverForSet: ({ id }) => id === 'magazine' ? { source: magazine } : null },
    '../lib/pokemonTcg': { getPokemonSetLogoUrl: (id, language) => { reads.push({ id, language }); return published.get(id); } },
    '../lib/publishedSetLogoFallbacks': { getPublishedSetCoverFallback: () => undefined },
    '../lib/typography': { stackrFonts: {} },
    './StackrImage': { StackrImage: 'StackrImage' },
    './theme-context': { useTheme: () => ({ theme: { colors: { primary: '#123456' } } }) },
  });
  function render(props) {
    cursor = 0;
    const result = component.BinderArtwork(props);
    const images = [];
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (value.type === 'StackrImage' || value.type === 'Image') images.push(value.props);
      visit(value.props?.children);
    }
    visit(result);
    return images;
  }
  return { render, reads, published };
}

const view = renderer();
const props = { sourceSetId: 'ordinary', sourceSetLanguage: 'en', setName: 'Ordinary', fallbackLogoUrl: saved, fallbackLogoSource: local };
let images = view.render(props);
assert.equal(images[0].uri, current, 'actual binder renderer selects current canonical URL over bundled and saved');
const oldFailure = images[0].onError;
oldFailure();
images = view.render(props);
assert.equal(images[0].source, local, 'actual onError recovers the local exact mark');
const replacement = 'https://assets.stackrtcg.com/fixture/replacement/detail.webp';
view.published.set('ordinary', replacement);
assert.equal(view.render(props)[0].uri, replacement);
oldFailure();
assert.equal(view.render(props)[0].uri, replacement, 'late failure cannot poison replacement rendition');
assert.ok(view.reads.every((read) => read.id === 'ordinary' && read.language === 'en'));
assert.equal(renderer().render({ ...props, coverKey: 'custom' })[0].source, 'custom-cover');
assert.equal(renderer().render({ ...props, sourceSetId: 'magazine', sourceSetLanguage: 'ja' })[0].source, magazine);
assert.equal(renderer().render({ fallbackArtSource: 'custom-name-design' })[0].source, 'custom-name-design');
const crop = renderer().render({ sourceSetId: 'e8e16a23-fc7a-4ec8-abfe-b74448fa5f27', sourceSetLanguage: 'ja' });
assert.equal(crop[0].uri, current, 'published reviewed crop is selected by the actual binder renderer');
const recovery = renderer();
const cropProps = { sourceSetId: 'e8e16a23-fc7a-4ec8-abfe-b74448fa5f27', sourceSetLanguage: 'ja' };
recovery.render(cropProps)[0].onError();
assert.match(recovery.render(cropProps)[0].source, /l1b\.png$/, 'exact bundled crop recovers a delivery failure');
console.log('Binder source presentation passed: canonical/saved priority, published reviewed crops, exact local failure recovery, late-error isolation, unchanged custom/magazine roles.');
