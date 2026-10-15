import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import {
  getCorocoroIssueGroup,
  getCorocoroIssuesForPublication,
  getCorocoroPublicationSummaries,
  type CorocoroIssueGroup,
} from '../lib/corocoroIssueArchive';
import { getCorocoroIssueCoverPresentation } from '../lib/corocoroCoverReferences';
import { getMagazineSetCoverForSet } from '../lib/magazineSetCovers';

type ModuleBox = { exports: Record<string, unknown> };

function compileModule(
  path: string,
  dependencies: Record<string, unknown>,
  runtimeGlobals: Record<string, unknown> = {},
) {
  const module: ModuleBox = { exports: {} };
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    React,
    process,
    URL,
    console,
    __DEV__: false,
    ...runtimeGlobals,
    require: (name: string) => {
      if (/^\.\.\/assets\/Pokemon_Magazine_Cover_Art_PNGs\/CoroCoro Comic\//.test(name)) {
        return `asset:${name}`;
      }
      assert.ok(name in dependencies, `${path} unexpectedly imports ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}

const suppliedModule = compileModule('lib/corocoroSuppliedCovers.ts', {
  './magazineSetCovers': { getMagazineSetCoverForSet },
});
const getCorocoroSuppliedCover = suppliedModule.getCorocoroSuppliedCover as (id: string) => unknown;

const Link = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
const native = {
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    flatten: (styles: unknown) => Array.isArray(styles) ? Object.assign({}, ...styles.filter(Boolean)) : styles,
  },
  TextInput: 'TextInput',
  View: 'View',
};
const theme = {
  colors: new Proxy({}, { get: () => '#2E1065' }),
};
const coverModule = compileModule('components/CorocoroIssueCover.tsx', {
  react: React,
  'expo-router': { Link },
  'react-native': native,
  '../lib/corocoroIssueArchive': {},
  '../lib/corocoroCoverReferences': { getCorocoroIssueCoverPresentation },
  './StackrImage': { StackrImage: 'StackrImage' },
  './Text': { Text: 'Text' },
  '../lib/corocoroSuppliedCovers': { getCorocoroSuppliedCover },
});
const CorocoroIssueCover = coverModule.CorocoroIssueCover as React.ComponentType<{
  issueGroup: CorocoroIssueGroup;
  showSources?: boolean;
}>;
const nativeWindowCoverModule = compileModule('components/CorocoroIssueCover.tsx', {
  react: React,
  'expo-router': { Link },
  'react-native': native,
  '../lib/corocoroIssueArchive': {},
  '../lib/corocoroCoverReferences': { getCorocoroIssueCoverPresentation },
  './StackrImage': { StackrImage: 'StackrImage' },
  './Text': { Text: 'Text' },
  '../lib/corocoroSuppliedCovers': { getCorocoroSuppliedCover },
}, { window: {} });
const NativeWindowCorocoroIssueCover = nativeWindowCoverModule.CorocoroIssueCover as typeof CorocoroIssueCover;

let routeParams: { publication?: string; issue?: string; q?: string } = {};
const pushes: unknown[] = [];
const screenModule = compileModule('app/corocoro.tsx', {
  react: React,
  'expo-router': {
    Link,
    Stack: { Screen: 'StackScreen' },
    router: {
      canGoBack: () => true,
      back: () => pushes.push('back'),
      replace: (path: string) => pushes.push({ replace: path }),
    },
    useLocalSearchParams: () => routeParams,
  },
  'react-native': native,
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  '../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'StackrLoadingIndicator' },
  '../components/CorocoroIssueCover': { CorocoroIssueCover },
  '../components/StackrImage': { StackrImage: 'StackrImage' },
  '../components/Text': { Text: 'Text' },
  '../components/theme-context': { useTheme: () => ({ theme }) },
  '../lib/corocoroIssueArchive': {
    formatCorocoroIssueMonth: (month: string) => month,
    getCorocoroIssueGroup,
    getCorocoroIssuesForPublication,
    getCorocoroPublicationSummaries,
  },
  '../lib/curatedPokemonCatalogue': { getCuratedPokemonCardById: () => null },
  '../lib/pokemonTcg': { fetchCardById: async () => null },
});
const CorocoroLibraryScreen = screenModule.default as React.ComponentType;

async function mount(params: typeof routeParams) {
  routeParams = params;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(CorocoroLibraryScreen)); });
  return renderer;
}

function countStackrImages(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => String(node.type) === 'StackrImage').length;
}

async function run() {
  const nativeLikeWindowIssue = getCorocoroIssuesForPublication('monthly')[0];
  await act(async () => {
    create(React.createElement(NativeWindowCorocoroIssueCover, { issueGroup: nativeLikeWindowIssue }));
  });

  const defaultRoute = await mount({});
  assert.equal(defaultRoute.root.findAllByType(CorocoroIssueCover).length, 3,
    'Discover opens a three-publication library, not the 34-issue grid');
  assert.equal(countStackrImages(defaultRoute), 1,
    'Only the Monthly featured issue has an exact supplied cover at the default route');
  assert.equal(pushes.length, 0, 'Mounting the library must not navigate away');

  const monthlyRoute = await mount({ publication: 'monthly' });
  assert.equal(getCorocoroIssuesForPublication('monthly').length, 32);
  assert.equal(monthlyRoute.root.findAllByType(CorocoroIssueCover).length, 32,
    'The monthly selection mounts each exact documented monthly issue once');
  assert.equal(countStackrImages(monthlyRoute), 26,
    'Only the 26 exact supplied monthly covers are rendered; the remainder retain placeholders');

  const issueRoute = await mount({ issue: 'monthly:2001-05' });
  assert.equal(issueRoute.root.findAllByType(CorocoroIssueCover).length, 1,
    'An exact issue route mounts one issue cover without changing publication identity');
  assert.equal(issueRoute.root.findAllByProps({ accessibilityLabel: 'View Shining Mew card details' }).length, 1,
    'The exact mapped card pocket remains reachable after the issue route mounts');

  console.log('CoroCoro screen runtime: default publication library, 32-issue monthly grid, exact supplied-cover/placeholder bounds and detail route mount passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
