import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { enforceSetVisualRuntimePolicy } from '../../lib/providerSetMarkRuntimePolicy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  type ImageSourcePropType,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { StackrCardActionIcon, StackrPageHeader, StackrScreen } from '../../components/StackrScreen';
import { StackrBottomSheet } from '../../components/StackrModalSystem';
import {
  RecentSearchPill,
  SearchCategoryChip,
  SearchCardRailItem,
  SearchCollectorRailItem,
  SearchListingRailItem,
  SearchProductRailItem,
  SearchRailSection,
  SearchSetRailItem,
} from '../../components/search/SearchResults';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { ScrollToEndButton } from '../../components/ScrollToEndButton';
import {
  getPokemonLanguageDescriptor,
  POKEMON_CATALOGUE_LANGUAGE_OPTIONS,
  PokemonLanguageFlagIcon,
  type PokemonCatalogueLanguageCode,
} from '../../components/PokemonLanguageBadge';
import { useTheme } from '../../components/theme-context';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { fetchOwnedCardRows } from '../../lib/ownership';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import {
  fetchCachedCardListingStats,
  fetchCachedProductListingStatsByName,
} from '../../lib/marketSearchDataCache';
import { correctPokemonNameQuery } from '../../lib/pokemonNameAutocorrect';
import {
  fetchAllSets,
  getPokemonSetLogoUrl,
  getPokemonSetSymbolUrl,
  getPokemonSetVisualUrl,
  normalizePokemonCardLanguage,
  type PokemonSet,
} from '../../lib/pokemonTcg';
import { getPreferredSetDisplayName } from '../../lib/pokemonDisplayNames';
import { searchMarketProducts, productLookupLabel, type MarketProduct, type ProductLookupType } from '../../lib/productSearch';
import { expandSearchQuery, normaliseSearchText } from '../../lib/searchNormalisation';
import {
  getListingCategories,
  getListingCategoryConfig,
  isListingCategoryKey,
  type ListingCategoryConfig,
  type ListingCategoryKey,
} from '../../lib/listingCategoryRegistry';
import {
  getProfileShowcaseSearchConfig,
  isProfileShowcaseSlot,
  setProfileShowcaseCard,
  type ProfileShowcaseSlot,
} from '../../lib/profileShowcase';
import { ROUTES } from '../../lib/routes';
import { searchIcons } from '../../lib/searchIcons';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { getIncrementalListWindow } from '../../lib/performance';
import { supabase } from '../../lib/supabase';
import { sanitizeGate0CommerceCopy } from '../../lib/gate0CommerceCopy';
import { sanitizeMarketplaceListingPresentationFields } from '../../lib/marketplacePresentation';

type SearchCategory = 'all' | 'cards' | 'sets' | 'sealed' | 'graded' | 'collectors' | ListingCategoryKey;
type SearchSortKey = 'relevance' | 'priceAsc' | 'priceDesc' | 'rarity' | 'set' | 'gradeDesc' | 'newest';
type SearchPriceBucket = 'all' | 'under10' | '10to50' | '50to100' | '100plus';
type SearchLanguageFilter = 'all' | PokemonCatalogueLanguageCode;

type CardResult = {
  id: string;
  name: string;
  setId: string | null;
  setName: string | null;
  language: string | null;
  number: string | null;
  rarity: string | null;
  imageUri: string | null;
  estimatedValue: number | null;
  listingCount: number;
  ownedQuantity: number;
  raw: any;
};

type SetResult = PokemonSet & {
  ownedCount?: number | null;
  completionPercent?: number | null;
};

type ListingResult = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUri: string | null;
  price: number | null;
  modeLabel: string;
  cardId?: string | null;
  setId?: string | null;
  productType?: string | null;
  gradeCompany?: string | null;
  grade?: string | null;
  condition?: string | null;
  createdAt?: string | null;
};

type CollectorResult = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type SearchResults = {
  cards: CardResult[];
  sets: SetResult[];
  sealed: MarketProduct[];
  graded: ListingResult[];
  listings: ListingResult[];
  collectors: CollectorResult[];
};

type SearchErrorState = Partial<Record<keyof SearchResults, string>>;
type PendingResult = { status: 'pending' };
type TimedSettled<T> = PromiseSettledResult<T> | PendingResult;

const LEGACY_RECENT_SEARCHES_KEY = '@stackr:search:recent-queries';
const RECENT_SEARCHES_KEY_PREFIX = '@stackr:search:recent-queries:v2:user';
const MAX_RECENT_SEARCHES = 8;

type VerifiedRecentSearchIdentity = {
  userId: string;
  generation: number;
};

type SearchCategoryConfig = {
  key: SearchCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  imageIcon?: ImageSourcePropType;
};

function getListingCategoryFallbackIcon(category: ListingCategoryConfig): keyof typeof Ionicons.glyphMap {
  if (category.key === 'raw_card') return searchIcons.cards;
  if (category.key === 'graded_slab') return searchIcons.graded;
  if (category.family === 'other') return searchIcons.search;
  return searchIcons.sealed;
}

const LISTING_CATEGORY_CHIPS: SearchCategoryConfig[] = getListingCategories().map((category) => ({
  key: category.key,
  label: category.title,
  icon: getListingCategoryFallbackIcon(category),
  imageIcon: category.asset,
}));

const CATEGORIES: SearchCategoryConfig[] = [
  { key: 'all', label: 'All', icon: searchIcons.search, imageIcon: getListingCategoryConfig('collection_bundle').asset },
  { key: 'sets', label: 'Sets', icon: searchIcons.sets, imageIcon: getListingCategoryConfig('booster_box').asset },
  ...LISTING_CATEGORY_CHIPS,
  { key: 'collectors', label: 'Collectors', icon: searchIcons.collectors },
];

const EMPTY_RESULTS: SearchResults = {
  cards: [],
  sets: [],
  sealed: [],
  graded: [],
  listings: [],
  collectors: [],
};

const SEARCH_FIRST_PAINT_BUDGET_MS = 420;

const SEARCH_SORT_OPTIONS: { key: SearchSortKey; label: string }[] = [
  { key: 'relevance', label: 'Most relevant' },
  { key: 'priceAsc', label: 'Price low to high' },
  { key: 'priceDesc', label: 'Price high to low' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'set', label: 'Set A-Z' },
  { key: 'gradeDesc', label: 'Grade high to low' },
  { key: 'newest', label: 'Recently listed' },
];

const SEARCH_PRICE_BUCKETS: { key: SearchPriceBucket; label: string }[] = [
  { key: 'all', label: 'Any price' },
  { key: 'under10', label: 'Under £10' },
  { key: '10to50', label: '£10-£50' },
  { key: '50to100', label: '£50-£100' },
  { key: '100plus', label: '£100+' },
];

const SEARCH_LANGUAGE_FILTERS: { key: SearchLanguageFilter; label: string; flagLanguage?: PokemonCatalogueLanguageCode }[] = [
  { key: 'all', label: 'Any language' },
  ...POKEMON_CATALOGUE_LANGUAGE_OPTIONS.map((option) => ({
    key: option.key,
    label: option.label,
    flagLanguage: option.key,
  })),
];

const SEARCH_GRADER_FILTERS = ['PSA', 'BGS', 'CGC', 'TAG', 'ACE'];
const SEARCH_GRADE_FILTERS = ['10', '9.5', '9', '8', '7 or lower'];
const SEARCH_FALLBACK_RARITIES = ['Common', 'Uncommon', 'Rare', 'Double Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare', 'Secret Rare', 'Promo'];

const RARITY_ORDER = [
  'common',
  'uncommon',
  'rare',
  'double rare',
  'triple rare',
  'ultra rare',
  'illustration rare',
  'special illustration rare',
  'secret rare',
  'hyper rare',
  'promo',
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settleWithin<T>(promise: Promise<T>, ms = SEARCH_FIRST_PAINT_BUDGET_MS): Promise<TimedSettled<T>> {
  return Promise.race([
    promise.then(
      (value): TimedSettled<T> => ({ status: 'fulfilled', value }),
      (reason): TimedSettled<T> => ({ status: 'rejected', reason })
    ),
    delay(ms).then((): TimedSettled<T> => ({ status: 'pending' })),
  ]);
}

function isFulfilled<T>(result: TimedSettled<T> | PromiseSettledResult<T>): result is PromiseFulfilledResult<T> {
  return result.status === 'fulfilled';
}

function isRejected<T>(result: TimedSettled<T> | PromiseSettledResult<T>): result is PromiseRejectedResult {
  return result.status === 'rejected';
}

function emptyListingStatsMap() {
  return new Map<string, { count: number; lowest: number | null }>();
}

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isSearchCategory(value: unknown): value is SearchCategory {
  return value === 'all'
    || value === 'cards'
    || value === 'sets'
    || value === 'sealed'
    || value === 'graded'
    || value === 'collectors'
    || isListingCategoryKey(value);
}

function isRawCardCategory(category: SearchCategory) {
  return category === 'cards' || category === 'raw_card';
}

function isGradedCategory(category: SearchCategory) {
  return category === 'graded' || category === 'graded_slab';
}

function isListingProductCategory(category: SearchCategory) {
  return isListingCategoryKey(category) && category !== 'raw_card' && category !== 'graded_slab';
}

function getSelectedCategoryConfig(category: SearchCategory) {
  return isListingCategoryKey(category) ? getListingCategoryConfig(category) : null;
}

function getCatalogueProductTypeFilter(category: SearchCategory): ProductLookupType | undefined {
  return getSelectedCategoryConfig(category)?.catalogueProductType;
}

function getListingProductTypeFilter(category: SearchCategory): string | undefined {
  if (!isListingProductCategory(category)) return undefined;
  const config = getListingCategoryConfig(category);
  return config.catalogueProductType ?? config.key;
}

function getSelectedCategoryTitle(category: SearchCategory) {
  return getSelectedCategoryConfig(category)?.title ?? null;
}

function normaliseFilterValue(value: string | number | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseLanguageCode(value: string | null | undefined) {
  const normalised = normaliseFilterValue(value);
  return getPokemonLanguageDescriptor(value)?.code ?? normalised;
}

function getRarityRank(rarity: string | null | undefined) {
  const value = normaliseFilterValue(rarity);
  const index = RARITY_ORDER.findIndex((item) => value.includes(item));
  return index === -1 ? 999 : index;
}

function compareRarityHighToLow(a: string | null | undefined, b: string | null | undefined) {
  const ar = getRarityRank(a);
  const br = getRarityRank(b);
  if (ar === 999 && br === 999) return 0;
  if (ar === 999) return 1;
  if (br === 999) return -1;
  return br - ar;
}

function getComparablePrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function priceMatchesBucket(value: number | null | undefined, bucket: SearchPriceBucket) {
  if (bucket === 'all') return true;
  const price = getComparablePrice(value);
  if (price == null) return false;
  if (bucket === 'under10') return price < 10;
  if (bucket === '10to50') return price >= 10 && price <= 50;
  if (bucket === '50to100') return price > 50 && price <= 100;
  return price > 100;
}

function parseGradeValue(value: string | number | null | undefined) {
  const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function gradeMatchesFilter(value: string | number | null | undefined, filter: string | null) {
  if (!filter) return true;
  const grade = parseGradeValue(value);
  if (filter === '7 or lower') return grade > 0 && grade <= 7;
  return normaliseFilterValue(value) === normaliseFilterValue(filter);
}

function getProductPrice(product: MarketProduct) {
  return getComparablePrice(product.latest_price?.average ?? product.latest_price?.tcgMarket ?? null);
}

function sortByNullablePrice<T>(items: T[], getPrice: (item: T) => number | null, direction: 'asc' | 'desc') {
  return [...items].sort((a, b) => {
    const av = getPrice(a);
    const bv = getPrice(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return direction === 'asc' ? av - bv : bv - av;
  });
}

function getBestCardValue(card: any): number | null {
  const prices = card?.raw_data?.tcgplayer?.prices ?? card?.tcgplayer?.prices ?? {};
  for (const key of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal']) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return value * USD_TO_GBP;
  }
  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return value * USD_TO_GBP;
  }
  const cardmarket = card?.raw_data?.cardmarket?.prices ?? card?.cardmarket?.prices;
  const euro = cardmarket?.trendPrice ?? cardmarket?.averageSellPrice ?? cardmarket?.avg30;
  return typeof euro === 'number' ? euro * EUR_TO_GBP : null;
}

function getCardSetName(card: any) {
  return getPreferredSetDisplayName({
    id: card?.set_id ?? card?.raw_data?.set?.id ?? card?.set?.id ?? null,
    sourceId: card?.raw_data?.set?.tcgdex_id ?? card?.raw_data?.set?.source_id ?? card?.raw_data?.source_id ?? card?.set_id ?? null,
    setCode: card?.raw_data?.set?.set_code ?? card?.raw_data?.set?.tcgdex_id ?? card?.raw_data?.set_code ?? card?.set_id ?? null,
    language: card?.language ?? card?.raw_data?.language ?? card?.raw_data?.set?.language ?? null,
    region: card?.region ?? card?.raw_data?.region ?? card?.raw_data?.set?.region ?? null,
    localName: card?.raw_data?.set?.local_name ?? card?.raw_data?.set?.name ?? null,
    englishDisplayName: card?.raw_data?.set?.english_display_name ?? card?.raw_data?.set?.englishDisplayName ?? null,
    canonicalName: card?.raw_data?.set?.name ?? card?.set?.name ?? card?.set_name ?? null,
    fallbackName: card?.set_name ?? card?.set_id ?? null,
    raw: card?.raw_data?.set ?? card?.raw_data,
  });
}

function getCardSetId(card: any) {
  return card?.set_id ?? card?.raw_data?.set?.id ?? card?.set?.id ?? null;
}

function mapCardResults(
  cards: any[],
  listingStats = emptyListingStatsMap(),
  ownedMap = new Map<string, number>()
): CardResult[] {
  return cards.map((card: any) => ({
    id: card.id,
    name: card.name ?? card.id,
    setId: getCardSetId(card),
    setName: getCardSetName(card),
    language: card.language ?? card.raw_data?.language ?? card.raw_data?.set?.language ?? null,
    number: card.number ?? card.raw_data?.number ?? null,
    rarity: card.rarity ?? card.raw_data?.rarity ?? null,
    imageUri: card.image_small ?? card.image_large ?? card.raw_data?.images?.small ?? null,
    estimatedValue: getBestCardValue(card),
    listingCount: listingStats.get(card.id)?.count ?? 0,
    ownedQuantity: ownedMap.get(card.id) ?? 0,
    raw: card,
  }));
}

function mapSetRow(row: any): SetResult {
  const raw = row.raw_data ?? {};
  const name = getPreferredSetDisplayName({
    id: row.id,
    sourceId: row.external_ids?.tcgdex ?? row.provider_id ?? row.id,
    setCode: row.external_ids?.setCode ?? row.id,
    language: row.language ?? raw.language ?? null,
    region: row.region ?? raw.region ?? null,
    localName: raw.local_name ?? raw.name ?? null,
    englishDisplayName: raw.english_display_name ?? raw.englishDisplayName ?? null,
    canonicalName: row.name,
    raw,
  });
  return {
    id: row.id,
    name,
    series: row.series ?? '',
    printedTotal: row.printed_total ?? 0,
    total: row.total ?? 0,
    releaseDate: row.release_date ?? '',
    language: row.language ?? 'en',
    region: row.region ?? null,
    externalIds: row.external_ids ?? {},
    images: {
      symbol: row.symbol_url ?? getPokemonSetSymbolUrl(row.id, row.language ?? raw.language),
      logo: row.logo_url ?? getPokemonSetLogoUrl(row.id, row.language ?? raw.language),
      cover: raw.cover_image_url ?? raw.images?.cover ?? raw.images?.artwork ?? undefined,
      artwork: raw.cover_image_url ?? raw.images?.artwork ?? raw.images?.cover ?? undefined,
    },
  };
}

async function searchSetsQuick(primary: string, terms: string[]) {
  const safePrimary = primary.trim();
  if (safePrimary.length < 2) return [];

  const mappedSets = await fetchAllSets({ language: 'all' }).catch(() => []);
  return mappedSets
    .map((set) => ({ set, score: rankSet(set, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.set);
}

function boundedSetEditDistance(a: string, b: string, maxDistance: number) {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function getSetSearchText(set: PokemonSet) {
  const raw = (set as any).raw_data ?? {};
  const preferredName = getPreferredSetDisplayName({
    id: set.id,
    sourceId: set.externalIds?.tcgdex ?? raw.source_id ?? raw.provider_id ?? set.id,
    setCode: set.externalIds?.setCode ?? raw.set_code ?? set.id,
    language: set.language ?? raw.language ?? null,
    region: set.region ?? raw.region ?? null,
    localName: set.localName ?? raw.local_name ?? raw.name ?? null,
    englishDisplayName: set.englishDisplayName ?? raw.english_display_name ?? raw.englishDisplayName ?? null,
    canonicalName: set.name,
    fallbackName: set.id,
    raw,
  });

  return normaliseSearchText([
    preferredName,
    set.name,
    set.localName,
    set.englishDisplayName,
    set.id,
    set.series,
    set.externalIds ? Object.values(set.externalIds).join(' ') : '',
    normalizePokemonCardLanguage(set.language) === 'ja' ? 'jp jpn japan japanese' : '',
    normalizePokemonCardLanguage(set.language) === 'zh-tw' ? 'zh zhtw zh tw chinese traditional taiwan tc' : '',
    set.releaseDate ? new Date(set.releaseDate).getFullYear().toString() : '',
  ].filter(Boolean).join(' '));
}

function fuzzySetWordScore(word: string, tokens: string[]) {
  if (!word) return 0;
  let best = 0;
  const fuzzyLimit = word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0;

  for (const token of tokens) {
    if (!token) continue;
    if (token === word) best = Math.max(best, 24);
    else if (token.startsWith(word) && word.length >= 2) best = Math.max(best, word.length >= 4 ? 18 : 13);
    else if (word.startsWith(token) && token.length >= 4) best = Math.max(best, 13);
    else if (token.includes(word) && word.length >= 3) best = Math.max(best, 12);
    else if (word.includes(token) && token.length >= 4) best = Math.max(best, 9);

    if (fuzzyLimit > 0 && boundedSetEditDistance(word, token, fuzzyLimit) <= fuzzyLimit) {
      best = Math.max(best, fuzzyLimit === 1 ? 17 : 12);
    }
  }

  return best;
}

function productTypeMatchesIntent(query: string) {
  const q = normaliseSearchText(query);
  return /\b(box|booster|bundle|etb|elite trainer|tin|blister|sleeved|sealed|collection|accessor|sleeve|binder|case)\b/.test(q);
}

function isGradedIntent(query: string) {
  const q = normaliseSearchText(query);
  return /\b(psa|bgs|beckett|cgc|ace|tag)\b/.test(q) || /\b10\b|\b9\.5\b|\b9\b/.test(q);
}

function rankSet(set: PokemonSet, terms: string[]) {
  const searchText = getSetSearchText(set);
  const name = normaliseSearchText(set.name);
  const id = normaliseSearchText(set.id);
  const series = normaliseSearchText(set.series);
  const tokens = searchText.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    const termWords = term.split(/\s+/).filter(Boolean);
    if (id === term) score += 100;
    if (name === term || searchText === term) score += 92;
    if (id.includes(term)) score += 42;
    if (name.includes(term) || searchText.includes(term)) score += 36;
    if (series.includes(term)) score += 12;
    if (termWords.length) {
      const wordScore = termWords.reduce((sum, word) => sum + fuzzySetWordScore(word, tokens), 0);
      const matchedWords = termWords.filter((word) => fuzzySetWordScore(word, tokens) > 0).length;
      if (matchedWords === termWords.length) score += 18 + wordScore;
      else if (termWords.length > 1 && matchedWords / termWords.length >= 0.66) score += 8 + wordScore;
    }
  }
  return score;
}

function getRecentSearchesKey(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error('A verified user is required for recent searches.');
  return `${RECENT_SEARCHES_KEY_PREFIX}:${encodeURIComponent(normalizedUserId)}`;
}

async function clearLegacyRecentSearches() {
  await AsyncStorage.removeItem(LEGACY_RECENT_SEARCHES_KEY);
}

async function loadRecentSearches(userId: string) {
  const [, raw] = await Promise.all([
    clearLegacyRecentSearches(),
    AsyncStorage.getItem(getRecentSearchesKey(userId)),
  ]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

async function saveRecentSearches(userId: string, searches: string[]) {
  await clearLegacyRecentSearches();
  await AsyncStorage.setItem(
    getRecentSearchesKey(userId),
    JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)),
  );
}

export default function GlobalSearchScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    q?: string;
    category?: string;
    profileShowcaseSlot?: string;
  }>();
  const paramQuery = getParamValue(params.q);
  const paramCategory = getParamValue(params.category);
  const paramShowcaseSlot = getParamValue(params.profileShowcaseSlot);
  const profileShowcaseSlot = isProfileShowcaseSlot(paramShowcaseSlot) ? paramShowcaseSlot : null;
  const showcaseConfig = profileShowcaseSlot ? getProfileShowcaseSearchConfig(profileShowcaseSlot) : null;
  const initialCategory = isSearchCategory(paramCategory)
    ? paramCategory
    : showcaseConfig?.category ?? 'all';
  const [query, setQuery] = useState(paramQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>(initialCategory);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchSort, setSearchSort] = useState<SearchSortKey>('relevance');
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedSetFilter, setSelectedSetFilter] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<SearchLanguageFilter>('all');
  const [selectedGrader, setSelectedGrader] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedPriceBucket, setSelectedPriceBucket] = useState<SearchPriceBucket>('all');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [, setErrors] = useState<SearchErrorState>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const searchResultWindow = useMemo(
    () => getIncrementalListWindow(1, { initialRows: 16, pageRows: 12, minInitial: 16, minPage: 12 }),
    []
  );
  const [focusedResultLimit, setFocusedResultLimit] = useState(searchResultWindow.initialCount);
  const searchListRef = useRef<FlatList<number>>(null);
  const requestRef = useRef(0);
  const lastParamSignatureRef = useRef('');
  const recentSearchMountedRef = useRef(true);
  const observedRecentSearchUserIdRef = useRef<string | null | undefined>(undefined);
  const recentSearchIdentityRef = useRef<VerifiedRecentSearchIdentity | null>(null);
  const recentSearchGenerationRef = useRef(0);

  const isCurrentRecentSearchIdentity = useCallback((identity: VerifiedRecentSearchIdentity) => (
    recentSearchMountedRef.current
    && recentSearchIdentityRef.current?.userId === identity.userId
    && recentSearchIdentityRef.current.generation === identity.generation
    && recentSearchGenerationRef.current === identity.generation
  ), []);

  const beginRecentSearchAuthBoundary = useCallback((userId: string | null) => {
    if (observedRecentSearchUserIdRef.current === userId) {
      return recentSearchGenerationRef.current;
    }

    observedRecentSearchUserIdRef.current = userId;
    recentSearchGenerationRef.current += 1;
    recentSearchIdentityRef.current = null;
    setRecentSearches([]);
    void clearLegacyRecentSearches().catch(() => {});
    return recentSearchGenerationRef.current;
  }, []);

  const invalidateRecentSearchIdentity = useCallback(() => {
    observedRecentSearchUserIdRef.current = null;
    recentSearchGenerationRef.current += 1;
    recentSearchIdentityRef.current = null;
    setRecentSearches([]);
    void clearLegacyRecentSearches().catch(() => {});
  }, []);

  const activateVerifiedRecentSearchIdentity = useCallback(async (
    userId: string,
    generation: number,
  ) => {
    if (
      !recentSearchMountedRef.current
      || recentSearchGenerationRef.current !== generation
      || observedRecentSearchUserIdRef.current !== userId
    ) return;

    const identity = { userId, generation };
    recentSearchIdentityRef.current = identity;
    try {
      const items = await loadRecentSearches(userId);
      if (isCurrentRecentSearchIdentity(identity)) setRecentSearches(items);
    } catch {
      if (isCurrentRecentSearchIdentity(identity)) setRecentSearches([]);
    }
  }, [isCurrentRecentSearchIdentity]);

  const verifyRecentSearchIdentity = useCallback(async (
    expectedUserId: string,
    generation: number,
  ) => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (
      !user
      || user.id !== expectedUserId
      || recentSearchGenerationRef.current !== generation
      || observedRecentSearchUserIdRef.current !== expectedUserId
    ) return null;
    return { userId: user.id, generation } satisfies VerifiedRecentSearchIdentity;
  }, []);

  const getVerifiedRecentSearchWriteIdentity = useCallback(async () => {
    const identity = recentSearchIdentityRef.current;
    if (!identity || !isCurrentRecentSearchIdentity(identity)) return null;
    const verified = await verifyRecentSearchIdentity(identity.userId, identity.generation);
    if (verified && isCurrentRecentSearchIdentity(verified)) return verified;
    if (isCurrentRecentSearchIdentity(identity)) invalidateRecentSearchIdentity();
    return null;
  }, [invalidateRecentSearchIdentity, isCurrentRecentSearchIdentity, verifyRecentSearchIdentity]);

  useEffect(() => {
    recentSearchMountedRef.current = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const candidateUserId = session?.user?.id ?? null;
      const generation = beginRecentSearchAuthBoundary(candidateUserId);
      if (!candidateUserId) return;
      setTimeout(() => {
        void verifyRecentSearchIdentity(candidateUserId, generation)
          .then((identity) => {
            if (identity) {
              void activateVerifiedRecentSearchIdentity(identity.userId, identity.generation);
            } else if (
              recentSearchGenerationRef.current === generation
              && observedRecentSearchUserIdRef.current === candidateUserId
            ) {
              invalidateRecentSearchIdentity();
            }
          })
          .catch(() => {
            if (
              recentSearchGenerationRef.current === generation
              && observedRecentSearchUserIdRef.current === candidateUserId
            ) invalidateRecentSearchIdentity();
          });
      }, 0);
    });

    const initialGeneration = recentSearchGenerationRef.current;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!recentSearchMountedRef.current) return;
      if (recentSearchGenerationRef.current !== initialGeneration) return;
      if (error) {
        invalidateRecentSearchIdentity();
        return;
      }
      const userId = data.user?.id ?? null;
      const generation = beginRecentSearchAuthBoundary(userId);
      if (userId) void activateVerifiedRecentSearchIdentity(userId, generation);
    });

    return () => {
      recentSearchMountedRef.current = false;
      recentSearchGenerationRef.current += 1;
      recentSearchIdentityRef.current = null;
      subscription.unsubscribe();
    };
  }, [
    activateVerifiedRecentSearchIdentity,
    beginRecentSearchAuthBoundary,
    invalidateRecentSearchIdentity,
    verifyRecentSearchIdentity,
  ]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const identity = recentSearchIdentityRef.current;
      if (identity) {
        loadRecentSearches(identity.userId).then((items) => {
          if (active && isCurrentRecentSearchIdentity(identity)) setRecentSearches(items);
        });
      } else {
        setRecentSearches([]);
      }
      return () => {
        active = false;
        requestRef.current += 1;
      };
    }, [isCurrentRecentSearchIdentity])
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 240);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const signature = `${profileShowcaseSlot ?? ''}|${paramCategory ?? ''}|${paramQuery ?? ''}`;
    if (signature === lastParamSignatureRef.current) return;
    lastParamSignatureRef.current = signature;

    if (profileShowcaseSlot) {
      setCategory(isSearchCategory(paramCategory) ? paramCategory : getProfileShowcaseSearchConfig(profileShowcaseSlot).category);
      setQuery(paramQuery ?? '');
      return;
    }

    if (isSearchCategory(paramCategory)) setCategory(paramCategory);
    if (paramQuery != null) setQuery(paramQuery);
  }, [paramCategory, paramQuery, profileShowcaseSlot]);

  const rememberSearch = useCallback(async (value?: string) => {
    const trimmed = (value ?? query).trim();
    if (trimmed.length < 2) return;
    const identity = await getVerifiedRecentSearchWriteIdentity();
    if (!identity) return;
    const current = await loadRecentSearches(identity.userId);
    if (!isCurrentRecentSearchIdentity(identity)) return;
    const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())]
      .slice(0, MAX_RECENT_SEARCHES);
    await saveRecentSearches(identity.userId, next);
    if (isCurrentRecentSearchIdentity(identity)) setRecentSearches(next);
  }, [getVerifiedRecentSearchWriteIdentity, isCurrentRecentSearchIdentity, query]);

  const removeRecentSearch = useCallback(async (value: string) => {
    const identity = await getVerifiedRecentSearchWriteIdentity();
    if (!identity) return;
    const current = await loadRecentSearches(identity.userId);
    if (!isCurrentRecentSearchIdentity(identity)) return;
    const next = current.filter((item) => item !== value);
    await saveRecentSearches(identity.userId, next);
    if (isCurrentRecentSearchIdentity(identity)) setRecentSearches(next);
  }, [getVerifiedRecentSearchWriteIdentity, isCurrentRecentSearchIdentity]);

  const clearRecentSearches = useCallback(async () => {
    const identity = await getVerifiedRecentSearchWriteIdentity();
    if (!identity) return;
    await saveRecentSearches(identity.userId, []);
    if (isCurrentRecentSearchIdentity(identity)) setRecentSearches([]);
  }, [getVerifiedRecentSearchWriteIdentity, isCurrentRecentSearchIdentity]);

  const runSearch = useCallback(async (searchText: string, force = false) => {
    const trimmed = searchText.trim();
    const requestId = ++requestRef.current;

    if (trimmed.length < 2) {
      setResults(EMPTY_RESULTS);
      setErrors({});
      setSuggestion(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(!force);
    setRefreshing(force);
    setErrors({});

    const startedAt = Date.now();
    const expandedQueries = expandSearchQuery(trimmed);
    const primary = expandedQueries[0] ?? trimmed;
    const normalisedTerms = expandedQueries.map(normaliseSearchText);
    const catalogueProductTypeFilter = getCatalogueProductTypeFilter(category);
    const listingProductTypeFilter = getListingProductTypeFilter(category);
    const shouldSearchProducts =
      category === 'all'
      || category === 'sealed'
      || Boolean(catalogueProductTypeFilter)
      || productTypeMatchesIntent(trimmed);
    const cardResultLimit = category === 'all' || isRawCardCategory(category) ? 120 : 48;

    const correctionPromise = correctPokemonNameQuery(trimmed, { allowIndex: false }).catch(() => null);
    const cardsPromise = searchLocalPokemonCards<any>(primary, {
      language: selectedLanguage,
      limit: cardResultLimit,
      select: 'id, name, set_id, language, number, rarity, image_small, image_large, raw_data',
      skipSetDetection: true,
      skipApiBackedSearch: true,
      skipIndexFallback: true,
      skipNameCorrection: true,
    });
    const setsPromise = searchSetsQuick(primary, normalisedTerms);
    const productsPromise = shouldSearchProducts
      ? searchMarketProducts(trimmed, catalogueProductTypeFilter, catalogueProductTypeFilter || productTypeMatchesIntent(trimmed) ? 24 : 10)
      : Promise.resolve([]);
    const profilesPromise: Promise<any> = Promise.resolve(supabase
      .from('profile_public_directory')
      .select('id, collector_name, avatar_url')
      .ilike('collector_name', `%${primary}%`)
      .limit(8));
    let listingsQuery = supabase
      .from('user_card_flags')
      .select('id, card_id, set_id, product_name, product_type, pricing_mode, grade_company, grade, asking_price, trade_only, listing_status, condition, listing_images, official_image_url, created_at')
      .eq('flag_type', 'trade')
      .or('listing_status.eq.active,listing_status.is.null')
      .or(`product_name.ilike.%${primary}%,card_id.ilike.%${primary}%,set_id.ilike.%${primary}%,product_type.ilike.%${primary}%,grade_company.ilike.%${primary}%,grade.ilike.%${primary}%,condition.ilike.%${primary}%`);

    if (listingProductTypeFilter) {
      listingsQuery = listingsQuery.eq('product_type', listingProductTypeFilter);
    }

    const listingsPromise: Promise<any> = Promise.resolve(listingsQuery.limit(18));

    const [correctionFirst, cardsFirst, setsFirst, productsFirst, profilesFirst, listingsFirst] = await Promise.all([
      settleWithin(correctionPromise, 180),
      settleWithin(cardsPromise),
      settleWithin(setsPromise),
      settleWithin(productsPromise, isListingProductCategory(category) || category === 'sealed' ? SEARCH_FIRST_PAINT_BUDGET_MS : 240),
      settleWithin(profilesPromise, category === 'collectors' ? SEARCH_FIRST_PAINT_BUDGET_MS : 240),
      settleWithin(listingsPromise, isGradedCategory(category) ? SEARCH_FIRST_PAINT_BUDGET_MS : 260),
    ]);

    if (requestId !== requestRef.current) return;

    const firstErrors: SearchErrorState = {};
    const firstResults: SearchResults = { ...EMPTY_RESULTS };

    if (isFulfilled(correctionFirst) && correctionFirst.value?.correctedQuery) {
      const corrected = correctionFirst.value.correctedQuery.trim();
      setSuggestion(corrected.toLowerCase() !== trimmed.toLowerCase() ? corrected : null);
    } else if (correctionFirst.status !== 'pending') {
      setSuggestion(null);
    }

    if (isFulfilled(cardsFirst)) {
      firstResults.cards = mapCardResults(cardsFirst.value ?? []);
    } else if (isRejected(cardsFirst)) {
      firstErrors.cards = 'Card results could not be loaded.';
    }

    if (isFulfilled(setsFirst)) {
      firstResults.sets = setsFirst.value;
    } else if (isRejected(setsFirst)) {
      firstErrors.sets = 'Set results could not be loaded.';
    }

    if (isFulfilled(productsFirst)) {
      firstResults.sealed = productsFirst.value;
    } else if (isRejected(productsFirst)) {
      firstErrors.sealed = 'Sealed product results could not be loaded.';
    }

    if (isFulfilled(profilesFirst) && !profilesFirst.value.error) {
      firstResults.collectors = (profilesFirst.value.data ?? []).map((profile: any) => ({
        id: profile.id,
        name: sanitizeGate0CommerceCopy(profile.collector_name ?? null, 'Collector') ?? 'Collector',
        avatarUrl: profile.avatar_url ?? null,
      }));
    } else if (isRejected(profilesFirst)) {
      firstErrors.collectors = 'Collector results could not be loaded.';
    }

    if (isFulfilled(listingsFirst) && !listingsFirst.value.error) {
      const listingRows = listingsFirst.value.data ?? [];
      firstResults.graded = listingRows
        .filter((listing: any) => listing.pricing_mode === 'graded' || listing.grade_company || listing.grade)
        .map(mapListingResult);
      firstResults.listings = listingRows
        .filter((listing: any) => !(listing.pricing_mode === 'graded' || listing.grade_company || listing.grade))
        .map(mapListingResult);
    } else if (isRejected(listingsFirst)) {
      firstErrors.listings = 'Market listings could not be loaded.';
    }

    const firstPhaseStillLoading = [
      correctionFirst,
      cardsFirst,
      setsFirst,
      productsFirst,
      profilesFirst,
      listingsFirst,
    ].some((result) => result.status === 'pending');

    setResults(firstResults);
    setErrors(firstErrors);
    setLoading(firstPhaseStillLoading);
    setRefreshing(false);

    console.log('Search first results rendered', {
      query: trimmed,
      elapsedMs: Date.now() - startedAt,
      cards: firstResults.cards.length,
      sets: firstResults.sets.length,
      listings: firstResults.listings.length + firstResults.graded.length,
    });

    const [correction, cardsResult, setsResult, productsResult, profilesResult, listingsResult] = await Promise.allSettled([
      correctionPromise,
      cardsPromise,
      setsPromise,
      productsPromise,
      profilesPromise,
      listingsPromise,
    ]);

    if (requestId !== requestRef.current) return;

    const nextErrors: SearchErrorState = {};
    const next: SearchResults = { ...EMPTY_RESULTS };

    if (correction.status === 'fulfilled' && correction.value?.correctedQuery) {
      const corrected = correction.value.correctedQuery.trim();
      setSuggestion(corrected.toLowerCase() !== trimmed.toLowerCase() ? corrected : null);
    } else {
      setSuggestion(null);
    }

    let cardsForHydration: any[] = [];
    if (cardsResult.status === 'fulfilled') {
      cardsForHydration = cardsResult.value ?? [];
      next.cards = mapCardResults(cardsForHydration);
    } else {
      nextErrors.cards = 'Card results could not be loaded.';
    }

    if (setsResult.status === 'fulfilled') {
      next.sets = setsResult.value;
    } else {
      nextErrors.sets = 'Set results could not be loaded.';
    }

    if (productsResult.status === 'fulfilled') {
      next.sealed = productsResult.value;
    } else {
      nextErrors.sealed = 'Sealed product results could not be loaded.';
    }

    if (profilesResult.status === 'fulfilled' && !profilesResult.value.error) {
      next.collectors = (profilesResult.value.data ?? []).map((profile: any) => ({
        id: profile.id,
        name: sanitizeGate0CommerceCopy(profile.collector_name ?? null, 'Collector') ?? 'Collector',
        avatarUrl: profile.avatar_url ?? null,
      }));
    } else {
      nextErrors.collectors = 'Collector results could not be loaded.';
    }

    if (listingsResult.status === 'fulfilled' && !listingsResult.value.error) {
      const listingRows = listingsResult.value.data ?? [];
      next.graded = listingRows
        .filter((listing: any) => listing.pricing_mode === 'graded' || listing.grade_company || listing.grade)
        .map(mapListingResult);
      next.listings = listingRows
        .filter((listing: any) => !(listing.pricing_mode === 'graded' || listing.grade_company || listing.grade))
        .map(mapListingResult);
    } else {
      nextErrors.listings = 'Market listings could not be loaded.';
    }

    setResults(next);
    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);

    if (cardsForHydration.length) {
      const cardIds = [...new Set(cardsForHydration.map((card: any) => card.id).filter(Boolean))];
      Promise.all([
        fetchCardListingStats(cardIds),
        fetchOwnedCardRows({ cardIds }).catch(() => []),
      ]).then(([listingStats, ownedRows]) => {
        if (requestId !== requestRef.current) return;
        const ownedMap = new Map<string, number>();
        ownedRows.forEach((row) => {
          ownedMap.set(row.card_id, (ownedMap.get(row.card_id) ?? 0) + Math.max(1, Number(row.quantity ?? 1) || 1));
        });
        setResults((current) => ({
          ...current,
          cards: mapCardResults(cardsForHydration, listingStats, ownedMap),
        }));
      }).catch(() => {});
    }

    if (productsResult.status === 'fulfilled' && productsResult.value.length) {
      fetchProductListingStats(productsResult.value).then((productListingStats) => {
        if (requestId !== requestRef.current) return;
        setResults((current) => ({
          ...current,
          sealed: productsResult.value.map((product) => ({
            ...product,
            latest_price: product.latest_price
              ? {
                  ...product.latest_price,
                  count: productListingStats.get(product.id)?.count ?? product.latest_price.count,
                }
              : product.latest_price,
          })),
        }));
      }).catch(() => {});
    }
  }, [category, selectedLanguage]);

  const saveCardToShowcase = useCallback(async (
    slot: ProfileShowcaseSlot,
    card: {
      id: string;
      setId?: string | null;
      name: string;
      setName?: string | null;
      number?: string | null;
      rarity?: string | null;
      imageUri?: string | null;
      estimatedValue?: number | null;
      showcaseKind?: 'card' | 'graded';
    }
  ) => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        Alert.alert('Sign in needed', 'Sign in to update your Profile showcase.');
        return;
      }

      await setProfileShowcaseCard(user.id, slot, {
        id: card.id,
        setId: card.setId ?? null,
        name: card.name,
        setName: card.setName ?? null,
        number: card.number ?? null,
        rarity: card.rarity ?? null,
        imageUri: card.imageUri ?? null,
        estimatedValueGbp: card.estimatedValue ?? null,
        showcaseKind: card.showcaseKind ?? (slot === 'slab' ? 'graded' : 'card'),
      });
      await rememberSearch(card.name);
      router.replace(ROUTES.profile as any);
    } catch (error: any) {
      Alert.alert('Could not update showcase', error?.message ?? 'Please try again.');
    }
  }, [rememberSearch]);

  const showShowcaseSelectionHint = useCallback(() => {
    Alert.alert(
      profileShowcaseSlot === 'slab' ? 'Choose a slab or card' : 'Choose a card',
      profileShowcaseSlot === 'slab'
        ? 'Select a graded listing or card result to add it to your Profile showcase.'
        : 'Select a card result to add it to your Profile showcase.'
    );
  }, [profileShowcaseSlot]);

  useEffect(() => {
    void runSearch(debouncedQuery);
  }, [debouncedQuery, runSearch]);

  const toggleRarityFilter = useCallback((rarity: string) => {
    setSelectedRarities((current) => (
      current.includes(rarity) ? current.filter((item) => item !== rarity) : [...current, rarity]
    ));
  }, []);

  const clearSearchFilters = useCallback(() => {
    setCategory('all');
    setSearchSort('relevance');
    setSelectedRarities([]);
    setSelectedSetFilter(null);
    setSelectedLanguage('all');
    setSelectedGrader(null);
    setSelectedGrade(null);
    setSelectedPriceBucket('all');
  }, []);

  const availableSetFilters = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    const addSet = (key: string | null | undefined, label: string | null | undefined) => {
      const resolvedKey = (key ?? label ?? '').trim();
      const resolvedLabel = (label ?? key ?? '').trim();
      if (!resolvedKey || !resolvedLabel) return;
      const normalised = normaliseFilterValue(resolvedKey);
      if (!map.has(normalised)) map.set(normalised, { key: resolvedKey, label: resolvedLabel });
    };

    results.cards.forEach((card) => addSet(card.setId, card.setName));
    results.sets.forEach((set) => addSet(set.id, set.name));
    results.sealed.forEach((product) => addSet(product.set_name, product.set_name));
    [...results.graded, ...results.listings].forEach((listing) => addSet(listing.setId, listing.setId));

    return [...map.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 18);
  }, [results]);

  const availableRarityFilters = useMemo(() => {
    const map = new Map<string, string>();
    [...SEARCH_FALLBACK_RARITIES, ...results.cards.map((card) => card.rarity).filter(Boolean) as string[]]
      .forEach((rarity) => {
        const key = normaliseFilterValue(rarity);
        if (key && !map.has(key)) map.set(key, rarity);
      });
    return [...map.values()].sort((a, b) => getRarityRank(a) - getRarityRank(b) || a.localeCompare(b));
  }, [results.cards]);

  const visibleResults = useMemo<SearchResults>(() => {
    const selectedSetKey = normaliseFilterValue(selectedSetFilter);
    const selectedRarityKeys = new Set(selectedRarities.map(normaliseFilterValue));
    const selectedGraderKey = normaliseFilterValue(selectedGrader);
    const rarityFilterActive = selectedRarityKeys.size > 0;
    const gradeFilterActive = Boolean(selectedGraderKey || selectedGrade);
    const priceFilterActive = selectedPriceBucket !== 'all';
    const itemFilterActive = Boolean(rarityFilterActive || gradeFilterActive || priceFilterActive || selectedSetKey || selectedLanguage !== 'all');
    const matchesSet = (...values: (string | null | undefined)[]) => (
      !selectedSetKey || values.some((value) => normaliseFilterValue(value) === selectedSetKey)
    );

    const cards = gradeFilterActive ? [] : results.cards.filter((card) => {
      if (selectedRarityKeys.size && !selectedRarityKeys.has(normaliseFilterValue(card.rarity))) return false;
      if (!matchesSet(card.setId, card.setName)) return false;
      if (selectedLanguage !== 'all' && normaliseLanguageCode(card.language) !== selectedLanguage) return false;
      if (!priceMatchesBucket(card.estimatedValue, selectedPriceBucket)) return false;
      return true;
    });

    const sets = (rarityFilterActive || gradeFilterActive || priceFilterActive) ? [] : results.sets.filter((set) => {
      if (!matchesSet(set.id, set.name)) return false;
      if (selectedLanguage !== 'all' && normaliseLanguageCode(set.language) !== selectedLanguage) return false;
      return true;
    });

    const sealed = (rarityFilterActive || gradeFilterActive) ? [] : results.sealed.filter((product) => {
      if (!matchesSet(product.set_name)) return false;
      if (selectedLanguage !== 'all' && normaliseLanguageCode(product.language) !== selectedLanguage) return false;
      if (!priceMatchesBucket(getProductPrice(product), selectedPriceBucket)) return false;
      return true;
    });

    const filterListing = (listing: ListingResult) => {
      if (!matchesSet(listing.setId, listing.subtitle)) return false;
      if (selectedGraderKey && normaliseFilterValue(listing.gradeCompany) !== selectedGraderKey) return false;
      if (!gradeMatchesFilter(listing.grade, selectedGrade)) return false;
      if (!priceMatchesBucket(listing.price, selectedPriceBucket)) return false;
      return true;
    };

    const next: SearchResults = {
      cards,
      sets,
      sealed,
      graded: results.graded.filter(filterListing),
      listings: results.listings.filter(filterListing),
      collectors: itemFilterActive ? [] : results.collectors,
    };

    if (searchSort === 'priceAsc' || searchSort === 'priceDesc') {
      const direction = searchSort === 'priceAsc' ? 'asc' : 'desc';
      next.cards = sortByNullablePrice(next.cards, (card) => card.estimatedValue, direction);
      next.sealed = sortByNullablePrice(next.sealed, getProductPrice, direction);
      next.graded = sortByNullablePrice(next.graded, (listing) => listing.price, direction);
      next.listings = sortByNullablePrice(next.listings, (listing) => listing.price, direction);
    } else if (searchSort === 'rarity') {
      next.cards = [...next.cards].sort((a, b) => compareRarityHighToLow(a.rarity, b.rarity) || a.name.localeCompare(b.name));
    } else if (searchSort === 'set') {
      next.cards = [...next.cards].sort((a, b) => (a.setName ?? a.setId ?? '').localeCompare(b.setName ?? b.setId ?? '') || (a.number ?? '').localeCompare(b.number ?? ''));
      next.sets = [...next.sets].sort((a, b) => a.name.localeCompare(b.name));
      next.sealed = [...next.sealed].sort((a, b) => (a.set_name ?? '').localeCompare(b.set_name ?? '') || a.name.localeCompare(b.name));
      next.graded = [...next.graded].sort((a, b) => (a.setId ?? a.subtitle ?? '').localeCompare(b.setId ?? b.subtitle ?? ''));
      next.listings = [...next.listings].sort((a, b) => (a.setId ?? a.subtitle ?? '').localeCompare(b.setId ?? b.subtitle ?? ''));
    } else if (searchSort === 'gradeDesc') {
      next.graded = [...next.graded].sort((a, b) => parseGradeValue(b.grade) - parseGradeValue(a.grade));
      next.listings = [...next.listings].sort((a, b) => parseGradeValue(b.grade) - parseGradeValue(a.grade));
    } else if (searchSort === 'newest') {
      next.sets = [...next.sets].sort((a, b) => new Date(b.releaseDate ?? 0).getTime() - new Date(a.releaseDate ?? 0).getTime());
      next.graded = [...next.graded].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      next.listings = [...next.listings].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    }

    return next;
  }, [results, searchSort, selectedGrade, selectedGrader, selectedLanguage, selectedPriceBucket, selectedRarities, selectedSetFilter]);

  const activeSearchFilterCount =
    Number(category !== 'all')
    + Number(searchSort !== 'relevance')
    + selectedRarities.length
    + Number(Boolean(selectedSetFilter))
    + Number(selectedLanguage !== 'all')
    + Number(Boolean(selectedGrader))
    + Number(Boolean(selectedGrade))
    + Number(selectedPriceBucket !== 'all');

  const filteredGroups = useMemo(() => {
    if (isRawCardCategory(category)) return ['cards', 'listings'] as const;
    if (category === 'sets') return ['sets'] as const;
    if (category === 'sealed') return ['sealed', 'listings'] as const;
    if (isGradedCategory(category)) return ['graded', 'cards'] as const;
    if (category === 'collectors') return ['collectors'] as const;
    if (isListingProductCategory(category)) return ['sealed', 'listings'] as const;
    if (isGradedIntent(debouncedQuery)) return ['graded', 'cards', 'listings', 'sealed', 'sets', 'collectors'] as const;
    if (productTypeMatchesIntent(debouncedQuery)) return ['sealed', 'listings', 'cards', 'sets', 'graded', 'collectors'] as const;
    if (/\d+\/\d+|#?\d+/.test(debouncedQuery)) return ['cards', 'graded', 'listings', 'sets', 'sealed', 'collectors'] as const;
    return ['cards', 'sets', 'sealed', 'graded', 'listings', 'collectors'] as const;
  }, [category, debouncedQuery]);

  const hasQuery = debouncedQuery.trim().length >= 2;
  const resultCount = Object.values(results).reduce((total, group) => total + group.length, 0);
  const visibleResultCount = Object.values(visibleResults).reduce((total, group) => total + group.length, 0);
  const currentSearchSortLabel = SEARCH_SORT_OPTIONS.find((option) => option.key === searchSort)?.label ?? 'Recommended';
  const searchResultSummary = loading
    ? (visibleResultCount > 0
        ? `${visibleResultCount} result${visibleResultCount === 1 ? '' : 's'} so far`
        : 'Searching...')
    : `${visibleResultCount} result${visibleResultCount === 1 ? '' : 's'}${resultCount !== visibleResultCount ? ` from ${resultCount}` : ''}`;
  const isFocusedSearchGroup = useCallback((group: keyof SearchResults) => {
    if (group === 'cards') return isRawCardCategory(category);
    if (group === 'sets') return category === 'sets';
    if (group === 'sealed') return category === 'sealed' || isListingProductCategory(category);
    if (group === 'graded') return isGradedCategory(category);
    if (group === 'collectors') return category === 'collectors';
    return false;
  }, [category]);

  useEffect(() => {
    setFocusedResultLimit(searchResultWindow.initialCount);
  }, [activeSearchFilterCount, category, debouncedQuery, visibleResultCount, searchResultWindow.initialCount]);

  const hasMoreFocusedResults = false;

  const renderMoreFocusedResults = useCallback(() => {
    setFocusedResultLimit((current) => current + searchResultWindow.pageSize);
  }, [searchResultWindow.pageSize]);
  const scrollSearchToEnd = useCallback(() => {
    const largestFocusedGroup = filteredGroups.reduce((largest, group) => {
      if (!isFocusedSearchGroup(group)) return largest;
      return Math.max(largest, visibleResults[group].length);
    }, searchResultWindow.initialCount);
    setFocusedResultLimit(largestFocusedGroup);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => searchListRef.current?.scrollToEnd({ animated: true }));
    });
  }, [filteredGroups, isFocusedSearchGroup, visibleResults, searchResultWindow.initialCount]);
  const showSearchEndButton = false;

  const renderContent = () => {
    if (!hasQuery) {
      return (
        <View style={{ gap: 18 }}>
          <SearchEmpty
            icon={searchIcons.search}
            imageIcon={stackrIcons.searchCard}
            title="Search your collecting world"
            body="Find cards, sets, sealed products and Market listings."
          />
          {recentSearches.length > 0 ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }}>Recent searches</Text>
                <TouchableOpacity onPress={clearRecentSearches}>
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>Clear all</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recentSearches.map((item) => (
                  <RecentSearchPill
                    key={item}
                    label={item}
                    onPress={() => setQuery(item)}
                    onRemove={() => removeRecentSearch(item)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      );
    }

    if (loading && visibleResultCount === 0) {
      return <SearchLoading query={debouncedQuery} />;
    }

    if (visibleResultCount === 0) {
      return (
        <SearchEmpty
          icon={searchIcons.search}
          imageIcon={stackrIcons.searchCard}
          title="No matches found"
          body={resultCount > 0 ? 'Try clearing filters or widening your sort options.' : 'Check the spelling, try fewer words, or remove category filters.'}
          actionLabel={activeSearchFilterCount > 0 ? 'Clear filters' : 'Clear search'}
          onAction={activeSearchFilterCount > 0 ? clearSearchFilters : () => setQuery('')}
        />
      );
    }

    return (
      <View>
        {loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 2 }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 15, fontWeight: '800' }}>
              Loading more results...
            </Text>
          </View>
        ) : null}

        {filteredGroups.map((group) => renderGroup(group))}
      </View>
    );
  };

  const renderGroup = (group: keyof SearchResults) => {
    if (group === 'cards' && visibleResults.cards.length) {
      return (
        <SearchRailSection key="cards" title="Cards" count={visibleResults.cards.length}>
          {visibleResults.cards.map((card) => (
            <SearchCardRailItem
              key={card.id}
              name={card.name}
              imageUri={card.imageUri}
              setName={card.setName}
              setLogoUri={getPokemonSetLogoUrl(card.setId)}
              number={card.number}
              rarity={card.rarity}
              estimatedValue={card.estimatedValue}
              listingCount={card.listingCount}
              ownedQuantity={card.ownedQuantity}
              onPress={() => {
                if (profileShowcaseSlot) {
                  void saveCardToShowcase(profileShowcaseSlot, card);
                  return;
                }
                void rememberSearch();
                router.push({ pathname: '/card/[id]', params: { id: card.id, setId: card.setId ?? undefined } });
              }}
            />
          ))}
        </SearchRailSection>
      );
    }

    if (group === 'sets' && visibleResults.sets.length) {
      return (
        <SearchRailSection key="sets" title="Sets" count={visibleResults.sets.length}>
          {visibleResults.sets.map((set) => (
            <SearchSetRailItem
              key={set.id}
              name={set.name}
              logoUri={enforceSetVisualRuntimePolicy(set.images?.logo) ?? null}
              artworkUri={enforceSetVisualRuntimePolicy(getPokemonSetVisualUrl(set) ?? set.images?.symbol ?? getPokemonSetSymbolUrl(set.id, set.language))}
              series={set.series}
              year={set.releaseDate ? new Date(set.releaseDate).getFullYear() : null}
              total={Number(set.printedTotal ?? set.total ?? 0) > 0 ? Number(set.printedTotal ?? set.total) : null}
              onPress={() => {
                if (profileShowcaseSlot) {
                  showShowcaseSelectionHint();
                  return;
                }
                void rememberSearch();
                router.push({ pathname: '/set/[id]', params: { id: set.id } });
              }}
            />
          ))}
        </SearchRailSection>
      );
    }

    if (group === 'sealed' && visibleResults.sealed.length) {
      const selectedTitle = getSelectedCategoryTitle(category);
      return (
        <SearchRailSection
          key="sealed"
          title={selectedTitle ?? 'Sealed Products'}
          count={visibleResults.sealed.length}
        >
          {visibleResults.sealed.map((product) => (
            <SearchProductRailItem
              key={product.id}
              name={product.name}
              imageUri={product.image_large_url ?? product.image_url}
              setName={product.set_name}
              setLogoUri={getPokemonSetLogoUrl(product.set_name)}
              productType={productLookupLabel(product.product_type)}
              estimatedValue={product.latest_price?.average ?? product.latest_price?.tcgMarket ?? null}
              listingCount={product.latest_price?.count ?? undefined}
              onPress={() => {
                if (profileShowcaseSlot) {
                  showShowcaseSelectionHint();
                  return;
                }
                void rememberSearch();
                router.push({ pathname: '/product/[id]', params: { id: product.id } });
              }}
            />
          ))}
        </SearchRailSection>
      );
    }

    if (group === 'graded' && visibleResults.graded.length) {
      return (
        <SearchRailSection key="graded" title="Graded Slabs" count={visibleResults.graded.length}>
          {visibleResults.graded.map((listing) => (
            <SearchListingRailItem
              key={listing.id}
              title={listing.title}
              imageUri={listing.imageUri}
              subtitle={listing.subtitle}
              price={listing.price}
              modeLabel={listing.modeLabel}
              onPress={() => {
                if (profileShowcaseSlot === 'slab') {
                  if (!listing.cardId) {
                    Alert.alert('Choose another result', 'This listing is missing card details. Choose a graded card result instead.');
                    return;
                  }
                  void saveCardToShowcase('slab', {
                    id: listing.cardId,
                    setId: listing.setId ?? null,
                    name: listing.title,
                    setName: listing.subtitle,
                    imageUri: listing.imageUri,
                    estimatedValue: listing.price,
                    showcaseKind: 'graded',
                  });
                  return;
                }
                if (profileShowcaseSlot) return;
                void rememberSearch();
                router.push({ pathname: '/(tabs)/market', params: { listingId: listing.id, mode: 'buy' } });
              }}
            />
          ))}
        </SearchRailSection>
      );
    }

    if (group === 'listings' && visibleResults.listings.length) {
      return (
        <SearchRailSection key="listings" title="Listings" count={visibleResults.listings.length}>
          {visibleResults.listings.map((listing) => (
            <SearchListingRailItem
              key={listing.id}
              title={listing.title}
              imageUri={listing.imageUri}
              subtitle={listing.subtitle}
              price={listing.price}
              modeLabel={listing.modeLabel}
              onPress={() => {
                if (profileShowcaseSlot) {
                  showShowcaseSelectionHint();
                  return;
                }
                void rememberSearch();
                router.push({ pathname: '/(tabs)/market', params: { listingId: listing.id, mode: listing.modeLabel === 'Trade' ? 'trade' : 'buy' } });
              }}
            />
          ))}
        </SearchRailSection>
      );
    }

    if (group === 'collectors' && visibleResults.collectors.length) {
      return (
        <SearchRailSection key="collectors" title="Collectors" count={visibleResults.collectors.length}>
          {visibleResults.collectors.map((collector) => (
            <SearchCollectorRailItem
              key={collector.id}
              name={collector.name}
              avatarUri={collector.avatarUrl}
              subtitle="Public collector profile"
              onPress={() => {
                if (profileShowcaseSlot) {
                  showShowcaseSelectionHint();
                  return;
                }
                void rememberSearch();
                router.push({ pathname: '/user/[id]', params: { id: collector.id } });
              }}
            />
          ))}
        </SearchRailSection>
      );
    }

    return null;
  };

  return (
    <StackrScreen variant="tab">
      <StackrBackdrop />
      <FlatList
        ref={searchListRef}
        data={[0]}
        keyExtractor={() => 'search'}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => runSearch(debouncedQuery, true)} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
        onEndReached={hasMoreFocusedResults ? renderMoreFocusedResults : undefined}
        onEndReachedThreshold={0.8}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: insets.bottom + stackrTabContentPadding.standard }}
        ListFooterComponent={hasMoreFocusedResults ? (
          <View style={{ height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
          </View>
        ) : null}
        renderItem={() => (
          <View>
            <View style={{ gap: 9, marginBottom: 13 }}>
              <StackrPageHeader
                title={showcaseConfig?.title ?? 'Search'}
                accentText={showcaseConfig ? showcaseConfig.title.split(' ').at(-1) : 'rch'}
                subtitle={showcaseConfig?.subtitle ?? 'Find cards, sets and sealed products.'}
                style={{ marginBottom: -1 }}
              />

              <View
                style={{
                  minHeight: 46,
                  borderRadius: 14,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 11,
                  gap: 8,
                }}
              >
                <StackrCardActionIcon
                  source={stackrIcons.searchCard}
                  frameSize={24}
                  artworkSize={20}
                />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={showcaseConfig?.placeholder ?? 'Search cards, sets or sealed products'}
                  placeholderTextColor={theme.colors.textSoft}
                  autoCorrect={false}
                  spellCheck={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    void rememberSearch();
                  }}
                  accessibilityLabel={showcaseConfig?.placeholder ?? 'Search cards, sets or sealed products'}
                  style={{ flex: 1, color: theme.colors.text, fontSize: 14.5, fontWeight: '800', paddingVertical: 8 }}
                />
                {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
                <TouchableOpacity
                  onPress={() => setFiltersOpen(true)}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={activeSearchFilterCount > 0 ? `Open search filters, ${activeSearchFilterCount} active` : 'Open search filters'}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    borderWidth: 1,
                    borderColor: activeSearchFilterCount > 0 ? theme.colors.primary + '55' : theme.colors.border,
                    backgroundColor: activeSearchFilterCount > 0 ? theme.colors.primary + '12' : theme.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={searchIcons.filter} size={17} color={activeSearchFilterCount > 0 ? theme.colors.primary : theme.colors.textSoft} />
                  {activeSearchFilterCount > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        minWidth: 17,
                        height: 17,
                        borderRadius: 9,
                        backgroundColor: theme.colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: theme.colors.card,
                        paddingHorizontal: 4,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 9, lineHeight: 11, fontWeight: '900' }}>
                        {activeSearchFilterCount > 9 ? '9+' : activeSearchFilterCount}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
                {query.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setQuery('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name={searchIcons.clear} size={19} color={theme.colors.textSoft} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {suggestion ? (
                <TouchableOpacity onPress={() => setQuery(suggestion)} activeOpacity={0.82} style={{ alignSelf: 'flex-start' }}>
                  <Text style={{ color: theme.colors.primary, fontSize: 11.5, lineHeight: 15, fontWeight: '900' }}>
                    {`Search for "${suggestion}" instead`}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {showcaseConfig ? (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.primary + '30',
                    backgroundColor: theme.colors.primary + '0F',
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' }}>
                    Tap a card result to add it to your Profile showcase.
                  </Text>
                </View>
              ) : null}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: 8 }}>
                {CATEGORIES.map((item) => (
                  <SearchCategoryChip
                    key={item.key}
                    label={item.label}
                    icon={item.icon}
                    imageIcon={item.imageIcon}
                    active={category === item.key}
                    onPress={() => setCategory(item.key)}
                  />
                ))}
              </ScrollView>

              {hasQuery ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '800' }} numberOfLines={1}>
                    {searchResultSummary}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setFiltersOpen(true)}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel={`Sort and filter search results, currently ${currentSearchSortLabel}`}
                    style={{
                      minHeight: 34,
                      borderRadius: 11,
                      paddingHorizontal: 9,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: 'rgba(255,255,255,0.72)',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Ionicons name={searchIcons.sort} size={14} color={theme.colors.primary} />
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900', maxWidth: 132 }}>
                      {currentSearchSortLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {renderContent()}
          </View>
        )}
      />
      <SearchFilterSheet
        visible={filtersOpen}
        activeFilterCount={activeSearchFilterCount}
        onClose={() => setFiltersOpen(false)}
        onClear={clearSearchFilters}
      >
        <SearchFilterGroup title="Sort">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SEARCH_SORT_OPTIONS.map((option) => (
              <SearchFilterOption
                key={option.key}
                label={option.label}
                active={searchSort === option.key}
                onPress={() => setSearchSort(option.key)}
              />
            ))}
          </View>
        </SearchFilterGroup>

        <SearchFilterGroup title="Product/type">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.filter((item) => item.key !== 'collectors').map((item) => (
              <SearchFilterOption
                key={item.key}
                label={item.label}
                imageIcon={item.imageIcon}
                icon={item.imageIcon ? undefined : item.icon}
                active={category === item.key}
                onPress={() => setCategory(item.key)}
              />
            ))}
          </View>
        </SearchFilterGroup>

        <SearchFilterGroup title="Rarity">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {availableRarityFilters.map((rarity) => (
              <SearchFilterOption
                key={rarity}
                label={rarity}
                active={selectedRarities.includes(rarity)}
                onPress={() => toggleRarityFilter(rarity)}
              />
            ))}
          </View>
        </SearchFilterGroup>

        <SearchFilterGroup title="Set">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <SearchFilterOption
              label="Any set"
              active={!selectedSetFilter}
              onPress={() => setSelectedSetFilter(null)}
            />
            {availableSetFilters.map((set) => (
              <SearchFilterOption
                key={set.key}
                label={set.label}
                active={normaliseFilterValue(selectedSetFilter) === normaliseFilterValue(set.key)}
                onPress={() => setSelectedSetFilter(set.key)}
              />
            ))}
          </View>
        </SearchFilterGroup>

        <SearchFilterGroup title="Language">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SEARCH_LANGUAGE_FILTERS.map((language) => (
              <SearchFilterOption
                key={language.key}
                label={language.label}
                leading={language.flagLanguage ? <PokemonLanguageFlagIcon language={language.flagLanguage} size={16} decorative /> : undefined}
                active={selectedLanguage === language.key}
                onPress={() => setSelectedLanguage(language.key)}
              />
            ))}
          </View>
        </SearchFilterGroup>

        <SearchFilterGroup title="Price">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SEARCH_PRICE_BUCKETS.map((bucket) => (
              <SearchFilterOption
                key={bucket.key}
                label={bucket.label}
                active={selectedPriceBucket === bucket.key}
                onPress={() => setSelectedPriceBucket(bucket.key)}
              />
            ))}
          </View>
        </SearchFilterGroup>

        <SearchFilterGroup title="Grader">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <SearchFilterOption label="Any grader" active={!selectedGrader} onPress={() => setSelectedGrader(null)} />
            {SEARCH_GRADER_FILTERS.map((grader) => (
              <SearchFilterOption
                key={grader}
                label={grader}
                active={selectedGrader === grader}
                onPress={() => setSelectedGrader(grader)}
              />
            ))}
          </View>
        </SearchFilterGroup>

        <SearchFilterGroup title="Grade">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <SearchFilterOption label="Any grade" active={!selectedGrade} onPress={() => setSelectedGrade(null)} />
            {SEARCH_GRADE_FILTERS.map((grade) => (
              <SearchFilterOption
                key={grade}
                label={grade}
                active={selectedGrade === grade}
                onPress={() => setSelectedGrade(grade)}
              />
            ))}
          </View>
        </SearchFilterGroup>
      </SearchFilterSheet>
      <ScrollToEndButton
        visible={showSearchEndButton}
        onPress={scrollSearchToEnd}
        bottom={stackrTabContentPadding.standard - 34}
        accessibilityLabel="Skip to end of search results"
      />
    </StackrScreen>
  );
}

async function fetchCardListingStats(cardIds: string[]) {
  return fetchCachedCardListingStats(cardIds).catch(() => new Map<string, { count: number; lowest: number | null }>());
}

async function fetchProductListingStats(products: MarketProduct[]) {
  const map = new Map<string, { count: number; lowest: number | null }>();
  if (!products.length) return map;

  const statsByName = await fetchCachedProductListingStatsByName(products.map((product) => product.name)).catch(() => null);
  if (!statsByName) return map;

  products.forEach((product) => {
    const stats = statsByName.get(product.name);
    if (stats?.count) map.set(product.id, stats);
  });

  return map;
}

function mapListingResult(listing: any): ListingResult {
  const safeListing = sanitizeMarketplaceListingPresentationFields(listing);
  const isTrade = Boolean(safeListing.trade_only);
  return {
    id: safeListing.id,
    title: sanitizeGate0CommerceCopy(
      safeListing.product_name ?? safeListing.card_id ?? null,
      'Market listing',
    ) ?? 'Market listing',
    subtitle: [
      safeListing.pricing_mode === 'graded'
        ? [safeListing.grade_company, safeListing.grade].filter(Boolean).join(' ')
        : null,
      safeListing.condition,
    ].filter(Boolean).join(' · ') || null,
    imageUri: safeListing.official_image_url ?? safeListing.listing_images?.[0] ?? null,
    price: safeListing.asking_price == null ? null : Number(safeListing.asking_price),
    modeLabel: isTrade ? 'Trade' : 'Offers',
    cardId: safeListing.card_id ?? null,
    setId: safeListing.set_id ?? null,
    productType: safeListing.product_type ?? null,
    gradeCompany: safeListing.grade_company ?? null,
    grade: safeListing.grade ?? null,
    condition: safeListing.condition ?? null,
    createdAt: safeListing.created_at ?? null,
  };
}

function SearchEmpty({
  icon,
  imageIcon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  imageIcon?: ImageSourcePropType;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, padding: 14, alignItems: 'center', gap: 7 }}>
      <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
        {imageIcon ? (
          <StackrCardActionIcon
            source={imageIcon}
            frameSize={34}
            artworkSize={28}
          />
        ) : (
          <Ionicons name={icon} size={22} color={theme.colors.primary} />
        )}
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 16.5, lineHeight: 21, fontWeight: '900', textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' }}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={{ minHeight: 40, borderRadius: 13, backgroundColor: theme.colors.primary, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SearchLoading({ query }: { query: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, padding: 16, alignItems: 'center', gap: 9 }}>
      <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: theme.colors.primary + '12', borderWidth: 1, borderColor: theme.colors.primary + '26', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 16.5, lineHeight: 21, fontWeight: '900', textAlign: 'center' }}>
        Searching...
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>
        {query.trim()}
      </Text>
    </View>
  );
}

function SearchFilterSheet({
  visible,
  activeFilterCount,
  children,
  onClose,
  onClear,
}: {
  visible: boolean;
  activeFilterCount: number;
  children: React.ReactNode;
  onClose: () => void;
  onClear: () => void;
}) {
  const subtitle = activeFilterCount > 0
    ? `${activeFilterCount} active`
    : 'Refine cards, sets, slabs, listings, and collectors.';

  return (
    <StackrBottomSheet
      visible={visible}
      title="Search filters"
      subtitle={subtitle}
      onClose={onClose}
      onClear={onClear}
      maxHeight="74%"
      contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
    >
      {children}
    </StackrBottomSheet>
  );
}

function SearchFilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: '900' }}>{title}</Text>
      {children}
    </View>
  );
}

function SearchFilterOption({
  label,
  icon,
  imageIcon,
  leading,
  active,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  imageIcon?: ImageSourcePropType;
  leading?: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        minHeight: 34,
        maxWidth: 226,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary + '55' : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '12' : 'rgba(255,255,255,0.72)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {leading ?? (imageIcon ? (
        <StackrCardActionIcon source={imageIcon} frameSize={22} artworkSize={18} />
      ) : icon ? (
        <Ionicons name={icon} size={14} color={active ? theme.colors.primary : theme.colors.textSoft} />
      ) : active ? (
        <Ionicons name="checkmark-circle" size={14} color={theme.colors.primary} />
      ) : null)}
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          flexShrink: 1,
          color: active ? theme.colors.primary : theme.colors.text,
          fontSize: 12,
          lineHeight: 15,
          fontWeight: '900',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
