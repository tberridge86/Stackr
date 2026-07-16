import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import {
  MarketEmptyState,
  MarketFilterChip,
  MarketFilterSheet,
  MarketHeader,
  MarketListingCard,
  MarketListingCardData,
  MarketListingVariant,
  MarketMode,
  MarketModeSelector,
  MarketProtectionTier,
  MarketSearch,
  MarketSkeleton,
  MarketValueSummary,
  ProtectionDetail,
  SellerIdentityRow,
  StickyMarketActions,
} from '../../components/market/MarketComponents';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrImage, prefetchStackrImagesAfterInteractions } from '../../components/StackrImage';
import { StackrScreen } from '../../components/StackrScreen';
import { formatSlabCompanyLabel } from '../../components/SlabStickerLabel';
import { useProfile } from '../../components/profile-context';
import { useTheme } from '../../components/theme-context';
import { useTrade } from '../../components/trade-context';
import { PRICE_API_URL } from '../../lib/config';
import { getCachedCardsForSet, getCachedCardSync } from '../../lib/pokemonTcgCache';
import { correctPokemonNameQuery } from '../../lib/pokemonNameAutocorrect';
import { listingCategoryIcons, type ListingCategoryType } from '../../lib/listingCategoryIcons';
import { getListingCategories, type ListingCategoryKey } from '../../lib/listingCategoryRegistry';
import { calculateListingProtectionTier } from '../../lib/listingFlow';
import {
  clearCreateListingDraft,
  readCreateListingDraftSummary,
  type CreateListingDraftSummary,
} from '../../lib/listingDrafts';
import { fetchSavedMarketListingIds, toggleSavedMarketListing } from '../../lib/marketSavedItems';
import { MarketplaceListing } from '../../lib/marketplace';
import { marketIcons } from '../../lib/marketIcons';
import { stackrIcons } from '../../lib/stackrIcons';
import { getPokemonSetLogoUrl } from '../../lib/pokemonTcg';
import { supabase } from '../../lib/supabase';
import { TRADE_STATUS_LABELS, normaliseTradeStatus } from '../../lib/transactionStates';
import { fetchMyTradeOffers, TradeOffer } from '../../lib/tradeOffers';
import { stackrListPerformance } from '../../lib/performance';
import { stackrCardImageSizes, stackrTabContentPadding } from '../../lib/stackrSizing';

type PrimaryFilter = 'all' | ListingCategoryKey;
type SortKey = 'recommended' | 'recent' | 'priceAsc' | 'priceDesc' | 'bestValue' | 'relevant' | 'chase';
type Workspace = 'discover' | 'myListings';
type SellerFilter = { userId: string; name?: string | null } | null;
type ParsedMarketQuery = {
  raw: string;
  normalised: string;
  compact: string;
  terms: string[];
  cardNumber?: string | null;
  setTotal?: string | null;
};
type SearchSuggestion = {
  key: string;
  label: string;
  subtitle?: string | null;
  imageUri?: string | null;
  setLogoUrl?: string | null;
  onPress: () => void;
};

type CardDetail = {
  id: string;
  name: string;
  language?: string | null;
  number?: string | null;
  rarity?: string | null;
  set?: { id?: string | null; name?: string | null; printedTotal?: number | null; total?: number | null };
  images?: { small?: string | null; large?: string | null };
  rawData?: any;
};

type GalleryItem = {
  uri: string;
  label: string;
};

const CONDITION_FILTERS = ['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

const MARKET_CATEGORY_FILTERS: { key: PrimaryFilter; label: string; icon?: keyof typeof Ionicons.glyphMap; imageIcon?: ImageSourcePropType }[] = [
  { key: 'all', label: 'All' },
  ...getListingCategories().map((category) => ({
    key: category.key,
    label: category.title,
    imageIcon: category.asset,
  })),
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'recent', label: 'Recently listed' },
  { key: 'priceAsc', label: 'Price low to high' },
  { key: 'priceDesc', label: 'Price high to low' },
  { key: 'bestValue', label: 'Best value' },
  { key: 'relevant', label: 'Most relevant' },
  { key: 'chase', label: 'Closest chase match' },
];

const PHOTO_LABELS = ['Seller front', 'Seller back', 'Surface', 'Edges', 'Holo detail', 'Additional photo'];
const MARKET_BACKDROP = require('../../assets/rev2/01-brand/app/backdrop.png');

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `\u00A3${value.toFixed(2)}`
    : '--';

function isProductListing(listing: MarketplaceListing) {
  return Boolean(
    listing.product_type
    && listing.product_type !== 'raw_card'
    && listing.product_type !== 'graded_slab'
    && listing.product_name
  );
}

function isGradedListing(listing: MarketplaceListing) {
  return listing.pricing_mode === 'graded' || Boolean(listing.grade_company || listing.grade);
}

function isSealedListing(listing: MarketplaceListing, card?: CardDetail | null) {
  if (isProductListing(listing)) return true;
  const text = `${listing.product_name ?? ''} ${listing.product_type ?? ''} ${card?.name ?? ''} ${listing.listing_notes ?? ''}`.toLowerCase();
  return text.includes('sealed') || text.includes('booster') || text.includes('etb') || text.includes('box');
}

function titleCaseProductType(value: string | null | undefined) {
  return String(value ?? 'Listing')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getListingCategoryType(listing: MarketplaceListing): ListingCategoryType {
  if (isGradedListing(listing) || listing.product_type === 'graded_slab') return 'graded_slab';
  if (isProductListing(listing) && listing.product_type && listing.product_type in listingCategoryIcons) {
    return listing.product_type as ListingCategoryType;
  }
  if (isProductListing(listing)) return 'sealed_product';
  return 'raw_card';
}

function getListingCategoryLabel(listing: MarketplaceListing) {
  const category = getListingCategoryType(listing);
  if (category === 'raw_card') return 'Raw Card';
  if (category === 'graded_slab') return 'Graded Slab';
  return titleCaseProductType(category);
}

function hasSellerPhotos(listing: MarketplaceListing) {
  const media = Array.isArray(listing.listing_media) ? listing.listing_media : [];
  if (media.some((item: any) => item?.url && item.role !== 'stock' && item.slot !== 'stock')) return true;
  if (listing.seller_front_image_url || listing.seller_back_image_url) return true;
  return (listing.listing_images ?? []).some(Boolean);
}

function getListingImage(listing: MarketplaceListing, card?: CardDetail | null, large = false) {
  if (isProductListing(listing)) {
    return listing.listing_images?.[0] ?? listing.official_image_url ?? null;
  }
  return (
    listing.official_image_url
    ?? (large ? card?.images?.large : card?.images?.small)
    ?? card?.images?.large
    ?? card?.images?.small
    ?? listing.listing_images?.[0]
    ?? null
  );
}

function addGalleryItem(items: GalleryItem[], uri: string | null | undefined, label: string) {
  if (!uri || items.some((item) => item.uri === uri)) return;
  items.push({ uri, label });
}

function buildListingGallery(listing: MarketplaceListing, card?: CardDetail | null) {
  const items: GalleryItem[] = [];
  addGalleryItem(items, getListingImage(listing, card, true), isProductListing(listing) ? 'Listing photo' : 'Official card image');

  const media = Array.isArray(listing.listing_media) ? listing.listing_media : [];
  if (media.length) {
    media.forEach((item: any, index: number) => {
      if (!item?.url || item.role === 'stock' || item.slot === 'stock') return;
      addGalleryItem(items, item.url, item.label ?? PHOTO_LABELS[index] ?? `Photo ${index + 1}`);
    });
  }

  addGalleryItem(items, listing.seller_front_image_url, 'Seller front');
  addGalleryItem(items, listing.seller_back_image_url, 'Seller back');
  (listing.listing_images ?? []).forEach((uri, index) => {
    addGalleryItem(items, uri, PHOTO_LABELS[index] ?? `Photo ${index + 1}`);
  });

  return items;
}

function getListingVariant(listing: MarketplaceListing): MarketListingVariant {
  if (listing.status === 'sold' || listing.status === 'completed' || listing.status === 'purchased') return 'sold';
  if (listing.status === 'reserved') return 'reserved';
  if (listing.status === 'archived' || listing.status === 'cancelled') return 'unavailable';
  if (listing.trade_only && listing.asking_price != null) return 'tradePlusCash';
  if (listing.trade_only) return 'trade';
  if (listing.asking_price == null) return 'openToOffers';
  return 'buy';
}

function getProtectionTier(listing: MarketplaceListing): MarketProtectionTier {
  const selectedTier = getSelectedProtectionTierFromNotes(listing);
  if (selectedTier) return selectedTier;

  const decision = calculateListingProtectionTier({
    marketValue: listing.market_estimate ?? listing.prices?.preferred_value ?? null,
    listingValue: listing.asking_price,
    tradeValue: listing.custom_value,
  });

  if (decision.tier === 'gold') return 'Gold';
  if (decision.tier === 'silver') return 'Silver';
  return 'Bronze';
}

function getSelectedProtectionTierFromNotes(listing: MarketplaceListing): MarketProtectionTier | null {
  const notes = listing.listing_notes ?? listing.notes ?? '';
  const match = notes.match(/Protection selected:\s*(Bronze Protection|Silver Protection|Gold Verified|Bronze|Silver|Gold)/i);
  if (!match?.[1]) return null;
  const selected = match[1].toLowerCase();
  if (selected.includes('gold')) return 'Gold';
  if (selected.includes('silver')) return 'Silver';
  if (selected.includes('bronze')) return 'Bronze';
  return null;
}

function requiresSilverAgreement(listing: MarketplaceListing) {
  const notes = listing.listing_notes ?? listing.notes ?? '';
  return /Silver agreement required/i.test(notes);
}

function getTradeTerms(listing: MarketplaceListing) {
  if (listing.trade_only && listing.asking_price != null) return `Trade + up to ${money(listing.asking_price)}`;
  if (listing.trade_only) return 'Looking for a card-for-card trade';
  if (listing.asking_price == null) return 'Open to purchase or trade offers';
  return listing.listing_notes?.trim() || 'Purchase listing';
}

function normalise(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/pok\u00E9mon/gi, 'pokemon')
    .toLowerCase()
    .replace(/[^a-z0-9#\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingZeroes(value: string | null | undefined) {
  const stripped = String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return stripped || (value ? '0' : '');
}

function parseMarketQuery(value: string): ParsedMarketQuery {
  const raw = value.trim();
  const normalised = normalise(raw.replace(/#/g, ' #'));
  const compact = normalised.replace(/\s+/g, '');
  const numberMatch =
    raw.match(/#?\s*0*(\d{1,4})\s*(?:\/|-|\sof\s|\s+)\s*0*(\d{1,4})/i)
    ?? raw.match(/#\s*0*(\d{1,4})/i);

  return {
    raw,
    normalised,
    compact,
    terms: normalised.split(' ').filter(Boolean),
    cardNumber: numberMatch?.[1] ? stripLeadingZeroes(numberMatch[1]) : null,
    setTotal: numberMatch?.[2] ? stripLeadingZeroes(numberMatch[2]) : null,
  };
}

function normaliseCardNumber(value: string | null | undefined) {
  return stripLeadingZeroes(String(value ?? '').split('/')[0]);
}

function getCardSetTotal(card?: CardDetail | null) {
  const total = card?.set?.printedTotal ?? card?.set?.total ?? null;
  return total != null ? stripLeadingZeroes(String(total)) : '';
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? row[j - 1]
        : Math.min(row[j - 1] + 1, prev + 1, current + 1);
      prev = current;
    }
    row[0] = i;
  }
  return row[b.length];
}

function isCloseMatch(query: string, candidate: string) {
  if (query.length < 4 || candidate.length < 4) return false;
  if (candidate.includes(query) || query.includes(candidate)) return true;
  return levenshteinDistance(query, candidate) <= (query.length > 7 ? 2 : 1);
}

function getListingSearchMeta(listing: MarketplaceListing, card?: CardDetail | null) {
  const seller = listing.profiles?.collector_name ?? '';
  const cardName = isProductListing(listing) ? listing.product_name ?? '' : card?.name ?? listing.product_name ?? listing.card_id;
  const setName = card?.set?.name ?? listing.set_id ?? '';
  const japaneseNames = [
    card?.rawData?.japaneseName,
    card?.rawData?.japanese_name,
    card?.rawData?.name_jp,
    card?.rawData?.localName,
    card?.rawData?.printedName,
    card?.rawData?.romajiName,
    card?.rawData?.romanisedName,
    card?.rawData?.romanizedName,
    card?.rawData?.set?.japaneseName,
    card?.rawData?.set?.japanese_name,
    card?.rawData?.set?.printedName,
    card?.rawData?.set?.romajiName,
    card?.rawData?.set?.romanisedName,
    card?.rawData?.set?.romanizedName,
  ].filter(Boolean);
  const cardNumber = normaliseCardNumber(card?.number ?? listing.card_id);
  const setTotal = getCardSetTotal(card);
  const listingType = [
    isGradedListing(listing) ? 'graded psa slab' : 'raw',
    isSealedListing(listing, card) ? 'sealed booster box etb product' : '',
    listing.trade_only ? 'trade' : 'buy sell',
    listing.asking_price == null ? 'offer open offers' : '',
  ].join(' ');
  const haystack = normalise([
    cardName,
    ...japaneseNames,
    setName,
    card?.number,
    setTotal ? `${cardNumber}/${setTotal}` : null,
    card?.rarity,
    listing.product_name,
    listing.product_type,
    listing.card_id,
    listing.set_id,
    listing.condition,
    listing.grade_company,
    listing.grade,
    seller,
    listingType,
    listing.listing_notes,
  ].filter(Boolean).join(' '));

  return {
    seller,
    cardName,
    setName,
    cardNumber,
    setTotal,
    listingType,
    haystack,
    compactHaystack: haystack.replace(/\s+/g, ''),
  };
}

function scoreListingSearch(listing: MarketplaceListing, card: CardDetail | undefined, query: ParsedMarketQuery) {
  if (!query.normalised) return 1;
  const meta = getListingSearchMeta(listing, card);
  let score = 0;

  if (query.cardNumber && meta.cardNumber === query.cardNumber) {
    score += query.setTotal ? (meta.setTotal === query.setTotal ? 1200 : 0) : 900;
  }
  if (query.compact && meta.compactHaystack.includes(query.compact)) score += 320;
  if (normalise(meta.cardName) === query.normalised) score += 800;
  if (normalise(meta.setName) === query.normalised) score += 720;
  if (normalise(meta.seller) === query.normalised) score += 650;
  if (normalise(meta.cardName).includes(query.normalised)) score += 360;
  if (normalise(meta.setName).includes(query.normalised)) score += 320;
  if (normalise(meta.seller).includes(query.normalised)) score += 260;
  if (meta.haystack.includes(query.normalised)) score += 140;
  if (query.terms.length && query.terms.every((term) => meta.haystack.includes(term))) score += 120;
  if (isCloseMatch(query.normalised, normalise(meta.cardName))) score += 90;
  if (isCloseMatch(query.normalised, normalise(meta.setName))) score += 70;

  return score;
}

function getRecentLabel(value?: string | null) {
  if (!value) return 'Recently listed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently listed';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function TheMarketTab() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    mode?: string;
    segment?: string;
    q?: string;
    listingId?: string;
    cardId?: string;
    productId?: string;
    userId?: string;
    userName?: string;
  }>();
  const { profile } = useProfile();
  const {
    marketplaceListings,
    myListings,
    tradeLoading,
    tradeError,
    refreshTrade,
    archiveListing,
  } = useTrade();

  const [mode, setMode] = useState<MarketMode>(params.mode === 'trade' ? 'trade' : 'buy');
  const [workspace, setWorkspace] = useState<Workspace>(params.segment === 'myListings' ? 'myListings' : 'discover');
  const [search, setSearch] = useState(params.q ? String(params.q) : '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('recommended');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [photosOnly, setPhotosOnly] = useState(false);
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [cardDetails, setCardDetails] = useState<Record<string, CardDetail>>({});
  const [savedListingIds, setSavedListingIds] = useState<string[]>([]);
  const [favoriteBusyIds, setFavoriteBusyIds] = useState<string[]>([]);
  const [hiddenListingIds, setHiddenListingIds] = useState<string[]>([]);
  const [blockedSellerIds, setBlockedSellerIds] = useState<string[]>([]);
  const [sellerFilter, setSellerFilter] = useState<SellerFilter>(null);
  const [menuListing, setMenuListing] = useState<MarketplaceListing | null>(null);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [listingDraft, setListingDraft] = useState<CreateListingDraftSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCard, setDetailCard] = useState<CardDetail | null>(null);
  const [createCtaCollapsed, setCreateCtaCollapsed] = useState(false);
  const openedParamRef = useRef<string | null>(null);

  const incomingOfferCount = offers.filter((offer) => offer.receiver_id === currentUserId && offer.status === 'pending').length;
  const marketColumnGap = 10;
  const marketColumnCount = width >= 370 ? 2 : 1;
  const marketCardWidth = marketColumnCount === 2 ? (width - 32 - marketColumnGap) / 2 : undefined;
  const activeFilterCount =
    Number(primaryFilter !== 'all')
    + Number(sortBy !== 'recommended')
    + selectedConditions.length
    + Number(Boolean(minPrice.trim()))
    + Number(Boolean(maxPrice.trim()))
    + Number(photosOnly);

  useEffect(() => {
    if (params.mode === 'trade' || params.mode === 'buy') setMode(params.mode);
    if (params.segment === 'myListings') setWorkspace('myListings');
    if (params.q != null) setSearch(String(params.q));
  }, [params.mode, params.q, params.segment]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 240);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    const query = debouncedSearch.trim();
    if (!query) {
      setSuggestion(null);
      return;
    }
    correctPokemonNameQuery(query, { allowIndex: false }).then((result) => {
      if (!active) return;
      const corrected = result.correctedQuery.trim();
      setSuggestion(corrected && corrected.toLowerCase() !== query.toLowerCase() ? corrected : null);
    }).catch(() => {
      if (active) setSuggestion(null);
    });
    return () => {
      active = false;
    };
  }, [debouncedSearch]);

  const loadOffers = useCallback(async () => {
    try {
      const data = await fetchMyTradeOffers();
      setOffers(data);
    } catch (error) {
      console.log('Failed to load Market offers', error);
      setOffers([]);
    }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      setSavedListingIds(await fetchSavedMarketListingIds());
    } catch {
      setSavedListingIds([]);
    }
  }, []);

  const loadListingDraft = useCallback(async () => {
    setListingDraft(await readCreateListingDraftSummary());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        setCurrentUserId(user?.id ?? '');
        await Promise.all([refreshTrade(), loadOffers(), loadSaved(), loadListingDraft()]);
      };
      run();
      return () => {
        active = false;
      };
    }, [loadListingDraft, loadOffers, loadSaved, refreshTrade])
  );

  const sourceListings = useMemo(() => {
    const listings = workspace === 'myListings' ? myListings : marketplaceListings;
    const userId = sellerFilter?.userId ?? (params.userId ? String(params.userId) : '');
    const cardId = params.cardId ? String(params.cardId) : '';
    const productId = params.productId ? String(params.productId) : '';
    let filtered = userId ? listings.filter((listing) => listing.user_id === userId) : listings;
    if (cardId) filtered = filtered.filter((listing) => listing.card_id === cardId);
    if (productId) filtered = filtered.filter((listing) => listing.card_id === productId);
    return filtered;
  }, [marketplaceListings, myListings, params.cardId, params.productId, params.userId, sellerFilter?.userId, workspace]);

  useEffect(() => {
    let mounted = true;
    let cancelPrefetch: (() => void) | undefined;
    const loadDetails = async () => {
      const next: Record<string, CardDetail> = {};
      const listings = sourceListings.slice(0, 80);
      const cacheMisses: typeof listings = [];

      for (const listing of listings) {
        if (!listing.card_id || isProductListing(listing)) continue;
        const found = listing.set_id ? getCachedCardSync(listing.set_id, listing.card_id) as any : null;
        if (found?.name) {
          next[listing.id] = {
            id: found.id ?? listing.card_id,
            name: found.name,
            language: found.language ?? null,
            number: found.number ?? null,
            rarity: found.rarity ?? null,
            set: found.set ?? { id: listing.set_id, name: listing.set_id },
            images: found.images ?? {},
            rawData: found.raw_data ?? null,
          };
          continue;
        }
        cacheMisses.push(listing);
      }

      const unresolvedListings = [...cacheMisses];
      if (cacheMisses.length) {
        try {
          const missingCardIds = [...new Set(cacheMisses.map((listing) => listing.card_id).filter(Boolean))];
          const { data } = await supabase
            .from('pokemon_cards')
            .select('id, name, language, number, rarity, set_id, image_small, image_large, raw_data')
            .in('id', missingCardIds);
          const dbCards = new Map((data ?? []).map((card: any) => [card.id, card]));

          for (let index = unresolvedListings.length - 1; index >= 0; index -= 1) {
            const listing = unresolvedListings[index];
            const data = dbCards.get(listing.card_id);
            if (!data) continue;

            next[listing.id] = {
              id: data.id,
              name: data.name ?? listing.card_id,
              language: data.language ?? null,
              number: data.number ?? null,
              rarity: data.rarity ?? data.raw_data?.rarity ?? null,
              set: {
                id: data.set_id ?? listing.set_id,
                name: data.raw_data?.set?.name ?? data.set_id ?? listing.set_id,
                printedTotal: data.raw_data?.set?.printedTotal ?? null,
                total: data.raw_data?.set?.total ?? null,
              },
              images: {
                small: data.image_small ?? data.raw_data?.images?.small ?? null,
                large: data.image_large ?? data.raw_data?.images?.large ?? null,
              },
              rawData: data.raw_data ?? null,
            };
            unresolvedListings.splice(index, 1);
          }
        } catch (error) {
          console.log('Market card detail batch lookup failed', error);
        }
      }

      const fallbackSetIds = [
        ...new Set(unresolvedListings.map((listing) => listing.set_id).filter((setId): setId is string => Boolean(setId))),
      ];
      for (const setId of fallbackSetIds) {
        try {
          const setCards = await getCachedCardsForSet(setId);
          for (let index = unresolvedListings.length - 1; index >= 0; index -= 1) {
            const listing = unresolvedListings[index];
            if (listing.set_id !== setId) continue;
            const found = setCards.find((card: any) => card.id === listing.card_id) as any;
            if (!found?.name) continue;
            next[listing.id] = {
              id: found.id ?? listing.card_id,
              name: found.name,
              language: found.language ?? null,
              number: found.number ?? null,
              rarity: found.rarity ?? null,
              set: found.set ?? { id: listing.set_id, name: listing.set_id },
              images: found.images ?? {},
              rawData: found.raw_data ?? null,
            };
            unresolvedListings.splice(index, 1);
          }
        } catch (error) {
          console.log('Market set card fallback lookup failed', error);
        }
      }

      if (!mounted) return;
      setCardDetails(next);
      cancelPrefetch = prefetchStackrImagesAfterInteractions(
        Object.values(next).map((card) => card.images?.small),
        14
      );
    };

    if (sourceListings.length) {
      loadDetails();
    } else {
      setCardDetails({});
    }

    return () => {
      mounted = false;
      cancelPrefetch?.();
    };
  }, [sourceListings]);

  const displayListings = useMemo(() => {
    const query = parseMarketQuery(debouncedSearch);
    const min = Number(minPrice);
    const max = Number(maxPrice);

    let data = sourceListings
      .filter((listing) => !hiddenListingIds.includes(listing.id) && !blockedSellerIds.includes(listing.user_id))
      .map((listing) => {
        const card = cardDetails[listing.id];
        return { listing, searchScore: scoreListingSearch(listing, card, query) };
      })
      .filter(({ listing, searchScore }) => {
      const card = cardDetails[listing.id];
      const variant = getListingVariant(listing);
      if (mode === 'buy' && !(variant === 'buy' || variant === 'openToOffers')) return false;
      if (mode === 'trade' && variant === 'sold') return false;

      if (primaryFilter !== 'all' && getListingCategoryType(listing) !== primaryFilter) return false;
      if (selectedConditions.length && (!listing.condition || !selectedConditions.includes(listing.condition))) return false;
      if (photosOnly && !hasSellerPhotos(listing)) return false;
      if (Number.isFinite(min) && minPrice.trim() && (listing.asking_price ?? 0) < min) return false;
      if (Number.isFinite(max) && maxPrice.trim() && (listing.asking_price ?? 0) > max) return false;
      if (query.normalised && searchScore <= 0) return false;
      return true;
    });

    data = [...data].sort((a, b) => {
      if (query.normalised && b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      if (sortBy === 'priceAsc') return (a.listing.asking_price ?? Number.MAX_SAFE_INTEGER) - (b.listing.asking_price ?? Number.MAX_SAFE_INTEGER);
      if (sortBy === 'priceDesc') return (b.listing.asking_price ?? 0) - (a.listing.asking_price ?? 0);
      if (sortBy === 'bestValue') {
        const av = (a.listing.market_estimate ?? a.listing.prices?.preferred_value ?? 0) - (a.listing.asking_price ?? 0);
        const bv = (b.listing.market_estimate ?? b.listing.prices?.preferred_value ?? 0) - (b.listing.asking_price ?? 0);
        return bv - av;
      }
      return new Date(b.listing.created_at ?? 0).getTime() - new Date(a.listing.created_at ?? 0).getTime();
    });

    return data.map((item) => item.listing);
  }, [blockedSellerIds, cardDetails, debouncedSearch, hiddenListingIds, maxPrice, minPrice, mode, photosOnly, primaryFilter, selectedConditions, sortBy, sourceListings]);

  const searchSuggestions = useMemo(() => {
    const query = parseMarketQuery(debouncedSearch);
    if (!query.normalised) return {
      cards: [] as SearchSuggestion[],
      sets: [] as SearchSuggestion[],
      sellers: [] as SearchSuggestion[],
    };

    const cards = new Map<string, SearchSuggestion>();
    const sets = new Map<string, SearchSuggestion>();
    const sellers = new Map<string, SearchSuggestion>();

    sourceListings.forEach((listing) => {
      const card = cardDetails[listing.id];
      const score = scoreListingSearch(listing, card, query);
      if (score <= 0) return;
      const meta = getListingSearchMeta(listing, card);
      const title = isProductListing(listing) ? listing.product_name ?? 'Sealed product' : card?.name ?? listing.product_name ?? listing.card_id;
      const imageUri = getListingImage(listing, card);
      const setId = card?.set?.id ?? listing.set_id ?? null;
      const setLogoUrl = setId ? getPokemonSetLogoUrl(setId) : null;

      if (!cards.has(listing.card_id) && !isProductListing(listing)) {
        cards.set(listing.card_id, {
          key: `card:${listing.card_id}`,
          label: title,
          subtitle: [card?.number ? `#${card.number}` : null, card?.set?.name ?? listing.set_id].filter(Boolean).join(' • '),
          imageUri,
          setLogoUrl,
          onPress: () => setSearch([title, card?.number].filter(Boolean).join(' ')),
        });
      }

      if (setId && !sets.has(setId)) {
        sets.set(setId, {
          key: `set:${setId}`,
          label: card?.set?.name ?? listing.set_id ?? 'Set',
          subtitle: `${displayListings.filter((item) => item.set_id === listing.set_id).length || 1} listing${displayListings.filter((item) => item.set_id === listing.set_id).length === 1 ? '' : 's'}`,
          setLogoUrl,
          onPress: () => setSearch(card?.set?.name ?? listing.set_id ?? ''),
        });
      }

      if (listing.user_id && !sellers.has(listing.user_id) && meta.seller) {
        sellers.set(listing.user_id, {
          key: `seller:${listing.user_id}`,
          label: meta.seller,
          subtitle: 'Seller profile',
          imageUri: listing.profiles?.avatar_url ?? null,
          onPress: () => {
            setSellerFilter({ userId: listing.user_id, name: meta.seller });
            setWorkspace('discover');
          },
        });
      }
    });

    return {
      cards: [...cards.values()].slice(0, 4),
      sets: [...sets.values()].slice(0, 3),
      sellers: [...sellers.values()].slice(0, 3),
    };
  }, [cardDetails, debouncedSearch, displayListings, sourceListings]);

  const mapListingCard = useCallback((listing: MarketplaceListing): MarketListingCardData => {
    const card = cardDetails[listing.id];
    const product = isProductListing(listing);
    const image = getListingImage(listing, card);
    const title = product ? listing.product_name ?? 'Sealed product' : card?.name ?? listing.product_name ?? listing.card_id;
    const setName = product
      ? listing.product_type?.replace(/_/g, ' ')
      : card?.set?.name ?? listing.set_id;
    const sellerName = listing.profiles?.collector_name ?? (listing.user_id === currentUserId ? profile?.collector_name : null);
    const variant = getListingVariant(listing);
    const categoryType = getListingCategoryType(listing);
    const favoriteCount = Number((listing as any).favorite_count ?? (listing as any).saved_count ?? 0) || 0;
    return {
      id: listing.id,
      title,
      setName,
      cardNumber: card?.number ?? null,
      language: card?.language ?? null,
      variant: card?.rarity ?? null,
      imageUri: image,
      fullImageUri: getListingImage(listing, card, true),
      condition: listing.condition,
      gradeCompany: listing.grade_company,
      grade: listing.grade,
      price: listing.asking_price,
      buyerTotal: null,
      buyerTotalUnavailable: true,
      marketEstimate: listing.market_estimate ?? listing.prices?.preferred_value ?? null,
      terms: getTradeTerms(listing),
      sellerName,
      sellerAvatarUrl: listing.profiles?.avatar_url ?? null,
      sellerUserId: listing.user_id,
      verified: Boolean(listing.profiles?.collector_name),
      protectionTier: getProtectionTier(listing),
      protectionAgreementRequired: requiresSilverAgreement(listing),
      variantType: variant,
      saved: savedListingIds.includes(listing.id),
      favoriteCount,
      inDemand: favoriteCount >= 21,
      isMine: listing.user_id === currentUserId,
      createdAt: listing.created_at,
      categoryLabel: getListingCategoryLabel(listing),
      categoryImageIcon: listingCategoryIcons[categoryType],
    };
  }, [cardDetails, currentUserId, profile?.collector_name, savedListingIds]);

  const openListing = useCallback(async (listing: MarketplaceListing) => {
    setSelectedListing(listing);
    setDetailCard(cardDetails[listing.id] ?? null);
    if (cardDetails[listing.id] || isProductListing(listing) || !listing.card_id) return;
    try {
      setDetailLoading(true);
      const { data } = await supabase
        .from('pokemon_cards')
        .select('id, name, language, number, rarity, set_id, image_small, image_large, raw_data')
        .eq('id', listing.card_id)
        .maybeSingle();
      if (data) {
        const detail = {
          id: data.id,
          name: data.name ?? listing.card_id,
          language: data.language ?? null,
          number: data.number ?? null,
          rarity: data.rarity ?? data.raw_data?.rarity ?? null,
          set: {
            id: data.set_id ?? listing.set_id,
            name: data.raw_data?.set?.name ?? data.set_id ?? listing.set_id,
            printedTotal: data.raw_data?.set?.printedTotal ?? null,
            total: data.raw_data?.set?.total ?? null,
          },
          images: {
            small: data.image_small ?? data.raw_data?.images?.small ?? null,
            large: data.image_large ?? data.raw_data?.images?.large ?? null,
          },
          rawData: data.raw_data ?? null,
        };
        setDetailCard(detail);
        setCardDetails((prev) => ({ ...prev, [listing.id]: detail }));
      }
    } catch (error) {
      console.log('Listing detail card lookup failed', error);
    } finally {
      setDetailLoading(false);
    }
  }, [cardDetails]);

  useEffect(() => {
    const listingId = params.listingId ? String(params.listingId) : '';
    if (!listingId || openedParamRef.current === listingId) return;
    const listing = [...marketplaceListings, ...myListings].find((item) => item.id === listingId);
    if (listing) {
      openedParamRef.current = listingId;
      void openListing(listing);
    }
  }, [marketplaceListings, myListings, openListing, params.listingId]);

  const closeDetail = () => {
    setSelectedListing(null);
    setDetailCard(null);
  };

  const handleToggleSaved = async (listingId: string) => {
    if (favoriteBusyIds.includes(listingId)) return;
    const previous = savedListingIds;
    const next = previous.includes(listingId)
      ? previous.filter((id) => id !== listingId)
      : [...previous, listingId];
    setSavedListingIds(next);
    setFavoriteBusyIds((current) => [...current, listingId]);
    try {
      setSavedListingIds(await toggleSavedMarketListing(listingId));
    } catch (error) {
      setSavedListingIds(previous);
      Alert.alert('Could not update Favorites', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setFavoriteBusyIds((current) => current.filter((id) => id !== listingId));
    }
  };

  const handleArchive = async (listing: MarketplaceListing) => {
    Alert.alert('Mark unavailable', 'Remove this listing from The Market?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveListing(listing.id);
            closeDetail();
            await refreshTrade();
          } catch (error) {
            Alert.alert('Could not update listing', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const openSellerProfile = (listing: MarketplaceListing) => {
    setMenuListing(null);
    if (listing.user_id) router.push({ pathname: '/user/[id]', params: { id: listing.user_id } });
  };

  const viewSellerListings = (listing: MarketplaceListing) => {
    setMenuListing(null);
    setWorkspace('discover');
    setSellerFilter({
      userId: listing.user_id,
      name: listing.profiles?.collector_name ?? 'this seller',
    });
  };

  const readSellerReviews = (listing: MarketplaceListing) => {
    Alert.alert(
      listing.profiles?.collector_name ? `${listing.profiles.collector_name} reviews` : 'Seller reviews',
      'Seller reviews are not available for this seller yet.'
    );
  };

  const shareListing = async (listing: MarketplaceListing) => {
    try {
      await Share.share({
        title: 'StackR Market listing',
        message: `View this listing in The Market: ${listing.product_name ?? listing.card_id}`,
      });
    } catch (error) {
      Alert.alert('Could not share listing', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const reportListing = (listing: MarketplaceListing) => {
    Alert.alert('Report this listing', 'Choose a reason and optionally provide supporting details.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report listing',
        style: 'destructive',
        onPress: () => Alert.alert('Report received', 'Thanks. StackR will review this listing.'),
      },
    ]);
  };

  const hideListing = (listing: MarketplaceListing) => {
    Alert.alert('Hide this listing?', 'You will no longer see this listing in your Market feed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Hide listing',
        style: 'destructive',
        onPress: () => {
          setHiddenListingIds((current) => [...new Set([...current, listing.id])]);
          setMenuListing(null);
        },
      },
    ]);
  };

  const blockSeller = (listing: MarketplaceListing) => {
    Alert.alert('Block this seller?', 'You will no longer see listings or messages from this seller.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block seller',
        style: 'destructive',
        onPress: () => {
          setBlockedSellerIds((current) => [...new Set([...current, listing.user_id])]);
          setMenuListing(null);
        },
      },
    ]);
  };

  const openOfferBuilder = (listing: MarketplaceListing) => {
    closeDetail();
    router.push({
      pathname: '/offer/new',
      params: {
        listingId: listing.id,
        targetUserId: listing.user_id,
        cardId: listing.card_id,
        setId: listing.set_id ?? '',
      },
    });
  };

  const handleBuyNow = () => {
    Alert.alert(
      'Checkout not yet enabled',
      'Stackr checkout, shipping and payment handling still need backend support. You can make an offer or propose a trade from this listing.'
    );
  };

  const clearFilters = () => {
    setPrimaryFilter('all');
    setSortBy('recommended');
    setSelectedConditions([]);
    setMinPrice('');
    setMaxPrice('');
    setPhotosOnly(false);
  };

  const resumeListingDraft = () => {
    router.push('/listing/new' as any);
  };

  const discardListingDraft = () => {
    Alert.alert('Discard draft listing?', 'This removes the saved draft from My Listings. Your live listings will not be affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard draft',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearCreateListingDraft();
            setListingDraft(null);
          } catch (error) {
            Alert.alert('Could not discard draft', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const currentSortLabel = SORT_OPTIONS.find((option) => option.key === sortBy)?.label ?? 'Recommended';
  const draftCount = listingDraft ? 1 : 0;
  const listingCountCopy = sellerFilter
    ? `${displayListings.length} listing${displayListings.length === 1 ? '' : 's'} from ${sellerFilter.name ?? 'this seller'}`
    : workspace === 'myListings'
      ? `${myListings.length} live listing${myListings.length === 1 ? '' : 's'}${draftCount ? ` - ${draftCount} draft to resume` : ''}`
      : `${displayListings.length} listing${displayListings.length === 1 ? '' : 's'}`;

  const renderListingDraftCard = () => {
    if (workspace !== 'myListings' || !listingDraft) return null;
    const updatedLabel = listingDraft.updatedAt
      ? new Date(listingDraft.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : null;

    return (
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.primary + '28',
          backgroundColor: 'rgba(255,255,255,0.82)',
          padding: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              backgroundColor: theme.colors.primary + '12',
              borderWidth: 1,
              borderColor: theme.colors.primary + '24',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={{ color: theme.colors.primary, fontSize: 11.5, lineHeight: 15, fontWeight: '900' }}>
                Draft
              </Text>
              {updatedLabel ? (
                <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 15, fontWeight: '700' }}>
                  Saved {updatedLabel}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900', marginTop: 2 }} numberOfLines={2}>
              {listingDraft.title}
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
              {[listingDraft.subtitle, listingDraft.stepLabel, listingDraft.valueLabel].filter(Boolean).join(' - ')}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={resumeListingDraft}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel={`Resume draft listing for ${listingDraft.title}`}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: 13,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' }}>Resume draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={discardListingDraft}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel={`Discard draft listing for ${listingDraft.title}`}
            style={{
              minWidth: 92,
              minHeight: 40,
              borderRadius: 13,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, fontWeight: '900' }}>Discard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={{ gap: 10, paddingTop: 6, paddingBottom: 10 }}>
      <MarketHeader
        incomingOfferCount={incomingOfferCount}
        savedCount={savedListingIds.length}
        myListingCount={myListings.length + draftCount}
        profileAvatarUrl={profile?.avatar_url ?? null}
        profileAvatarPreset={profile?.avatar_preset ?? null}
        onSaved={() => router.push('/watchlist' as any)}
        onOffers={() => router.push('/offers' as any)}
        onMyListings={() => setWorkspace('myListings')}
        onOrders={() => router.push('/orders' as any)}
        onProfile={() => router.push('/(tabs)/profile' as any)}
        showShortcuts
      />

      <MarketSearch
        value={search}
        onChangeText={setSearch}
        onClear={() => setSearch('')}
        suggestion={suggestion}
        onUseSuggestion={() => {
          if (suggestion) setSearch(suggestion);
        }}
      />

      <MarketSearchSuggestions
        visible={Boolean(debouncedSearch.trim())}
        cards={searchSuggestions.cards}
        sets={searchSuggestions.sets}
        sellers={searchSuggestions.sellers}
      />

      <MarketModeSelector value={mode} onChange={(next) => {
        setMode(next);
        setWorkspace('discover');
      }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingLeft: 1, paddingRight: 40 }}>
        {MARKET_CATEGORY_FILTERS.map((filter) => (
          <MarketFilterChip
            key={filter.key}
            label={filter.label}
            icon={filter.icon}
            imageIcon={filter.imageIcon}
            active={primaryFilter === filter.key}
            onPress={() => setPrimaryFilter(filter.key)}
          />
        ))}
        <MarketFilterChip
          label={activeFilterCount > 0 ? `More (${activeFilterCount})` : 'More'}
          icon={marketIcons.filter}
          active={activeFilterCount > 0}
          onPress={() => setFiltersOpen(true)}
        />
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingTop: 1,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900' }} numberOfLines={1}>
            {listingCountCopy}
          </Text>
          {activeFilterCount > 0 ? (
            <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, lineHeight: 15, fontWeight: '700' }}>
              {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => setFiltersOpen(true)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`Sort listings, currently ${currentSortLabel}`}
          style={{
            minHeight: 34,
            borderRadius: 11,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: 'rgba(255,255,255,0.72)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900' }}>
            Sort: {currentSortLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={theme.colors.primary} />
        </TouchableOpacity>
        {workspace === 'myListings' || sellerFilter ? (
          <TouchableOpacity
            onPress={() => {
              setWorkspace('discover');
              setSellerFilter(null);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>
              {sellerFilter ? 'Clear' : 'Browse'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {workspace === 'myListings' ? (
        <>
          {renderListingDraftCard()}
          <TouchableOpacity
            onPress={() => router.push('/listing/new' as any)}
            activeOpacity={0.84}
            style={{
              minHeight: 42,
              borderRadius: 14,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 7,
            }}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '900' }}>Create Listing</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {tradeError ? (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', padding: 12 }}>
          <Text style={{ color: '#991B1B', fontSize: 12.5, lineHeight: 18, fontWeight: '800' }}>
            {tradeError}
          </Text>
          <TouchableOpacity onPress={refreshTrade} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '900' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const renderListing = ({ item }: { item: MarketplaceListing }) => {
    const card = mapListingCard(item);
    return (
      <View style={{ width: marketCardWidth, flex: marketColumnCount === 1 ? 1 : 0, marginBottom: 12 }}>
        <MarketListingCard
          item={card}
          onPress={() => openListing(item)}
          onSave={() => handleToggleSaved(item.id)}
          onSellerPress={() => {
            if (item.user_id) router.push({ pathname: '/user/[id]', params: { id: item.user_id } });
          }}
          onMore={() => {
            if (item.user_id === currentUserId) {
              handleArchive(item);
            } else {
              setMenuListing(item);
            }
          }}
        />
      </View>
    );
  };

  const handleMarketScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextCollapsed = event.nativeEvent.contentOffset.y > 80;
    setCreateCtaCollapsed((current) => (current === nextCollapsed ? current : nextCollapsed));
  }, []);

  return (
    <StackrScreen variant="tab">
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: theme.spacing.sm }}>
        <StackrBackdrop source={MARKET_BACKDROP} />
        {tradeLoading && displayListings.length === 0 ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: stackrTabContentPadding.floatingAction }}
            onScroll={handleMarketScroll}
            scrollEventThrottle={16}
          >
            {renderHeader()}
            <MarketSkeleton />
          </ScrollView>
        ) : (
          <FlatList
            key={`market-columns-${marketColumnCount}`}
            data={displayListings}
            numColumns={marketColumnCount}
            columnWrapperStyle={marketColumnCount > 1 ? { gap: marketColumnGap } : undefined}
            keyExtractor={(item) => item.id}
            renderItem={renderListing}
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={
              <View style={{ paddingTop: 10, paddingBottom: 64 }}>
                <MarketEmptyState
                  icon={mode === 'buy' ? marketIcons.buy : marketIcons.trade}
                  title={
                    workspace === 'myListings'
                      ? 'No live listings yet'
                      : debouncedSearch || activeFilterCount > 0
                      ? 'No matching listings'
                      : mode === 'buy'
                        ? 'No buy listings yet'
                        : 'No trade listings yet'
                  }
                  body={
                    workspace === 'myListings'
                      ? (listingDraft ? 'Resume your draft above or create a new listing when you are ready.' : 'Create a listing to publish it in The Market.')
                      : debouncedSearch || activeFilterCount > 0
                      ? 'Try changing your search or clearing filters.'
                      : mode === 'buy'
                        ? 'Check back soon or create your own listing from a card detail page.'
                        : 'Add cards to trade or browse buy listings while collectors add more.'
                  }
                  actionLabel={workspace === 'myListings' && listingDraft ? 'Resume draft' : debouncedSearch || activeFilterCount > 0 ? 'Clear filters' : 'Create listing'}
                  onAction={workspace === 'myListings' && listingDraft ? resumeListingDraft : debouncedSearch || activeFilterCount > 0 ? () => {
                    setSearch('');
                    clearFilters();
                  } : () => router.push('/listing/new' as any)}
                />
              </View>
            }
            refreshControl={<RefreshControl refreshing={tradeLoading} onRefresh={refreshTrade} tintColor={theme.colors.primary} />}
            showsVerticalScrollIndicator={false}
            onScroll={handleMarketScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: stackrTabContentPadding.floatingAction, flexGrow: displayListings.length === 0 ? 1 : 0 }}
            {...stackrListPerformance.marketListings}
          />
        )}
      </View>

      <TouchableOpacity
        onPress={() => router.push('/listing/new' as any)}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel="Create Listing"
        style={{
          position: 'absolute',
          right: 18,
          bottom: 94 + Math.min(insets.bottom, 16),
          width: createCtaCollapsed ? 48 : undefined,
          minWidth: createCtaCollapsed ? 48 : undefined,
          minHeight: 42,
          maxWidth: 172,
          borderRadius: 15,
          backgroundColor: 'rgba(255,255,255,0.88)',
          borderWidth: 1,
          borderColor: theme.colors.primary + '30',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 9,
          paddingLeft: 9,
          paddingRight: createCtaCollapsed ? 9 : 13,
          shadowColor: theme.colors.primary,
          shadowOpacity: 0.09,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          elevation: 2,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 12,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.28)',
          }}
        >
          <Ionicons name="add" size={17} color="#FFFFFF" />
        </View>
        {!createCtaCollapsed ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.86}
            style={{
              color: theme.colors.text,
              fontSize: 12.5,
              lineHeight: 16,
              fontWeight: '900',
            }}
          >
            Create Listing
          </Text>
        ) : null}
      </TouchableOpacity>

      <MarketFilterSheet
        visible={filtersOpen}
        activeFilterCount={activeFilterCount}
        onClose={() => setFiltersOpen(false)}
        onClear={clearFilters}
      >
        <FilterGroup title="Sort">
          {SORT_OPTIONS.map((option) => {
            const disabled = mode === 'buy' && option.key === 'chase';
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => !disabled && setSortBy(option.key)}
                disabled={disabled}
                style={{
                  minHeight: 38,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: sortBy === option.key ? theme.colors.primary : theme.colors.border,
                  backgroundColor: sortBy === option.key ? theme.colors.primary + '12' : theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: disabled ? 0.45 : 1,
                  paddingHorizontal: 10,
                }}
              >
                <Text style={{ color: sortBy === option.key ? theme.colors.primary : theme.colors.text, fontSize: 12, fontWeight: '900' }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </FilterGroup>

        <FilterGroup title={mode === 'buy' ? 'Buy filters' : 'Trade filters'}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={minPrice}
              onChangeText={setMinPrice}
              keyboardType="decimal-pad"
              placeholder="Min price"
              placeholderTextColor={theme.colors.textSoft}
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                paddingHorizontal: 12,
                fontWeight: '800',
              }}
            />
            <TextInput
              value={maxPrice}
              onChangeText={setMaxPrice}
              keyboardType="decimal-pad"
              placeholder="Max price"
              placeholderTextColor={theme.colors.textSoft}
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text,
                paddingHorizontal: 12,
                fontWeight: '800',
              }}
            />
          </View>
          <TouchableOpacity
            onPress={() => setPhotosOnly((value) => !value)}
            style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Ionicons
              name={photosOnly ? 'checkbox' : 'square-outline'}
              size={22}
              color={photosOnly ? theme.colors.primary : theme.colors.textSoft}
            />
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
              Seller photos only
            </Text>
          </TouchableOpacity>
        </FilterGroup>

        <FilterGroup title="Condition">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CONDITION_FILTERS.map((condition) => {
              const active = selectedConditions.includes(condition);
              return (
                <MarketFilterChip
                  key={condition}
                  label={condition}
                  active={active}
                  onPress={() => setSelectedConditions((current) => (
                    active ? current.filter((item) => item !== condition) : [...current, condition]
                  ))}
                />
              );
            })}
          </View>
        </FilterGroup>
      </MarketFilterSheet>

      <SellerOverflowSheet
        listing={menuListing}
        onClose={() => setMenuListing(null)}
        onViewProfile={openSellerProfile}
        onViewListings={viewSellerListings}
        onReadReviews={readSellerReviews}
        onShare={shareListing}
        onReport={reportListing}
        onHide={hideListing}
        onBlock={blockSeller}
      />

      <ListingDetailModal
        listing={selectedListing}
        card={detailCard ?? (selectedListing ? cardDetails[selectedListing.id] : null)}
        loading={detailLoading}
        saved={selectedListing ? savedListingIds.includes(selectedListing.id) : false}
        currentUserId={currentUserId}
        onClose={closeDetail}
        onSave={() => selectedListing && handleToggleSaved(selectedListing.id)}
        onOffer={() => selectedListing && openOfferBuilder(selectedListing)}
        onBuyNow={handleBuyNow}
        onArchive={() => selectedListing && handleArchive(selectedListing)}
      />
    </StackrScreen>
  );
}

function MarketSearchSuggestions({
  visible,
  cards,
  sets,
  sellers,
}: {
  visible: boolean;
  cards: SearchSuggestion[];
  sets: SearchSuggestion[];
  sellers: SearchSuggestion[];
}) {
  const { theme } = useTheme();
  if (!visible) return null;
  const hasSuggestions = cards.length || sets.length || sellers.length;
  if (!hasSuggestions) return null;

  const renderGroup = (title: string, items: SearchSuggestion[]) => {
    if (!items.length) return null;
    return (
      <View style={{ gap: 7 }}>
        <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase' }}>
          {title}
        </Text>
        {items.map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={item.onPress}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`${title} suggestion: ${item.label}`}
            style={{
              minHeight: 48,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 10,
              paddingVertical: 7,
            }}
          >
            {item.imageUri ? (
              <StackrImage
                uri={item.imageUri}
                contentFit="cover"
                rounded={11}
                style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: theme.colors.surface }}
              />
            ) : item.setLogoUrl ? (
              <Image source={{ uri: item.setLogoUrl }} resizeMode="contain" style={{ width: 38, height: 30 }} />
            ) : (
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={title === 'Sellers' ? 'person-outline' : 'albums-outline'} size={17} color={theme.colors.primary} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: theme.colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: '900' }} numberOfLines={1}>
                {item.label}
              </Text>
              {item.subtitle ? (
                <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 14, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            {item.setLogoUrl && item.imageUri ? (
              <Image source={{ uri: item.setLogoUrl }} resizeMode="contain" style={{ width: 36, height: 20 }} />
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: 'rgba(255,255,255,0.88)',
        padding: 10,
        gap: 11,
      }}
    >
      {renderGroup('Cards', cards)}
      {renderGroup('Sets', sets)}
      {renderGroup('Sellers', sellers)}
    </View>
  );
}

function SellerOverflowSheet({
  listing,
  onClose,
  onViewProfile,
  onViewListings,
  onReadReviews,
  onShare,
  onReport,
  onHide,
  onBlock,
}: {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onViewProfile: (listing: MarketplaceListing) => void;
  onViewListings: (listing: MarketplaceListing) => void;
  onReadReviews: (listing: MarketplaceListing) => void;
  onShare: (listing: MarketplaceListing) => void;
  onReport: (listing: MarketplaceListing) => void;
  onHide: (listing: MarketplaceListing) => void;
  onBlock: (listing: MarketplaceListing) => void;
}) {
  const { theme } = useTheme();
  if (!listing) return null;
  const sellerName = listing.profiles?.collector_name ?? 'Collector';
  const listingTitle = listing.product_name ?? listing.card_id;

  const action = (
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
    destructive = false
  ) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: 46,
        borderRadius: 14,
        paddingHorizontal: 12,
        backgroundColor: destructive ? '#FEF2F2' : theme.colors.surface,
        borderWidth: 1,
        borderColor: destructive ? '#FCA5A5' : theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Ionicons name={icon} size={18} color={destructive ? '#B91C1C' : theme.colors.primary} />
      <Text style={{ color: destructive ? '#991B1B' : theme.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal transparent animationType="slide" visible={Boolean(listing)} onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.28)' }} onPress={onClose} />
        <View
          accessibilityRole="menu"
          style={{
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <StackrImage
              uri={listing.profiles?.avatar_url ?? null}
              rounded={18}
              contentFit="cover"
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surface }}
              showFallbackIcon={false}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' }} numberOfLines={1}>
                {sellerName}
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '700' }} numberOfLines={1}>
                {listingTitle}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close listing actions" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>Seller</Text>
            {action('View seller profile', 'person-circle-outline', () => onViewProfile(listing))}
            {action("View seller's other listings", 'storefront-outline', () => onViewListings(listing))}
            {action('Read seller reviews', 'star-outline', () => onReadReviews(listing))}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>Listing</Text>
            {action('Share listing', 'share-outline', () => onShare(listing))}
            {action('Report listing', 'flag-outline', () => onReport(listing), true)}
            {action('Hide this listing', 'eye-off-outline', () => onHide(listing))}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>Safety</Text>
            {action('Block seller', 'ban-outline', () => onBlock(listing), true)}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 9 }}>
      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>{title}</Text>
      {children}
    </View>
  );
}

function ListingDetailModal({
  listing,
  card,
  loading,
  saved,
  currentUserId,
  onClose,
  onSave,
  onOffer,
  onBuyNow,
  onArchive,
}: {
  listing: MarketplaceListing | null;
  card?: CardDetail | null;
  loading?: boolean;
  saved?: boolean;
  currentUserId: string;
  onClose: () => void;
  onSave: () => void;
  onOffer: () => void;
  onBuyNow: () => void;
  onArchive: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    setGalleryIndex(0);
  }, [listing?.id]);

  if (!listing) return null;

  const variant = getListingVariant(listing);
  const tier = getProtectionTier(listing);
  const product = isProductListing(listing);
  const title = product ? listing.product_name ?? 'Sealed product' : card?.name ?? listing.card_id;
  const setName = product ? listing.product_type?.replace(/_/g, ' ') : card?.set?.name ?? listing.set_id;
  const categoryType = getListingCategoryType(listing);
  const categoryLabel = getListingCategoryLabel(listing);
  const gallery = buildListingGallery(listing, card);
  const isMine = listing.user_id === currentUserId;
  const canBuy = variant === 'buy' || variant === 'openToOffers';
  const canTrade = variant === 'trade' || variant === 'tradePlusCash' || variant === 'openToOffers';
  const isUnavailable = ['sold', 'reserved', 'unavailable'].includes(variant);
  const status = normaliseTradeStatus((listing.status as any) ?? 'pending');
  const statusLabel = TRADE_STATUS_LABELS[status] ?? String(listing.status ?? 'Published');
  const value = listing.market_estimate ?? listing.prices?.preferred_value ?? null;

  const primaryLabel = isMine
    ? 'Mark unavailable'
    : isUnavailable
      ? 'Return to The Market'
      : canBuy
        ? 'Buy now'
        : 'Propose trade';
  const secondaryLabel = isMine || isUnavailable
    ? undefined
    : canBuy && canTrade
      ? 'Propose trade'
      : canBuy
        ? 'Make offer'
        : undefined;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.34)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            maxHeight: '92%',
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 10,
              backgroundColor: theme.colors.card,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close listing detail"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-down" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' }} numberOfLines={1}>
                The Market
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11.5, fontWeight: '800' }} numberOfLines={1}>
                Listing detail
              </Text>
            </View>
            <TouchableOpacity
              onPress={onSave}
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Remove from Favorites' : 'Add to Favorites'}
              accessibilityState={{ selected: saved }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 42,
                height: 42,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: saved ? `${theme.colors.primary}14` : theme.colors.surface,
                borderWidth: 1,
                borderColor: saved ? `${theme.colors.primary}55` : theme.colors.border,
              }}
            >
              <Image
                source={stackrIcons.favorite}
                resizeMode="contain"
                style={{ width: 23, height: 23, opacity: saved ? 1 : 0.58 }}
                accessibilityIgnoresInvertColors
              />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 22 + insets.bottom }}>
            {loading ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : null}

            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const width = event.nativeEvent.layoutMeasurement.width || 1;
                setGalleryIndex(Math.round(event.nativeEvent.contentOffset.x / width));
              }}
              style={{ marginHorizontal: -16 }}
            >
              {(gallery.length ? gallery : [{ uri: '', label: 'Missing artwork' }]).map((item, index) => (
                <View key={`${item.uri || 'missing'}:${index}`} style={{ width: 360, maxWidth: 360, paddingHorizontal: 16 }}>
                  <View
                    style={{
                      aspectRatio: product ? 1 : stackrCardImageSizes.cardAspectRatio,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.card,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.uri ? (
                      <StackrImage uri={item.uri} contentFit="contain" rounded={18} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <Ionicons name="image-outline" size={42} color={theme.colors.textSoft} />
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }}>
                {gallery[galleryIndex]?.label ?? 'Missing artwork'} · {Math.min(galleryIndex + 1, Math.max(1, gallery.length))} of {Math.max(1, gallery.length)}
              </Text>
              {gallery.length > 1 ? (
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {gallery.map((item, index) => (
                    <View
                      key={`${item.uri}:${index}:dot`}
                      style={{
                        width: index === galleryIndex ? 16 : 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: index === galleryIndex ? theme.colors.primary : theme.colors.border,
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <View style={{ gap: 14, marginTop: 16 }}>
              <View>
                <Text style={{ color: theme.colors.text, fontSize: 23, lineHeight: 29, fontWeight: '900' }} numberOfLines={2}>
                  {title}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 4 }}>
                  {[setName, card?.number ? `#${card.number}` : null, card?.rarity].filter(Boolean).join(' · ') || 'Collector listing'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <DetailBadge label={variant === 'buy' ? 'Buy' : variant === 'tradePlusCash' ? 'Trade + cash' : variant === 'openToOffers' ? 'Open to offers' : variant === 'trade' ? 'Trade' : statusLabel} icon={variant === 'buy' ? marketIcons.buy : marketIcons.trade} />
                <DetailBadge label={categoryLabel} icon={categoryType === 'graded_slab' ? marketIcons.graded : categoryType === 'raw_card' ? marketIcons.raw : marketIcons.sealed} imageIcon={listingCategoryIcons[categoryType]} />
                <DetailBadge label={listing.grade_company || listing.grade ? `${formatSlabCompanyLabel(listing.grade_company ?? 'Graded')} ${listing.grade ?? ''}`.trim() : listing.condition ?? 'Condition in photos'} icon={listing.grade_company || listing.grade ? marketIcons.graded : marketIcons.raw} />
                <DetailBadge label={getRecentLabel(listing.created_at)} icon="time-outline" />
              </View>

              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.card,
                  padding: 13,
                  gap: 8,
                }}
              >
                <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>
                  {variant === 'buy' || variant === 'openToOffers' ? 'Price or offer' : 'Trade terms'}
                </Text>
                <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' }}>
                  {variant === 'buy'
                    ? money(listing.asking_price)
                    : variant === 'openToOffers'
                      ? 'Open to offers'
                      : getTradeTerms(listing)}
                </Text>
                {listing.listing_notes ? (
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, fontWeight: '700' }}>
                    {listing.listing_notes}
                  </Text>
                ) : null}
              </View>

              <SellerIdentityRow
                avatarUrl={listing.profiles?.avatar_url ?? null}
                name={listing.profiles?.collector_name ?? (isMine ? 'You' : 'Collector')}
                verified={Boolean(listing.profiles?.collector_name)}
                transactionCount={null}
                onPress={() => listing.user_id && router.push({ pathname: '/user/[id]', params: { id: listing.user_id } })}
              />

              <ProtectionDetail tier={tier} />

              {requiresSilverAgreement(listing) ? (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#F59E0B',
                    backgroundColor: '#FEF3C7',
                    padding: 12,
                    gap: 5,
                  }}
                >
                  <Text style={{ color: '#92400E', fontSize: 13, fontWeight: '900' }}>Silver agreement required</Text>
                  <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 17, fontWeight: '700' }}>
                    This listing uses Silver Protection by agreement. Silver relies on AI-assisted condition evidence and photos, not Gold AGS verification, so both parties must agree before proceeding.
                  </Text>
                </View>
              ) : null}

              <MarketValueSummary
                estimatedValue={value}
                recentRange={listing.prices?.ebay_average ? `around ${money(listing.prices.ebay_average)}` : null}
                lastUpdated={listing.updated_at ? new Date(listing.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null}
                price={listing.asking_price}
                deliveryIncluded={null}
              />

              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  padding: 12,
                  gap: 6,
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>Delivery and fulfilment</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>
                  Delivery, tracking, payment and fulfilment steps are confirmed after an offer or checkout flow is supported for this listing.
                </Text>
              </View>

              {PRICE_API_URL ? null : (
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B55', backgroundColor: '#FFFBEB', padding: 12 }}>
                  <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 17, fontWeight: '800' }}>
                    Live pricing is not configured in this build. Stored estimates may be stale.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          <StickyMarketActions
            primaryLabel={primaryLabel}
            secondaryLabel={secondaryLabel}
            onPrimary={() => {
              if (isMine) return onArchive();
              if (isUnavailable) return onClose();
              if (canBuy) return onBuyNow();
              return onOffer();
            }}
            onSecondary={() => onOffer()}
          />
        </View>
      </View>
    </Modal>
  );
}

function DetailBadge({
  icon,
  imageIcon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  imageIcon?: ImageSourcePropType;
  label: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        minHeight: 30,
        borderRadius: 999,
        paddingHorizontal: 10,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {imageIcon ? (
        <Image
          source={imageIcon}
          resizeMode="contain"
          style={{ width: 17, height: 17 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name={icon} size={14} color={theme.colors.primary} />
      )}
      <Text style={{ color: theme.colors.text, fontSize: 11.5, fontWeight: '900' }}>{label}</Text>
    </View>
  );
}
