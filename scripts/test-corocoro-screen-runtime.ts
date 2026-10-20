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
  formatCorocoroIssueGroup,
  getCorocoroVerifiedPrinting,
  getCorocoroVerifiedPrintingArtwork,
  validateCorocoroVerifiedPrinting,
  type CorocoroIssueGroup,
} from '../lib/corocoroIssueArchive';
import type { PokemonCard } from '../lib/pokemonTcg';
import { getCorocoroIssueCoverPresentation } from '../lib/corocoroCoverReferences';
import { getMagazineSetCoverForSet } from '../lib/magazineSetCovers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
      if (/^\.\.\/assets\/Pokemon_Magazine_Cover_Art_PNGs\/CoroCoro Comic\//.test(name)
        || name === '../assets/magazine-covers/2023-11-corocoro-regular.jpg') {
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
  '../lib/corocoroIssueArchive': { formatCorocoroIssueGroup },
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
  '../lib/corocoroIssueArchive': { formatCorocoroIssueGroup },
  '../lib/corocoroCoverReferences': { getCorocoroIssueCoverPresentation },
  './StackrImage': { StackrImage: 'StackrImage' },
  './Text': { Text: 'Text' },
  '../lib/corocoroSuppliedCovers': { getCorocoroSuppliedCover },
}, { window: {} });
const NativeWindowCorocoroIssueCover = nativeWindowCoverModule.CorocoroIssueCover as typeof CorocoroIssueCover;

let routeParams: { publication?: string; issue?: string; q?: string } = {};
const pushes: unknown[] = [];
let readCard: (id: string) => Promise<PokemonCard | null> = async () => null;
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
    useFocusEffect: () => {},
  },
  'react-native': native,
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  '../components/StackrLoadingIndicator': { StackrLoadingIndicator: 'StackrLoadingIndicator' },
  '../components/CorocoroIssueCover': { CorocoroIssueCover },
  '../components/CorocoroIssueOpening': { CorocoroIssueOpening: 'CorocoroIssueOpening' },
  '../components/auth-context': { useAuth: () => ({ user: null, loading: false }) },
  '../components/StackrImage': { StackrImage: 'StackrImage' },
  '../components/Text': { Text: 'Text' },
  '../components/theme-context': { useTheme: () => ({ theme }) },
  '../lib/corocoroIssueArchive': {
    formatCorocoroIssueGroup,
    getCorocoroIssueGroup,
    getCorocoroIssuesForPublication,
    getCorocoroPublicationSummaries,
    getCorocoroVerifiedPrinting,
    getCorocoroVerifiedPrintingArtwork,
    validateCorocoroVerifiedPrinting,
  },
  '../lib/curatedPokemonCatalogue': { getCuratedPokemonCardById: () => null },
  '../lib/pokemonTcg': { fetchCardById: (id: string) => readCard(id) },
  '../lib/corocoroIssueCollection': {
    fetchCorocoroOwnedCardKeys: async () => new Set(), getCorocoroCollectionCard: () => null,
    getCorocoroCollectionDestinations: () => ({ binderIds: [], variants: false }),
    getCorocoroIssueOwnership: () => ({ total: 1, owned: null, pending: 0 }),
  },
  '../lib/pokedexOwnershipState': { usePokedexOwnership: () => ({ values: null, status: 'idle' }) },
  '../lib/manualCollectionDraft': { createManualCollectionDraft: () => { throw Error('Browsing cannot create a review'); } },
  '../lib/supabase': { supabase: {} },
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

  let combinedCover!: ReactTestRenderer;
  await act(async () => {
    combinedCover = create(React.createElement(CorocoroIssueCover, { issueGroup: getCorocoroIssueGroup('ichiban:2025-07')! }));
  });
  const combinedText = combinedCover.root.findAll(node => String(node.type) === 'Text').map(node => node.children.join(''));
  assert.ok(combinedText.includes('July / August'), 'The actual placeholder displays both printed months of the single combined issue');
  assert.ok(combinedText.includes('2025'));
  assert.ok(combinedText.includes('PLACEHOLDER · NO COVER'));
  assert.equal(countStackrImages(combinedCover), 0, 'An unapproved combined-issue cover source must remain a labelled placeholder');
  await act(async () => combinedCover.unmount());

  let novemberCover!: ReactTestRenderer;
  await act(async () => {
    novemberCover = create(React.createElement(CorocoroIssueCover, { issueGroup: getCorocoroIssueGroup('monthly:2023-11')! }));
  });
  assert.equal(countStackrImages(novemberCover), 1, 'The existing November issue selects its newly approved cover');
  const novemberImage = novemberCover.root.find(node => String(node.type) === 'StackrImage');
  assert.equal(novemberImage.props.source, 'asset:../assets/magazine-covers/2023-11-corocoro-regular.jpg');
  assert.equal(novemberImage.props.uri, undefined, 'The exact released cover remains available without a network image read');
  assert.ok(novemberCover.root.findAll(node => String(node.type) === 'Text').some(node => node.children.join('') === 'Issue cover'));
  await act(async () => novemberCover.unmount());

  const defaultRoute = await mount({});
  assert.equal(defaultRoute.root.findAllByType(CorocoroIssueCover).length, 3,
    'Discover opens a three-publication library, not the 34-issue grid');
  assert.equal(countStackrImages(defaultRoute), 1,
    'Only the Monthly featured issue has an exact supplied cover at the default route');
  assert.equal(pushes.length, 0, 'Mounting the library must not navigate away');

  const monthlyRoute = await mount({ publication: 'monthly' });
  assert.equal(getCorocoroIssuesForPublication('monthly').length, 34);
  assert.equal(monthlyRoute.root.findAllByType(CorocoroIssueCover).length, 34,
    'The monthly selection mounts each exact documented monthly issue once');
  assert.equal(countStackrImages(monthlyRoute), 27,
    'The 26 supplied covers and approved November2023 cover render; the remainder retain placeholders');

  const issueRoute = await mount({ issue: 'monthly:2001-05' });
  assert.equal(issueRoute.root.findAllByType(CorocoroIssueCover).length, 1,
    'An exact issue route mounts one issue cover without changing publication identity');
  assert.equal(issueRoute.root.findAllByProps({ accessibilityLabel: 'View Shining Mew card details' }).length, 1,
    'The exact mapped card pocket remains reachable after the issue route mounts');

  const pawmiRecord = getCorocoroIssueGroup('ichiban:2023-04')!.records[0];
  const pawmi = getCorocoroVerifiedPrinting(pawmiRecord.id, pawmiRecord.cards[0])!;
  const printingCard: PokemonCard = {
    id: pawmi.cardId, language: 'ja', name: 'Pawmi', localName: pawmi.nativeName,
    number: pawmi.collectorNumber, set: { id: pawmi.setId },
    images: { small: 'https://example.com/unbound-image.jpg' },
    raw_data: { set: { set_code: pawmi.setCode }, stackr: {
      cardId: pawmi.cardId, defaultVariantId: 'variant-pawmi', variants: [{
        variantId: 'variant-pawmi', variantCode: 'normal', finishCode: 'normal',
        image: { assetId: 'asset-pawmi', assetType: 'card_image', game: 'pokemon',
          cardId: pawmi.cardId, setId: pawmi.setId, variantId: 'variant-pawmi', permissionStatus: 'approved',
          deliveryUrl: 'https://example.com/approved-pawmi.jpg', derivatives: [] },
      }],
    } },
  };
  const image = (renderer: ReactTestRenderer) => renderer.root.findAll(node => String(node.type) === 'StackrImage').at(-1)!;
  const texts = (renderer: ReactTestRenderer) => renderer.root.findAll(node => String(node.type) === 'Text').map(node => node.children.join('')).join(' ');
  const hasPrintingLink = (renderer: ReactTestRenderer) => renderer.root.findAllByProps({ accessibilityLabel: 'View Pawmi exact printing' }).length;
  const assertNoCollectionAction = (renderer: ReactTestRenderer) => {
    assert.equal(renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string'
      && node.props.accessibilityLabel.startsWith('Add Pawmi')).length, 0);
    assert.match(texts(renderer), /Physical finish and edition unverified/);
  };

  let resolveCard!: (value: PokemonCard | null) => void;
  let cardReads = 0;
  readCard = () => { cardReads++; return new Promise(resolve => { resolveCard = resolve; }); };
  const checking = await mount({ issue: 'ichiban:2023-04' });
  assert.equal(hasPrintingLink(checking), 0, 'Printing navigation waits for every fetched identity field');
  assert.equal(image(checking).props.uri, undefined);
  await act(async () => resolveCard(printingCard));
  assert.equal(hasPrintingLink(checking), 1);
  assert.equal(image(checking).props.uri, 'https://example.com/approved-pawmi.jpg');
  assertNoCollectionAction(checking);
  assert.equal(cardReads, 1, 'Stable archive binding objects must not cause a fetch loop after verification');
  await act(async () => checking.unmount());

  readCard = async () => ({ ...printingCard, number: '999' });
  const wrongPrinting = await mount({ issue: 'ichiban:2023-04' });
  assert.equal(hasPrintingLink(wrongPrinting), 0, 'Wrong collector numbers leave artwork and navigation unavailable');
  assert.equal(image(wrongPrinting).props.uri, undefined);
  assert.match(texts(wrongPrinting), /Retry printing check/);
  await act(async () => wrongPrinting.unmount());

  readCard = async () => ({ ...printingCard, raw_data: { set: { set_code: pawmi.setCode } } });
  const noArtwork = await mount({ issue: 'ichiban:2023-04' });
  assert.equal(hasPrintingLink(noArtwork), 1, 'A verified printing remains navigable when approved artwork is missing');
  assert.equal(image(noArtwork).props.uri, undefined, 'An arbitrary image URL cannot bypass the bound API asset contract');
  assertNoCollectionAction(noArtwork);
  await act(async () => noArtwork.unmount());

  const selectedVariant = printingCard.raw_data.stackr.variants[0];
  readCard = async () => ({ ...printingCard, raw_data: { ...printingCard.raw_data, stackr: {
    ...printingCard.raw_data.stackr, variants: [{ ...selectedVariant,
      sameArtworkAsVariantId: 'shared-pawmi', nativeImageStatus: 'same_artwork_reference', imageVariantId: 'shared-pawmi',
      image: { ...selectedVariant.image, variantId: 'shared-pawmi' },
    }],
  } } });
  const sharedArtwork = await mount({ issue: 'ichiban:2023-04' });
  assert.equal(hasPrintingLink(sharedArtwork), 1);
  assert.match(texts(sharedArtwork), /Shared artwork reference · language or finish may differ/,
    'Approved shared artwork must remain labelled as a reference');
  assertNoCollectionAction(sharedArtwork);
  await act(async () => sharedArtwork.unmount());

  readCard = async () => { throw Error('offline'); };
  const offline = await mount({ issue: 'ichiban:2023-04' });
  assert.equal(hasPrintingLink(offline), 0);
  await act(async () => {
    readCard = async () => printingCard;
    offline.root.findAll(node => String(node.type) === 'Pressable').find(node => node.children.some(child =>
      typeof child === 'object' && child.children.includes('Retry printing check')))!.props.onPress();
  });
  assert.equal(hasPrintingLink(offline), 1, 'Retry rechecks the exact printing after an offline failure');
  await act(async () => offline.unmount());

  readCard = () => new Promise(resolve => { resolveCard = resolve; });
  const late = await mount({ issue: 'ichiban:2023-04' });
  routeParams = { issue: 'ichiban:2025-04' };
  await act(async () => late.update(React.createElement(CorocoroLibraryScreen)));
  await act(async () => resolveCard(printingCard));
  assert.equal(late.root.findAllByProps({ accessibilityLabel: "View Iono's Tadbulb exact printing" }).length, 0);
  assert.equal(hasPrintingLink(late), 0, 'A late response cannot carry a previous printing into the held Tadbulb issue');
  assert.equal(image(late).props.uri, undefined);
  await act(async () => late.unmount());

  console.log('CoroCoro screen runtime: 34 monthly issues, original Mew, strict printing navigation/artwork, finish holds, retry and late-response isolation passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
