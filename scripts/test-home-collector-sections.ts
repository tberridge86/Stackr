import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';

type Element = {
  type: string | ((props: Record<string, unknown>) => unknown);
  props: Record<string, unknown>;
};

const reactMock = {
  Fragment: 'Fragment',
  useState: <T,>(value: T) => [value, () => {}],
  useEffect: () => {},
  createElement(type: Element['type'], props: Record<string, unknown> | null, ...children: unknown[]): Element {
    return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } };
  },
};
const element = (type: string) => type;
const mocks: Record<string, unknown> = {
  react: { __esModule: true, default: reactMock },
  'react-native': {
    ActivityIndicator: element('ActivityIndicator'), Image: element('Image'), StyleSheet: { create: <T,>(value: T) => value },
    TouchableOpacity: element('TouchableOpacity'), View: element('View'),
    Modal: element('Modal'), ScrollView: element('ScrollView'),
    useWindowDimensions: () => ({ width: 393, height: 852 }),
  },
  '@expo/vector-icons': { Ionicons: element('Ionicons') },
  './BinderArtwork': { BinderArtwork: element('BinderArtwork') },
  './StackrImage': { StackrImage: element('StackrImage') },
  './Text': { Text: element('Text') },
  './BinderModeBadge': { BinderModeIconBadge: element('BinderModeIconBadge') },
  './StackrActionButton': { StackrActionButton: element('StackrActionButton') },
  './StackrEmboss': { StackrButtonPattern: element('StackrButtonPattern') },
  './StackrScreen': { StackrCardActionIcon: element('StackrCardActionIcon') },
  './RaritySymbol': { RaritySymbol: element('RaritySymbol'), RARITY_SYMBOL_CARD_OVERLAY: {} },
  'expo-linear-gradient': { LinearGradient: element('LinearGradient') },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) },
  '../lib/japaneseSetLogos': { getJapaneseSetLogoSourceForSet: () => null },
  '../lib/pokemonTcg': { getPokemonSetLogoUrl: () => null },
  '../lib/providerSetMarkRuntimePolicy': { enforceSetVisualRuntimePolicy: (value: string) => value },
  '../lib/customBinderNameArt': { getCustomBinderNameArt: () => null },
  '../lib/typography': { numericTextStyle: {}, tabularNumberStyle: {}, stackrFonts: {}, typeScale: {} },
  '../lib/theme': { stackrGradients: {} },
  './theme-context': { useTheme: () => ({ theme: { colors: { card: '#fff', border: '#ddd', text: '#111', textSoft: '#666', surface: '#f7f3ff' } } }) },
  '../lib/stackrIcons': { stackrIcons: { binders: 1, scanCard: 2 } },
};

function loadComponents(path: string): Record<string, (props: Record<string, unknown>) => unknown> {
  const componentPath = resolve(path);
  const compiled = transformSync(readFileSync(componentPath, 'utf8'), { loader: 'tsx', format: 'cjs', target: 'es2022' }).code;
  const originalLoad = (Module as unknown as { _load: Function })._load;
  (Module as unknown as { _load: Function })._load = function mockLoad(request: string, parent: unknown, isMain: boolean) {
    if (/\.png$/.test(request)) return 1;
    return request in mocks ? mocks[request] : originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loaded = new Module(componentPath);
    (loaded as unknown as { filename: string }).filename = componentPath;
    (loaded as unknown as { paths: string[] }).paths = (Module as unknown as { _nodeModulePaths(path: string): string[] })._nodeModulePaths(resolve('.'));
    (loaded as unknown as { _compile(code: string, filename: string): void })._compile(compiled, componentPath);
    return loaded.exports;
  } finally {
    (Module as unknown as { _load: Function })._load = originalLoad;
  }
}
const { HomeCollectionHero } = loadComponents('components/HomeCollectorSections.tsx');
const { HomeOpportunitiesSection, RecentActivitySection, ChaseCardsSheet } = loadComponents('components/HomeCommandCenter.tsx');

function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== 'object') return node;
  const value = node as Element;
  if (typeof value.type === 'function') return expand(value.type(value.props));
  return { ...value, props: { ...value.props, children: expand(value.props.children) } };
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (!node || typeof node !== 'object') return typeof node === 'string' ? node : '';
  return text((node as Element).props.children);
}

function findButton(node: unknown, label: string): Element | null {
  if (Array.isArray(node)) return node.map((item) => findButton(item, label)).find(Boolean) ?? null;
  if (!node || typeof node !== 'object') return null;
  const value = node as Element;
  if (value.props.accessibilityLabel === label) return value;
  return findButton(value.props.children, label);
}

const ownedCard = { cardId: 'owned-1', setId: 'set-1', name: 'Owned Japanese card', setName: 'Japanese set', imageUrl: 'https://local/owned.jpg' };
const missingCards = [1, 2, 3].map((number) => ({ ...ownedCard, cardId: `missing-${number}`, name: `Missing ${number}`, imageUrl: `https://local/missing-${number}.jpg` }));
const chaseCards = [1, 2, 3].map((number) => ({ ...ownedCard, cardId: `chase-${number}`, name: `Wish ${number}`, imageUrl: `https://local/wish-${number}.jpg` }));
const binder = {
  id: 'binder-1', name: 'Japanese 151', type: 'official' as const, coverKey: null, coverImageUrl: null, color: null,
  owned: 148, total: 151, missing: 3, duplicateCount: 0, value: 0, completionPercent: 98,
  masterSetEnabled: false, topValueCards: [{ ...ownedCard, estimatedValue: null }],
};
const baseProps = { isLoading: false, onRetry() {}, onOpenBinder() {}, onCreateBinder() {}, onCardPress() {} };
const render = (props: Record<string, unknown>) => expand(HomeCollectionHero(props));

const initialError = render({ ...baseProps, binder: null, missingCards: [], error: 'Offline' });
assert.match(text(initialError), /Collection unavailable/);
assert.doesNotMatch(text(initialError), /Start a binder/);

const cachedError = render({ ...baseProps, binder, missingCards, error: 'Offline' });
assert.match(text(cachedError), /3 cards to go/);
assert.match(text(cachedError), /Offline/);

const nearCompletion = render({ ...baseProps, binder, missingCards, chaseCards });
assert.match(text(nearCompletion), /Still to collect/);
assert.doesNotMatch(text(nearCompletion), /On your wish list/);

const completed = render({ ...baseProps, binder: { ...binder, owned: 151, missing: 0, completionPercent: 100 }, missingCards: [], chaseCards });
assert.match(text(completed), /Set complete/);
assert.match(text(completed), /From your binder/);
assert.match(text(completed), /Owned Japanese card/);
assert.doesNotMatch(text(completed), /On your wish list/);

const wishList = render({ ...baseProps, binder: { ...binder, missing: 12 }, missingCards: missingCards.map((card) => ({ ...card, imageUrl: null })), chaseCards });
assert.match(text(wishList), /On your wish list/);
assert.match(text(wishList), /Wish 1/);

let opened = 0;
let selected = '';
const interactive = render({ ...baseProps, binder, missingCards, onOpenBinder() { opened += 1; }, onCardPress(card: { cardId: string }) { selected = card.cardId; } });
const cardButton = findButton(interactive, 'View Missing 1');
assert.ok(cardButton, 'A collection card must remain directly tappable.');
(cardButton.props.onPress as () => void)();
assert.equal(selected, 'missing-1');
assert.equal(opened, 0, 'Tapping a card must not open the binder or mutate ownership.');

const foreignCard = { ...ownedCard, name: 'ナゾノクサ', englishName: 'Oddish', language: 'ja', number: '001', imageUrl: 'https://local/japanese-original.jpg' };
const foreignCardSnapshot = JSON.stringify(foreignCard);
const foreignRail = render({ ...baseProps, binder: { ...binder, missing: 12 }, missingCards: missingCards.map((card) => ({ ...card, imageUrl: null })), chaseCards: [foreignCard] });
assert.match(text(foreignRail), /Oddish/);
assert.match(text(foreignRail), /#001 · Japanese/);
assert.doesNotMatch(text(foreignRail), /ナゾノクサ|English: Oddish/);
assert.ok(findButton(foreignRail, 'View Oddish, Japanese'));
assert.equal(JSON.stringify(foreignCard), foreignCardSnapshot, 'English captions must not change the original card identity or image.');

const radarProps = {
  duplicateSummary: { count: 2, estimatedValue: 0, estimatedValueAvailable: false, items: [] },
  chaseCount: 1, hasCollectionMovement: true, movementSummary: 'Up £2.50 across comparable snapshots',
  isLoading: false, error: 'Chase refresh unavailable', onDuplicates() {}, onChase() {}, onMarketMovers() {},
};
const radar = expand(HomeOpportunitiesSection(radarProps));
assert.match(text(radar), /On your radar/);
assert.match(text(radar), /2 duplicate copies/);
assert.match(text(radar), /Price unavailable/);
assert.doesNotMatch(text(radar), /£0\.00|Sell, trade/);
assert.match(text(radar), /Up £2.50/);
assert.match(text(radar), /Chase refresh unavailable/);
const knownZero = expand(HomeOpportunitiesSection({ ...radarProps, duplicateSummary: { ...radarProps.duplicateSummary, estimatedValueAvailable: true } }));
assert.match(text(knownZero), /£0\.00/, 'A genuinely known zero retains candidate pricing semantics');

const activities = [1, 2, 3, 4].map((n) => ({ id: `activity-${n}`, title: `Collection update ${n}`, createdAt: '2026-09-06T12:00:00.000Z' }));
const recent = expand(RecentActivitySection({ items: activities, isLoading: false, openLayout: true, error: 'Offline', onRetry() {}, onItemPress() {} }));
assert.match(text(recent), /Collection update 3/);
assert.doesNotMatch(text(recent), /Collection update 4/);
assert.match(text(recent), /Show 1 more/);
assert.match(text(recent), /Showing saved activity. Offline/);
assert.ok(findButton(recent, 'Retry recent activity'));
assert.deepEqual(findButton(recent, 'Show 1 more recent activities')?.props.accessibilityState, { expanded: false });
const foreignActivity = expand(RecentActivitySection({ items: [{ ...activities[0], title: 'Added ナゾノクサ', cardName: 'ナゾノクサ', englishName: 'Oddish', language: 'ja' }], isLoading: false, onRetry() {}, onItemPress() {} }));
assert.match(text(foreignActivity), /Added Oddish/);
assert.doesNotMatch(text(foreignActivity), /ナゾノクサ/);

const chaseSheet = expand(ChaseCardsSheet({
  visible: true, items: [foreignCard], isLoading: false, selectedCardId: foreignCard.cardId,
  listings: [{ id: 'listing-1', askingPrice: 0, sellerDisplayName: 'Collector', condition: 'Near mint' }], listingsLoading: false,
  onClose() {}, onSelectCard() {}, onViewCard() {}, onViewListing() {}, onBrowseMarketplace() {}, onAddChase() {}, onRetryListings() {},
}));
assert.match(text(chaseSheet), /Oddish/);
assert.match(text(chaseSheet), /#001 · Japanese/);
assert.doesNotMatch(text(chaseSheet), /ナゾノクサ/);
assert.match(text(chaseSheet), /browse-only listing/);
assert.match(text(chaseSheet), /guide price £0\.00/);
assert.deepEqual(findButton(chaseSheet, 'Select Oddish, Japanese')?.props.accessibilityState, { selected: true });
assert.ok(findButton(chaseSheet, 'View selected chase card'));

const homeSource = readFileSync(resolve('features/home/HubScreen.tsx'), 'utf8');
assert.ok(homeSource.indexOf('<ValueTrackerCard') < homeSource.indexOf('<HomeCollectionHero'), 'Value summary must precede binder content.');
assert.equal(homeSource.match(/<ValueTrackerCard\b/g)?.length, 1, 'Home must have only one value summary.');

console.log('Home collector section component regressions passed.');
