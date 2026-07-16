import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import {
  RecentSearchPill,
  SearchCardResult,
  SearchCategoryChip,
  SearchCollectorResult,
  SearchListingResult,
  SearchResultSection,
  SearchSealedResult,
  SearchSetResult,
  SearchSkeleton,
} from '../../components/search/SearchResults';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { useTheme } from '../../components/theme-context';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { fetchOwnedCardRows } from '../../lib/ownership';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { correctPokemonNameQuery } from '../../lib/pokemonNameAutocorrect';
import {
  fetchAllSets,
  getPokemonSetLogoUrl,
  getPokemonSetSymbolUrl,
  type PokemonSet,
} from '../../lib/pokemonTcg';
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
import { supabase } from '../../lib/supabase';

type SearchCategory = 'all' | 'cards' | 'sets' | 'sealed' | 'graded' | 'collectors' | ListingCategoryKey;

type CardResult = {
  id: string;
  name: string;
  setId: string | null;
  setName: string | null;
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

const RECENT_SEARCHES_KEY = '@stackr:search:recent-queries';
const MAX_RECENT_SEARCHES = 8;

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
  return card?.raw_data?.set?.name ?? card?.set?.name ?? card?.set_name ?? card?.set_id ?? null;
}

function getCardSetId(card: any) {
  return card?.set_id ?? card?.raw_data?.set?.id ?? card?.set?.id ?? null;
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
  const name = normaliseSearchText(set.name);
  const id = normaliseSearchText(set.id);
  const series = normaliseSearchText(set.series);
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (id === term) score += 100;
    if (name === term) score += 92;
    if (id.includes(term)) score += 42;
    if (name.includes(term)) score += 36;
    if (series.includes(term)) score += 12;
  }
  return score;
}

async function loadRecentSearches() {
  const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

async function saveRecentSearches(searches: string[]) {
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
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
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [errors, setErrors] = useState<SearchErrorState>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const requestRef = useRef(0);
  const lastParamSignatureRef = useRef('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadRecentSearches().then((items) => {
        if (active) setRecentSearches(items);
      });
      return () => {
        active = false;
        requestRef.current += 1;
      };
    }, [])
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
    const next = [trimmed, ...recentSearches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(next);
    await saveRecentSearches(next);
  }, [query, recentSearches]);

  const removeRecentSearch = useCallback(async (value: string) => {
    const next = recentSearches.filter((item) => item !== value);
    setRecentSearches(next);
    await saveRecentSearches(next);
  }, [recentSearches]);

  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([]);
    await saveRecentSearches([]);
  }, []);

  const runSearch = useCallback(async (searchText: string, force = false) => {
    const trimmed = searchText.trim();
    const requestId = ++requestRef.current;

    if (trimmed.length < 2) {
      setResults(EMPTY_RESULTS);
      setErrors({});
      setSuggestion(null);
      setLoading(false);
      return;
    }

    setLoading(!force);
    setRefreshing(force);
    setErrors({});

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

    try {
      const correctionPromise = correctPokemonNameQuery(trimmed, { allowIndex: false }).catch(() => null);
      const cardsPromise = searchLocalPokemonCards<any>(primary, {
        limit: 18,
        select: 'id, name, set_id, number, rarity, image_small, image_large, raw_data',
      });
      const setsPromise = fetchAllSets();
      const productsPromise = shouldSearchProducts
        ? searchMarketProducts(trimmed, catalogueProductTypeFilter, catalogueProductTypeFilter || productTypeMatchesIntent(trimmed) ? 24 : 10)
        : Promise.resolve([]);
      const profilesPromise = supabase
        .from('profiles')
        .select('id, collector_name, avatar_url')
        .ilike('collector_name', `%${primary}%`)
        .limit(8);
      let listingsQuery = supabase
        .from('user_card_flags')
        .select('id, card_id, set_id, product_name, product_type, pricing_mode, grade_company, grade, asking_price, trade_only, listing_status, condition, listing_images, official_image_url')
        .eq('flag_type', 'trade')
        .or('listing_status.eq.active,listing_status.is.null')
        .or(`product_name.ilike.%${primary}%,card_id.ilike.%${primary}%,grade_company.ilike.%${primary}%`);

      if (listingProductTypeFilter) {
        listingsQuery = listingsQuery.eq('product_type', listingProductTypeFilter);
      }

      const listingsPromise = listingsQuery.limit(18);

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

      if (cardsResult.status === 'fulfilled') {
        const cards = cardsResult.value ?? [];
        const cardIds = [...new Set(cards.map((card: any) => card.id).filter(Boolean))];
        const [listingStats, ownedRows] = await Promise.all([
          fetchCardListingStats(cardIds),
          fetchOwnedCardRows({ cardIds }).catch(() => []),
        ]);
        const ownedMap = new Map<string, number>();
        ownedRows.forEach((row) => {
          ownedMap.set(row.card_id, (ownedMap.get(row.card_id) ?? 0) + Math.max(1, Number(row.quantity ?? 1) || 1));
        });

        if (requestId !== requestRef.current) return;
        next.cards = cards.map((card: any) => ({
          id: card.id,
          name: card.name ?? card.id,
          setId: getCardSetId(card),
          setName: getCardSetName(card),
          number: card.number ?? card.raw_data?.number ?? null,
          rarity: card.rarity ?? card.raw_data?.rarity ?? null,
          imageUri: card.image_small ?? card.image_large ?? card.raw_data?.images?.small ?? null,
          estimatedValue: getBestCardValue(card),
          listingCount: listingStats.get(card.id)?.count ?? 0,
          ownedQuantity: ownedMap.get(card.id) ?? 0,
          raw: card,
        }));
      } else {
        nextErrors.cards = 'Card results could not be loaded.';
      }

      if (setsResult.status === 'fulfilled') {
        next.sets = setsResult.value
          .map((set) => ({ set, score: rankSet(set, normalisedTerms) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 12)
          .map((entry) => entry.set);
      } else {
        nextErrors.sets = 'Set results could not be loaded.';
      }

      if (productsResult.status === 'fulfilled') {
        const productListingStats = await fetchProductListingStats(productsResult.value);
        if (requestId !== requestRef.current) return;
        next.sealed = productsResult.value.map((product) => ({
          ...product,
          latest_price: product.latest_price
            ? {
                ...product.latest_price,
                count: productListingStats.get(product.id)?.count ?? product.latest_price.count,
              }
            : product.latest_price,
        }));
      } else {
        nextErrors.sealed = 'Sealed product results could not be loaded.';
      }

      if (profilesResult.status === 'fulfilled' && !profilesResult.value.error) {
        next.collectors = (profilesResult.value.data ?? []).map((profile: any) => ({
          id: profile.id,
          name: profile.collector_name ?? 'Collector',
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
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [category]);

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

    if (loading && resultCount === 0) return <SearchSkeleton />;

    if (resultCount === 0) {
      return (
        <SearchEmpty
          icon={searchIcons.search}
          imageIcon={stackrIcons.searchCard}
          title="No matches found"
          body="Check the spelling, try fewer words, or remove category filters."
          actionLabel="Clear search"
          onAction={() => setQuery('')}
        />
      );
    }

    return (
      <View>
        {errors.cards || errors.listings || errors.sealed ? (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B55', backgroundColor: '#FFFBEB', padding: 12, marginBottom: 14 }}>
            <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 17, fontWeight: '800' }}>
              Some live results could not be loaded. Cached card and set results are still shown where available.
            </Text>
            <TouchableOpacity onPress={() => runSearch(debouncedQuery, true)} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '900' }}>Retry live results</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {filteredGroups.map((group) => renderGroup(group))}
      </View>
    );
  };

  const renderGroup = (group: keyof SearchResults) => {
    if (group === 'cards' && results.cards.length) {
      const items = results.cards.slice(0, isRawCardCategory(category) ? 30 : 5);
      return (
        <SearchResultSection key="cards" title="Cards" count={results.cards.length} onViewAll={results.cards.length > items.length ? () => setCategory('raw_card') : undefined}>
          {items.map((card) => (
            <SearchCardResult
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
        </SearchResultSection>
      );
    }

    if (group === 'sets' && results.sets.length) {
      const items = results.sets.slice(0, category === 'sets' ? 30 : 4);
      return (
        <SearchResultSection key="sets" title="Sets" count={results.sets.length} onViewAll={results.sets.length > items.length ? () => setCategory('sets') : undefined}>
          {items.map((set) => (
            <SearchSetResult
              key={set.id}
              name={set.name}
              logoUri={set.images?.logo ?? getPokemonSetLogoUrl(set.id)}
              artworkUri={set.images?.symbol ?? getPokemonSetSymbolUrl(set.id)}
              series={set.series}
              year={set.releaseDate ? new Date(set.releaseDate).getFullYear() : null}
              total={set.printedTotal ?? set.total}
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
        </SearchResultSection>
      );
    }

    if (group === 'sealed' && results.sealed.length) {
      const focusedProductCategory = category === 'sealed' || isListingProductCategory(category);
      const selectedTitle = getSelectedCategoryTitle(category);
      const items = results.sealed.slice(0, focusedProductCategory ? 30 : 5);
      return (
        <SearchResultSection
          key="sealed"
          title={selectedTitle ?? 'Sealed Products'}
          count={results.sealed.length}
          onViewAll={results.sealed.length > items.length ? () => setCategory('sealed') : undefined}
        >
          {items.map((product) => (
            <SearchSealedResult
              key={product.id}
              name={product.name}
              imageUri={product.image_url ?? product.image_large_url}
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
        </SearchResultSection>
      );
    }

    if (group === 'graded' && results.graded.length) {
      const items = results.graded.slice(0, isGradedCategory(category) ? 30 : 4);
      return (
        <SearchResultSection key="graded" title="Graded Slabs" count={results.graded.length} onViewAll={results.graded.length > items.length ? () => setCategory('graded_slab') : undefined}>
          {items.map((listing) => (
            <SearchListingResult
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
        </SearchResultSection>
      );
    }

    if (group === 'listings' && results.listings.length) {
      const items = results.listings.slice(0, 5);
      return (
        <SearchResultSection key="listings" title="Listings" count={results.listings.length}>
          {items.map((listing) => (
            <SearchListingResult
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
        </SearchResultSection>
      );
    }

    if (group === 'collectors' && results.collectors.length) {
      const items = results.collectors.slice(0, category === 'collectors' ? 30 : 4);
      return (
        <SearchResultSection key="collectors" title="Collectors" count={results.collectors.length} onViewAll={results.collectors.length > items.length ? () => setCategory('collectors') : undefined}>
          {items.map((collector) => (
            <SearchCollectorResult
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
        </SearchResultSection>
      );
    }

    return null;
  };

  return (
    <StackrScreen variant="tab">
      <StackrBackdrop />
      <FlatList
        data={[0]}
        keyExtractor={() => 'search'}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => runSearch(debouncedQuery, true)} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: theme.spacing.sm, paddingBottom: insets.bottom + stackrTabContentPadding.standard }}
        renderItem={() => (
          <View>
            <View style={{ gap: 12, marginBottom: 16 }}>
              <StackrPageHeader
                title={showcaseConfig?.title ?? 'Search'}
                accentText={showcaseConfig ? showcaseConfig.title.split(' ').at(-1) : 'rch'}
                subtitle={showcaseConfig?.subtitle ?? 'Find cards, sets and sealed products.'}
              />

              <View
                style={{
                  minHeight: 50,
                  borderRadius: 15,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  gap: 9,
                }}
              >
                <StackrCardActionIcon
                  source={stackrIcons.searchCard}
                  frameSize={26}
                  artworkSize={22}
                />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={showcaseConfig?.placeholder ?? 'Search cards, sets or sealed products'}
                  placeholderTextColor={theme.colors.textSoft}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    void rememberSearch();
                  }}
                  accessibilityLabel={showcaseConfig?.placeholder ?? 'Search cards, sets or sealed products'}
                  style={{ flex: 1, color: theme.colors.text, fontSize: 15, fontWeight: '800', paddingVertical: 11 }}
                />
                {loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
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
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>
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
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' }}>
                    Tap a card result to add it to your Profile showcase.
                  </Text>
                </View>
              ) : null}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
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
            </View>

            {renderContent()}
          </View>
        )}
      />
    </StackrScreen>
  );
}

async function fetchCardListingStats(cardIds: string[]) {
  const map = new Map<string, { count: number; lowest: number | null }>();
  if (!cardIds.length) return map;

  const { data, error } = await supabase
    .from('user_card_flags')
    .select('card_id, asking_price')
    .eq('flag_type', 'trade')
    .or('listing_status.eq.active,listing_status.is.null')
    .in('card_id', cardIds);

  if (error) return map;

  for (const row of data ?? []) {
    const key = row.card_id;
    if (!key) continue;
    const current = map.get(key) ?? { count: 0, lowest: null };
    const price = row.asking_price == null ? null : Number(row.asking_price);
    map.set(key, {
      count: current.count + 1,
      lowest: price == null ? current.lowest : current.lowest == null ? price : Math.min(current.lowest, price),
    });
  }

  return map;
}

async function fetchProductListingStats(products: MarketProduct[]) {
  const map = new Map<string, { count: number; lowest: number | null }>();
  if (!products.length) return map;

  await Promise.all(products.map(async (product) => {
    const { data } = await supabase
      .from('user_card_flags')
      .select('asking_price')
      .eq('flag_type', 'trade')
      .or('listing_status.eq.active,listing_status.is.null')
      .eq('product_name', product.name)
      .limit(20);
    const prices = (data ?? []).map((row: any) => Number(row.asking_price)).filter((value: number) => Number.isFinite(value));
    if (data?.length) {
      map.set(product.id, {
        count: data.length,
        lowest: prices.length ? Math.min(...prices) : null,
      });
    }
  }));

  return map;
}

function mapListingResult(listing: any): ListingResult {
  const isTrade = Boolean(listing.trade_only);
  return {
    id: listing.id,
    title: listing.product_name ?? listing.card_id ?? 'Market listing',
    subtitle: [
      listing.pricing_mode === 'graded' ? [listing.grade_company, listing.grade].filter(Boolean).join(' ') : null,
      listing.condition,
    ].filter(Boolean).join(' · ') || null,
    imageUri: listing.official_image_url ?? listing.listing_images?.[0] ?? null,
    price: listing.asking_price == null ? null : Number(listing.asking_price),
    modeLabel: isTrade ? 'Trade' : 'Buy',
    cardId: listing.card_id ?? null,
    setId: listing.set_id ?? null,
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
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, padding: 16, alignItems: 'center', gap: 8 }}>
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
        {imageIcon ? (
          <StackrCardActionIcon
            source={imageIcon}
            frameSize={38}
            artworkSize={30}
          />
        ) : (
          <Ionicons name={icon} size={23} color={theme.colors.primary} />
        )}
      </View>
      <Text style={{ color: theme.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900', textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, lineHeight: 18, fontWeight: '700', textAlign: 'center' }}>
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
