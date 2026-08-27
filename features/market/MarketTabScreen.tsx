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
import { useAppMode } from '../../components/app-mode-context';
import { useTheme } from '../../components/theme-context';
import { useTrade } from '../../components/trade-context';
import {
  PRICE_API_URL,
  TRADE_CASH_TERMS_ENABLED,
} from '../../lib/config';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { fetchCachedPokemonCardDetails } from '../../lib/marketSearchDataCache';
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
import { sanitizeGate0CommerceCopy } from '../../lib/gate0CommerceCopy';
import { marketIcons } from '../../lib/marketIcons';
import { stackrIcons } from '../../lib/stackrIcons';
import { getPokemonSetLogoUrl } from '../../lib/pokemonTcg';
import { supabase } from '../../lib/supabase';
import { TRADE_STATUS_LABELS, normaliseTradeStatus } from '../../lib/transactionStates';
import { fetchMyTradeOffers, TradeOffer } from '../../lib/tradeOffers';
import { getIncrementalListWindow, stackrListPerformance } from '../../lib/performance';
import { stackrCardImageSizes, stackrTabContentPadding } from '../../lib/stackrSizing';

type PrimaryFilter = 'all' | ListingCategoryKey;
type SortKey = 'recommended' | 'recent' | 'priceAsc' | 'priceDesc' | 'bestValue' | 'relevant' | 'chase' | 'rarity' | 'set' | 'gradeDesc' | 'type';
type MarketLanguageFilter = 'en' | 'ja' | 'zh-tw';
type Workspace = 'discover' | 'myListings';
type MarketLayoutMode = 'browse' | 'compact';
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
  listingCount?: number;
  sourceLabel?: string | null;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryPress?: () => void;
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
  { key: 'rarity', label: 'Rarity' },
  { key: 'set', label: 'Set A-Z' },
  { key: 'gradeDesc', label: 'Grade high to low' },
  { key: 'type', label: 'Product/type' },
];

const MARKET_GRADER_FILTERS = ['PSA', 'BGS', 'CGC', 'TAG', 'ACE'];
const MARKET_GRADE_FILTERS = ['10', '9.5', '9', '8', '7 or lower'];
const MARKET_FALLBACK_RARITIES = ['Common', 'Uncommon', 'Rare', 'Double Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare', 'Secret Rare', 'Promo'];
const MARKET_LANGUAGE_FILTERS: { key: MarketLanguageFilter; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'ja', label: 'Japanese' },
  { key: 'zh-tw', label: 'Traditional Chinese' },
];
type MarketListingTypeFilter = {
  key: MarketListingVariant;
  label: string;
  modes: MarketMode[];
  icon: keyof typeof Ionicons.glyphMap;
};
const MARKET_LISTING_TYPE_FILTERS: MarketListingTypeFilter[] = ([
  { key: 'openToOffers', label: 'Offers', modes: ['buy', 'trade'], icon: 'chatbubbles-outline' },
  { key: 'trade', label: 'Trade only', modes: ['trade'], icon: 'swap-horizontal-outline' },
] as MarketListingTypeFilter[]).filter((filter) => (
  filter.key !== 'tradePlusCash' || TRADE_CASH_TERMS_ENABLED
));
const MARKET_PROTECTION_FILTERS: { key: MarketProtectionTier; label: string; imageIcon: ImageSourcePropType }[] = [
  { key: 'Bronze', label: 'Bronze', imageIcon: stackrIcons.protectionBronze },
  { key: 'Silver', label: 'Silver', imageIcon: stackrIcons.protectionSilver },
  { key: 'Gold', label: 'Gold', imageIcon: stackrIcons.protectionGold },
];
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

const PHOTO_LABELS = ['Seller front', 'Seller back', 'Surface', 'Edges', 'Holo detail', 'Additional photo'];
const MARKET_CARD_MIN_WIDTH = 142;
const MARKET_CARD_THREE_COLUMN_MIN_WIDTH = 152;

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `\u00A3${value.toFixed(2)}`
    : '--';

function gate0MarketText(value: unknown, fallback: string) {
  const sanitized = sanitizeGate0CommerceCopy(
    typeof value === 'string' ? value : value == null ? null : String(value),
    fallback,
  );
  return sanitized?.trim() || fallback;
}

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

function getSellerPhotoUris(listing: MarketplaceListing) {
  const photos: string[] = [];
  const media = Array.isArray(listing.listing_media) ? listing.listing_media : [];

  media.forEach((item: any) => {
    if (!item?.url || item.role === 'stock' || item.slot === 'stock') return;
    photos.push(item.url);
  });
  if (listing.seller_front_image_url) photos.push(listing.seller_front_image_url);
  if (listing.seller_back_image_url) photos.push(listing.seller_back_image_url);
  (listing.listing_images ?? []).forEach((uri) => {
    if (uri) photos.push(uri);
  });

  return [...new Set(photos)];
}

function getCatalogueImage(listing: MarketplaceListing, card?: CardDetail | null, large = false) {
  return (
    listing.official_image_url
    ?? (large ? card?.images?.large : card?.images?.small)
    ?? card?.images?.large
    ?? card?.images?.small
    ?? null
  );
}

function getListingImageStrategy(listing: MarketplaceListing, card?: CardDetail | null, large = false) {
  const categoryType = getListingCategoryType(listing);
  const sellerPhotos = getSellerPhotoUris(listing);
  const catalogueImage = getCatalogueImage(listing, card, large);
  const sellerLead = sellerPhotos[0] ?? null;

  if (categoryType === 'graded_slab') {
    return {
      uri: sellerLead ?? catalogueImage,
      label: sellerLead ? 'Slab photo' : 'Catalogue image',
      isCatalogue: !sellerLead,
    };
  }

  if (categoryType === 'raw_card') {
    return {
      uri: sellerLead ?? catalogueImage,
      label: sellerLead ? 'Seller photo' : 'Catalogue image',
      isCatalogue: !sellerLead,
    };
  }

  return {
    uri: catalogueImage ?? sellerLead,
    label: catalogueImage ? 'Catalogue image' : 'Seller photo',
    isCatalogue: Boolean(catalogueImage),
  };
}

function getListingImage(listing: MarketplaceListing, card?: CardDetail | null, large = false) {
  return getListingImageStrategy(listing, card, large).uri;
}

function addGalleryItem(items: GalleryItem[], uri: string | null | undefined, label: string) {
  if (!uri || items.some((item) => item.uri === uri)) return;
  items.push({ uri, label });
}

function buildListingGallery(listing: MarketplaceListing, card?: CardDetail | null) {
  const items: GalleryItem[] = [];
  const categoryType = getListingCategoryType(listing);
  const catalogueImage = getCatalogueImage(listing, card, true);
  const sellerPhotos = getSellerPhotoUris(listing);

  if (categoryType === 'raw_card' || categoryType === 'graded_slab') {
    sellerPhotos.forEach((uri, index) => {
      addGalleryItem(items, uri, categoryType === 'graded_slab' && index === 0 ? 'Seller slab photo' : PHOTO_LABELS[index] ?? `Seller photo ${index + 1}`);
    });
    addGalleryItem(items, catalogueImage, 'Catalogue reference');
    return items;
  }

  addGalleryItem(items, catalogueImage, 'Catalogue image');

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

function getProtectionTier(listing: MarketplaceListing): MarketProtectionTier | null {
  if (getListingCategoryType(listing) !== 'raw_card') return null;

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
  if (getListingCategoryType(listing) !== 'raw_card') return false;
  const notes = listing.listing_notes ?? listing.notes ?? '';
  return /Silver agreement required/i.test(notes);
}

function getTradeTerms(listing: MarketplaceListing) {
  if (TRADE_CASH_TERMS_ENABLED && listing.trade_only && listing.asking_price != null) {
    return `Trade + up to ${money(listing.asking_price)}`;
  }
  if (listing.trade_only) return 'Looking for a card-for-card trade';
  if (listing.asking_price == null) return 'Open to offers or trades';
  return gate0MarketText(listing.listing_notes, 'Collector listing');
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

function normaliseLanguageCode(value: string | null | undefined) {
  const normalised = normalise(value);
  if (normalised === 'ja' || normalised === 'jp' || normalised === 'japanese') return 'ja';
  if (normalised === 'zh tw' || normalised === 'zh' || normalised === 'zhtw' || normalised === 'chinese' || normalised === 'traditional chinese' || normalised === 'tc' || normalised === 'tw' || normalised === 'taiwan') return 'zh-tw';
  if (normalised === 'en' || normalised === 'english') return 'en';
  return normalised;
}

function parseGradeValue(value: string | number | null | undefined) {
  const match = String(value ?? '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function gradeMatchesFilter(value: string | number | null | undefined, filter: string) {
  const grade = parseGradeValue(value);
  if (filter === '7 or lower') return grade > 0 && grade <= 7;
  return normalise(value == null ? null : String(value)) === normalise(filter);
}

function getRarityRank(rarity: string | null | undefined) {
  const value = normalise(rarity);
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

function getListingSetLabel(listing: MarketplaceListing, card?: CardDetail | null) {
  return card?.set?.name ?? card?.set?.id ?? listing.set_id ?? '';
}

function getListingMarketValue(listing: MarketplaceListing) {
  return listing.market_estimate ?? listing.prices?.preferred_value ?? null;
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
  const seller = gate0MarketText(listing.profiles?.collector_name, 'Collector');
  const cardName = gate0MarketText(
    isProductListing(listing)
      ? listing.product_name
      : card?.name ?? listing.product_name ?? listing.card_id,
    'Collector listing',
  );
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

function isRecentlyAdded(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
}

export default function TheMarketTab() {
  const { theme } = useTheme();
  const { hydrated: appModeHydrated, premiumSellerAccess } = useAppMode();
  const canPublishListing = appModeHydrated && premiumSellerAccess.allowed;
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
  const [workspace, setWorkspace] = useState<Workspace>(params.segment === 'myListings' && canPublishListing ? 'myListings' : 'discover');
  const [search, setSearch] = useState(params.q ? String(params.q) : '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [catalogueCardSuggestions, setCatalogueCardSuggestions] = useState<SearchSuggestion[]>([]);
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('recommended');
  const [layoutMode, setLayoutMode] = useState<MarketLayoutMode>('browse');
  const [selectedListingTypes, setSelectedListingTypes] = useState<MarketListingVariant[]>([]);
  const [selectedProtectionTiers, setSelectedProtectionTiers] = useState<MarketProtectionTier[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedSetFilter, setSelectedSetFilter] = useState<string | null>(null);
  const [selectedGraders, setSelectedGraders] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<MarketLanguageFilter[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [photosOnly, setPhotosOnly] = useState(false);
  const [sealedOnly, setSealedOnly] = useState(false);
  const [recentlyAddedOnly, setRecentlyAddedOnly] = useState(false);
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [cardDetails, setCardDetails] = useState<Record<string, CardDetail>>({});
  const [savedListingIds, setSavedListingIds] = useState<string[]>([]);
  const [favoriteBusyIds, setFavoriteBusyIds] = useState<string[]>([]);
  const [sellerFilter, setSellerFilter] = useState<SellerFilter>(null);
  const [menuListing, setMenuListing] = useState<MarketplaceListing | null>(null);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [listingDraft, setListingDraft] = useState<CreateListingDraftSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCard, setDetailCard] = useState<CardDetail | null>(null);
  const [createCtaCollapsed, setCreateCtaCollapsed] = useState(false);
  const openedParamRef = useRef<string | null>(null);
  const marketAuthUserIdRef = useRef('');
  const marketAuthGenerationRef = useRef(0);

  const incomingOfferCount = offers.filter((offer) => offer.receiver_id === currentUserId && offer.status === 'pending').length;
  const marketColumnGap = 10;
  const marketAvailableWidth = Math.max(0, width - 32);
  const canUseThreeColumns = marketAvailableWidth >= (MARKET_CARD_THREE_COLUMN_MIN_WIDTH * 3) + (marketColumnGap * 2);
  const canUseTwoColumns = marketAvailableWidth >= (MARKET_CARD_MIN_WIDTH * 2) + marketColumnGap;
  const marketColumnCount = layoutMode === 'compact' && canUseThreeColumns
    ? 3
    : canUseTwoColumns
      ? 2
      : 1;
  const marketCardWidth = marketColumnCount > 1
    ? (marketAvailableWidth - marketColumnGap * (marketColumnCount - 1)) / marketColumnCount
    : undefined;
  const favoriteListingIds = useMemo(() => {
    const myListingIds = new Set(myListings.map((listing) => listing.id));
    return savedListingIds.filter((id) => !myListingIds.has(id));
  }, [myListings, savedListingIds]);
  const marketWindow = useMemo(
    () => getIncrementalListWindow(marketColumnCount, {
      initialRows: 6,
      pageRows: 5,
      minInitial: marketColumnCount === 1 ? 8 : 12,
      minPage: marketColumnCount === 1 ? 8 : 10,
    }),
    [marketColumnCount]
  );
  const [visibleListingCount, setVisibleListingCount] = useState(marketWindow.initialCount);
  const activeFilterCount =
    Number(primaryFilter !== 'all')
    + selectedListingTypes.length
    + selectedProtectionTiers.length
    + selectedConditions.length
    + selectedRarities.length
    + Number(Boolean(selectedSetFilter))
    + selectedGraders.length
    + selectedGrades.length
    + selectedLanguages.length
    + Number(Boolean(minPrice.trim()))
    + Number(Boolean(maxPrice.trim()))
    + Number(photosOnly)
    + Number(sealedOnly)
    + Number(recentlyAddedOnly)
    + Number(Boolean(sellerFilter));

  useEffect(() => {
    if (params.mode === 'trade' || params.mode === 'buy') setMode(params.mode);
    if (params.segment === 'myListings') setWorkspace(canPublishListing ? 'myListings' : 'discover');
    if (params.q != null) setSearch(String(params.q));
  }, [canPublishListing, params.mode, params.q, params.segment]);

  useEffect(() => {
    if (!canPublishListing) setWorkspace('discover');
  }, [canPublishListing]);

  useEffect(() => {
    setSelectedListingTypes((current) => (
      current.filter((selected) => MARKET_LISTING_TYPE_FILTERS.some((filter) => filter.key === selected && filter.modes.includes(mode)))
    ));
  }, [mode]);

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

  useEffect(() => {
    let active = true;
    const query = debouncedSearch.trim();

    if (query.length < 2) {
      setCatalogueCardSuggestions([]);
      return;
    }

    searchLocalPokemonCards<any>(query, {
      language: selectedLanguages.length === 1 ? selectedLanguages[0] : 'all',
      limit: 4,
      select: 'id, name, language, set_id, number, rarity, image_small, image_large, raw_data',
    }).then((cards) => {
      if (!active) return;
      setCatalogueCardSuggestions((cards ?? []).map((card: any) => {
        const setId = card.set_id ?? card.raw_data?.set?.id ?? null;
        const setName = card.raw_data?.set?.name ?? setId;
        return {
          key: `catalogue-card:${card.id}`,
          label: card.name ?? card.id,
          subtitle: [card.number ? `#${card.number}` : null, setName].filter(Boolean).join(' - '),
          imageUri: card.image_small ?? card.image_large ?? card.raw_data?.images?.small ?? null,
          setLogoUrl: setId ? getPokemonSetLogoUrl(setId) : null,
          sourceLabel: 'Catalogue card',
          primaryActionLabel: 'View card',
          secondaryActionLabel: 'View listings',
          onSecondaryPress: () => setSearch([card.name ?? card.id, card.number].filter(Boolean).join(' ')),
          onPress: () => router.push({ pathname: '/card/[id]', params: { id: card.id, setId: setId ?? undefined } } as any),
        };
      }));
    }).catch((error) => {
      console.log('Market catalogue card suggestions failed', error);
      if (active) setCatalogueCardSuggestions([]);
    });

    return () => {
      active = false;
    };
  }, [debouncedSearch, selectedLanguages]);

  const loadOffers = useCallback(async (userId: string, generation: number) => {
    try {
      const data = await fetchMyTradeOffers();
      if (marketAuthUserIdRef.current !== userId || marketAuthGenerationRef.current !== generation) return;
      setOffers(data);
    } catch (error) {
      console.log('Failed to load Market offers', error);
      if (marketAuthUserIdRef.current === userId && marketAuthGenerationRef.current === generation) {
        setOffers([]);
      }
    }
  }, []);

  const loadSaved = useCallback(async (userId: string, generation = marketAuthGenerationRef.current) => {
    if (!userId) {
      setSavedListingIds([]);
      return;
    }
    try {
      const saved = await fetchSavedMarketListingIds(userId);
      if (marketAuthUserIdRef.current !== userId || marketAuthGenerationRef.current !== generation) return;
      setSavedListingIds(saved);
    } catch {
      if (marketAuthUserIdRef.current === userId && marketAuthGenerationRef.current === generation) {
        setSavedListingIds([]);
      }
    }
  }, []);

  const loadListingDraft = useCallback(async (userId: string, generation: number) => {
    if (!canPublishListing || !userId) {
      setListingDraft(null);
      return;
    }
    try {
      const draft = await readCreateListingDraftSummary(userId);
      if (marketAuthUserIdRef.current !== userId || marketAuthGenerationRef.current !== generation) return;
      setListingDraft(draft);
    } catch (error) {
      if (marketAuthUserIdRef.current !== userId || marketAuthGenerationRef.current !== generation) return;
      console.log('Failed to load Market listing draft', error);
      setListingDraft(null);
    }
  }, [canPublishListing]);

  const bindMarketIdentity = useCallback((userId: string) => {
    if (marketAuthUserIdRef.current === userId) return marketAuthGenerationRef.current;
    marketAuthUserIdRef.current = userId;
    marketAuthGenerationRef.current += 1;
    setCurrentUserId(userId);
    setOffers([]);
    setSavedListingIds([]);
    setFavoriteBusyIds([]);
    setListingDraft(null);
    setMenuListing(null);
    setSelectedListing(null);
    setDetailCard(null);
    openedParamRef.current = null;
    return marketAuthGenerationRef.current;
  }, []);

  const reloadMarketIdentity = useCallback(async (userId: string, generation: number) => {
    if (!userId) return;
    try {
      await Promise.all([
        refreshTrade(),
        loadOffers(userId, generation),
        loadSaved(userId, generation),
        loadListingDraft(userId, generation),
      ]);
    } catch (error) {
      if (marketAuthUserIdRef.current !== userId || marketAuthGenerationRef.current !== generation) return;
      console.log('Failed to refresh Market account state', error);
    }
  }, [loadListingDraft, loadOffers, loadSaved, refreshTrade]);

  useEffect(() => {
    let mounted = true;
    const activate = (userId: string) => {
      if (!mounted) return;
      const generation = bindMarketIdentity(userId);
      void reloadMarketIdentity(userId, generation);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      activate(session?.user?.id ?? '');
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [bindMarketIdentity, reloadMarketIdentity]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        const startingUserId = marketAuthUserIdRef.current;
        const startingGeneration = marketAuthGenerationRef.current;
        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error) throw error;
          if (!active) return;
          const userId = user?.id ?? '';
          const generation = bindMarketIdentity(userId);
          await reloadMarketIdentity(userId, generation);
        } catch (error) {
          if (!active) return;
          if (
            marketAuthUserIdRef.current === startingUserId
            && marketAuthGenerationRef.current === startingGeneration
          ) bindMarketIdentity('');
          console.log('Failed to verify Market account state', error);
        }
      };
      run();
      return () => {
        active = false;
      };
    }, [bindMarketIdentity, reloadMarketIdentity])
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
          const dbCards = await fetchCachedPokemonCardDetails(missingCardIds);

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

  const toggleStringFilter = useCallback(<T extends string,>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    value: T
  ) => {
    setter((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  }, []);

  const toggleLanguageFilter = useCallback((value: MarketLanguageFilter) => {
    setSelectedLanguages((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  }, []);

  const availableMarketSets = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    sourceListings.forEach((listing) => {
      const card = cardDetails[listing.id];
      const key = card?.set?.id ?? listing.set_id ?? card?.set?.name ?? '';
      const label = card?.set?.name ?? listing.set_id ?? '';
      if (!key || !label) return;
      const normalised = normalise(key);
      if (!map.has(normalised)) map.set(normalised, { key, label });
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(0, 18);
  }, [cardDetails, sourceListings]);

  const availableMarketRarities = useMemo(() => {
    const map = new Map<string, string>();
    MARKET_FALLBACK_RARITIES.forEach((rarity) => map.set(normalise(rarity), rarity));
    Object.values(cardDetails).forEach((card) => {
      if (!card.rarity) return;
      const key = normalise(card.rarity);
      if (key && !map.has(key)) map.set(key, card.rarity);
    });
    return [...map.values()].sort((a, b) => getRarityRank(a) - getRarityRank(b) || a.localeCompare(b));
  }, [cardDetails]);

  const availableMarketGraders = useMemo(() => {
    const map = new Map<string, string>();
    MARKET_GRADER_FILTERS.forEach((grader) => map.set(normalise(grader), grader));
    sourceListings.forEach((listing) => {
      if (!listing.grade_company) return;
      const label = formatSlabCompanyLabel(listing.grade_company);
      const key = normalise(label);
      if (key && !map.has(key)) map.set(key, label);
    });
    return [...map.values()];
  }, [sourceListings]);

  const displayListings = useMemo(() => {
    const query = parseMarketQuery(debouncedSearch);
    const min = Number(minPrice);
    const max = Number(maxPrice);

    let data = sourceListings
      .map((listing) => {
        const card = cardDetails[listing.id];
        return { listing, searchScore: scoreListingSearch(listing, card, query) };
      })
      .filter(({ listing, searchScore }) => {
      const card = cardDetails[listing.id];
      const variant = getListingVariant(listing);
      if (mode === 'buy' && !(variant === 'buy' || variant === 'openToOffers')) return false;
      if (mode === 'trade' && variant === 'sold') return false;

      if (selectedListingTypes.length && !selectedListingTypes.includes(variant)) return false;
      if (primaryFilter !== 'all' && getListingCategoryType(listing) !== primaryFilter) return false;
      if (sealedOnly && !isSealedListing(listing, card)) return false;
      if (recentlyAddedOnly && !isRecentlyAdded(listing.created_at)) return false;
      if (selectedProtectionTiers.length) {
        const protectionTier = getProtectionTier(listing);
        if (!protectionTier || !selectedProtectionTiers.includes(protectionTier)) return false;
      }
      if (selectedConditions.length && (!listing.condition || !selectedConditions.includes(listing.condition))) return false;
      if (selectedRarities.length && !selectedRarities.some((rarity) => normalise(rarity) === normalise(card?.rarity))) return false;
      if (selectedSetFilter) {
        const selectedSet = normalise(selectedSetFilter);
        const listingSet = normalise(card?.set?.id ?? listing.set_id);
        const listingSetName = normalise(card?.set?.name);
        if (listingSet !== selectedSet && listingSetName !== selectedSet) return false;
      }
      if (selectedGraders.length && !selectedGraders.some((grader) => normalise(grader) === normalise(formatSlabCompanyLabel(listing.grade_company ?? '')))) return false;
      if (selectedGrades.length && !selectedGrades.some((grade) => gradeMatchesFilter(listing.grade, grade))) return false;
      if (selectedLanguages.length && !selectedLanguages.includes(normaliseLanguageCode(card?.language) as MarketLanguageFilter)) return false;
      if (photosOnly && !hasSellerPhotos(listing)) return false;
      if (Number.isFinite(min) && minPrice.trim() && (listing.asking_price ?? 0) < min) return false;
      if (Number.isFinite(max) && maxPrice.trim() && (listing.asking_price ?? 0) > max) return false;
      if (query.normalised && searchScore <= 0) return false;
      return true;
    });

    data = [...data].sort((a, b) => {
      const aCard = cardDetails[a.listing.id];
      const bCard = cardDetails[b.listing.id];
      if ((sortBy === 'recommended' || sortBy === 'relevant') && query.normalised && b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      if (sortBy === 'priceAsc') return (a.listing.asking_price ?? Number.MAX_SAFE_INTEGER) - (b.listing.asking_price ?? Number.MAX_SAFE_INTEGER);
      if (sortBy === 'priceDesc') return (b.listing.asking_price ?? 0) - (a.listing.asking_price ?? 0);
      if (sortBy === 'bestValue') {
        const av = (getListingMarketValue(a.listing) ?? 0) - (a.listing.asking_price ?? 0);
        const bv = (getListingMarketValue(b.listing) ?? 0) - (b.listing.asking_price ?? 0);
        return bv - av;
      }
      if (sortBy === 'chase') return (getListingMarketValue(b.listing) ?? 0) - (getListingMarketValue(a.listing) ?? 0);
      if (sortBy === 'rarity') return compareRarityHighToLow(aCard?.rarity, bCard?.rarity) || (aCard?.name ?? a.listing.product_name ?? '').localeCompare(bCard?.name ?? b.listing.product_name ?? '');
      if (sortBy === 'set') return getListingSetLabel(a.listing, aCard).localeCompare(getListingSetLabel(b.listing, bCard)) || (aCard?.number ?? '').localeCompare(bCard?.number ?? '');
      if (sortBy === 'gradeDesc') return parseGradeValue(b.listing.grade) - parseGradeValue(a.listing.grade);
      if (sortBy === 'type') return getListingCategoryLabel(a.listing).localeCompare(getListingCategoryLabel(b.listing));
      return new Date(b.listing.created_at ?? 0).getTime() - new Date(a.listing.created_at ?? 0).getTime();
    });

    return data.map((item) => item.listing);
  }, [cardDetails, debouncedSearch, maxPrice, minPrice, mode, photosOnly, primaryFilter, recentlyAddedOnly, sealedOnly, selectedConditions, selectedGrades, selectedGraders, selectedLanguages, selectedListingTypes, selectedProtectionTiers, selectedRarities, selectedSetFilter, sortBy, sourceListings]);

  useEffect(() => {
    setVisibleListingCount(Math.min(displayListings.length, marketWindow.initialCount));
  }, [
    activeFilterCount,
    debouncedSearch,
    displayListings.length,
    marketWindow.initialCount,
    mode,
    sellerFilter?.userId,
    workspace,
  ]);

  const visibleDisplayListings = useMemo(
    () => displayListings.slice(0, visibleListingCount),
    [displayListings, visibleListingCount]
  );
  const hasMoreDisplayListings = visibleListingCount < displayListings.length;
  const renderMoreDisplayListings = useCallback(() => {
    setVisibleListingCount((current) => Math.min(displayListings.length, current + marketWindow.pageSize));
  }, [displayListings.length, marketWindow.pageSize]);

  const searchSuggestions = useMemo(() => {
    const query = parseMarketQuery(debouncedSearch);
    if (!query.normalised) return {
      cards: [] as SearchSuggestion[],
      products: [] as SearchSuggestion[],
      sets: [] as SearchSuggestion[],
      sellers: [] as SearchSuggestion[],
    };

    const searchableListings = sourceListings;
    const cards = new Map<string, SearchSuggestion>();
    const products = new Map<string, SearchSuggestion>();
    const sets = new Map<string, SearchSuggestion>();
    const sellers = new Map<string, SearchSuggestion>();
    const liveCardListingCounts = new Map<string, number>();
    const productListingCounts = new Map<string, number>();
    const setListingCounts = new Map<string, number>();
    const sellerListingCounts = new Map<string, number>();
    const countCopy = (count: number) => `${count} listing${count === 1 ? '' : 's'}`;

    searchableListings.forEach((listing) => {
      const card = cardDetails[listing.id];
      const setId = card?.set?.id ?? listing.set_id ?? null;
      if (setId) setListingCounts.set(setId, (setListingCounts.get(setId) ?? 0) + 1);
      if (listing.user_id) sellerListingCounts.set(listing.user_id, (sellerListingCounts.get(listing.user_id) ?? 0) + 1);
      if (isProductListing(listing)) {
        const title = gate0MarketText(listing.product_name, 'Sealed product');
        const productKey = normalise(`${title} ${listing.product_type ?? ''}`) || listing.id;
        productListingCounts.set(productKey, (productListingCounts.get(productKey) ?? 0) + 1);
      } else if (listing.card_id) {
        liveCardListingCounts.set(listing.card_id, (liveCardListingCounts.get(listing.card_id) ?? 0) + 1);
      }
    });

    searchableListings.forEach((listing) => {
      const card = cardDetails[listing.id];
      const score = scoreListingSearch(listing, card, query);
      if (score <= 0) return;
      const meta = getListingSearchMeta(listing, card);
      const title = gate0MarketText(
        isProductListing(listing)
          ? listing.product_name
          : card?.name ?? listing.product_name ?? listing.card_id,
        isProductListing(listing) ? 'Sealed product' : 'Collector listing',
      );
      const imageUri = getListingImage(listing, card);
      const setId = card?.set?.id ?? listing.set_id ?? null;
      const setLogoUrl = setId ? getPokemonSetLogoUrl(setId) : null;
      const productKey = normalise(`${title} ${listing.product_type ?? ''}`) || listing.id;

      if (isProductListing(listing) && !products.has(productKey)) {
        const listingCount = productListingCounts.get(productKey) ?? 1;
        products.set(productKey, {
          key: `product:${productKey}`,
          label: title,
          subtitle: [titleCaseProductType(listing.product_type), countCopy(listingCount)].filter(Boolean).join(' - '),
          imageUri,
          listingCount,
          sourceLabel: 'Live product',
          primaryActionLabel: 'View listings',
          onPress: () => setSearch(title),
        });
      }

      if (!cards.has(listing.card_id) && !isProductListing(listing)) {
        const listingCount = liveCardListingCounts.get(listing.card_id) ?? 1;
        cards.set(listing.card_id, {
          key: `card:${listing.card_id}`,
          label: title,
          subtitle: [card?.number ? `#${card.number}` : null, card?.set?.name ?? listing.set_id, countCopy(listingCount)].filter(Boolean).join(' - '),
          imageUri,
          setLogoUrl,
          listingCount,
          sourceLabel: 'Live listings',
          primaryActionLabel: 'View listings',
          secondaryActionLabel: 'View card',
          onSecondaryPress: () => router.push({ pathname: '/card/[id]', params: { id: listing.card_id, setId: listing.set_id ?? setId ?? undefined } } as any),
          onPress: () => setSearch([title, card?.number].filter(Boolean).join(' ')),
        });
      }

      if (setId && !sets.has(setId)) {
        const listingCount = setListingCounts.get(setId) ?? 1;
        sets.set(setId, {
          key: `set:${setId}`,
          label: card?.set?.name ?? listing.set_id ?? 'Set',
          subtitle: [setId, countCopy(listingCount)].filter(Boolean).join(' - '),
          setLogoUrl,
          listingCount,
          sourceLabel: 'Set code',
          primaryActionLabel: 'View listings',
          onPress: () => setSearch(card?.set?.name ?? listing.set_id ?? ''),
        });
      }

      if (listing.user_id && !sellers.has(listing.user_id) && meta.seller) {
        const listingCount = sellerListingCounts.get(listing.user_id) ?? 1;
        sellers.set(listing.user_id, {
          key: `seller:${listing.user_id}`,
          label: meta.seller,
          subtitle: countCopy(listingCount),
          imageUri: listing.profiles?.avatar_url ?? null,
          listingCount,
          sourceLabel: 'Seller',
          primaryActionLabel: 'View listings',
          onPress: () => {
            setSellerFilter({ userId: listing.user_id, name: meta.seller });
            setWorkspace('discover');
          },
        });
      }
    });

    catalogueCardSuggestions.forEach((item) => {
      const cardId = item.key.replace(/^catalogue-card:/, '');
      const listingCount = liveCardListingCounts.get(cardId) ?? 0;
      if (!cards.has(cardId)) {
        cards.set(cardId, {
          ...item,
          subtitle: [item.subtitle, countCopy(listingCount)].filter(Boolean).join(' - '),
          listingCount,
          secondaryActionLabel: listingCount > 0 ? item.secondaryActionLabel : undefined,
          onSecondaryPress: listingCount > 0 ? item.onSecondaryPress : undefined,
        });
      }
    });

    return {
      cards: [...cards.values()].slice(0, 4),
      products: [...products.values()].slice(0, 3),
      sets: [...sets.values()].slice(0, 3),
      sellers: [...sellers.values()].slice(0, 3),
    };
  }, [cardDetails, catalogueCardSuggestions, debouncedSearch, sourceListings]);

  const mapListingCard = useCallback((listing: MarketplaceListing): MarketListingCardData => {
    const card = cardDetails[listing.id];
    const product = isProductListing(listing);
    const imageStrategy = getListingImageStrategy(listing, card);
    const fullImageStrategy = getListingImageStrategy(listing, card, true);
    const title = gate0MarketText(
      product ? listing.product_name : card?.name ?? listing.product_name ?? listing.card_id,
      product ? 'Sealed product' : 'Collector listing',
    );
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
      imageUri: imageStrategy.uri,
      fullImageUri: fullImageStrategy.uri,
      imageBadgeLabel: imageStrategy.label,
      imageIsCatalogue: imageStrategy.isCatalogue,
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
      verified: false,
      protectionTier: getProtectionTier(listing),
      protectionAgreementRequired: requiresSilverAgreement(listing),
      variantType: variant,
      saved: favoriteListingIds.includes(listing.id),
      favoriteCount,
      inDemand: favoriteCount >= 21,
      isMine: listing.user_id === currentUserId,
      createdAt: listing.created_at,
      categoryLabel: getListingCategoryLabel(listing),
      categoryImageIcon: listingCategoryIcons[categoryType],
    };
  }, [cardDetails, currentUserId, favoriteListingIds, profile?.collector_name]);

  const openListing = useCallback(async (listing: MarketplaceListing) => {
    setSelectedListing(listing);
    setDetailCard(cardDetails[listing.id] ?? null);
    if (cardDetails[listing.id] || isProductListing(listing) || !listing.card_id) return;
    try {
      setDetailLoading(true);
      const data = (await fetchCachedPokemonCardDetails([listing.card_id])).get(listing.card_id);
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

  const handleToggleSaved = async (listing: MarketplaceListing) => {
    if (listing.user_id === currentUserId) return;
    if (!currentUserId) {
      Alert.alert('Sign in required', 'Sign in before favoriting a Market listing.');
      return;
    }
    if (marketAuthUserIdRef.current !== currentUserId) return;
    const actionGeneration = marketAuthGenerationRef.current;
    const listingId = listing.id;
    if (favoriteBusyIds.includes(listingId)) return;
    const previous = savedListingIds;
    const next = previous.includes(listingId)
      ? previous.filter((id) => id !== listingId)
      : [...previous, listingId];
    setSavedListingIds(next);
    setFavoriteBusyIds((current) => [...current, listingId]);
    try {
      const saved = await toggleSavedMarketListing(currentUserId, listingId);
      if (
        marketAuthUserIdRef.current === currentUserId
        && marketAuthGenerationRef.current === actionGeneration
      ) setSavedListingIds(saved);
    } catch (error) {
      const { data: { user } } = await supabase.auth.getUser();
      const activeUserId = user?.id ?? '';
      if (
        activeUserId === currentUserId
        && marketAuthUserIdRef.current === currentUserId
        && marketAuthGenerationRef.current === actionGeneration
      ) {
        setSavedListingIds(previous);
      } else {
        const generation = bindMarketIdentity(activeUserId);
        await loadSaved(activeUserId, generation);
      }
      Alert.alert('Could not update favorites', error instanceof Error ? error.message : 'Please try again.');
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

  const shareListing = async (listing: MarketplaceListing) => {
    try {
      await Share.share({
        title: 'StackR Market listing',
        message: `View this listing in The Market: ${gate0MarketText(listing.product_name ?? listing.card_id, 'Collector listing')}`,
      });
    } catch (error) {
      Alert.alert('Could not share listing', error instanceof Error ? error.message : 'Please try again.');
    }
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

  const clearFilters = () => {
    setPrimaryFilter('all');
    setSelectedListingTypes([]);
    setSelectedProtectionTiers([]);
    setSelectedConditions([]);
    setSelectedRarities([]);
    setSelectedSetFilter(null);
    setSelectedGraders([]);
    setSelectedGrades([]);
    setSelectedLanguages([]);
    setMinPrice('');
    setMaxPrice('');
    setPhotosOnly(false);
    setSealedOnly(false);
    setRecentlyAddedOnly(false);
    setSellerFilter(null);
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
            if (!currentUserId) throw new Error('Your listing draft session is unavailable.');
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error) throw error;
            if (
              user?.id !== currentUserId
              || marketAuthUserIdRef.current !== currentUserId
            ) throw new Error('Your account changed before the draft could be removed.');
            await clearCreateListingDraft(currentUserId);
            if (marketAuthUserIdRef.current === currentUserId) setListingDraft(null);
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

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    const categoryLabel = MARKET_CATEGORY_FILTERS.find((filter) => filter.key === primaryFilter)?.label;
    if (primaryFilter !== 'all') chips.push({ key: 'category', label: categoryLabel ?? 'Category', onRemove: () => setPrimaryFilter('all') });
    selectedListingTypes.forEach((value) => {
      const label = MARKET_LISTING_TYPE_FILTERS.find((filter) => filter.key === value)?.label ?? value;
      chips.push({ key: `type:${value}`, label, onRemove: () => setSelectedListingTypes((current) => current.filter((item) => item !== value)) });
    });
    selectedProtectionTiers.forEach((value) => chips.push({ key: `protection:${value}`, label: value, onRemove: () => setSelectedProtectionTiers((current) => current.filter((item) => item !== value)) }));
    selectedConditions.forEach((value) => chips.push({ key: `condition:${value}`, label: value, onRemove: () => setSelectedConditions((current) => current.filter((item) => item !== value)) }));
    selectedRarities.forEach((value) => chips.push({ key: `rarity:${value}`, label: value, onRemove: () => setSelectedRarities((current) => current.filter((item) => item !== value)) }));
    if (selectedSetFilter) {
      const label = availableMarketSets.find((set) => normalise(set.key) === normalise(selectedSetFilter))?.label ?? selectedSetFilter;
      chips.push({ key: 'set', label, onRemove: () => setSelectedSetFilter(null) });
    }
    selectedGraders.forEach((value) => chips.push({ key: `grader:${value}`, label: value, onRemove: () => setSelectedGraders((current) => current.filter((item) => item !== value)) }));
    selectedGrades.forEach((value) => chips.push({ key: `grade:${value}`, label: `Grade ${value}`, onRemove: () => setSelectedGrades((current) => current.filter((item) => item !== value)) }));
    selectedLanguages.forEach((value) => {
      const label = MARKET_LANGUAGE_FILTERS.find((filter) => filter.key === value)?.label ?? value;
      chips.push({ key: `language:${value}`, label, onRemove: () => setSelectedLanguages((current) => current.filter((item) => item !== value)) });
    });
    if (minPrice.trim() || maxPrice.trim()) chips.push({ key: 'price', label: `${minPrice.trim() ? `£${minPrice.trim()}` : '£0'}-${maxPrice.trim() ? `£${maxPrice.trim()}` : 'Any'}`, onRemove: () => { setMinPrice(''); setMaxPrice(''); } });
    if (photosOnly) chips.push({ key: 'photos', label: 'Seller photos', onRemove: () => setPhotosOnly(false) });
    if (sealedOnly) chips.push({ key: 'sealed', label: 'Sealed', onRemove: () => setSealedOnly(false) });
    if (recentlyAddedOnly) chips.push({ key: 'recent', label: 'Recently added', onRemove: () => setRecentlyAddedOnly(false) });
    if (sellerFilter) chips.push({ key: 'seller', label: sellerFilter.name ?? 'Seller', onRemove: () => setSellerFilter(null) });
    return chips;
  }, [
    availableMarketSets,
    maxPrice,
    minPrice,
    photosOnly,
    primaryFilter,
    recentlyAddedOnly,
    sealedOnly,
    selectedConditions,
    selectedGrades,
    selectedGraders,
    selectedLanguages,
    selectedListingTypes,
    selectedProtectionTiers,
    selectedRarities,
    selectedSetFilter,
    sellerFilter,
  ]);

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
        savedCount={favoriteListingIds.length}
        myListingCount={myListings.length + draftCount}
        profileAvatarUrl={profile?.avatar_url ?? null}
        profileAvatarPreset={profile?.avatar_preset ?? null}
        onSaved={() => router.push('/watchlist' as any)}
        onOffers={() => router.push('/offers' as any)}
        onMyListings={() => setWorkspace('myListings')}
        onProfile={() => router.push('/(tabs)/profile' as any)}
        showShortcuts
        showMyListings={canPublishListing}
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
        products={searchSuggestions.products}
        sets={searchSuggestions.sets}
        sellers={searchSuggestions.sellers}
      />

      <MarketModeSelector value={mode} onChange={(next) => {
        setMode(next);
        setWorkspace('discover');
      }} />

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

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <TouchableOpacity
          onPress={() => setFiltersOpen(true)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={activeFilterCount > 0 ? `Filter listings, ${activeFilterCount} active` : 'Filter listings'}
          style={{
            minHeight: 38,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: activeFilterCount > 0 ? theme.colors.primary + '66' : theme.colors.border,
            backgroundColor: activeFilterCount > 0 ? theme.colors.primary + '10' : 'rgba(255,255,255,0.76)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            paddingHorizontal: 11,
          }}
        >
          <Ionicons name={marketIcons.filter} size={17} color={activeFilterCount > 0 ? theme.colors.primary : theme.colors.text} />
          <Text style={{ color: activeFilterCount > 0 ? theme.colors.primary : theme.colors.text, fontSize: 12.2, lineHeight: 15, fontWeight: '900' }}>
            Filter
          </Text>
          {activeFilterCount > 0 ? (
            <View
              pointerEvents="none"
              style={{
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 5,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 9.5, lineHeight: 12, fontWeight: '900' }}>
                {activeFilterCount > 9 ? '9+' : activeFilterCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSortOpen(true)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`Sort listings, currently ${currentSortLabel}`}
          style={{
            flexGrow: 1,
            minHeight: 38,
            borderRadius: 12,
            paddingHorizontal: 11,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: 'rgba(255,255,255,0.76)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 12.2, fontWeight: '900' }} numberOfLines={1}>
            Sort: {currentSortLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={theme.colors.primary} />
        </TouchableOpacity>
        {canUseThreeColumns ? (
          <TouchableOpacity
            onPress={() => setLayoutMode((value) => (value === 'compact' ? 'browse' : 'compact'))}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={layoutMode === 'compact' ? 'Use browse layout' : 'Use compact discovery layout'}
            style={{
              minHeight: 38,
              borderRadius: 12,
              paddingHorizontal: 10,
              borderWidth: 1,
              borderColor: layoutMode === 'compact' ? theme.colors.primary + '66' : theme.colors.border,
              backgroundColor: layoutMode === 'compact' ? theme.colors.primary + '10' : 'rgba(255,255,255,0.76)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="grid-outline" size={16} color={layoutMode === 'compact' ? theme.colors.primary : theme.colors.text} />
            <Text style={{ color: layoutMode === 'compact' ? theme.colors.primary : theme.colors.text, fontSize: 12.2, fontWeight: '900' }}>
              {layoutMode === 'compact' ? 'Compact' : 'Browse'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {activeFilterChips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingLeft: 1, paddingRight: 12 }}>
          {activeFilterChips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={chip.onRemove}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${chip.label} filter`}
              style={{
                minHeight: 30,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.primary + '30',
                backgroundColor: theme.colors.primary + '0F',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 9,
              }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 11.2, lineHeight: 14, fontWeight: '900' }} numberOfLines={1}>
                {chip.label}
              </Text>
              <Ionicons name="close" size={13} color={theme.colors.primary} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={clearFilters}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Clear all Market filters"
            style={{
              minHeight: 30,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: 'rgba(255,255,255,0.78)',
              justifyContent: 'center',
              paddingHorizontal: 10,
            }}
          >
            <Text style={{ color: theme.colors.textSoft, fontSize: 11.2, lineHeight: 14, fontWeight: '900' }}>
              Clear all
            </Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {canPublishListing && workspace === 'myListings' ? (
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
          compact={marketColumnCount > 1}
          onPress={() => openListing(item)}
          onSave={item.user_id === currentUserId ? undefined : () => handleToggleSaved(item)}
          onSellerPress={() => {
            if (item.user_id) router.push({ pathname: '/user/[id]', params: { id: item.user_id } });
          }}
          onMore={item.user_id === currentUserId
            ? (canPublishListing ? () => handleArchive(item) : undefined)
            : () => setMenuListing(item)}
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
        <StackrBackdrop />
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
            data={visibleDisplayListings}
            numColumns={marketColumnCount}
            columnWrapperStyle={marketColumnCount > 1 ? { gap: marketColumnGap } : undefined}
            keyExtractor={(item) => item.id}
            renderItem={renderListing}
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={
              <View style={{ paddingTop: 10, paddingBottom: 64 }}>
                <MarketEmptyState
                  icon={mode === 'buy' ? marketIcons.offer : marketIcons.trade}
                  title={
                    workspace === 'myListings'
                      ? 'No live listings yet'
                      : debouncedSearch || activeFilterCount > 0
                      ? 'No matching listings'
                      : mode === 'buy'
                        ? 'No listings to browse yet'
                        : 'No trade listings yet'
                  }
                  body={
                    workspace === 'myListings'
                      ? (listingDraft ? 'Resume your draft above or create a new listing when you are ready.' : 'Create a listing to publish it in The Market.')
                      : debouncedSearch || activeFilterCount > 0
                      ? 'Try changing your search or clearing filters.'
                      : mode === 'buy'
                        ? canPublishListing
                          ? 'Check back soon or create a browse-only beta listing from a card detail page.'
                          : 'Check back soon while trusted beta sellers add more listings.'
                        : 'Add cards to trade or browse listings while collectors add more.'
                  }
                  actionLabel={workspace === 'myListings' && listingDraft
                    ? 'Resume draft'
                    : debouncedSearch || activeFilterCount > 0
                      ? 'Clear filters'
                      : canPublishListing ? 'Create beta listing' : undefined}
                  onAction={workspace === 'myListings' && listingDraft
                    ? resumeListingDraft
                    : debouncedSearch || activeFilterCount > 0
                      ? () => {
                          setSearch('');
                          clearFilters();
                        }
                      : canPublishListing ? () => router.push('/listing/new' as any) : undefined}
                />
              </View>
            }
            refreshControl={<RefreshControl refreshing={tradeLoading} onRefresh={refreshTrade} tintColor={theme.colors.primary} />}
            showsVerticalScrollIndicator={false}
            onEndReached={hasMoreDisplayListings ? renderMoreDisplayListings : undefined}
            onEndReachedThreshold={0.8}
            onScroll={handleMarketScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: stackrTabContentPadding.floatingAction, flexGrow: displayListings.length === 0 ? 1 : 0 }}
            {...stackrListPerformance.marketListings}
            ListFooterComponent={hasMoreDisplayListings ? (
              <View style={{ height: 34, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} size="small" />
              </View>
            ) : null}
          />
        )}
      </View>

      {canPublishListing ? (
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
            Create Beta Listing
          </Text>
        ) : null}
      </TouchableOpacity>
      ) : null}

      <MarketFilterSheet
        visible={sortOpen}
        title="Sort listings"
        subtitle="Choose how Market listings are ordered."
        activeFilterCount={sortBy !== 'recommended' ? 1 : 0}
        onClose={() => setSortOpen(false)}
        onClear={() => setSortBy('recommended')}
      >
        <FilterGroup title="Sort by">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SORT_OPTIONS.map((option) => {
              const active = sortBy === option.key;
              const disabled = mode === 'buy' && option.key === 'chase';
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => {
                    if (disabled) return;
                    setSortBy(option.key);
                    setSortOpen(false);
                  }}
                  disabled={disabled}
                  activeOpacity={0.82}
                  style={{
                    minHeight: 38,
                    flexBasis: width >= 390 ? '31.5%' : '48%',
                    flexGrow: 1,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : disabled ? theme.colors.border : theme.colors.primary + '18',
                    borderStyle: disabled ? 'dashed' : 'solid',
                    backgroundColor: active
                      ? theme.colors.primary + '12'
                      : disabled
                        ? theme.colors.surface
                        : 'rgba(255,255,255,0.72)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 9,
                    paddingVertical: 7,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {active ? <Ionicons name="checkmark-circle" size={14} color={theme.colors.primary} /> : null}
                    {disabled ? <Ionicons name="lock-closed-outline" size={13} color={theme.colors.textSoft} /> : null}
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      style={{
                        color: active ? theme.colors.primary : disabled ? theme.colors.textSoft : theme.colors.text,
                        fontSize: 11.7,
                        lineHeight: 15,
                        fontWeight: '900',
                        textAlign: 'center',
                      }}
                    >
                      {option.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </FilterGroup>
      </MarketFilterSheet>

      <MarketFilterSheet
        visible={filtersOpen}
        activeFilterCount={activeFilterCount}
        onClose={() => setFiltersOpen(false)}
        onClear={clearFilters}
      >
        <FilterGroup title="Category">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
          </View>
        </FilterGroup>

        <FilterGroup title="Set">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MarketFilterChip
              label="Any set"
              active={!selectedSetFilter}
              onPress={() => setSelectedSetFilter(null)}
            />
            {availableMarketSets.map((set) => (
              <MarketFilterChip
                key={set.key}
                label={set.label}
                active={normalise(selectedSetFilter) === normalise(set.key)}
                onPress={() => setSelectedSetFilter(set.key)}
              />
            ))}
          </View>
        </FilterGroup>

        <FilterGroup title="Language">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MARKET_LANGUAGE_FILTERS.map((language) => {
              const active = selectedLanguages.includes(language.key);
              return (
                <MarketFilterChip
                  key={language.key}
                  label={language.label}
                  active={active}
                  onPress={() => toggleLanguageFilter(language.key)}
                />
              );
            })}
          </View>
        </FilterGroup>

        <FilterGroup title="Card">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {search.trim() ? (
              <MarketFilterChip
                label={search.trim()}
                icon="search-outline"
                active
                onPress={() => setSearch('')}
              />
            ) : (
              <MarketFilterChip
                label="Use marketplace search"
                icon="search-outline"
                disabled
                onPress={() => {}}
              />
            )}
          </View>
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

        <FilterGroup title="Grader">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {availableMarketGraders.map((grader) => {
              const active = selectedGraders.includes(grader);
              return (
                <MarketFilterChip
                  key={grader}
                  label={grader}
                  active={active}
                  onPress={() => toggleStringFilter(setSelectedGraders, grader)}
                />
              );
            })}
          </View>
        </FilterGroup>

        <FilterGroup title="Grade">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MARKET_GRADE_FILTERS.map((grade) => {
              const active = selectedGrades.includes(grade);
              return (
                <MarketFilterChip
                  key={grade}
                  label={grade}
                  active={active}
                  onPress={() => toggleStringFilter(setSelectedGrades, grade)}
                />
              );
            })}
          </View>
        </FilterGroup>

        <FilterGroup title="Price">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.primary + '18',
                backgroundColor: 'rgba(255,255,255,0.72)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: 11,
              }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>{'\u00A3'}</Text>
              <TextInput
                value={minPrice}
                onChangeText={setMinPrice}
                keyboardType="decimal-pad"
                placeholder="Min"
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: theme.colors.text,
                  paddingVertical: 9,
                  fontSize: 12,
                  lineHeight: 15,
                  fontWeight: '900',
                }}
              />
            </View>
            <View
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.primary + '18',
                backgroundColor: 'rgba(255,255,255,0.72)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: 11,
              }}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>{'\u00A3'}</Text>
              <TextInput
                value={maxPrice}
                onChangeText={setMaxPrice}
                keyboardType="decimal-pad"
                placeholder="Max"
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: theme.colors.text,
                  paddingVertical: 9,
                  fontSize: 12,
                  lineHeight: 15,
                  fontWeight: '900',
                }}
              />
            </View>
          </View>
        </FilterGroup>

        <FilterGroup title="Seller location">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MarketFilterChip
              label="Location data pending"
              icon="location-outline"
              disabled
              onPress={() => {}}
            />
          </View>
        </FilterGroup>

        <FilterGroup title="Listing type">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MARKET_LISTING_TYPE_FILTERS.map((filter) => {
              const active = selectedListingTypes.includes(filter.key);
              const disabled = !filter.modes.includes(mode);
              return (
                <MarketFilterChip
                  key={filter.key}
                  label={filter.label}
                  icon={disabled ? 'lock-closed-outline' : filter.icon}
                  active={active}
                  disabled={disabled}
                  onPress={() => !disabled && toggleStringFilter(setSelectedListingTypes, filter.key)}
                />
              );
            })}
          </View>
        </FilterGroup>

        <FilterGroup title="Sealed status">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MarketFilterChip
              label="Any status"
              active={!sealedOnly}
              onPress={() => setSealedOnly(false)}
            />
            <MarketFilterChip
              label="Sealed products"
              icon="cube-outline"
              active={sealedOnly}
              onPress={() => setSealedOnly((value) => !value)}
            />
          </View>
        </FilterGroup>

        <FilterGroup title="Rarity">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {availableMarketRarities.map((rarity) => {
              const active = selectedRarities.includes(rarity);
              return (
                <MarketFilterChip
                  key={rarity}
                  label={rarity}
                  active={active}
                  onPress={() => toggleStringFilter(setSelectedRarities, rarity)}
                />
              );
            })}
          </View>
        </FilterGroup>

        <FilterGroup title="Recently added">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MarketFilterChip
              label="Any time"
              active={!recentlyAddedOnly}
              onPress={() => setRecentlyAddedOnly(false)}
            />
            <MarketFilterChip
              label="Last 7 days"
              icon="time-outline"
              active={recentlyAddedOnly}
              onPress={() => setRecentlyAddedOnly((value) => !value)}
            />
          </View>
        </FilterGroup>

        <FilterGroup title="Photo evidence">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MarketFilterChip
              label="Seller photos only"
              icon={photosOnly ? 'checkbox' : 'square-outline'}
              active={photosOnly}
              onPress={() => setPhotosOnly((value) => !value)}
            />
          </View>
        </FilterGroup>

        <FilterGroup title="Protection">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MARKET_PROTECTION_FILTERS.map((tier) => {
              const active = selectedProtectionTiers.includes(tier.key);
              return (
                <MarketFilterChip
                  key={tier.key}
                  label={tier.label}
                  imageIcon={tier.imageIcon}
                  active={active}
                  onPress={() => toggleStringFilter(setSelectedProtectionTiers, tier.key)}
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
        onShare={shareListing}
      />

      <ListingDetailModal
        listing={selectedListing}
        card={detailCard ?? (selectedListing ? cardDetails[selectedListing.id] : null)}
        loading={detailLoading}
        saved={selectedListing ? favoriteListingIds.includes(selectedListing.id) : false}
        currentUserId={currentUserId}
        canManageOwnListing={canPublishListing}
        onClose={closeDetail}
        onSave={selectedListing && selectedListing.user_id !== currentUserId ? () => handleToggleSaved(selectedListing) : undefined}
        onOffer={() => selectedListing && openOfferBuilder(selectedListing)}
        onArchive={() => selectedListing && handleArchive(selectedListing)}
      />
    </StackrScreen>
  );
}

function MarketSearchSuggestions({
  visible,
  cards,
  products,
  sets,
  sellers,
}: {
  visible: boolean;
  cards: SearchSuggestion[];
  products: SearchSuggestion[];
  sets: SearchSuggestion[];
  sellers: SearchSuggestion[];
}) {
  const { theme } = useTheme();
  if (!visible) return null;
  const hasSuggestions = cards.length || products.length || sets.length || sellers.length;
  if (!hasSuggestions) return null;

  const renderGroup = (title: string, items: SearchSuggestion[]) => {
    if (!items.length) return null;
    const fallbackIcon: keyof typeof Ionicons.glyphMap = title === 'Sellers'
      ? 'person-outline'
      : title === 'Products'
        ? 'cube-outline'
        : 'albums-outline';
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
                <Ionicons name={fallbackIcon} size={17} color={theme.colors.primary} />
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
              {item.sourceLabel ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <View
                    style={{
                      minHeight: 18,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.primary + '24',
                      backgroundColor: theme.colors.primary + '0F',
                      justifyContent: 'center',
                      paddingHorizontal: 7,
                    }}
                  >
                    <Text style={{ color: theme.colors.primary, fontSize: 9.5, lineHeight: 12, fontWeight: '900' }} numberOfLines={1}>
                      {item.sourceLabel}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
            {item.primaryActionLabel || item.secondaryActionLabel ? (
              <View style={{ alignItems: 'flex-end', gap: 5, maxWidth: 88 }}>
                {item.primaryActionLabel ? (
                  <Text style={{ color: theme.colors.primary, fontSize: 10.4, lineHeight: 13, fontWeight: '900', textAlign: 'right' }} numberOfLines={1}>
                    {item.primaryActionLabel}
                  </Text>
                ) : null}
                {item.secondaryActionLabel && item.onSecondaryPress ? (
                  <TouchableOpacity
                    onPress={(event) => {
                      event.stopPropagation();
                      item.onSecondaryPress?.();
                    }}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.secondaryActionLabel} for ${item.label}`}
                    style={{
                      minHeight: 24,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                      justifyContent: 'center',
                      paddingHorizontal: 7,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 9.8, lineHeight: 12, fontWeight: '900' }} numberOfLines={1}>
                      {item.secondaryActionLabel}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : item.setLogoUrl && item.imageUri ? (
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
      {renderGroup('Cards and catalogue', cards)}
      {renderGroup('Products', products)}
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
  onShare,
}: {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onViewProfile: (listing: MarketplaceListing) => void;
  onViewListings: (listing: MarketplaceListing) => void;
  onShare: (listing: MarketplaceListing) => void;
}) {
  const { theme } = useTheme();
  if (!listing) return null;
  const sellerName = gate0MarketText(listing.profiles?.collector_name, 'Collector');
  const listingTitle = gate0MarketText(listing.product_name ?? listing.card_id, 'Collector listing');

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
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>Listing</Text>
            {action('Share listing', 'share-outline', () => onShare(listing))}
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
  canManageOwnListing,
  onClose,
  onSave,
  onOffer,
  onArchive,
}: {
  listing: MarketplaceListing | null;
  card?: CardDetail | null;
  loading?: boolean;
  saved?: boolean;
  currentUserId: string;
  canManageOwnListing: boolean;
  onClose: () => void;
  onSave?: () => void;
  onOffer: () => void;
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
  const title = gate0MarketText(
    product ? listing.product_name : card?.name ?? listing.card_id,
    product ? 'Sealed product' : 'Collector listing',
  );
  const listingNotes = listing.listing_notes
    ? gate0MarketText(listing.listing_notes, 'Listing details hidden during this beta.')
    : null;
  const setName = product ? listing.product_type?.replace(/_/g, ' ') : card?.set?.name ?? listing.set_id;
  const categoryType = getListingCategoryType(listing);
  const categoryLabel = getListingCategoryLabel(listing);
  const gallery = buildListingGallery(listing, card);
  const isOwnedByCurrentUser = listing.user_id === currentUserId;
  const isMine = isOwnedByCurrentUser && canManageOwnListing;
  const canTrade = variant === 'trade' || variant === 'tradePlusCash' || variant === 'openToOffers';
  const isUnavailable = ['sold', 'reserved', 'unavailable'].includes(variant);
  const status = normaliseTradeStatus((listing.status as any) ?? 'pending');
  const statusLabel = TRADE_STATUS_LABELS[status] ?? String(listing.status ?? 'Published');
  const value = listing.market_estimate ?? listing.prices?.preferred_value ?? null;

  const primaryLabel = isMine
    ? 'Mark unavailable'
    : isUnavailable
      ? 'Return to The Market'
      : canTrade
        ? 'Propose trade'
        : 'Make offer';
  const secondaryLabel = undefined;
  const detailVariantLabel = variant === 'buy'
    ? 'Offers only'
    : variant === 'tradePlusCash'
      ? TRADE_CASH_TERMS_ENABLED ? 'Trade + cash' : 'Trade'
      : variant === 'openToOffers'
        ? 'Open to offers'
        : variant === 'trade'
          ? 'Trade'
          : statusLabel;
  const detailVariantIcon = variant === 'openToOffers' || variant === 'buy'
      ? marketIcons.offer
      : marketIcons.trade;

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
            {!isMine && onSave ? (
              <TouchableOpacity
                onPress={onSave}
                accessibilityRole="button"
                accessibilityLabel={saved ? 'Remove from favorited listings' : 'Add to favorited listings'}
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
                  style={{ width: 24, height: 24, opacity: saved ? 1 : 0.72 }}
                  accessibilityIgnoresInvertColors
                />
              </TouchableOpacity>
            ) : null}
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
                  {[setName, card?.number ? `#${card.number}` : null].filter(Boolean).join(' · ') || 'Collector listing'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <DetailBadge label={detailVariantLabel} icon={detailVariantIcon} />
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
                {listingNotes ? (
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, fontWeight: '700' }}>
                    {listingNotes}
                  </Text>
                ) : null}
              </View>

              <SellerIdentityRow
                avatarUrl={listing.profiles?.avatar_url ?? null}
                name={isMine
                  ? 'You'
                  : gate0MarketText(listing.profiles?.collector_name, 'Collector')}
                onPress={() => listing.user_id && router.push({ pathname: '/user/[id]', params: { id: listing.user_id } })}
              />

              {tier ? (
                <ProtectionDetail tier={tier} />
              ) : (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    padding: 12,
                    gap: 7,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>
                    {categoryType === 'graded_slab' ? 'Professional grade' : isSealedListing(listing, card) ? 'Item evidence' : 'Seller evidence'}
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>
                    {categoryType === 'graded_slab'
                      ? 'The grader label is the condition source. Check the slab photos, certification label and case notes before making an offer.'
                      : isSealedListing(listing, card)
                        ? 'Sealed products do not use Bronze, Silver or Gold protection tiers. Check actual-item photos, packaging notes and any seal or wrap close-ups before making an offer.'
                        : 'This item is listed from seller photos and factual item details, without a raw-card protection tier.'}
                  </Text>
                </View>
              )}

              {requiresSilverAgreement(listing) ? (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: `${theme.colors.primary}28`,
                    backgroundColor: theme.colors.surface,
                    padding: 12,
                    flexDirection: 'row',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      backgroundColor: `${theme.colors.primary}10`,
                      borderWidth: 1,
                      borderColor: `${theme.colors.primary}20`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Image source={stackrIcons.protectionSilver} resizeMode="contain" style={{ width: 22, height: 22 }} accessibilityIgnoresInvertColors />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>Silver protection agreement</Text>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>
                      This listing uses Silver Protection by agreement. It relies on AI-assisted condition evidence and photos, so both collectors must confirm before proceeding.
                    </Text>
                  </View>
                </View>
              ) : null}

              <MarketValueSummary
                estimatedValue={value}
                recentRange={listing.prices?.ebay_average ? `around ${money(listing.prices.ebay_average)}` : null}
                lastUpdated={listing.updated_at ? new Date(listing.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null}
                price={listing.asking_price}
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
                <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}>Beta boundary</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>
                  Browse-only listings and card-only offers are available. Checkout, payment, shipping and fulfilment are unavailable.
                </Text>
              </View>

              {PRICE_API_URL ? null : (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: `${theme.colors.primary}22`,
                    backgroundColor: theme.colors.surface,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 9,
                  }}
                >
                  <Ionicons name="information-circle-outline" size={18} color={theme.colors.primary} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, minWidth: 0, color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: '800' }}>
                    Stored market estimates are shown while live pricing is unavailable.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          {!isOwnedByCurrentUser || canManageOwnListing ? (
            <StickyMarketActions
              primaryLabel={primaryLabel}
              secondaryLabel={secondaryLabel}
              onPrimary={() => {
                if (isMine) return onArchive();
                if (isUnavailable) return onClose();
                return onOffer();
              }}
              onSecondary={() => onOffer()}
            />
          ) : null}
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
