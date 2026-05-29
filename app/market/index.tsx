import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { BlurView } from 'expo-blur';
import { useFocusEffect , router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { scanStore } from '../../lib/scanStore';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { PRICE_API_URL, USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { buildProductQuery, searchMarketProducts } from '../../lib/productSearch';
import type { ProductLookupType, ProductPriceResult } from '../../lib/productSearch';


// ===============================
// TYPES
// ===============================

type PokemonCard = {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  images?: { small?: string; large?: string };
  set?: { id?: string; name?: string; series?: string; printedTotal?: number; total?: number };
  tcgplayer?: {
    prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }>;
  };
  cardmarket?: {
    prices?: {
      averageSellPrice?: number;
      trendPrice?: number;
      avg30?: number;
    };
  };
};

type WatchlistRow = {
  id?: string;
  user_id?: string;
  card_id: string;
  set_id?: string | null;
  created_at?: string;
};

type WatchlistPriceState = {
  latestPrice: number | null;
  previousPrice: number | null;
  change: number | null;
  percentChange: number | null;
  hasHistory: boolean;
};

type SearchPriceState = {
  ebayAverage: number | null;
  ebayLow: number | null;
  ebayHigh: number | null;
  ebayCount: number | null;
  tcgLatest: number | null;
  tcgPrevious: number | null;
  tcgChange: number | null;
  tcgPercentChange: number | null;
  snapshotAt: string | null;
};

type EbayDetailData = {
  low?: number | null;
  average?: number | null;
  high?: number | null;
  count?: number | null;
  query?: string;
  soldDataSource?: string;
} | null;

type LookupType =
  | 'raw_card'
  | 'graded_slab'
  | 'sealed_product'
  | 'booster_pack'
  | 'sleeved_booster_pack'
  | 'booster_bundle'
  | 'booster_box'
  | 'elite_trainer_box'
  | 'collection_bundle'
  | 'accessories';

// ===============================
// CONSTANTS
// ===============================

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const LOOKUP_OPTIONS: { key: LookupType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'raw_card', label: 'Raw Card', icon: 'albums-outline' },
  { key: 'graded_slab', label: 'Graded Slab', icon: 'id-card-outline' },
  { key: 'sealed_product', label: 'Sealed Product', icon: 'cube-outline' },
  { key: 'booster_pack', label: 'Booster Pack', icon: 'file-tray-full-outline' },
  { key: 'sleeved_booster_pack', label: 'Sleeved Pack', icon: 'file-tray-full-outline' },
  { key: 'booster_bundle', label: 'Booster Bundle', icon: 'file-tray-stacked-outline' },
  { key: 'booster_box', label: 'Booster Box', icon: 'archive-outline' },
  { key: 'elite_trainer_box', label: 'Elite Trainer Box', icon: 'file-tray-stacked-outline' },
  { key: 'collection_bundle', label: 'Collection Bundle', icon: 'cube-outline' },
  { key: 'accessories', label: 'Accessories', icon: 'layers-outline' },
];

const RAW_CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];
const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'Ace'];
const GRADES = ['10', '9.5', '9', '8', '7'];

const isCardLookup = (lookupType: LookupType): lookupType is 'raw_card' | 'graded_slab' =>
  lookupType === 'raw_card' || lookupType === 'graded_slab';

const getLookupSearchHint = (lookupType: LookupType) => {
  switch (lookupType) {
    case 'graded_slab':
      return 'Search a card to price as a slab...';
    case 'elite_trainer_box':
      return 'Search an ETB, set, or product...';
    case 'booster_pack':
      return 'Search a booster pack...';
    case 'sleeved_booster_pack':
      return 'Search a sleeved booster pack...';
    case 'booster_bundle':
      return 'Search a booster bundle...';
    case 'booster_box':
      return 'Search a booster box...';
    case 'collection_bundle':
      return 'Search a collection box or bundle...';
    case 'accessories':
      return 'Search binders, sleeves, cases...';
    case 'sealed_product':
      return 'Search any sealed Pokemon product...';
    default:
      return 'Search a specific card...';
  }
};

// ===============================
// HELPERS
// ===============================

const formatCurrency = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${value.toFixed(2)}`;
};

const formatDelta = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}£${value.toFixed(2)}`;
};

const formatPercent = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '';
  const sign = value > 0 ? '+' : '';
  return `(${sign}${value.toFixed(1)}%)`;
};

const formatSnapshotDay = (value: string | null | undefined): string => {
  if (!value) return 'Latest TCG';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Latest TCG';
  const today = new Date();
  const dateKey = date.toISOString().split('T')[0];
  const todayKey = today.toISOString().split('T')[0];
  if (dateKey === todayKey) return "Today's TCG";
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} TCG`;
};

const getBestTcgPrice = (
  card: PokemonCard,
  field: 'mid' | 'low' | 'market'
): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const preferred = [
    'holofoil',
    'reverseHolofoil',
    'normal',
    '1stEditionHolofoil',
    '1stEditionNormal',
  ];

  for (const key of preferred) {
    const val = prices[key]?.[field];
    if (typeof val === 'number') return val;
  }

  for (const entry of Object.values(prices)) {
    const val = entry?.[field];
    if (typeof val === 'number') return val;
  }

  return null;
};

const mapCard = (card: any): PokemonCard => ({
  id: card.id,
  name: card.name,
  number: card.number ?? '',
  rarity: card.rarity ?? undefined,
  images: {
    small: card.image_small ?? undefined,
    large: card.image_large ?? undefined,
  },
  set: {
    id: card.set_id,
    name: card.raw_data?.set?.name ?? card.set_id,
    series: card.raw_data?.set?.series ?? '',
  },
  tcgplayer: card.raw_data?.tcgplayer,
  cardmarket: card.raw_data?.cardmarket,
});

const normalise = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function fetchJsonWithTimeout(url: string, options: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.text();
    let json: any = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      throw new Error(`Server returned an unreadable response (${response.status}).`);
    }
    return { response, json };
  } finally {
    clearTimeout(timeout);
  }
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function MarketScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [lookupType, setLookupType] = useState<LookupType>('raw_card');
  const [lookupMenuOpen, setLookupMenuOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PokemonCard[]>([]);
  const [productPriceData, setProductPriceData] = useState<ProductPriceResult | null>(null);
  const [productPriceLoading, setProductPriceLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailEbayData, setDetailEbayData] = useState<EbayDetailData>(null);
  const [detailPriceLoading, setDetailPriceLoading] = useState(false);
  const [rawCondition, setRawCondition] = useState('Near Mint');
  const [gradingCompany, setGradingCompany] = useState('PSA');
  const [grade, setGrade] = useState('10');

  const [refreshing, setRefreshing] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [watchlistCards, setWatchlistCards] = useState<PokemonCard[]>([]);
  const [watchlistPriceMap, setWatchlistPriceMap] = useState<Record<string, WatchlistPriceState>>({});
  const [searchPriceMap, setSearchPriceMap] = useState<Record<string, SearchPriceState>>({});
  const [searchEbayMap, setSearchEbayMap] = useState<Record<string, EbayDetailData>>({});
  const [watchlistLoading, setWatchlistLoading] = useState(true);

  const translateY = useRef(new Animated.Value(0)).current;
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const watchedCardIds = useMemo(
    () => new Set(watchlist.map((item) => item.card_id)),
    [watchlist]
  );

  const isWatching = useCallback(
    (cardId: string) => watchedCardIds.has(cardId),
    [watchedCardIds]
  );

  const closeDetail = useCallback(() => {
    Animated.timing(translateY, {
      toValue: 700,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      setDetailVisible(false);
      setSelectedCard(null);
      setDetailEbayData(null);
    });
  }, [translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 130 || gesture.vy > 1.2) {
            closeDetail();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 80,
              friction: 10,
            }).start();
          }
        },
      }),
    [closeDetail, translateY]
  );

  const loadWatchlistPrices = useCallback(async (cardIds: string[]) => {
    if (!cardIds.length) { setWatchlistPriceMap({}); return; }

    const { data, error } = await supabase
      .from('market_price_snapshots')
      .select('card_id, tcg_mid, tcg_low, snapshot_at')
      .is('user_id', null)
      .or('tcg_mid.not.is.null,tcg_low.not.is.null')
      .in('card_id', cardIds)
      .order('snapshot_at', { ascending: false });

    if (error) { console.log('Watchlist price snapshot error:', error); return; }

    const grouped: Record<string, any[]> = {};
    for (const row of data ?? []) {
      if (!grouped[row.card_id]) grouped[row.card_id] = [];
      if (grouped[row.card_id].length < 2) grouped[row.card_id].push(row);
    }

    const nextMap: Record<string, WatchlistPriceState> = {};
    for (const cardId of cardIds) {
      const snapshots = grouped[cardId] ?? [];
      const latest = snapshots[0];
      const previous = snapshots[1];
      const latestPrice = latest?.tcg_mid ?? latest?.tcg_low ?? null;
      const previousPrice = previous?.tcg_mid ?? previous?.tcg_low ?? null;
      const change = latestPrice != null && previousPrice != null ? latestPrice - previousPrice : null;
      const percentChange = change != null && previousPrice != null && previousPrice !== 0 ? (change / previousPrice) * 100 : null;
      nextMap[cardId] = { latestPrice, previousPrice, change, percentChange, hasHistory: snapshots.length > 1 };
    }

    setWatchlistPriceMap(nextMap);
  }, []);

  const loadSearchResultPrices = useCallback(async (cardIds: string[]) => {
    if (!cardIds.length) {
      setSearchPriceMap({});
      setSearchEbayMap({});
      return;
    }

    const { data, error } = await supabase
      .from('market_price_snapshots')
      .select('card_id, ebay_average, ebay_low, ebay_high, ebay_count, tcg_mid, tcg_low, snapshot_at')
      .is('user_id', null)
      .in('card_id', cardIds)
      .or('tcg_mid.not.is.null,tcg_low.not.is.null')
      .order('snapshot_at', { ascending: false });

    if (error) {
      console.log('Search price snapshot error:', error);
      setSearchPriceMap({});
      return;
    }

    const grouped: Record<string, any[]> = {};
    for (const row of data ?? []) {
      if (!grouped[row.card_id]) grouped[row.card_id] = [];
      if (grouped[row.card_id].length < 2) grouped[row.card_id].push(row);
    }

    const nextMap: Record<string, SearchPriceState> = {};
    for (const cardId of cardIds) {
      const snapshots = grouped[cardId] ?? [];
      const latest = snapshots[0];
      const previous = snapshots[1];
      const latestTcg = latest?.tcg_mid == null && latest?.tcg_low == null ? null : Number(latest.tcg_mid ?? latest.tcg_low);
      const previousTcg = previous?.tcg_mid == null && previous?.tcg_low == null ? null : Number(previous.tcg_mid ?? previous.tcg_low);
      const change = latestTcg != null && previousTcg != null ? latestTcg - previousTcg : null;
      const percentChange = change != null && previousTcg != null && previousTcg !== 0 ? (change / previousTcg) * 100 : null;

      nextMap[cardId] = {
        ebayAverage: latest?.ebay_average == null ? null : Number(latest.ebay_average),
        ebayLow: latest?.ebay_low == null ? null : Number(latest.ebay_low),
        ebayHigh: latest?.ebay_high == null ? null : Number(latest.ebay_high),
        ebayCount: latest?.ebay_count == null ? null : Number(latest.ebay_count),
        tcgLatest: latestTcg,
        tcgPrevious: previousTcg,
        tcgChange: change,
        tcgPercentChange: percentChange,
        snapshotAt: latest?.snapshot_at ?? null,
      };
    }

    setSearchPriceMap(nextMap);
  }, []);

  const fetchLiveEbayForCard = useCallback(async (card: PokemonCard): Promise<EbayDetailData> => {
    if (!PRICE_API_URL) return null;

    const rawSetName = card.set?.name ?? '';
    const setName = (rawSetName && rawSetName !== card.set?.id) ? rawSetName : '';

    const params = new URLSearchParams({
      name: card.name ?? '',
      setName,
      number: card.number ?? '',
      rarity: card.rarity ?? '',
      cardId: card.id ?? '',
      productType: 'card',
      pricingMode: lookupType === 'graded_slab' ? 'graded' : 'raw',
    });

    if (lookupType === 'graded_slab') {
      params.set('gradingCompany', gradingCompany);
      params.set('grade', grade);
    } else {
      params.set('condition', rawCondition);
    }

    const printedTotal = card.set?.printedTotal ?? card.set?.total;
    if (printedTotal != null) params.set('setTotal', String(printedTotal));

    const response = await fetch(`${PRICE_API_URL}/api/price/ebay?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch eBay price');

    const data = await response.json();
    if (__DEV__) {
      console.log('[market:eBay:card]', {
        cardId: card.id,
        pricingMode: lookupType === 'graded_slab' ? 'graded' : 'raw',
        gradingCompany: lookupType === 'graded_slab' ? gradingCompany : undefined,
        grade: lookupType === 'graded_slab' ? grade : undefined,
        condition: lookupType === 'raw_card' ? rawCondition : undefined,
        query: data.query,
        count: data.count,
        average: data.average,
        source: data.soldDataSource,
        usedCachedPrice: data.usedCachedPrice,
      });
    }
    return {
      low: data.low ?? null,
      average: data.average ?? null,
      high: data.high ?? null,
      count: data.count ?? null,
      query: data.query ?? null,
      soldDataSource: data.soldDataSource ?? null,
    };
  }, [grade, gradingCompany, lookupType, rawCondition]);

  const loadLiveEbayForSearchResults = useCallback(async (cards: PokemonCard[]) => {
    const visibleCards = cards.slice(0, 12);
    if (!visibleCards.length || !PRICE_API_URL) {
      setSearchEbayMap({});
      return;
    }

    const nextMap: Record<string, EbayDetailData> = Object.fromEntries(cards.map((card) => [card.id, null]));
    await Promise.all(visibleCards.map(async (card) => {
      try {
        nextMap[card.id] = await fetchLiveEbayForCard(card);
      } catch (error) {
        console.log('Search result eBay price error:', card.id, error);
        nextMap[card.id] = null;
      }
    }));

    setSearchEbayMap(nextMap);
  }, [fetchLiveEbayForCard]);

  const loadWatchlist = useCallback(async () => {
    try {
      setWatchlistLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      if (!user) { setWatchlist([]); setWatchlistCards([]); setWatchlistPriceMap({}); return; }

      const { data: watchlistData, error } = await supabase
        .from('market_watchlist')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (watchlistData ?? []) as WatchlistRow[];
      setWatchlist(rows);

      if (!rows.length) { setWatchlistCards([]); setWatchlistPriceMap({}); return; }

      const cardIds = rows.map((r) => r.card_id);
      const { data: cardData } = await supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
        .in('id', cardIds);

      const cards: PokemonCard[] = (cardData ?? []).map(mapCard);
      const cardMap = Object.fromEntries(cards.map((c) => [c.id, c]));
      const ordered = cardIds.map((id) => cardMap[id]).filter(Boolean) as PokemonCard[];

      setWatchlistCards(ordered);
      await loadWatchlistPrices(cardIds);
    } catch (err) {
      console.log('Failed to load watchlist:', err);
    } finally {
      setWatchlistLoading(false);
    }
  }, [loadWatchlistPrices]);

  useFocusEffect(useCallback(() => { loadWatchlist(); }, [loadWatchlist]));

  const searchCards = useCallback(async (searchQuery: string, skipSetFilter = false) => {
  const trimmed = searchQuery.trim();
  if (!trimmed) { setSearchResults([]); setSearchPriceMap({}); setSearchEbayMap({}); return; }

  try {
    setSearching(true);
    const smartResults = await searchLocalPokemonCards<any>(trimmed, {
      limit: 120,
      select: 'id, name, number, rarity, image_small, image_large, set_id, raw_data',
      skipSetDetection: skipSetFilter,
    });
    const cards = smartResults.map(mapCard);
    setSearchResults(cards);
    await loadSearchResultPrices(cards.map((card) => card.id));
    if (smartResults.length < 0) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    let cardTerm = trimmed;
    let matchedSetIds: string[] = [];

    // Start at i=1 so at least one word is always kept as the card term.
    // Starting at i=0 would let a single word like "pikachu" be consumed
    // entirely by set detection (matching "Detective Pikachu" set) with no
    // name filter left to apply.
    if (!skipSetFilter) for (let i = 1; i < words.length; i++) {
        const possibleCardTerm = words.slice(0, i).join(' ');
        const possibleSetTerm = words.slice(i).join(' ');
        if (!possibleSetTerm) continue;

        const { data: matchingSets, error: setError } = await supabase
          .from('pokemon_sets')
          .select('id, name')
          .or(`name.ilike.%${possibleSetTerm}%,id.ilike.%${possibleSetTerm}%`)
          .limit(20);

        if (setError) { console.log('Set search error:', setError); continue; }

        const filteredSets = (matchingSets ?? []).filter((set: any) => {
          const setName = normalise(set.name ?? '');
          const setId = normalise(set.id ?? '');
          const searchText = normalise(possibleSetTerm);
          return setName.includes(searchText) || setId.includes(searchText);
        });

        if (filteredSets.length > 0) {
          cardTerm = possibleCardTerm;
          matchedSetIds = filteredSets.map((set: any) => set.id);
          break;
        }
      }

      let dbQuery = supabase
        .from('pokemon_cards')
        .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
        .limit(500);

      if (cardTerm) {
        // Normalise apostrophes and map plain-ascii "pokemon" to the accented
        // form stored in the DB ("Pokémon") so ilike matches correctly.
        const normalised = cardTerm
          .replace(/[''ʼ]/g, "'")
          .replace(/\bpokemon\b/gi, 'Pokémon');
        const searchWords = normalised.split(/\s+/).filter(Boolean);
        for (const word of searchWords) {
          // "Mistys" → also try "Misty_s" so the _ wildcard matches the apostrophe
          if (!word.includes("'") && /[a-z]s$/i.test(word)) {
            const wildcardForm = `${word.slice(0, -1)}_s`;
            dbQuery = dbQuery.or(`name.ilike.%${word}%,name.ilike.%${wildcardForm}%`);
          } else {
            dbQuery = dbQuery.ilike('name', `%${word}%`);
          }
        }
      }
      if (!skipSetFilter && matchedSetIds.length > 0) dbQuery = dbQuery.in('set_id', matchedSetIds);

      const { data, error } = await dbQuery;
      if (error) throw error;

      const fallbackCards = (data ?? []).map(mapCard);
      setSearchResults(fallbackCards);
      await loadSearchResultPrices(fallbackCards.map((card) => card.id));
    }
    } catch (err) {
      console.log('Search error:', err);
      setSearchResults([]);
      setSearchPriceMap({});
      setSearchEbayMap({});
    } finally {
      setSearching(false);
    }
  }, [loadSearchResultPrices]);

  useEffect(() => {
    if (!isCardLookup(lookupType) || !searchResults.length) return;
    loadLiveEbayForSearchResults(searchResults);
  }, [grade, gradingCompany, loadLiveEbayForSearchResults, lookupType, rawCondition, searchResults]);

  const searchProductPrice = useCallback(async (searchQuery: string, productType: ProductLookupType) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) { setProductPriceData(null); return; }

    try {
      setProductPriceLoading(true);
      setSearching(true);
      setSearchResults([]);
      setSearchPriceMap({});
      setSearchEbayMap({});
      const catalogResults = await searchMarketProducts(trimmed, productType, 1);
      const catalogPrice = catalogResults[0]?.latest_price ?? null;
      setProductPriceData(catalogPrice);
    } catch (err) {
      console.log('Product price search error:', err);
      setProductPriceData(null);
    } finally {
      setProductPriceLoading(false);
      setSearching(false);
    }
  }, []);

  const runLookupSearch = useCallback(async (
    searchQuery: string,
    skipSetFilter = false,
    activeLookupType: LookupType = lookupType
  ) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchPriceMap({});
      setSearchEbayMap({});
      setProductPriceData(null);
      return;
    }

    if (isCardLookup(activeLookupType)) {
      setProductPriceData(null);
      await searchCards(searchQuery, skipSetFilter);
    } else {
      await searchProductPrice(searchQuery, activeLookupType);
    }
  }, [lookupType, searchCards, searchProductPrice]);

  const handleSearchChange = useCallback((text: string) => {
    setQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length < 2) {
      setSearchResults([]);
      setSearchEbayMap({});
      setProductPriceData(null);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      runLookupSearch(text, false, lookupType);
    }, isCardLookup(lookupType) ? 350 : 500);
  }, [lookupType, runLookupSearch]);

  const fetchDetailEbayData = useCallback(async (card: PokemonCard) => {
    try {
      setDetailPriceLoading(true);

      if (!PRICE_API_URL) { setDetailEbayData(null); return; }

      // set.name falls back to set_id (e.g. "base1") when raw_data is absent —
      // set IDs never appear in eBay titles so skip them to avoid killing results
      const rawSetName = card.set?.name ?? '';
      const setName = (rawSetName && rawSetName !== card.set?.id) ? rawSetName : '';

      const params = new URLSearchParams({
        name: card.name ?? '',
        setName,
        number: card.number ?? '',
        rarity: card.rarity ?? '',
        cardId: card.id ?? '',
        productType: 'card',
        pricingMode: lookupType === 'graded_slab' ? 'graded' : 'raw',
      });
      if (lookupType === 'graded_slab') {
        params.set('gradingCompany', gradingCompany);
        params.set('grade', grade);
      } else {
        params.set('condition', rawCondition);
      }
      const printedTotal = card.set?.printedTotal ?? card.set?.total;
      if (printedTotal != null) params.set('setTotal', String(printedTotal));

      const response = await fetch(`${PRICE_API_URL}/api/price/ebay?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch eBay price');

      const data = await response.json();
      if (__DEV__) {
        console.log('[market:eBay:detail]', {
          cardId: card.id,
          pricingMode: lookupType === 'graded_slab' ? 'graded' : 'raw',
          gradingCompany: lookupType === 'graded_slab' ? gradingCompany : undefined,
          grade: lookupType === 'graded_slab' ? grade : undefined,
          condition: lookupType === 'raw_card' ? rawCondition : undefined,
          query: data.query,
          count: data.count,
          average: data.average,
          source: data.soldDataSource,
          usedCachedPrice: data.usedCachedPrice,
        });
      }
      setDetailEbayData({
        low: data.low ?? null,
        average: data.average ?? null,
        high: data.high ?? null,
        count: data.count ?? null,
        query: data.query ?? null,
        soldDataSource: data.soldDataSource ?? null,
      });
    } catch (err) {
      console.log('eBay detail price error:', err);
      setDetailEbayData(null);
    } finally {
      setDetailPriceLoading(false);
    }
  }, [grade, gradingCompany, lookupType, rawCondition]);

  const openCardDetail = useCallback(async (card: PokemonCard) => {
    translateY.setValue(0);
    setSelectedCard(card);
    setDetailVisible(true);
  }, [translateY]);

  useEffect(() => {
    if (!detailVisible || !selectedCard) return;
    fetchDetailEbayData(selectedCard);
  }, [detailVisible, fetchDetailEbayData, selectedCard, grade, gradingCompany]);


  const toggleWatchlist = useCallback(async (card: PokemonCard) => {
    if (!userId) return;
    if (isWatching(card.id)) {
      await supabase.from('market_watchlist').delete().eq('user_id', userId).eq('card_id', card.id);
    } else {
      await supabase.from('market_watchlist').insert({ user_id: userId, card_id: card.id, set_id: card.set?.id ?? null });
    }
    await loadWatchlist();
  }, [userId, isWatching, loadWatchlist]);

  // ===============================
  // SCAN CARD
  // ===============================

  const handleScanCard = useCallback(async () => {
  scanStore.setCallback(async (base64Image: string) => {
    try {
      setScanning(true);

      if (!PRICE_API_URL) {
        throw new Error('Price API URL is not configured.');
      }

      const { response: cardSightResponse, json: parsed } = await fetchJsonWithTimeout(
        `${PRICE_API_URL}/api/cardsight/identify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image }),
        },
        12000
      );

      if (!cardSightResponse.ok) {
        throw new Error(parsed?.error ?? `Card scan failed with status ${cardSightResponse.status}.`);
      }

      if (parsed?.error || !parsed?.name) {
        Alert.alert('Could not identify card', 'Try taking a clearer photo of the card.');
        return;
      }

      setQuery(parsed.name.trim());
      await searchCards(parsed.name.trim(), true);

      if (parsed.number) {
        const numberClean = parsed.number.split('/')[0].trim().replace(/^0+/, '');

        const { data: cardData } = await supabase
          .from('pokemon_cards')
          .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
          .ilike('name', `%${parsed.name.trim()}%`)
          .limit(120);

        const cards = (cardData ?? []).map(mapCard);

        const numberMatches = cards.filter((c) => {
          const cardNum = (c.number ?? '').replace(/^0+/, '');
          return cardNum === numberClean;
        });

        let match: PokemonCard | undefined;

        if (numberMatches.length === 1) {
          match = numberMatches[0];
        } else if (numberMatches.length > 1) {
          if (parsed.set) {
            const setNameLower = parsed.set.toLowerCase();
            const fuzzyMatch = numberMatches.find((c) =>
              c.set?.name?.toLowerCase().includes(setNameLower.split(' ')[0]) ||
              setNameLower.includes((c.set?.name ?? '').toLowerCase().split(' ')[0])
            );
            if (fuzzyMatch) { match = fuzzyMatch; }
          }

          if (!match) {
            const setIds = [...new Set(numberMatches.map(c => c.set?.id).filter(Boolean))];
            const { data: setsData } = await supabase
              .from('pokemon_sets')
              .select('id, release_date')
              .in('id', setIds as string[])
              .order('release_date', { ascending: false });

            const mostRecentSetId = setsData?.[0]?.id;
            match = numberMatches.find(c => c.set?.id === mostRecentSetId) ?? numberMatches[0];
          }
        }

        if (match) {
          setSearchResults(cards);
          openCardDetail(match);
        }
      }
    } catch (err: any) {
      console.log('Market scan callback failed:', {
        message: err?.message ?? String(err),
        stack: err?.stack,
      });
      Alert.alert(
        'Scan failed',
        `Something went wrong before the market result could open.\n\n${err?.message ?? String(err)}`
      );
    } finally {
      setScanning(false);
    }
  });

  router.push({ pathname: '/scan', params: { mode: 'market' } });
}, [searchCards, openCardDetail]);

  // ===============================
  // RENDER HELPERS
  // ===============================

  const renderPriceChange = useCallback((cardId: string) => {
    const priceData = watchlistPriceMap[cardId];
    if (!priceData) return <Text style={{ color: theme.colors.textSoft, fontSize: 14, marginTop: 6 }}>--</Text>;

    const { latestPrice, change, percentChange, hasHistory } = priceData;
    const changeColor = change == null ? theme.colors.textSoft : change > 0 ? '#22C55E' : change < 0 ? '#EF4444' : theme.colors.textSoft;

    return (
      <View style={{ marginTop: 10, marginBottom: 10, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>{formatCurrency(latestPrice)}</Text>
        {hasHistory ? (
          <Text style={{ fontSize: 13, fontWeight: '700', color: changeColor }}>{formatDelta(change)} {formatPercent(percentChange)}</Text>
        ) : (
          <Text style={{ fontSize: 13, color: theme.colors.textSoft }}>No history yet</Text>
        )}
      </View>
    );
  }, [watchlistPriceMap]);

  const renderCard = useCallback(({ item }: { item: PokemonCard }) => {
    const watching = isWatching(item.id);
    const tcgMid = getBestTcgPrice(item, 'mid');
    const priceSnapshot = searchPriceMap[item.id];
    const liveEbay = searchEbayMap[item.id];
    const snapshotTcg = priceSnapshot?.tcgLatest ?? null;
    const displayTcg = snapshotTcg ?? (tcgMid != null ? tcgMid * USD_TO_GBP : null);
    const tcgChange = priceSnapshot?.tcgChange ?? null;
    const tcgMovementColor = tcgChange == null ? theme.colors.textSoft : tcgChange > 0 ? '#2ECC71' : tcgChange < 0 ? '#FF5A5F' : theme.colors.textSoft;
    const tcgMovementIcon = tcgChange == null ? null : tcgChange > 0 ? 'arrow-up' : tcgChange < 0 ? 'arrow-down' : 'remove';

    return (
      <Pressable
        onPress={() => openCardDetail(item)}
        style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.colors.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}
      >
        <Image source={{ uri: item.images?.small ?? item.images?.large }} style={{ width: 86, height: 120, borderRadius: 12, backgroundColor: theme.colors.surface }} resizeMode="contain" />

        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }} numberOfLines={2}>{item.name}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 4 }} numberOfLines={1}>
            {item.set?.name ?? 'Unknown set'}{item.number ? ` • #${item.number}` : ''}
          </Text>
          {item.rarity && <Text style={{ color: '#FFD166', fontSize: 12, marginTop: 3, fontWeight: '700' }}>{item.rarity}</Text>}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700' }}>
              {snapshotTcg != null ? formatSnapshotDay(priceSnapshot?.snapshotAt) : 'TCG'}
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
              {formatCurrency(displayTcg)}
            </Text>
            {tcgMovementIcon ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name={tcgMovementIcon} size={13} color={tcgMovementColor} />
                <Text style={{ color: tcgMovementColor, fontSize: 12, fontWeight: '800' }}>
                  {formatDelta(tcgChange)} {formatPercent(priceSnapshot?.tcgPercentChange)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700' }}>eBay sold</Text>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>
              {liveEbay === undefined ? 'Checking...' : formatCurrency(liveEbay?.average ?? priceSnapshot?.ebayAverage)}
            </Text>
          </View>
          {(liveEbay?.count ?? priceSnapshot?.ebayCount) != null && (liveEbay?.count ?? priceSnapshot?.ebayCount ?? 0) > 0 ? (
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 4 }}>
              Based on {liveEbay?.count ?? priceSnapshot?.ebayCount} sold listing{(liveEbay?.count ?? priceSnapshot?.ebayCount) !== 1 ? 's' : ''}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={() => toggleWatchlist(item)}
            style={{ marginTop: 10, alignSelf: 'flex-start', backgroundColor: watching ? theme.colors.secondary : theme.colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: watching ? theme.colors.secondary : theme.colors.border }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>{watching ? '✓ Watching' : '+ Watch'}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  }, [isWatching, openCardDetail, searchEbayMap, searchPriceMap, theme.colors.text, theme.colors.textSoft, toggleWatchlist]);

  const renderWatchlistCard = useCallback(({ item }: { item: PokemonCard }) => {
    const watching = isWatching(item.id);

    return (
      <Pressable
        onPress={() => openCardDetail(item)}
        style={{ width: 280, flexDirection: 'row', backgroundColor: theme.colors.card, borderRadius: 18, padding: 12, marginRight: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'flex-start', ...cardShadow }}
      >
        <Image source={{ uri: item.images?.small ?? item.images?.large }} style={{ width: 82, height: 114, borderRadius: 10, backgroundColor: theme.colors.surface }} resizeMode="contain" />

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800' }} numberOfLines={2}>{item.name}</Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
            {item.set?.name ?? 'Unknown set'}{item.number ? ` • #${item.number}` : ''}
          </Text>
          {renderPriceChange(item.id)}
          <TouchableOpacity
            onPress={() => toggleWatchlist(item)}
            style={{ alignSelf: 'flex-start', backgroundColor: watching ? theme.colors.secondary : theme.colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: watching ? theme.colors.secondary : theme.colors.border }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>{watching ? '✓ Watching' : '+ Watch'}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  }, [isWatching, openCardDetail, renderPriceChange, toggleWatchlist]);

  const renderLookupOption = useCallback((option: { key: LookupType; label: string; icon: keyof typeof Ionicons.glyphMap }) => {
    const active = lookupType === option.key;
    return (
      <TouchableOpacity
        key={option.key}
        onPress={() => {
          if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
          setLookupType(option.key);
          setLookupMenuOpen(false);
          setSearchResults([]);
          setProductPriceData(null);
          if (query.trim().length >= 2) {
            searchTimerRef.current = setTimeout(() => {
              runLookupSearch(query, false, option.key);
            }, 120);
          }
        }}
        style={{
          width: '31%',
          minHeight: 102,
          backgroundColor: active ? theme.colors.primary + '10' : theme.colors.card,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: active ? theme.colors.primary : theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
          marginBottom: 10,
          position: 'relative',
        }}
      >
        {active && (
          <View style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
        )}
        <Ionicons name={option.icon} size={34} color={active ? theme.colors.primary : theme.colors.text} />
        <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 11, textAlign: 'center', marginTop: 8 }} numberOfLines={2}>
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  }, [lookupType, query, runLookupSearch, theme.colors.border, theme.colors.card, theme.colors.primary, theme.colors.text]);

  const selectedLookupOption = LOOKUP_OPTIONS.find((option) => option.key === lookupType) ?? LOOKUP_OPTIONS[0];

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await loadWatchlist(); setRefreshing(false); }}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
            <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: '900', color: theme.colors.text }}>Latest Prices</Text>
            <Text style={{ marginTop: 2, fontSize: 12, fontWeight: '700', lineHeight: 18, color: theme.colors.textSoft, marginBottom: 16 }}>
              Search raw cards, graded slabs, sealed products, and accessories.
            </Text>

            <TouchableOpacity
              onPress={() => setLookupMenuOpen((open) => !open)}
              activeOpacity={0.85}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: lookupMenuOpen ? theme.colors.primary : theme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: lookupMenuOpen ? 10 : 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: theme.colors.primary + '14',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={selectedLookupOption.icon} size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 10, fontWeight: '900' }}>PRICE MODE</Text>
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>
                    {selectedLookupOption.label}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={lookupMenuOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.textSoft}
              />
            </TouchableOpacity>

            {lookupMenuOpen ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
                {LOOKUP_OPTIONS.map(renderLookupOption)}
              </View>
            ) : null}

            {/* Search + Scan row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
<TextInput
                value={query}
                onChangeText={handleSearchChange}
                placeholder={getLookupSearchHint(lookupType)}
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.card,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 13,
                }}
                returnKeyType="search"
                onSubmitEditing={() => runLookupSearch(query, false, lookupType)}
              />

              <TouchableOpacity
                onPress={() => runLookupSearch(query, false, lookupType)}
                style={{ backgroundColor: theme.colors.primary, borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Search</Text>
              </TouchableOpacity>

              {isCardLookup(lookupType) && (
                <TouchableOpacity
                  onPress={handleScanCard}
                  disabled={scanning}
                  style={{ backgroundColor: theme.colors.card, borderRadius: 14, width: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, opacity: scanning ? 0.6 : 1 }}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="camera-outline" size={22} color={theme.colors.text} />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {!isCardLookup(lookupType) && (
              <ProductPricePanel
                title={query.trim() ? buildProductQuery(query, lookupType) : LOOKUP_OPTIONS.find((option) => option.key === lookupType)?.label ?? 'Product price'}
                data={productPriceData}
                loading={productPriceLoading}
              />
            )}

            {isCardLookup(lookupType) && (
              <>
                {/* Watchlist */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>Watchlist</Text>
                  {watchlistLoading && <ActivityIndicator color={theme.colors.textSoft} size="small" />}
                </View>

                {!userId ? (
                  <EmptyBox text="Sign in to use your market watchlist." />
                ) : watchlistLoading ? (
                  <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border }}>
                    <ActivityIndicator color={theme.colors.primary} />
                  </View>
                ) : watchlistCards.length === 0 ? (
                  <EmptyBox text="No watched cards yet. Search for a card and tap Watch." />
                ) : (
                  <FlatList
                    data={watchlistCards}
                    keyExtractor={(item) => `watch-${item.id}`}
                    renderItem={renderWatchlistCard}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 0, paddingBottom: 4, marginBottom: 16 }}
                  />
                )}

                {/* Results header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>
                    {searchResults.length > 0 ? `Latest prices (${searchResults.length})` : 'Latest price results'}
                  </Text>
                  {searching && <ActivityIndicator color={theme.colors.textSoft} size="small" />}
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          !searching && isCardLookup(lookupType) ? (
            <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, padding: 18, marginHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20 }}>
                Search for a Pokémon card to view pricing and add it to your watchlist.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Card Detail Modal */}
      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={closeDetail}>
        <BlurView intensity={95} tint="dark" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={closeDetail} />

          <SafeAreaView style={{ flex: 1 }}>
            <Animated.View style={{ flex: 1, transform: [{ translateY }] }} {...panResponder.panHandlers}>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 44 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative' }}>
                  <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.55)' }} />
                  <TouchableOpacity onPress={closeDetail} style={{ position: 'absolute', right: 0, padding: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 20, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>

                {selectedCard && (
                  <>
                    <Image
                      source={{ uri: selectedCard.images?.large ?? selectedCard.images?.small }}
                      style={{ width: '100%', height: 330, borderRadius: 20, alignSelf: 'center', marginBottom: 18 }}
                      resizeMode="contain"
                    />

                    <View style={{ backgroundColor: theme.colors.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: theme.colors.border, ...cardShadow }}>
                      <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>{selectedCard.name}</Text>
                      <Text style={{ marginTop: 6, color: theme.colors.textSoft, fontSize: 15, marginBottom: 4 }}>
                        {selectedCard.set?.name ?? 'Unknown set'}{selectedCard.number ? ` • #${selectedCard.number}` : ''}
                      </Text>
                      {selectedCard.rarity && (
                        <Text style={{ color: '#FFD166', fontSize: 13, fontWeight: '700', marginBottom: 8 }}>{selectedCard.rarity}</Text>
                      )}

                      <TouchableOpacity
                        onPress={() => toggleWatchlist(selectedCard)}
                        style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: isWatching(selectedCard.id) ? theme.colors.secondary : theme.colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: isWatching(selectedCard.id) ? theme.colors.secondary : theme.colors.border }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 14 }}>
                          {isWatching(selectedCard.id) ? '✓ Watching' : '+ Watch'}
                        </Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                        {(['raw_card', 'graded_slab'] as LookupType[]).map((mode) => {
                          const active = lookupType === mode;
                          return (
                            <TouchableOpacity
                              key={mode}
                              onPress={() => setLookupType(mode)}
                              style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: active ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.border }}
                            >
                              <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 13 }}>
                                {mode === 'raw_card' ? 'Raw' : 'Graded'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {lookupType === 'graded_slab' ? (
                        <>
                          <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12, marginTop: 14, marginBottom: 8 }}>Grading company</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {GRADING_COMPANIES.map((company) => (
                              <TouchableOpacity
                                key={company}
                                onPress={() => setGradingCompany(company)}
                                style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: gradingCompany === company ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: gradingCompany === company ? theme.colors.primary : theme.colors.border }}
                              >
                                <Text style={{ color: gradingCompany === company ? '#FFFFFF' : theme.colors.text, fontWeight: '800', fontSize: 12 }}>{company}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12, marginTop: 14, marginBottom: 8 }}>Grade</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {GRADES.map((value) => (
                              <TouchableOpacity
                                key={value}
                                onPress={() => setGrade(value)}
                                style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: grade === value ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: grade === value ? theme.colors.primary : theme.colors.border }}
                              >
                                <Text style={{ color: grade === value ? '#FFFFFF' : theme.colors.text, fontWeight: '800', fontSize: 12 }}>{value}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      ) : (
                        <>
                          <Text style={{ color: theme.colors.textSoft, fontWeight: '800', fontSize: 12, marginTop: 14, marginBottom: 8 }}>Condition</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {RAW_CONDITIONS.map((condition) => (
                              <TouchableOpacity
                                key={condition}
                                onPress={() => setRawCondition(condition)}
                                style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: rawCondition === condition ? theme.colors.primary : theme.colors.surface, borderWidth: 1, borderColor: rawCondition === condition ? theme.colors.primary : theme.colors.border }}
                              >
                                <Text style={{ color: rawCondition === condition ? '#FFFFFF' : theme.colors.text, fontWeight: '800', fontSize: 12 }}>{condition}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      )}

                      <View style={{ marginTop: 16, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800' }}>
                            {lookupType === 'graded_slab' ? `Live eBay sold - ${gradingCompany} ${grade}` : `Live eBay sold - ${rawCondition}`}
                          </Text>
                          {detailPriceLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
                        </View>

                        {detailPriceLoading ? (
                          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Fetching live eBay sold prices...</Text>
                        ) : (
                          <>
                            <PriceRow label="Low" value={formatCurrency(detailEbayData?.low)} />
                            <PriceRow label="Average" value={formatCurrency(detailEbayData?.average)} highlight />
                            <PriceRow label="High" value={formatCurrency(detailEbayData?.high)} />
                            {detailEbayData?.count != null && (
                              <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 6 }}>
                                Based on {detailEbayData.count} sold listing{detailEbayData.count !== 1 ? 's' : ''}
                              </Text>
                            )}
                          </>
                        )}
                      </View>

                      <PriceSection title="TCGPlayer (GBP est.)">
                        <PriceRow label="Low" value={getBestTcgPrice(selectedCard, 'low') != null ? `£${((getBestTcgPrice(selectedCard, 'low') ?? 0) * USD_TO_GBP).toFixed(2)}` : '--'} />
                        <PriceRow label="Mid" value={getBestTcgPrice(selectedCard, 'mid') != null ? `£${((getBestTcgPrice(selectedCard, 'mid') ?? 0) * USD_TO_GBP).toFixed(2)}` : '--'} />
                        <PriceRow label="Market" value={getBestTcgPrice(selectedCard, 'market') != null ? `£${((getBestTcgPrice(selectedCard, 'market') ?? 0) * USD_TO_GBP).toFixed(2)}` : '--'} />
                      </PriceSection>

                      {selectedCard.cardmarket?.prices && (
                        <PriceSection title="Cardmarket (GBP est.)">
                          <PriceRow label="Trend" value={selectedCard.cardmarket.prices.trendPrice != null ? `£${(selectedCard.cardmarket.prices.trendPrice * EUR_TO_GBP).toFixed(2)}` : '--'} />
                          <PriceRow label="30d Avg" value={selectedCard.cardmarket.prices.avg30 != null ? `£${(selectedCard.cardmarket.prices.avg30 * EUR_TO_GBP).toFixed(2)}` : '--'} />
                        </PriceSection>
                      )}

                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </SafeAreaView>
        </BlurView>
      </Modal>
    </SafeAreaView>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function EmptyBox({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border }}>
      <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function ProductPricePanel({ title, data, loading }: { title: string; data: ProductPriceResult | null; loading: boolean }) {
  const { theme } = useTheme();
  const tcgMarket = data?.tcgMarket ?? null;
  const tcgMid = data?.tcgMid ?? null;
  const tcgLow = data?.tcgLow ?? null;
  return (
    <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', flex: 1 }} numberOfLines={2}>{title}</Text>
        {loading && <ActivityIndicator color={theme.colors.primary} size="small" />}
      </View>
      {loading ? (
        <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Checking latest TCG prices...</Text>
      ) : data ? (
        <>
          <PriceRow label="TCG Market" value={formatCurrency(tcgMarket)} highlight />
          <PriceRow label="TCG Mid" value={formatCurrency(tcgMid)} />
          <PriceRow label="TCG Low" value={formatCurrency(tcgLow)} />
          <PriceRow label="eBay Sold Avg" value={formatCurrency(data.average)} />
          <PriceRow label="eBay Low" value={formatCurrency(data.low)} />
          <PriceRow label="eBay High" value={formatCurrency(data.high)} />
          {data.tcgProductId != null && (
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 6 }}>
              TCGCSV product #{data.tcgProductId}
            </Text>
          )}
          {data.count != null && data.count > 0 && (
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 4 }}>
              eBay based on {data.count} sold listing{data.count !== 1 ? 's' : ''}
            </Text>
          )}
        </>
      ) : (
        <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Search the product catalog to see latest TCG prices.</Text>
      )}
    </View>
  );
}

function PriceSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: 16, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border }}>
      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function PriceRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: highlight ? theme.colors.primary : theme.colors.text, fontSize: highlight ? 15 : 14, fontWeight: highlight ? '900' : '700' }}>
        {value}
      </Text>
    </View>
  );
}
