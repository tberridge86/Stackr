import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  useWindowDimensions,
  View,
  StyleSheet,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView , useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EditionAwareCardImage from '../../components/EditionAwareCardImage';
import PokeTraceMarketInsights from '../../components/PokeTraceMarketInsights';
import { BinderArtwork } from '../../components/BinderArtwork';
import { BinderModeIconBadge, BinderModePill } from '../../components/BinderModeBadge';
import SlabStickerLabel, {
  SLAB_GRADE_SHORTCUTS,
  SLAB_GRADING_COMPANIES,
  formatSlabCompanyLabel,
  getSlabAccent,
} from '../../components/SlabStickerLabel';
import { StackrBackButton } from '../../components/StackrBackButton';
import { StackrActionButton } from '../../components/StackrActionButton';
import { StackrCardIdentity } from '../../components/StackrCardIdentity';
import { StackrButtonPattern } from '../../components/StackrEmboss';
import { StackrBottomSheet, StackrQuickActionSheet, type StackrQuickAction } from '../../components/StackrModalSystem';
import { StackrImage, prefetchStackrImagesAfterInteractions } from '../../components/StackrImage';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../components/RaritySymbol';
import { ScrollToEndButton } from '../../components/ScrollToEndButton';
import {
  BinderRecord,
  BinderCardRecord,
  addCardsToBinder,
  fetchBinderById,
  fetchBinderCards,
  updateBinderCardOwned,
  updateBinderCardCondition,
  updateBinderCardGrading,
  updateBinderCardQuantity,
  getEstimatedValue,
} from '../../lib/binders';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { useTrade } from '../../components/trade-context';
import { supabase } from '../../lib/supabase';
import { fetchStackrPrice } from '../../lib/stackrDomainAdapter';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';
import { fetchTcgcsvUiCardPricesForSet } from '../../lib/pricing';
import {
  getKnownPokemonSetTotal,
  getPokemonSetLogoUrl,
  normalizePokemonCardLanguage,
  type PokemonCardLanguage,
} from '../../lib/pokemonTcg';
import { getJapaneseSetLogoSourceForSet } from '../../lib/japaneseSetLogos';
import { searchLocalPokemonCards } from '../../lib/cardSearch';
import { checkAchievements, recordAchievementEvent } from '../../lib/achievements';
import {
  getCustomBinderNameArt,
  getCustomBinderNameArtKeyForBinder,
} from '../../lib/customBinderNameArt';
import {
  getEnglishCardDisplayName,
  getLocalCardName,
  getPreferredCardDisplayName,
  getPreferredSetDisplayName,
} from '../../lib/pokemonDisplayNames';
import { getIncrementalListWindow, measureAsync, stackrListPerformance } from '../../lib/performance';
import { stackrCardImageSizes, stackrTabContentPadding } from '../../lib/stackrSizing';
import { stackrIcons } from '../../lib/stackrIcons';
import { createActivityPost } from '../../lib/activity';
import type { ScanEditionHint } from '../../types/scan';

// ===============================
// CONSTANTS
// ===============================

const CONDITION_OPTIONS = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

const GRADING_COMPANIES = SLAB_GRADING_COMPANIES;
const GRADES = SLAB_GRADE_SHORTCUTS;


const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// ===============================
// TYPES
// ===============================

type BinderCardWithDetails = BinderCardRecord & {
  card?: any | null;
};

function getBinderCardDisplayName(item: BinderCardWithDetails | null | undefined, fallback = 'Card') {
  if (!item) return fallback;

  const card = item.card ?? {};
  const raw = card.raw_data ?? card.raw ?? {};
  const rawSet = raw?.set && typeof raw.set === 'object' ? raw.set : {};
  const language = normalizePokemonCardLanguage(card.language ?? item.language ?? raw?.language);

  return getPreferredCardDisplayName({
    id: card.id ?? item.card_id ?? null,
    sourceId: card.externalIds?.tcgdex ?? raw?.source_id ?? raw?.provider_card_id ?? raw?.id ?? item.api_card_id ?? item.card_id ?? null,
    setId: item.set_id ?? card.set?.id ?? rawSet.id ?? null,
    collectorNumber: card.number ?? item.card_number ?? raw?.localId ?? raw?.number ?? null,
    language,
    region: card.region ?? raw?.region ?? null,
    localName: card.localName ?? raw?.local_name ?? (language !== 'en' ? raw?.name ?? item.card_name ?? card.name ?? null : null),
    englishDisplayName: card.englishDisplayName ?? raw?.english_display_name ?? raw?.englishDisplayName ?? null,
    canonicalName: card.canonicalName ?? raw?.canonical_name ?? null,
    fallbackName: card.name ?? item.card_name ?? item.card_id ?? fallback,
    raw,
  });
}

const cleanPreviewText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
};

const containsCjkText = (value: unknown) => /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value ?? ''));

function getPreviewCardRawData(card: CardPreviewResult | null | undefined) {
  return card?.raw_data ?? {};
}

function getPreviewCardLocalName(card: CardPreviewResult | null | undefined) {
  if (!card) return null;
  const raw = getPreviewCardRawData(card);
  const language = normalizePokemonCardLanguage(card.language ?? raw.language);

  return cleanPreviewText(card.local_name)
    ?? getLocalCardName({
      id: card.card_id,
      sourceId: raw.source_id ?? raw.provider_card_id ?? raw.id ?? card.card_id,
      setId: card.set_id ?? raw.set?.id ?? null,
      collectorNumber: card.number ?? raw.localId ?? raw.number ?? null,
      language,
      region: raw.region ?? null,
      localName: card.local_name ?? (language !== 'en' ? card.name ?? raw.name ?? null : null),
      englishDisplayName: card.english_name ?? raw.english_display_name ?? raw.englishDisplayName ?? null,
      canonicalName: raw.canonical_name ?? null,
      fallbackName: card.name ?? card.card_id,
      raw,
    });
}

function getPreviewCardEnglishName(card: CardPreviewResult | null | undefined) {
  if (!card) return null;
  const raw = getPreviewCardRawData(card);
  const language = normalizePokemonCardLanguage(card.language ?? raw.language);
  const localName = getPreviewCardLocalName(card);

  return cleanPreviewText(card.english_name)
    ?? getEnglishCardDisplayName({
      id: card.card_id,
      sourceId: raw.source_id ?? raw.provider_card_id ?? raw.id ?? card.card_id,
      setId: card.set_id ?? raw.set?.id ?? null,
      collectorNumber: card.number ?? raw.localId ?? raw.number ?? null,
      language,
      region: raw.region ?? null,
      localName,
      englishDisplayName: raw.english_display_name ?? raw.englishDisplayName ?? null,
      canonicalName: raw.canonical_name ?? null,
      fallbackName: card.name ?? card.card_id,
      raw,
    })
    ?? (!containsCjkText(card.name) ? cleanPreviewText(card.name) : null);
}

function getPreviewCardDisplayName(card: CardPreviewResult | null | undefined, fallback = 'Card') {
  if (!card) return fallback;
  const englishName = getPreviewCardEnglishName(card);
  if (englishName) return englishName;

  const localName = getPreviewCardLocalName(card);
  const language = normalizePokemonCardLanguage(card.language);

  return getPreferredCardDisplayName({
    id: card.card_id,
    setId: card.set_id ?? null,
    language,
    localName,
    englishDisplayName: card.english_name ?? null,
    fallbackName: card.name ?? card.card_id ?? fallback,
    raw: {
      name: card.name,
      local_name: localName,
      english_display_name: card.english_name ?? englishName,
      language,
      set: {
        id: card.set_id ?? null,
        name: card.set_name ?? null,
      },
    },
  });
}

function getPreviewCardSupportingName(card: CardPreviewResult | null | undefined, primaryName: string) {
  const englishName = getPreviewCardEnglishName(card);
  const localName = getPreviewCardLocalName(card);
  if (containsCjkText(primaryName) && englishName && englishName !== primaryName) return englishName;
  if (localName && localName !== primaryName && containsCjkText(localName)) return localName;
  return null;
}

function getPreviewSetDisplayName(card: CardPreviewResult | null | undefined, fallback?: string | null) {
  if (!card) return cleanPreviewText(fallback) ?? 'Unknown set';
  const raw = getPreviewCardRawData(card);
  return cleanPreviewText(card.english_set_name)
    ?? getPreferredSetDisplayName({
      id: card.set_id ?? raw.set?.id ?? null,
      sourceId: raw.set?.tcgdex_id ?? raw.set?.source_id ?? raw.source_id ?? card.set_id ?? null,
      setCode: raw.set?.set_code ?? raw.set?.tcgdex_id ?? raw.set_code ?? card.set_id ?? null,
      language: card.language ?? raw.language ?? raw.set?.language ?? null,
      region: raw.region ?? raw.set?.region ?? null,
      localName: card.local_set_name ?? raw.set?.local_name ?? raw.set?.name ?? null,
      englishDisplayName: raw.set?.english_display_name ?? raw.set?.englishDisplayName ?? null,
      canonicalName: card.set_name ?? raw.set?.name ?? null,
      fallbackName: fallback ?? card.set_id ?? null,
      raw: raw.set ?? raw,
    })
    ?? cleanPreviewText(fallback)
    ?? 'Unknown set';
}

function getPreviewSetSupportingName(card: CardPreviewResult | null | undefined, primarySetName: string) {
  const localSetName = cleanPreviewText(card?.local_set_name ?? getPreviewCardRawData(card)?.set?.local_name);
  const englishSetName = cleanPreviewText(card?.english_set_name);
  if (containsCjkText(primarySetName) && englishSetName && englishSetName !== primarySetName) return englishSetName;
  if (localSetName && localSetName !== primarySetName && containsCjkText(localSetName)) return localSetName;
  return null;
}

type ShowcaseType = 'favorite' | 'chase';

type ShowcaseRow = {
  id: string;
  user_id: string;
  binder_id: string;
  card_id: string;
  set_id: string;
  showcase_type: ShowcaseType;
  sort_order: number;
};

type CardPreviewResult = {
  card_id: string;
  set_id?: string | null;
  language?: PokemonCardLanguage | null;
  name: string;
  local_name?: string | null;
  english_name?: string | null;
  set_name?: string | null;
  local_set_name?: string | null;
  english_set_name?: string | null;
  number?: string | null;
  image_url?: string | null;
  rarity?: string | null;
  card_type?: string | null;
  value?: number | null;
  finish_keys?: string[];
  raw_data?: any;
};

type SortMode = 'binder' | 'name' | 'owned' | 'missing' | 'number';

type EbayModalPrice = {
  low: number | null;
  average: number | null;
  high: number | null;
  count: number;
  usedFallback?: boolean;
};

type TcgFallbackPrice = {
  low: number | null;
  mid: number | null;
  market: number | null;
};

type AddCardValueFilter = 'any' | 'under20' | '20to100' | '100plus';
type AddCardTypeFilter = 'any' | 'pokemon' | 'trainer' | 'energy';
type AddCardFinishFilter = 'any' | 'holo' | 'nonHolo';
type AddCardRarityFilter = 'any' | 'sar' | 'ar' | 'fullArt' | 'secret';

type AddCardFilters = {
  value: AddCardValueFilter;
  cardType: AddCardTypeFilter;
  finish: AddCardFinishFilter;
  rarity: AddCardRarityFilter;
  setQuery: string;
};

const DEFAULT_ADD_CARD_FILTERS: AddCardFilters = {
  value: 'any',
  cardType: 'any',
  finish: 'any',
  rarity: 'any',
  setQuery: '',
};

const ADD_VALUE_FILTERS: { key: AddCardValueFilter; label: string }[] = [
  { key: 'any', label: 'Any value' },
  { key: 'under20', label: 'Under \u00A320' },
  { key: '20to100', label: '\u00A320-\u00A3100' },
  { key: '100plus', label: '\u00A3100+' },
];

const ADD_TYPE_FILTERS: { key: AddCardTypeFilter; label: string }[] = [
  { key: 'any', label: 'Any type' },
  { key: 'pokemon', label: 'Pokemon' },
  { key: 'trainer', label: 'Trainer' },
  { key: 'energy', label: 'Energy' },
];

const ADD_FINISH_FILTERS: { key: AddCardFinishFilter; label: string }[] = [
  { key: 'any', label: 'Any finish' },
  { key: 'holo', label: 'Holo' },
  { key: 'nonHolo', label: 'Non-holo' },
];

const ADD_RARITY_FILTERS: { key: AddCardRarityFilter; label: string }[] = [
  { key: 'any', label: 'Any rarity' },
  { key: 'sar', label: 'SAR / SIR' },
  { key: 'ar', label: 'AR / IR' },
  { key: 'fullArt', label: 'Full Art' },
  { key: 'secret', label: 'Secret' },
];

// ===============================
// HELPERS
// ===============================

const getSetIdFromCardId = (cardId: string) => {
  const parts = cardId.split('-');
  return parts.length > 1 ? parts[0] : '';
};

const getPreviewSetId = (card: Pick<CardPreviewResult, 'card_id' | 'set_id'>) =>
  card.set_id || getSetIdFromCardId(card.card_id);

const inferBinderLanguage = (language?: PokemonCardLanguage | string | null, setId?: string | null): PokemonCardLanguage => {
  const explicit = String(language ?? '').trim();
  if (explicit) return normalizePokemonCardLanguage(explicit);
  const rawSetId = String(setId ?? '').trim().toLowerCase();
  const strippedSetId = rawSetId.replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, '');
  if (/^(zh-tw|zh_tw|zhtw|zh):/i.test(rawSetId)) return 'zh-tw';
  return rawSetId.startsWith('ja:') || rawSetId.startsWith('jp:') || /^sv\d+[a-z]$/i.test(strippedSetId) ? 'ja' : 'en';
};

const getBinderEditionHint = (edition?: string | null): ScanEditionHint | null => {
  if (edition === '1st_edition' || edition === 'unlimited' || edition === 'shadowless') return edition;
  return null;
};

const getOwnedQuantity = (card?: Pick<BinderCardRecord, 'owned_quantity'> | null) =>
  Math.max(1, Math.floor(Number(card?.owned_quantity ?? 1) || 1));

const getVariantKey = (cardId: string, setId: string, variant: string) => `${setId}:${cardId}:${variant}`;
const getVariantCardKey = (cardId: string, setId: string) => `${setId}:${cardId}`;

const getVariantQuantityFromMap = (
  variants: Map<string, number>,
  cardId: string,
  setId: string,
  variant: string
) => Math.max(0, Math.floor(Number(variants.get(getVariantKey(cardId, setId, variant)) ?? 0) || 0));

const formatCurrency = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '--';
  return `£${value.toFixed(2)}`;
};

const getPreferredBinderCardPrice = (card: BinderCardWithDetails, variant?: string | null, edition?: string | null): number => {
  return getBinderTcgPrice(card.card, edition, variant) ?? card.ebay_price ?? card.tcg_price ?? card.cardmarket_price ?? 0;
};

const getCardmarketPrice = (binderCard: any): number | null => {
  if (typeof binderCard?.cardmarket_price === 'number') return binderCard.cardmarket_price;
  const prices = binderCard?.card?.cardmarket?.prices;
  if (!prices) return null;
  const eur = prices.trendPrice ?? prices.averageSellPrice ?? prices.avg30;
  return typeof eur === 'number' ? Math.round(eur * EUR_TO_GBP * 100) / 100 : null;
};

const getBinderTcgPrice = (card: any, edition?: string | null, variant?: string | null): number | null => {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  if (variant) {
    const value = prices[variant]?.market ?? prices[variant]?.mid ?? prices[variant]?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
    return null;
  }

  if (edition === '1st_edition') {
    const preferred = ['1stEditionHolofoil', '1stEditionNormal'];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
    }
    return null;
  }

  if (edition === 'unlimited') {
    const preferred = ['unlimitedHolofoil', 'unlimited', 'holofoil', 'reverseHolofoil', 'normal'];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
    }
    return null;
  }

  const preferred = ['unlimitedHolofoil', 'unlimited', 'holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal'];
  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return Math.round(value * USD_TO_GBP * 100) / 100;
  }

  return null;
};

const normalizeAddFilterText = (value: string | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getSearchCardFinishKeys = (card: any): string[] => {
  const prices = card?.raw_data?.tcgplayer?.prices ?? card?.tcgplayer?.prices ?? {};
  return Object.keys(prices);
};

const getSearchCardValue = (card: any): number | null => {
  const prices = card?.raw_data?.tcgplayer?.prices ?? card?.tcgplayer?.prices ?? {};
  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value * USD_TO_GBP * 100) / 100;
    }
  }
  return null;
};

const getAddFilterCount = (filters: AddCardFilters) =>
  Number(filters.value !== 'any')
  + Number(filters.cardType !== 'any')
  + Number(filters.finish !== 'any')
  + Number(filters.rarity !== 'any')
  + Number(filters.setQuery.trim().length > 0);

const matchesAddCardFilters = (card: CardPreviewResult, filters: AddCardFilters) => {
  const rarity = normalizeAddFilterText(card.rarity);
  const type = normalizeAddFilterText(card.card_type);
  const setName = normalizeAddFilterText([
    card.set_name,
    card.english_set_name,
    card.local_set_name,
  ].filter(Boolean).join(' '));
  const setId = normalizeAddFilterText(getPreviewSetId(card));
  const finishKeys = (card.finish_keys ?? []).map(normalizeAddFilterText);
  const hasHoloFinish = finishKeys.some((key) => key.includes('holo')) || rarity.includes('holo');
  const hasNonHoloFinish = finishKeys.some((key) => (
    key === 'normal'
    || key === 'unlimited'
    || key === '1steditionnormal'
    || key.includes('normal')
  ));

  if (filters.value !== 'any') {
    const value = card.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (filters.value === 'under20' && value >= 20) return false;
    if (filters.value === '20to100' && (value < 20 || value > 100)) return false;
    if (filters.value === '100plus' && value < 100) return false;
  }

  if (filters.cardType !== 'any' && type !== filters.cardType) return false;
  if (filters.finish === 'holo' && !hasHoloFinish) return false;
  if (filters.finish === 'nonHolo' && hasHoloFinish && !hasNonHoloFinish) return false;

  if (filters.rarity !== 'any') {
    const isSar = rarity.includes('special art rare') || rarity.includes('special illustration rare') || rarity.includes('rare special illustration') || rarity === 'sar' || rarity === 'sir';
    const isAr = !isSar && (rarity.includes('art rare') || rarity.includes('illustration rare') || rarity.includes('rare illustration') || rarity === 'ar' || rarity === 'ir');
    const isFullArt = rarity.includes('full art') || rarity.includes('ultra rare');
    const isSecret = rarity.includes('secret') || rarity.includes('hyper') || rarity.includes('rainbow');
    if (filters.rarity === 'sar' && !isSar) return false;
    if (filters.rarity === 'ar' && !isAr) return false;
    if (filters.rarity === 'fullArt' && !isFullArt) return false;
    if (filters.rarity === 'secret' && !isSecret) return false;
  }

  const setQuery = normalizeAddFilterText(filters.setQuery);
  if (setQuery && !setName.includes(setQuery) && !setId.includes(setQuery)) return false;

  return true;
};

function GradedSlabCard({
  item,
  imageUri,
  editionHint,
  size = 'grid',
  opacity = 1,
}: {
  item: BinderCardWithDetails;
  imageUri: string | null;
  editionHint: ScanEditionHint | null;
  size?: 'showcase' | 'grid' | 'modal';
  opacity?: number;
}) {
  const company = item.grade_company ?? 'PSA';
  const grade = item.grade ?? '10';
  const accent = getSlabAccent(company);
  const cardName = getBinderCardDisplayName(item, item.card_id);
  const setName = item.card?.set?.name ?? item.set_name ?? item.set_id;
  const number = item.card?.number ?? item.card_number ?? null;
  const compact = size !== 'modal';
  const labelHeight = compact ? (size === 'showcase' ? 36 : 44) : 84;
  const outerPadding = compact ? 4 : 8;
  const bodyPadding = compact ? 4 : 8;

  return (
    <View style={{
      width: '100%',
      height: '100%',
      opacity,
      borderRadius: compact ? 11 : 24,
      backgroundColor: '#DDE3EC',
      padding: outerPadding,
      borderWidth: compact ? 1 : 2,
      borderColor: compact ? '#AAB4C2' : `${accent}80`,
    }}>
      <SlabStickerLabel
        company={company}
        grade={grade}
        cardName={cardName}
        setName={setName}
        number={number}
        size={size}
        style={{
          height: labelHeight,
          borderRadius: compact ? 8 : 16,
          marginBottom: compact ? 5 : 8,
          borderWidth: 1,
          borderColor: '#CBD5E1',
        }}
      />

      <View style={{
        flex: 1,
        borderRadius: compact ? 8 : 18,
        backgroundColor: '#C7D2E1',
        padding: bodyPadding,
        borderWidth: 1,
        borderColor: '#94A3B8',
      }}>
        <View style={{
          flex: 1,
          borderRadius: compact ? 6 : 12,
          overflow: 'hidden',
          backgroundColor: '#F8FAFC',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {imageUri ? (
            <EditionAwareCardImage
              uri={imageUri}
              cardId={item.card_id}
              rawData={item.card}
              editionHint={editionHint}
              sourceSize={size === 'modal' ? 'large' : 'small'}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: '#64748B', fontSize: compact ? 9 : 13, fontWeight: '800' }}>No image</Text>
          )}
        </View>
      </View>

      <View style={{
        position: 'absolute',
        left: compact ? 3 : 6,
        right: compact ? 3 : 6,
        top: compact ? 3 : 6,
        bottom: compact ? 3 : 6,
        borderRadius: compact ? 10 : 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.72)',
      }} pointerEvents="none" />
    </View>
  );
}

// ===============================
// VARIANT HELPERS
// ===============================

const VARIANT_LABELS: Record<string, string> = {
  normal: 'Base',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse Holo',
  '1stEditionNormal': '1st',
  '1stEditionHolofoil': '1stH',
  unlimitedHolofoil: 'Unlimited Holo',
  unlimited: 'Unlimited',
  reverseHoloEnergy: 'Energy Holo',
  reverseHoloPokeball: 'Poke Ball Holo',
  speckledHolofoil: 'Speckled Holo',
  lineHolofoil: 'Line Holo',
  masterBallPatternHolofoil: 'Master Ball',
  stampedHolofoil: 'Stamped',
  quickBallPatternHolofoil: 'Quick Ball',
  loveBallPatternHolofoil: 'Love Ball',
  duskBallPatternHolofoil: 'Dusk Ball',
  friendBallPatternHolofoil: 'Friend Ball',
};

type MasterVariantKind = 'base' | 'holo' | 'reverse';

function getMasterVariantKind(key: string): MasterVariantKind {
  if (key === 'normal' || key === '1stEditionNormal' || key === 'unlimited') return 'base';
  if ((key === 'holofoil' || key === '1stEditionHolofoil' || key === 'unlimitedHolofoil') && !key.toLowerCase().includes('pattern')) return 'holo';
  return 'reverse';
}

// Per-set variant overrides (e.g. for sets with multiple reverse holo patterns like Poké Ball)
const SET_VARIANT_OVERRIDES: Record<string, Partial<Record<string, string[]>>> = {
  asc: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  ASC: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  // English 151: Only force 2 slices if your DB doesn't have the price keys yet
  me2pt5: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  me3: {
    Common: ['normal', 'reverseHolofoil'],
    Uncommon: ['normal', 'reverseHolofoil'],
  },
};

const getMasterSetStorageKey = (binderId: string) => `stackr:binder-master-set:${binderId}`;

function getVariants(card: any, explicitSetId?: string): string[] {
  const setId = (explicitSetId ?? card?.set?.id ?? card?.set_id ?? '').toLowerCase();
  const setName = (card?.set?.name ?? card?.raw_data?.set?.name ?? '').toLowerCase();

  // 1. Check for hardcoded set overrides by set ID
  let override = SET_VARIANT_OVERRIDES[setId] || SET_VARIANT_OVERRIDES[setId.toUpperCase()];

  // Fallback by set name in case naming differs
  if (!override && setName.includes('ascended')) {
    override = {
      Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
      Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    };
  }

  if (override && card?.rarity) {
    const r = card.rarity;
    const variants = override[r] ||
                     override[r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()] ||
                     override[r.toLowerCase()];
    if (variants) return variants;
  }

  // 2. Try to get variants from TCGPlayer price keys (Most cards fall here)
  const prices = card?.tcgplayer?.prices ?? card?.raw_data?.tcgplayer?.prices;
  const keys = Object.keys(prices ?? {}).filter(k => k !== 'unlimited');

  // Return multiple variants ONLY if they exist in the database data
  if (keys.length > 1) return keys;

  // 3. Fallback: Default to a single variant if no multi-variant data is found
  return keys.length > 0 ? [keys[0]] : ['normal'];
}

const getDefaultOwnedVariant = (variants: string[]): string | null => {
  const preferred = [
    'normal',
    'unlimited',
    'holofoil',
    'unlimitedHolofoil',
    '1stEditionNormal',
    '1stEditionHolofoil',
    'reverseHolofoil',
    'reverseHoloEnergy',
    'reverseHoloPokeball',
  ];

  return preferred.find((variant) => variants.includes(variant)) ?? variants[0] ?? null;
};

function isJapaneseSecretBinderCard(card: BinderCardWithDetails) {
  const language = normalizePokemonCardLanguage(card.language ?? card.card?.language ?? card.card?.raw_data?.language);
  if (language !== 'ja') return false;
  const raw = card.card?.raw_data ?? {};
  const rarity = String(card.card?.rarity ?? raw?.rarity ?? '').toLowerCase();
  return raw?.secret === true || rarity.includes('secret');
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function BinderDetailScreen() {
  const { theme } = useTheme();
  const { id, readOnly } = useLocalSearchParams<{ id: string; readOnly?: string }>();
  const binderId = Array.isArray(id) ? id[0] : id;
  const routeReadOnly = readOnly === 'true';
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = useWindowDimensions();
  const numColumns = width >= 900 ? 6 : width >= 600 ? 4 : 2;
  const cardWidth = (width - 32 - (numColumns - 1) * 8) / numColumns;

  // ===============================
  // STATE
  // ===============================

  const [binder, setBinder] = useState<BinderRecord | null>(null);
  const [customNameArtKey, setCustomNameArtKey] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [cards, setCards] = useState<BinderCardWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const gridWindow = useMemo(() => getIncrementalListWindow(numColumns), [numColumns]);
  const addSearchWindow = useMemo(
    () => getIncrementalListWindow(1, { initialRows: 18, pageRows: 14, minInitial: 18, minPage: 14 }),
    []
  );
  const [visibleCardCount, setVisibleCardCount] = useState(gridWindow.initialCount);
  const [visibleAddSearchCount, setVisibleAddSearchCount] = useState(addSearchWindow.initialCount);

  const [sortMode, setSortMode] = useState<SortMode>('number');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const [selectedCard, setSelectedCard] = useState<BinderCardWithDetails | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [quickActionCard, setQuickActionCard] = useState<BinderCardWithDetails | null>(null);

  const [modalEbayPrice, setModalEbayPrice] = useState<EbayModalPrice | null>(null);
  const [modalEbayLoading, setModalEbayLoading] = useState(false);
  const [modalEbayError, setModalEbayError] = useState(false);
  const [modalTcgFallbackPrice, setModalTcgFallbackPrice] = useState<TcgFallbackPrice | null>(null);

  const [showcaseRows, setShowcaseRows] = useState<ShowcaseRow[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [debouncedAddSearch, setDebouncedAddSearch] = useState('');
  const [addSearchResults, setAddSearchResults] = useState<CardPreviewResult[]>([]);
  const [addSearchLoading, setAddSearchLoading] = useState(false);
  const [addFiltersVisible, setAddFiltersVisible] = useState(false);
  const [addFilters, setAddFilters] = useState<AddCardFilters>(DEFAULT_ADD_CARD_FILTERS);
  const [addingCardId, setAddingCardId] = useState<string | null>(null);
const [pendingAddIds, setPendingAddIds] = useState<Record<string, CardPreviewResult>>({});
const pendingAddCount = Object.keys(pendingAddIds).length;
const activeAddFilterCount = getAddFilterCount(addFilters);
  const [addGradeCompany, setAddGradeCompany] = useState('PSA');
  const [addGrade, setAddGrade] = useState('10');
  const [gradingCardToAdd, setGradingCardToAdd] = useState<BinderCardWithDetails | null>(null);
  const [gradingPromptCompany, setGradingPromptCompany] = useState('PSA');
  const [gradingPromptGrade, setGradingPromptGrade] = useState('10');
  const [detailGradeText, setDetailGradeText] = useState('10');

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addSearchRequestRef = useRef(0);
  const addResultLongPressRef = useRef<string | null>(null);
  const binderListRef = useRef<FlatList<BinderCardWithDetails>>(null);
  const addCardListRef = useRef<FlatList<CardPreviewResult>>(null);
  const [ownedVariants, setOwnedVariants] = useState<Map<string, number>>(new Map());
  const [variantManagedCards, setVariantManagedCards] = useState<Set<string>>(new Set());
  const [masterSetEnabled, setMasterSetEnabled] = useState(false);
  const [updatingMasterSet, setUpdatingMasterSet] = useState(false);
  const [setLogoFailed, setSetLogoFailed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const achievementProgressRef = useRef<Record<string, number>>({});
  const isOwner = Boolean(userId && binder?.user_id === userId);
  const isReadOnly = routeReadOnly || (Boolean(binder) && !isOwner);

  useEffect(() => {
    if (selectedCard) setDetailGradeText(selectedCard.grade ?? '10');
  }, [selectedCard?.id, selectedCard?.grade]);

  const goBackToBinderLibrary = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/binder' as any);
  }, []);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    toastTimer.current = setTimeout(() => setToastMessage(null), 2500);
  };

  const [showcaseCollapsed, setShowcaseCollapsed] = useState<Record<ShowcaseType, boolean>>({
  favorite: true,
  chase: true,
});

  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const imageScale = Animated.multiply(baseScale, pinchScale);

  const { isForTrade } = useTrade();

  const sortOptions: { label: string; value: SortMode }[] = [
    { label: 'Number', value: 'number' },
    { label: 'Binder order', value: 'binder' },
    { label: 'Name', value: 'name' },
    { label: 'Owned first', value: 'owned' },
    { label: 'Missing first', value: 'missing' },
  ];

  const currentSortLabel =
    sortOptions.find((o) => o.value === sortMode)?.label ?? 'Number';

  useEffect(() => {
    setSetLogoFailed(false);
  }, [binder?.source_set_id, binder?.cover_key, binder?.source_set_logo_url, binder?.source_set_symbol_url]);

  // ===============================
  // MODAL HELPERS
  // ===============================

  const closeDetailModal = () => {
    setDetailVisible(false);
    setModalEbayPrice(null);
    setModalEbayError(false);
    setModalTcgFallbackPrice(null);
    modalTranslateY.setValue(0);
    baseScale.setValue(1);
    pinchScale.setValue(1);
    lastScale.current = 1;
  };

  // ===============================
  // EBAY PRICE FOR MODAL
  // ===============================

  const fetchModalEbayPrice = useCallback(async (card: BinderCardWithDetails) => {
    try {
      setModalEbayLoading(true);
      setModalEbayError(false);
      setModalEbayPrice(null);

      const name = getBinderCardDisplayName(card, '');
      const setName = card.card?.set?.name ?? card.set_name ?? '';
      const number = card.card?.number ?? card.card_number ?? '';
      const cardId = card.card?.id ?? card.card_id ?? '';
      const language = normalizePokemonCardLanguage(card.language ?? binder?.language);
      const isGraded = binder?.card_mode === 'graded';
      if (isGraded) {
        setModalEbayLoading(false);
        return;
      }
      const result = await fetchStackrPrice(cardId || `${setName} ${number}` || name, {
        language,
        productType: isGraded ? 'graded_card' : 'raw_card',
        currency: 'GBP',
        condition: isGraded ? null : card.condition || 'Near Mint',
        grader: isGraded ? card.grade_company ?? 'PSA' : null,
        grade: isGraded ? card.grade ?? '10' : null,
      });

      if (!result) {
        setModalEbayError(true);
        return;
      }

      setModalEbayPrice({
        low: result.price.estimates.low,
        average: result.price.estimates.central,
        high: result.price.estimates.high,
        count: result.price.sample.total,
        usedFallback: result.price.fallbackEstimate != null,
      });
    } catch (err) {
      console.warn('Modal eBay price unavailable:', err instanceof Error ? err.message : err);
      setModalEbayError(true);
    } finally {
      setModalEbayLoading(false);
    }
  }, [binder?.card_mode, binder?.edition, binder?.language]);

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async () => {
    if (!binderId) return;

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const binderData = await measureAsync(
        'binder.fetchBinderById',
        () => fetchBinderById(binderId),
        { binderId }
      );

      if (!binderData || (binderData.user_id !== user?.id && !binderData.is_public)) {
        setBinder(null);
        setCustomNameArtKey(null);
        setCards([]);
        setShowcaseRows([]);
        return;
      }

      setBinder(binderData);
      setCustomNameArtKey(
        binderData.type === 'custom'
          ? await getCustomBinderNameArtKeyForBinder(binderData.id, binderData.name)
          : null
      );
      setIsPublic(Boolean(binderData?.is_public));

      const binderCards = await measureAsync(
        'binder.fetchBinderCards',
        () => fetchBinderCards(binderId),
        { binderId }
      );

      if (user) {
        const { data, error } = await supabase
          .from('binder_card_showcases')
          .select('*')
          .eq('user_id', user.id)
          .eq('binder_id', binderId)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        setShowcaseRows((data ?? []) as ShowcaseRow[]);

        const { data: userBinders, error: userBindersError } = await supabase
          .from('binders')
          .select('id')
          .eq('user_id', user.id);

        if (userBindersError) throw userBindersError;

        const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);
        const { data: ownedRows, error: ownedRowsError } = userBinderIds.length
          ? await supabase
              .from('binder_cards')
              .select('card_id, set_id')
              .in('binder_id', userBinderIds)
              .eq('owned', true)
          : { data: [], error: null };

        if (ownedRowsError) throw ownedRowsError;

        const nextGlobalOwnedKeys = new Set(
          (ownedRows ?? []).map((row) => `${row.set_id}:${row.card_id}`)
        );
        setCards(binderCards.map((card) => ({
          ...card,
          owned: card.owned || nextGlobalOwnedKeys.has(`${card.set_id}:${card.card_id}`),
        })));

        // Load variant ownership for all cards in this binder
        const cardIds = binderCards.map((c) => c.card_id);
        if (cardIds.length > 0) {
          const setIds = Array.from(new Set(binderCards.map((c) => c.set_id).filter(Boolean)));
          const binderVariantCardKeys = new Set(
            binderCards.map((card) => getVariantCardKey(card.card_id, card.set_id))
          );
          const { data: variantRowsWithQuantity, error: variantQuantityError } = await supabase
            .from('user_card_variants')
            .select('card_id, set_id, variant, quantity')
            .eq('user_id', user.id)
            .in('card_id', cardIds)
            .in('set_id', setIds);

          const variantRows = variantQuantityError
            ? (await supabase
                .from('user_card_variants')
                .select('card_id, set_id, variant')
                .eq('user_id', user.id)
                .in('card_id', cardIds)
                .in('set_id', setIds)).data
            : variantRowsWithQuantity;

          const typedVariantRows = ((variantRows ?? []) as {
            card_id: string;
            set_id?: string | null;
            variant: string;
            quantity?: number | null;
          }[]).filter((row) =>
            Boolean(row.set_id) && binderVariantCardKeys.has(getVariantCardKey(row.card_id, row.set_id ?? ''))
          );

          setOwnedVariants(new Map(
            typedVariantRows.map((row) => [
              getVariantKey(row.card_id, row.set_id ?? '', row.variant),
              Math.max(1, Number(row.quantity ?? 1)),
            ])
          ));
          setVariantManagedCards(new Set(
            typedVariantRows.map((row) => getVariantCardKey(row.card_id, row.set_id ?? ''))
          ));
        } else {
          setOwnedVariants(new Map());
          setVariantManagedCards(new Set());
        }
      } else {
        setCards(binderCards);
        setOwnedVariants(new Map());
        setVariantManagedCards(new Set());
      }
    } catch (error) {
      console.log('Failed to load binder', error);
      Alert.alert('Error', 'Could not load this binder.');
    } finally {
      setLoading(false);
    }
  }, [binderId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    let mounted = true;

    const loadMasterSetMode = async () => {
      if (!binderId) return;
      try {
        const stored = await AsyncStorage.getItem(getMasterSetStorageKey(binderId));
        if (mounted) setMasterSetEnabled(stored === 'true' || binder?.master_set_enabled === true);
      } catch (error) {
        console.log('Failed to load master set setting', error);
      }
    };

    loadMasterSetMode();

    return () => {
      mounted = false;
    };
  }, [binder?.master_set_enabled, binderId]);

  // ===============================
  // DEBOUNCED SEARCH
  // ===============================

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAddSearch(addSearch), 220);
    return () => clearTimeout(timer);
  }, [addSearch]);

  useEffect(() => {
    if (debouncedAddSearch.trim().length >= 2) {
      searchCardsToAdd(debouncedAddSearch);
    } else {
      addSearchRequestRef.current += 1;
      setAddSearchLoading(false);
      setAddSearchResults([]);
    }
    // searchCardsToAdd is declared later in this component; addFilters is included to refresh filtered results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedAddSearch, addFilters]);

  // ===============================
  // SORTED CARDS
  // ===============================

  const displayCards = useMemo(() => {
    const language = normalizePokemonCardLanguage(binder?.language);
    if (binder?.type === 'official' && language === 'ja' && !masterSetEnabled) {
      return cards.filter((card) => !isJapaneseSecretBinderCard(card));
    }
    return cards;
  }, [binder?.language, binder?.type, cards, masterSetEnabled]);

  const sortedCards = useMemo(() => {
    const next = [...displayCards];
    if (sortMode === 'binder') return next.sort((a, b) => a.slot_order - b.slot_order);
    if (sortMode === 'name') return next.sort((a, b) =>
      String(a.card?.name ?? a.card_id).localeCompare(String(b.card?.name ?? b.card_id))
    );
    if (sortMode === 'owned') return next.sort((a, b) => Number(b.owned) - Number(a.owned));
    if (sortMode === 'missing') return next.sort((a, b) => Number(a.owned) - Number(b.owned));
    if (sortMode === 'number') return next.sort((a, b) =>
      String(a.card?.number ?? a.card_id).localeCompare(
        String(b.card?.number ?? b.card_id),
        undefined,
        { numeric: true }
      )
    );
    return next;
  }, [displayCards, sortMode]);

  const rendersFullOfficialSet = binder?.type === 'official';

  useEffect(() => {
    setVisibleCardCount(
      rendersFullOfficialSet
        ? sortedCards.length
        : Math.min(sortedCards.length, gridWindow.initialCount)
    );
  }, [gridWindow.initialCount, rendersFullOfficialSet, sortedCards.length, sortMode]);

  useEffect(() => {
    setVisibleAddSearchCount(Math.min(addSearchResults.length, addSearchWindow.initialCount));
  }, [addFilters, addSearchResults.length, addSearchWindow.initialCount, debouncedAddSearch]);

  const visibleCards = useMemo(
    () => (rendersFullOfficialSet ? sortedCards : sortedCards.slice(0, visibleCardCount)),
    [rendersFullOfficialSet, sortedCards, visibleCardCount]
  );
  const visibleAddSearchResults = useMemo(
    () => addSearchResults.slice(0, visibleAddSearchCount),
    [addSearchResults, visibleAddSearchCount]
  );
  const hasMoreCardsToRender = !rendersFullOfficialSet && visibleCardCount < sortedCards.length;
  const hasMoreAddResultsToRender = visibleAddSearchCount < addSearchResults.length;
  const renderMoreCards = useCallback(() => {
    setVisibleCardCount((current) => Math.min(sortedCards.length, current + gridWindow.pageSize));
  }, [gridWindow.pageSize, sortedCards.length]);
  const renderMoreAddResults = useCallback(() => {
    setVisibleAddSearchCount((current) => Math.min(addSearchResults.length, current + addSearchWindow.pageSize));
  }, [addSearchResults.length, addSearchWindow.pageSize]);
  const scrollBinderToEnd = useCallback(() => {
    setVisibleCardCount(sortedCards.length);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => binderListRef.current?.scrollToEnd({ animated: true }));
    });
  }, [sortedCards.length]);
  const scrollAddCardsToEnd = useCallback(() => {
    setVisibleAddSearchCount(addSearchResults.length);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => addCardListRef.current?.scrollToEnd({ animated: true }));
    });
  }, [addSearchResults.length]);
  const showBinderEndButton = sortedCards.length > Math.max(18, numColumns * 8);
  const showAddCardsEndButton = !addSearchLoading && addSearchResults.length > 12;

  useEffect(() => {
    if (!sortedCards.length) return;
    const firstWindowSize = Math.max(12, numColumns * 6);
    const cancelPrefetch = prefetchStackrImagesAfterInteractions(
      sortedCards
        .slice(0, firstWindowSize)
        .map((card) => card.card?.images?.small ?? card.image_url ?? card.card?.images?.large ?? null),
      firstWindowSize
    );

    return cancelPrefetch;
  }, [numColumns, sortedCards]);

  let ownedCount = 0;
  let countedSlotTotal = 0;
  for (const c of displayCards) {
    const savedVariants = [...ownedVariants.keys()]
      .filter((key) => key.startsWith(`${c.set_id}:${c.card_id}:`))
      .map((key) => key.slice(`${c.set_id}:${c.card_id}:`.length));
    const variants = masterSetEnabled ? getVariants(c.card, c.set_id) : ['card'];
    if (masterSetEnabled && variants.length > 1) {
      countedSlotTotal += variants.length;
      const variantManaged = variantManagedCards.has(getVariantCardKey(c.card_id, c.set_id));
      const defaultVariant = c.owned && !variantManaged ? getDefaultOwnedVariant(variants) : null;
      const ownedVariantCount = variants.filter((v) =>
        getVariantQuantityFromMap(ownedVariants, c.card_id, c.set_id, v) > 0 || v === defaultVariant
      ).length;
      ownedCount += ownedVariantCount > 0 ? ownedVariantCount : !variantManaged && c.owned ? 1 : 0;
    } else {
      countedSlotTotal += 1;
      if (c.owned || savedVariants.length > 0) ownedCount += 1;
    }
  }
  const knownOfficialTotal = binder?.type === 'official'
    ? getKnownPokemonSetTotal(binder.source_set_id, binder.language) ?? 0
    : 0;
  const cardSetTotals = cards
    .map((card) => Number(
      card.card?.set?.printedTotal ??
      card.card?.set?.total ??
      card.card?.raw_data?.set?.printedTotal ??
      card.card?.raw_data?.set?.total ??
      0
    ))
    .filter((value) => Number.isFinite(value) && value > 0);
  const officialCatalogueTotal = Math.max(knownOfficialTotal, ...cardSetTotals, 0);
  const totalKnown = binder?.type !== 'official' || officialCatalogueTotal > 0;
  const totalCount = totalKnown
    ? binder?.type === 'official'
      ? Math.max(officialCatalogueTotal, masterSetEnabled ? countedSlotTotal : 0)
      : countedSlotTotal
    : 0;
  const progressPercent = totalKnown && totalCount
    ? Math.min(100, Math.round((ownedCount / totalCount) * 100))
    : 0;

  useEffect(() => {
    if (!binderId || !totalKnown || totalCount <= 0 || loading) return;

    const lastProgress = achievementProgressRef.current[binderId] ?? -1;
    if (progressPercent <= lastProgress && progressPercent < 100) return;
    achievementProgressRef.current[binderId] = progressPercent;

    checkAchievements({
      binderId,
      binderCompletion: progressPercent,
      masterSetEnabled,
    }).catch((achievementError) => {
      console.log('Binder progress achievement check failed:', achievementError);
    });

    if (progressPercent >= 100 && lastProgress < 100) {
      recordAchievementEvent(
        masterSetEnabled ? 'master_set_complete' : 'binder_complete',
        {
          binderId,
          binderCompletion: progressPercent,
          complete: true,
          masterSetEnabled,
        }
      ).catch((achievementError) => {
        console.log('Binder complete achievement event failed:', achievementError);
      });
    }
  }, [binderId, loading, masterSetEnabled, progressPercent, totalCount, totalKnown]);

  const binderValue = useMemo(() => {
    return displayCards.reduce((sum, card) => {
      const variantManaged = variantManagedCards.has(getVariantCardKey(card.card_id, card.set_id));
      let variants = masterSetEnabled
        ? getVariants(card.card, card.set_id).filter((variant) => {
            const savedQuantity = getVariantQuantityFromMap(ownedVariants, card.card_id, card.set_id, variant);
            if (savedQuantity > 0) return true;
            const defaultVariant = card.owned && !variantManaged
              ? getDefaultOwnedVariant(getVariants(card.card, card.set_id))
              : null;
            return variant === defaultVariant;
          })
        : [...ownedVariants.keys()]
            .filter((key) => key.startsWith(`${card.set_id}:${card.card_id}:`))
            .map((key) => key.slice(`${card.set_id}:${card.card_id}:`.length));

      if (masterSetEnabled && card.owned && !variantManaged && variants.length === 0) {
        const defaultVariant = getDefaultOwnedVariant(getVariants(card.card, card.set_id));
        variants = defaultVariant ? [defaultVariant] : [];
      }

      if (variants.length) {
        return sum + variants.reduce((variantSum, variant) => {
          const base = getPreferredBinderCardPrice(card, variant, binder?.edition);
          const savedQuantity = getVariantQuantityFromMap(ownedVariants, card.card_id, card.set_id, variant);
          const quantity = savedQuantity > 0 ? savedQuantity : getOwnedQuantity(card);
          return variantSum + getEstimatedValue(base, card.condition || 'Near Mint') * quantity;
        }, 0);
      }

      if (!card.owned) return sum;

      const base = getPreferredBinderCardPrice(card, null, binder?.edition);
      return sum + getEstimatedValue(base, card.condition || 'Near Mint');
    }, 0);
  }, [binder?.edition, displayCards, masterSetEnabled, ownedVariants, variantManagedCards]);

  const getDisplayedVariantQuantity = useCallback((card: BinderCardWithDetails, variant: string) => {
    const savedQuantity = getVariantQuantityFromMap(ownedVariants, card.card_id, card.set_id, variant);
    if (savedQuantity > 0) return savedQuantity;
    const variantManaged = variantManagedCards.has(getVariantCardKey(card.card_id, card.set_id));
    if (variantManaged) return 0;
    if (!masterSetEnabled || !card.owned) return 0;

    const defaultVariant = getDefaultOwnedVariant(getVariants(card.card, card.set_id));
    return variant === defaultVariant ? getOwnedQuantity(card) : 0;
  }, [masterSetEnabled, ownedVariants, variantManagedCards]);

  const getDisplayedOwnedQuantity = useCallback((card: BinderCardWithDetails) => {
    const baseQuantity = card.owned ? getOwnedQuantity(card) : 0;
    if (!masterSetEnabled) return baseQuantity;

    const variants = getVariants(card.card, card.set_id);
    if (variants.length <= 1) return baseQuantity;

    const ownedVariantCount = variants.reduce((sum, variant) =>
      sum + getDisplayedVariantQuantity(card, variant), 0);
    if (variantManagedCards.has(getVariantCardKey(card.card_id, card.set_id))) return ownedVariantCount;

    return Math.max(baseQuantity, ownedVariantCount);
  }, [getDisplayedVariantQuantity, masterSetEnabled, variantManagedCards]);

  // ===============================
  // VISIBILITY TOGGLE
  // ===============================

  const togglePublic = async () => {
    try {
      if (!binder || updatingVisibility) return;
      setUpdatingVisibility(true);
      const newValue = !isPublic;
      setIsPublic(newValue);

      const { error } = await supabase
        .from('binders')
        .update({ is_public: newValue })
        .eq('id', binder.id);

      if (error) throw error;

      if (newValue) {
        checkAchievements({ publicBinder: true }).catch((achievementError) => {
          console.log('Public binder achievement check failed:', achievementError);
        });
      }
    } catch (err) {
      console.log('Toggle public error:', err);
      setIsPublic((prev) => !prev);
      Alert.alert('Could not update binder', 'Please try again.');
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const toggleMasterSet = async (value: boolean) => {
    if (!binderId || updatingMasterSet) return;
    try {
      setUpdatingMasterSet(true);
      setMasterSetEnabled(value);
      await AsyncStorage.setItem(getMasterSetStorageKey(binderId), value ? 'true' : 'false');
      if (value) {
        recordAchievementEvent('master_set_enabled', { binderId }).catch((achievementError) => {
          console.log('Master set achievement check failed:', achievementError);
        });
      }
      const { error } = await supabase
        .from('binders')
        .update({ master_set_enabled: value })
        .eq('id', binderId);

      if (error && error.code !== 'PGRST204') throw error;

      setBinder((current) => current ? { ...current, master_set_enabled: value } : current);
    } catch (error) {
      console.log('Toggle master set error:', error);
      setMasterSetEnabled((prev) => !prev);
      Alert.alert('Could not update binder', 'Please try again.');
    } finally {
      setUpdatingMasterSet(false);
    }
  };

  // ===============================
  // SHOWCASE
  // ===============================

  const getShowcaseItems = (type: ShowcaseType) => {
    return showcaseRows
      .filter((row) => row.showcase_type === type)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => cards.find((c) => c.card_id === row.card_id && c.set_id === row.set_id))
      .filter(Boolean) as BinderCardWithDetails[];
  };

  const isShowcased = (item: BinderCardWithDetails, type: ShowcaseType) => {
    return showcaseRows.some(
      (row) =>
        row.card_id === item.card_id &&
        row.set_id === item.set_id &&
        row.showcase_type === type
    );
  };

  const toggleShowcase = async (item: BinderCardWithDetails, type: ShowcaseType) => {
    if (isReadOnly) return;

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('You must be signed in.');
      if (!binderId) throw new Error('Missing binder ID.');

      const existing = showcaseRows.find(
        (row) =>
          row.card_id === item.card_id &&
          row.set_id === item.set_id &&
          row.showcase_type === type
      );

      if (existing) {
        const { error } = await supabase
          .from('binder_card_showcases')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
        setShowcaseRows((prev) => prev.filter((row) => row.id !== existing.id));
        return;
      }

      const currentRows = showcaseRows.filter((row) => row.showcase_type === type);

      if (currentRows.length >= 3) {
        Alert.alert(
          type === 'favorite' ? 'Showcase limit reached' : 'Chase card limit reached',
          type === 'favorite'
            ? 'You can only choose 3 showcase cards per set.'
            : 'You can only choose 3 chase cards per set.'
        );
        return;
      }

      const { data, error } = await supabase
        .from('binder_card_showcases')
        .insert({
          user_id: user.id,
          binder_id: binderId,
          card_id: item.card_id,
          set_id: item.set_id,
          showcase_type: type,
          sort_order: currentRows.length,
        })
        .select()
        .single();

      if (error) throw error;
      setShowcaseRows((prev) => [...prev, data as ShowcaseRow]);
    } catch (error: any) {
      console.log('Failed to update showcase', error);
      Alert.alert('Could not update showcase', error?.message ?? 'Something went wrong.');
    }
  };

  const reorderShowcase = async (type: ShowcaseType, orderedItems: BinderCardWithDetails[]) => {
    if (isReadOnly) return;

    const rowsForType = showcaseRows.filter((row) => row.showcase_type === type);

    const updatedRows = rowsForType.map((row) => {
      const nextIndex = orderedItems.findIndex(
        (item) => item.card_id === row.card_id && item.set_id === row.set_id
      );
      return { ...row, sort_order: nextIndex >= 0 ? nextIndex : row.sort_order };
    });

    setShowcaseRows((prev) => [
      ...prev.filter((row) => row.showcase_type !== type),
      ...updatedRows,
    ]);

    try {
      await Promise.all(
        updatedRows.map((row) =>
          supabase
            .from('binder_card_showcases')
            .update({ sort_order: row.sort_order })
            .eq('id', row.id)
        )
      );
    } catch (error) {
      console.log('Failed to reorder showcase', error);
      Alert.alert('Error', 'Could not save showcase order.');
      load();
    }
  };

  // ===============================
  // CARD ACTIONS
  // ===============================

  const openCardDetail = (item: BinderCardWithDetails) => {
    const latestCard = cards.find((c) => c.id === item.id) ?? item;
    setSelectedCard(latestCard);
    setDetailVisible(true);
    fetchModalEbayPrice(latestCard);
  };

  const applyCardOwnedChange = async (
    item: BinderCardWithDetails,
    newOwned: boolean,
    grading?: { company: string; grade: string }
  ) => {
    const nextQuantity = newOwned ? getOwnedQuantity(item) : 1;
    setCards((prev) =>
      prev.map((c) => (c.id === item.id ? {
        ...c,
        owned: newOwned,
        owned_quantity: nextQuantity,
        grade_company: grading?.company ?? c.grade_company ?? null,
        grade: grading?.grade ?? c.grade ?? null,
      } : c))
    );

    if (selectedCard?.id === item.id) {
      setSelectedCard({
        ...item,
        owned: newOwned,
        owned_quantity: nextQuantity,
        grade_company: grading?.company ?? item.grade_company ?? null,
        grade: grading?.grade ?? item.grade ?? null,
      });
    }

    try {
  const language = normalizePokemonCardLanguage(item.language ?? binder?.language);
  const latestPrice = await updateBinderCardOwned(item.id, newOwned, {
    cardName: getBinderCardDisplayName(item, item.card_id),
    cardNumber: item.card?.number ?? item.card_number ?? null,
    imageUrl: item.card?.images?.small ?? item.image_url ?? null,
    setName: item.card?.set?.name ?? item.set_name ?? null,
    language,
    slotOrder: item.slot_order,
    condition: item.condition,
    gradeCompany: grading?.company ?? item.grade_company ?? null,
    grade: grading?.grade ?? item.grade ?? null,
    ownedQuantity: nextQuantity,
  });

  if (userId) {
    const { data: userBinders } = await supabase
      .from('binders')
      .select('id')
      .eq('user_id', userId);
    const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);

    if (userBinderIds.length) {
      await supabase
        .from('binder_cards')
        .update({ owned: newOwned, owned_quantity: nextQuantity })
        .in('binder_id', userBinderIds)
        .eq('card_id', item.card_id)
        .eq('set_id', item.set_id)
        .eq('language', language);
    }
  }

  setCards((prev) =>
    prev.map((c) => (c.card_id === item.card_id && c.set_id === item.set_id && normalizePokemonCardLanguage(c.language ?? binder?.language) === language ? {
      ...c,
      owned: newOwned,
      owned_quantity: nextQuantity,
      grade_company: grading?.company ?? c.grade_company ?? null,
      grade: grading?.grade ?? c.grade ?? null,
      ebay_price: latestPrice?.ebay_price ?? c.ebay_price,
      tcg_price: latestPrice?.tcg_price ?? c.tcg_price,
      cardmarket_price: latestPrice?.cardmarket_price ?? c.cardmarket_price,
      last_price_update: latestPrice?.last_price_update ?? c.last_price_update,
    } : c))
  );
  if (selectedCard?.id === item.id) {
    setSelectedCard((prev) => prev ? {
      ...prev,
      owned: newOwned,
      owned_quantity: nextQuantity,
      grade_company: grading?.company ?? prev.grade_company ?? null,
      grade: grading?.grade ?? prev.grade ?? null,
      ebay_price: latestPrice?.ebay_price ?? prev.ebay_price,
      tcg_price: latestPrice?.tcg_price ?? prev.tcg_price,
      cardmarket_price: latestPrice?.cardmarket_price ?? prev.cardmarket_price,
      last_price_update: latestPrice?.last_price_update ?? prev.last_price_update,
    } : prev);
  }
} catch (error) {
  console.log('Rollback owned toggle', error);
  setCards((prev) =>
    prev.map((c) => (c.id === item.id ? { ...c, owned: !newOwned, owned_quantity: getOwnedQuantity(item) } : c))
  );
  Alert.alert('Error', 'Failed to update card.');
}
  };

  const confirmGradedCardAdd = async () => {
    if (!gradingCardToAdd) return;
    const card = gradingCardToAdd;
    const finalGrade = gradingPromptGrade.trim() || '10';
    setGradingPromptGrade(finalGrade);
    setGradingCardToAdd(null);
    await applyCardOwnedChange(card, true, {
      company: gradingPromptCompany,
      grade: finalGrade,
    });
  };

  const handleRemoveCustomBinderCard = async (item: BinderCardWithDetails) => {
    if (isReadOnly || binder?.type !== 'custom') return;

    Alert.alert(
      'Remove from binder?',
      `Remove ${getBinderCardDisplayName(item, 'this card')} from this custom binder?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const previousCards = cards;
            const previousShowcaseRows = showcaseRows;

            try {
              setCards((prev) => prev.filter((card) => card.id !== item.id));
              setShowcaseRows((prev) =>
                prev.filter((row) => !(row.card_id === item.card_id && row.set_id === item.set_id))
              );

              const { error } = await supabase
                .from('binder_cards')
                .delete()
                .eq('id', item.id)
                .eq('binder_id', binder.id);

              if (error) throw error;

              await supabase
                .from('binder_card_showcases')
                .delete()
                .eq('binder_id', binder.id)
                .eq('card_id', item.card_id)
                .eq('set_id', item.set_id);

              if (selectedCard?.id === item.id) {
                setDetailVisible(false);
                setSelectedCard(null);
              }

              showToast('Card removed from binder');
            } catch (error) {
              console.log('Failed to remove custom binder card', error);
              setCards(previousCards);
              setShowcaseRows(previousShowcaseRows);
              Alert.alert('Could not remove card', 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleCardLongPress = (item: BinderCardWithDetails) => {
    setQuickActionCard(item);
  };

  const handleSetVariantQuantity = useCallback(async (
    cardId: string,
    setId: string,
    variant: string,
    quantity: number
  ) => {
    if (!userId || isReadOnly) return;
    const key = getVariantKey(cardId, setId, variant);
    const cardKey = getVariantCardKey(cardId, setId);
    const nextQuantity = Math.max(0, Math.min(999, Math.floor(Number(quantity) || 0)));
    const previousQuantity = getVariantQuantityFromMap(ownedVariants, cardId, setId, variant);
    const targetCard = cards.find((card) => card.card_id === cardId && card.set_id === setId);
    const cardVariants = targetCard ? getVariants(targetCard.card, setId) : [variant];
    const nextCardOwned = cardVariants.some((candidateVariant) =>
      candidateVariant === variant
        ? nextQuantity > 0
        : getVariantQuantityFromMap(ownedVariants, cardId, setId, candidateVariant) > 0
    );

    setOwnedVariants((prev) => {
      const next = new Map(prev);
      if (nextQuantity > 0) next.set(key, nextQuantity);
      else next.delete(key);
      return next;
    });
    setVariantManagedCards((prev) => {
      const next = new Set(prev);
      next.add(cardKey);
      return next;
    });
    setCards((prev) =>
      prev.map((card) =>
        card.card_id === cardId && card.set_id === setId
          ? { ...card, owned: nextCardOwned, owned_quantity: nextCardOwned ? getOwnedQuantity(card) : 1 }
          : card
      )
    );
    setSelectedCard((prev) =>
      prev && prev.card_id === cardId && prev.set_id === setId
        ? { ...prev, owned: nextCardOwned, owned_quantity: nextCardOwned ? getOwnedQuantity(prev) : 1 }
        : prev
    );

    try {
      if (nextQuantity <= 0) {
        await supabase
          .from('user_card_variants')
          .delete()
          .eq('user_id', userId)
          .eq('card_id', cardId)
          .eq('set_id', setId)
          .eq('variant', variant);
      } else {
        await supabase
          .from('user_card_variants')
          .upsert({
            user_id: userId,
            card_id: cardId,
            set_id: setId,
            variant,
            quantity: nextQuantity,
          }, { onConflict: 'user_id,card_id,set_id,variant' });
      }

      const { data: userBinders } = await supabase
        .from('binders')
        .select('id')
        .eq('user_id', userId);
      const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);
      if (userBinderIds.length) {
        await supabase
          .from('binder_cards')
          .update({ owned: nextCardOwned })
          .in('binder_id', userBinderIds)
          .eq('card_id', cardId)
          .eq('set_id', setId);
      }

      const cardName = getBinderCardDisplayName(targetCard, cardId);
      if (previousQuantity > nextQuantity) {
        await createActivityPost({
          title: nextQuantity <= 0 ? 'Removed from collection' : `Quantity reduced from ${previousQuantity} to ${nextQuantity}`,
          subtitle: `${cardName}${variant !== 'card' ? ` · ${VARIANT_LABELS[variant] ?? variant}` : ''}`,
          cardId,
          setId,
          type: nextQuantity <= 0 ? 'binder_remove' : 'quantity_reduced',
          isPositive: false,
        });
      } else if (previousQuantity === 0 && nextQuantity > 0) {
        await createActivityPost({
          title: 'Added to collection',
          subtitle: `${cardName}${variant !== 'card' ? ` · ${VARIANT_LABELS[variant] ?? variant}` : ''}`,
          cardId,
          setId,
          type: 'binder_add',
          isPositive: true,
        });
      }
    } catch (error) {
      console.log('Failed to update variant quantity', error);
      Alert.alert('Error', 'Failed to update variant quantity.');
      load();
    }
  }, [cards, isReadOnly, load, ownedVariants, userId]);

  const handleToggleVariant = useCallback(async (cardId: string, setId: string, variant: string) => {
    const savedQuantity = getVariantQuantityFromMap(ownedVariants, cardId, setId, variant);
    const targetCard = cards.find((card) => card.card_id === cardId && card.set_id === setId);
    const cardVariants = targetCard ? getVariants(targetCard.card, setId) : [variant];
    const isManaged = variantManagedCards.has(getVariantCardKey(cardId, setId));
    const defaultVariant = targetCard && !isManaged && targetCard.owned
      ? getDefaultOwnedVariant(cardVariants)
      : null;
    const currentQuantity = savedQuantity > 0
      ? savedQuantity
      : defaultVariant === variant && targetCard
        ? getOwnedQuantity(targetCard)
        : 0;
    await handleSetVariantQuantity(cardId, setId, variant, currentQuantity > 0 ? 0 : 1);
  }, [cards, handleSetVariantQuantity, ownedVariants, variantManagedCards]);

  const handleCardTileTap = (item: BinderCardWithDetails, variant?: string) => {
    if (isReadOnly) {
      openCardDetail(item);
      return;
    }

    void Haptics.selectionAsync().catch(() => {});

    const variants = masterSetEnabled ? getVariants(item.card, item.set_id) : ['card'];
    if (variants.length > 1) {
      const targetVariant =
        variant ??
        variants.find((candidate) => getDisplayedVariantQuantity(item, candidate) > 0) ??
        variants[0];
      const currentQuantity = getDisplayedVariantQuantity(item, targetVariant);
      void handleSetVariantQuantity(
        item.card_id,
        item.set_id,
        targetVariant,
        currentQuantity > 0 ? 0 : 1
      );
      showToast(currentQuantity > 0 ? 'Marked variant as missing' : 'Marked variant as collected');
      return;
    }

    const displayedOwnedQuantity = getDisplayedOwnedQuantity(item);
    const isOwned = item.owned || displayedOwnedQuantity > 0;

    if (binder?.card_mode === 'graded' && !isOwned) {
      setGradingCardToAdd(item);
      return;
    }

    void applyCardOwnedChange(item, !isOwned);
    showToast(!isOwned ? 'Marked as collected' : 'Marked as missing');
  };

  const handleSetCondition = async (item: BinderCardWithDetails, condition: string) => {
    if (isReadOnly) return;

    setCards((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, condition } : c))
    );
    if (selectedCard?.id === item.id) {
      setSelectedCard({ ...item, condition });
    }

    try {
      await updateBinderCardCondition(item.id, condition);
    } catch (error) {
      console.log('Failed to update condition', error);
      Alert.alert('Error', 'Failed to update condition.');
      load();
    }
  };

  const handleSetOwnedQuantity = async (item: BinderCardWithDetails, quantity: number) => {
    if (isReadOnly) return;

    const nextQuantity = Math.max(1, Math.min(999, Math.floor(Number(quantity) || 1)));
    const updatedCard = { ...item, owned: true, owned_quantity: nextQuantity };

    setCards((prev) =>
      prev.map((c) => (
        c.card_id === item.card_id && c.set_id === item.set_id
          ? { ...c, owned: true, owned_quantity: nextQuantity }
          : c
      ))
    );
    if (selectedCard?.id === item.id) {
      setSelectedCard(updatedCard);
    }

    try {
      const language = normalizePokemonCardLanguage(item.language ?? binder?.language);
      await updateBinderCardQuantity(item.id, nextQuantity, {
        cardName: getBinderCardDisplayName(item, item.card_id),
        cardNumber: item.card?.number ?? item.card_number ?? null,
        imageUrl: item.card?.images?.small ?? item.image_url ?? null,
        setName: item.card?.set?.name ?? item.set_name ?? null,
        language,
        slotOrder: item.slot_order,
        condition: item.condition,
        gradeCompany: item.grade_company ?? null,
        grade: item.grade ?? null,
      });

      if (userId) {
        const { data: userBinders } = await supabase
          .from('binders')
          .select('id')
          .eq('user_id', userId);
        const userBinderIds = (userBinders ?? []).map((row) => row.id).filter(Boolean);

        if (userBinderIds.length) {
          await supabase
            .from('binder_cards')
            .update({ owned: true, owned_quantity: nextQuantity })
            .in('binder_id', userBinderIds)
            .eq('card_id', item.card_id)
            .eq('set_id', item.set_id)
            .eq('language', language);
        }
      }
    } catch (error) {
      console.log('Failed to update owned quantity', error);
      Alert.alert('Error', 'Failed to update quantity owned.');
      load();
    }
  };

  const handleSetGrading = async (
    item: BinderCardWithDetails,
    updates: { company?: string; grade?: string }
  ) => {
    if (isReadOnly) return;

    const nextCompany = updates.company ?? item.grade_company ?? 'PSA';
    const nextGrade = updates.grade ?? item.grade ?? '10';
    const updatedCard = { ...item, grade_company: nextCompany, grade: nextGrade };

    setCards((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, grade_company: nextCompany, grade: nextGrade } : c))
    );
    if (selectedCard?.id === item.id) {
      setSelectedCard(updatedCard);
    }

    try {
      await updateBinderCardGrading(item.id, nextCompany, nextGrade);
      fetchModalEbayPrice(updatedCard);
    } catch (error) {
      console.log('Failed to update grading', error);
      Alert.alert('Error', 'Failed to update grading details.');
      load();
    }
  };

  const commitDetailGradeText = (item: BinderCardWithDetails | null = selectedCard) => {
    const nextGrade = detailGradeText.trim() || '10';
    setDetailGradeText(nextGrade);
    if (!item || nextGrade === (item.grade ?? '10')) return;
    void handleSetGrading(item, { grade: nextGrade });
  };

  // ===============================
  // SEARCH (custom binder)
  // ===============================

  const searchCardsToAdd = async (query: string) => {
    const safeQuery = query.trim();
    if (safeQuery.length < 2) {
      addSearchRequestRef.current += 1;
      setAddSearchLoading(false);
      setAddSearchResults([]);
      return;
    }

    const requestId = ++addSearchRequestRef.current;

    try {
      setAddSearchLoading(true);
      const language = inferBinderLanguage(binder?.language, binder?.source_set_id);
      const searchLanguage = binder?.type === 'official' ? language : 'all';

      const data = await searchLocalPokemonCards<any>(safeQuery, {
        language: searchLanguage,
        limit: 150,
        select: 'id, name, language, number, set_id, image_small, image_large, rarity, raw_data',
      });

      if (requestId !== addSearchRequestRef.current) return;

      const mapped = (data ?? []).map((card: any) => {
        const raw = card.raw_data ?? {};
        const normalizedLanguage = normalizePokemonCardLanguage(card.language ?? raw.language ?? language);
        const providerCardId = raw.source_id ?? raw.provider_card_id ?? raw.id ?? card.id ?? null;
        const collectorNumber = cleanPreviewText(card.number ?? raw.localId ?? raw.number);
        const localName = getLocalCardName({
          id: card.id,
          sourceId: providerCardId,
          setId: card.set_id ?? raw.set?.id ?? null,
          collectorNumber,
          language: normalizedLanguage,
          region: raw.region ?? null,
          localName: raw.local_name ?? (normalizedLanguage !== 'en' ? raw.name ?? card.name ?? null : null),
          englishDisplayName: raw.english_display_name ?? raw.englishDisplayName ?? null,
          canonicalName: raw.canonical_name ?? null,
          fallbackName: card.name ?? providerCardId,
          raw,
        });
        const englishName = getEnglishCardDisplayName({
          id: card.id,
          sourceId: providerCardId,
          setId: card.set_id ?? raw.set?.id ?? null,
          collectorNumber,
          language: normalizedLanguage,
          region: raw.region ?? null,
          localName,
          englishDisplayName: raw.english_display_name ?? raw.englishDisplayName ?? null,
          canonicalName: raw.canonical_name ?? null,
          fallbackName: card.name ?? providerCardId,
          raw,
        });
        const setDisplayName = getPreferredSetDisplayName({
          id: card.set_id ?? raw.set?.id ?? null,
          sourceId: raw.set?.tcgdex_id ?? raw.set?.source_id ?? raw.source_id ?? card.set_id ?? null,
          setCode: raw.set?.set_code ?? raw.set?.tcgdex_id ?? raw.set_code ?? card.set_id ?? null,
          language: normalizedLanguage,
          region: raw.region ?? raw.set?.region ?? null,
          localName: raw.set?.local_name ?? raw.set?.name ?? null,
          englishDisplayName: raw.set?.english_display_name ?? raw.set?.englishDisplayName ?? null,
          canonicalName: raw.set?.name ?? null,
          fallbackName: card.set_id ?? null,
          raw: raw.set ?? raw,
        });
        const localSetName = cleanPreviewText(raw.set?.local_name ?? (normalizedLanguage !== 'en' ? raw.set?.name : null));
        const englishSetName = cleanPreviewText(raw.set?.english_display_name ?? raw.set?.englishDisplayName)
          ?? (setDisplayName && !containsCjkText(setDisplayName) ? setDisplayName : null);

        return {
          card_id: card.id,
          set_id: card.set_id ?? null,
          language: normalizedLanguage,
          name: cleanPreviewText(englishName ?? localName ?? card.name) ?? card.id,
          local_name: localName,
          english_name: englishName,
          set_name: setDisplayName ?? englishSetName ?? localSetName ?? card.set_id,
          local_set_name: localSetName,
          english_set_name: englishSetName,
          number: collectorNumber,
          image_url: card.image_small ?? card.image_large ?? null,
          rarity: card.rarity ?? raw.rarity ?? null,
          card_type: raw.supertype ?? null,
          value: getSearchCardValue(card),
          finish_keys: getSearchCardFinishKeys(card),
          raw_data: raw,
        };
      });

      setAddSearchResults(mapped.filter((card) => matchesAddCardFilters(card, addFilters)));
    } catch (error) {
      if (requestId !== addSearchRequestRef.current) return;
      console.log('Supabase search failed', error);
      setAddSearchResults([]);
    } finally {
      if (requestId === addSearchRequestRef.current) setAddSearchLoading(false);
    }
  };

  const handleAddCardToCustomBinder = async (
    card: CardPreviewResult,
    options: { closeAfterAdd?: boolean } = {}
  ) => {
    if (!binderId) return;

    const closeAfterAdd = options.closeAfterAdd ?? true;
    const derivedSetId = getPreviewSetId(card);
    const language = normalizePokemonCardLanguage(card.language ?? binder?.language);

    if (!derivedSetId) {
      Alert.alert('Missing set', 'Could not work out the set for this card.');
      return;
    }

    try {
      const finalAddGrade = addGrade.trim() || '10';
      if (binder?.card_mode === 'graded') setAddGrade(finalAddGrade);
      setAddingCardId(card.card_id);
      await addCardsToBinder(binderId, [{
        cardId: card.card_id,
        setId: derivedSetId,
        language,
        cardName: getPreviewCardDisplayName(card, card.card_id),
        imageUrl: card.image_url ?? null,
        setName: card.set_name ?? null,
        gradeCompany: binder?.card_mode === 'graded' ? addGradeCompany : null,
        grade: binder?.card_mode === 'graded' ? finalAddGrade : null,
      }]);
      setAddFiltersVisible(false);
      setPendingAddIds((prev) => {
        const next = { ...prev };
        delete next[card.card_id];
        return next;
      });
      if (closeAfterAdd) {
        setShowAddModal(false);
        setAddSearch('');
        setAddSearchResults([]);
        setPendingAddIds({});
      }
      await load();
      const displayCardName = getPreviewCardDisplayName(card, card.name);
      const message = `${displayCardName} added${binder?.card_mode === 'graded' ? ` as ${addGradeCompany} ${finalAddGrade}` : ' to binder'}.`;
      if (closeAfterAdd) {
        Alert.alert('Added', message);
      } else {
        showToast(message);
      }
    } catch (error: any) {
      Alert.alert('Could not add card', error?.message ?? 'Something went wrong.');
    } finally {
      setAddingCardId(null);
    }
  };

  const handleAddMultipleToCustomBinder = async () => {
  if (!binderId || pendingAddCount === 0) return;

  const cardsToAdd = Object.values(pendingAddIds);

  if (binder?.card_mode === 'graded' && cardsToAdd.length === 1) {
    await handleAddCardToCustomBinder(cardsToAdd[0]);
    return;
  }

  if (binder?.card_mode === 'graded') {
    Alert.alert('Choose one slab', 'Graded binders add one card at a time so you can choose the grading company and grade.');
    return;
  }

  try {
    setAddingCardId('bulk');

    const validCards = cardsToAdd
  .map((card) => ({
    cardId: card.card_id,
    setId: getPreviewSetId(card),
    language: card.language ?? binder?.language ?? 'en',
    cardName: getPreviewCardDisplayName(card, card.card_id),
    imageUrl: card.image_url ?? null,
    setName: card.set_name ?? null,
  }))
  .filter((c) => c.setId);

    await addCardsToBinder(binderId, validCards);
    setPendingAddIds({});
    setAddSearch('');
    setAddSearchResults([]);
    setShowAddModal(false);
    setAddFiltersVisible(false);
    await load();
    showToast(`${validCards.length} card${validCards.length !== 1 ? 's' : ''} added to binder.`);
  } catch (error: any) {
    Alert.alert('Could not add cards', error?.message ?? 'Something went wrong.');
  } finally {
    setAddingCardId(null);
  }
};

  // ===============================
  // SCAN
  // ===============================

  const handleScanCard = async () => {
    if (!binder?.id) return;
    router.push({ pathname: '/scan', params: { binderId: binder.id } });
  };

  // ===============================
  // GESTURE HANDLERS
  // ===============================

  const modalPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) modalTranslateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 140 || gesture.vy > 1.2) {
          closeDetailModal();
        } else {
          Animated.spring(modalTranslateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  const onPinchHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= event.nativeEvent.scale;
      lastScale.current = Math.max(1, Math.min(lastScale.current, 3));
      baseScale.setValue(lastScale.current);
      pinchScale.setValue(1);
    }
  };

  // ===============================
  // RENDER HELPERS
  // ===============================

  const renderToploaderCard = ({
    item,
    drag,
    isActive,
  }: RenderItemParams<BinderCardWithDetails>) => {
    const imageUri = item.card?.images?.small ?? item.card?.images?.large ?? null;
    const imageEditionHint = getBinderEditionHint(binder?.edition);
    const isGradedBinder = binder?.card_mode === 'graded';
    const ownedQuantity = getOwnedQuantity(item);

    return (
      <TouchableOpacity
        onPress={() => openCardDetail(item)}
        onLongPress={() => handleCardLongPress(item)}
        activeOpacity={0.9}
        style={{ width: 120, marginRight: 14, opacity: isActive ? 0.75 : 1 }}
      >
        <View style={{
          padding: 5,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: item.owned ? theme.colors.secondary : theme.colors.border,
          backgroundColor: theme.colors.card,
          ...cardShadow,
        }}>
          {isGradedBinder ? (
            <View style={{ width: '100%', aspectRatio: 0.68 }}>
              <GradedSlabCard
                item={item}
                imageUri={imageUri}
                editionHint={imageEditionHint}
                size="showcase"
                opacity={item.owned ? 1 : 0.35}
              />
            </View>
          ) : imageUri ? (
            <StackrImage
              uri={imageUri}
              style={{
                width: '100%',
                aspectRatio: stackrCardImageSizes.cardAspectRatio,
                borderRadius: 7,
                opacity: item.owned ? 1 : 0.35,
              }}
              contentFit="cover"
              priority="low"
              showFallbackIcon={false}
            />
          ) : (
            <View style={{
              width: '100%',
              aspectRatio: stackrCardImageSizes.cardAspectRatio,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
            }}>
              <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
            </View>
          )}

          {!isGradedBinder && (
            <View style={{
            position: 'absolute',
            left: 7, right: 7, top: 7, bottom: 7,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.7)',
          }} />
          )}

          {item.owned && ownedQuantity > 1 && (
            <View style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              minWidth: 28,
              height: 24,
              borderRadius: 12,
              paddingHorizontal: 7,
              backgroundColor: theme.colors.primary,
              borderWidth: 2,
              borderColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                x{ownedQuantity}
              </Text>
            </View>
          )}

          {!isReadOnly && (
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                if (item.owned) {
                  void handleSetOwnedQuantity(item, ownedQuantity + 1);
                  return;
                }
                void applyCardOwnedChange(item, true);
              }}
              activeOpacity={0.82}
              style={{
                position: 'absolute',
                right: 8,
                top: 8,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: theme.colors.primary,
                borderWidth: 2,
                borderColor: theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        <Text numberOfLines={1} style={{
          color: theme.colors.text,
          fontSize: 11,
          fontWeight: '900',
          textAlign: 'center',
          marginTop: 7,
        }}>
          {getBinderCardDisplayName(item, item.card_id)}
        </Text>

        {!isReadOnly && (
          <Text numberOfLines={1} style={{
            color: theme.colors.textSoft,
            fontSize: 9,
            textAlign: 'center',
            marginTop: 2,
          }}>
            Hold for actions
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderShowcaseStrip = (type: ShowcaseType, title: string) => {
  const data = getShowcaseItems(type);
  if (!data.length) return null;

  const collapsed = showcaseCollapsed[type];
  const isChase = type === 'chase';
  const accent = theme.colors.primary;
  const panelStyle = isChase
    ? {
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 18,
        padding: 12,
        overflow: 'hidden' as const,
        ...cardShadow,
      }
    : {};

  return (
    <View style={{ marginBottom: 18, zIndex: 0, ...panelStyle }}>
      <TouchableOpacity
        onPress={() =>
          setShowcaseCollapsed((prev) => ({ ...prev, [type]: !prev[type] }))
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: collapsed ? 0 : 10,
          minHeight: 44,
        }}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {isChase && (
            <View style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              backgroundColor: theme.colors.primary + '12',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Image source={stackrIcons.chase} style={{ width: 28, height: 28 }} resizeMode="contain" />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            color: theme.colors.text,
            fontSize: isChase ? 17 : 18,
            fontWeight: '900',
          }} numberOfLines={1}>
            {isChase ? 'Chase List' : title}
          </Text>
          {isChase ? (
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 17, fontWeight: '700' }} numberOfLines={1}>
              {data.length} card{data.length === 1 ? '' : 's'} you are hunting
            </Text>
          ) : null}
          </View>
        </View>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}>
          <Text style={{
            color: accent,
            fontSize: 12,
            fontWeight: '900',
          }}>
            {data.length} card{data.length !== 1 ? 's' : ''}
          </Text>
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-down'}
            size={18}
            color={accent}
          />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <DraggableFlatList
          data={data}
          horizontal
          keyExtractor={(item) => `${type}-${item.set_id}-${item.card_id}`}
          renderItem={renderToploaderCard}
          onDragEnd={({ data: newData }) => !isReadOnly && reorderShowcase(type, newData)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={isChase ? { paddingTop: 4, paddingBottom: 2, paddingRight: 10 } : undefined}
        />
      )}
    </View>
  );
};

  const renderCard = ({ item }: { item: BinderCardWithDetails }) => {
    const imageUri = item.card?.images?.small ?? item.card?.images?.large ?? null;
    const imageEditionHint = getBinderEditionHint(binder?.edition);
    const cardName = getBinderCardDisplayName(item, item.card_id);
    const forTrade = isForTrade(item.card_id, item.set_id);
    const isGradedBinder = binder?.card_mode === 'graded';

    const variants = masterSetEnabled ? getVariants(item.card, item.set_id) : ['card'];
    const multiVariant = variants.length > 1;
    const anyVariantOwned = variants.some((v) => getDisplayedVariantQuantity(item, v) > 0);
    const displayedOwnedQuantity = getDisplayedOwnedQuantity(item);
    const isOwned = multiVariant ? anyVariantOwned || displayedOwnedQuantity > 0 : item.owned;
    const handleQuickAddCopy = () => {
      if (isReadOnly) return;
      if (multiVariant) {
        const ownedVariant = variants.find((variant) => getDisplayedVariantQuantity(item, variant) > 0);
        const targetVariant = ownedVariant ?? variants[0];
        const currentQuantity = getDisplayedVariantQuantity(item, targetVariant);
        void handleSetVariantQuantity(item.card_id, item.set_id, targetVariant, currentQuantity + 1);
        showToast(`${VARIANT_LABELS[targetVariant] ?? targetVariant} quantity increased`);
        return;
      }
      if (isOwned) {
        void handleSetOwnedQuantity(item, Math.max(1, displayedOwnedQuantity) + 1);
        showToast('Copy added');
        return;
      }
      void applyCardOwnedChange(item, true);
      showToast('Marked as collected');
    };

    const handleQuickRemoveCopy = () => {
      if (isReadOnly || !isOwned) return;
      if (multiVariant) {
        const ownedVariant = variants.find((variant) => getDisplayedVariantQuantity(item, variant) > 1);
        if (!ownedVariant) return;
        const currentQuantity = getDisplayedVariantQuantity(item, ownedVariant);
        void handleSetVariantQuantity(item.card_id, item.set_id, ownedVariant, currentQuantity - 1);
        showToast(`${VARIANT_LABELS[ownedVariant] ?? ownedVariant} quantity reduced`);
        return;
      }
      if (displayedOwnedQuantity <= 1) return;
      void handleSetOwnedQuantity(item, displayedOwnedQuantity - 1);
      showToast('Copy removed');
    };

    return (
      <TouchableOpacity
        onPress={() => handleCardTileTap(item)}
        onLongPress={() => openCardDetail(item)}
        delayLongPress={300}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${cardName}. Tap to mark collected or missing. Hold for details.`}
        style={{
          width: cardWidth,
          marginBottom: 8,
          borderRadius: 14,
          padding: 6,
          borderWidth: isOwned ? 1.5 : 1,
          borderColor: isOwned ? theme.colors.primary + '70' : theme.colors.border,
          backgroundColor: isOwned ? theme.colors.primary + '08' : theme.colors.card,
          shadowColor: isOwned ? theme.colors.primary : '#000',
          shadowOpacity: isOwned ? 0.13 : cardShadow.shadowOpacity,
          shadowRadius: isOwned ? 10 : cardShadow.shadowRadius,
          shadowOffset: isOwned ? { width: 0, height: 5 } : cardShadow.shadowOffset,
          elevation: isOwned ? 4 : cardShadow.elevation,
        }}
      >
        <View style={{
          width: '100%',
          aspectRatio: isGradedBinder ? 0.68 : stackrCardImageSizes.cardAspectRatio,
          borderRadius: 10,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: multiVariant ? 1 : isOwned ? 1 : 0.62,
        }}>
          {isGradedBinder ? (
            <GradedSlabCard
              item={item}
              imageUri={imageUri}
              editionHint={imageEditionHint}
              size="grid"
            />
          ) : imageUri ? (
            <EditionAwareCardImage
              uri={imageUri}
              cardId={item.card_id}
              rawData={item.card}
              editionHint={imageEditionHint}
              sourceSize="small"
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          ) : (
            <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
          )}

          {multiVariant && (
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
              {variants.map((variant, i) => {
                const variantQuantity = getDisplayedVariantQuantity(item, variant);
                const owned = variantQuantity > 0;
                return (
                  <Pressable
                    key={variant}
                    onPress={() => handleCardTileTap(item, variant)}
                    onLongPress={() => openCardDetail(item)}
                    delayLongPress={400}
                    accessibilityRole="button"
                    accessibilityLabel={`${cardName} ${variant}. Tap to toggle this variant. Hold for details.`}
                    style={({ pressed }) => ({
                      flex: 1,
                      opacity: owned ? 1 : 0.62,
                      backgroundColor: pressed
                        ? 'rgba(108,75,255,0.25)'
                        : owned
                          ? 'transparent'
                          : 'rgba(255,255,255,0.46)',
                      borderLeftWidth: i > 0 ? 1 : 0,
                      borderColor: 'rgba(255,255,255,0.3)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <View style={{
                      position: 'absolute',
                      bottom: 5,
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: owned ? theme.colors.primary : theme.colors.card,
                      borderWidth: 2,
                      borderColor: theme.colors.card,
                    }}>
                      {owned && variantQuantity > 1 ? (
                        <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                          x{variantQuantity}
                        </Text>
                      ) : owned ? (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      ) : (
                        <MasterVariantIcon variant={variant} size="tiny" active={false} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {!isReadOnly && (
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                handleQuickAddCopy();
              }}
              activeOpacity={0.82}
              style={{
              position: 'absolute',
              right: 7,
              top: 7,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.90)',
              borderWidth: 1,
              borderColor: theme.colors.primary + '45',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            >
              <Ionicons name="add" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          )}

          {!isReadOnly && (
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                handleCardLongPress(item);
              }}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`${cardName} quick actions`}
              style={{
                position: 'absolute',
                right: 7,
                bottom: 7,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.90)',
                borderWidth: 1,
                borderColor: theme.colors.primary + '35',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          )}

          {isOwned && (
            <View style={{
              position: 'absolute',
              left: 7,
              top: 7,
              minWidth: displayedOwnedQuantity > 1 ? 30 : 26,
              height: 26,
              borderRadius: 13,
              paddingHorizontal: displayedOwnedQuantity > 1 ? 7 : 0,
              backgroundColor: theme.colors.primary,
              borderWidth: 2,
              borderColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {displayedOwnedQuantity > 1 ? (
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                  x{displayedOwnedQuantity}
                </Text>
              ) : (
                <Ionicons name="checkmark" size={15} color="#FFFFFF" />
              )}
            </View>
          )}

          {!isReadOnly && isOwned && displayedOwnedQuantity > 1 && !multiVariant && (
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                handleQuickRemoveCopy();
              }}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`Remove one copy of ${cardName}`}
              style={{
                position: 'absolute',
                left: 7,
                bottom: 7,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.90)',
                borderWidth: 1,
                borderColor: theme.colors.primary + '35',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="remove" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <Text numberOfLines={2} style={{
          color: theme.colors.text,
          fontSize: 11,
          fontWeight: '900',
          marginTop: 6,
          minHeight: 28,
          opacity: multiVariant ? anyVariantOwned ? 1 : 0.68 : isOwned ? 1 : 0.68,
        }}>
          {cardName}
        </Text>

        {item.owned && binder?.card_mode === 'graded' && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={{
            color: '#3730A3',
            fontSize: 9,
            fontWeight: '900',
            marginTop: 2,
          }}>
            {[formatSlabCompanyLabel(item.grade_company ?? 'PSA'), item.grade ?? '10'].filter(Boolean).join(' ')}
          </Text>
        )}

        {item.owned && binder?.card_mode !== 'graded' && item.condition && item.condition !== 'Near Mint' && (
          <Text style={{
            color: theme.colors.textSoft,
            fontSize: 9,
            fontWeight: '700',
            marginTop: 2,
          }}>
            {item.condition}
          </Text>
        )}

        {!isReadOnly && forTrade && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 5 }}>
            <Text style={{ color: '#16A34A', fontSize: 10, fontWeight: '900' }}>Trade</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ===============================
  // LOADING / NOT FOUND
  // ===============================

  useEffect(() => {
    let mounted = true;

    const loadModalTcgFallback = async () => {
      if (!selectedCard) {
        setModalTcgFallbackPrice(null);
        return;
      }

      const prices = selectedCard.card?.tcgplayer?.prices;
      if (prices && Object.keys(prices).length > 0) {
        setModalTcgFallbackPrice(null);
        return;
      }

      const setName = (selectedCard.card?.set?.name ?? selectedCard.set_name ?? '').trim();
      const cardName = getBinderCardDisplayName(selectedCard, '').trim();
      const cardNumberRaw = (selectedCard.card?.number ?? selectedCard.card_number ?? '').trim();

      if (!setName || !cardName) {
        setModalTcgFallbackPrice(null);
        return;
      }

      try {
        const rows = await fetchTcgcsvUiCardPricesForSet(setName);
        if (!mounted) return;

        const normalizeNumber = (value: string) =>
          value.trim().replace(/^#/, '').replace(/\s+/g, '').toLowerCase();

        const normalizeName = (value: string) =>
          value
            .toLowerCase()
            .replace(/\bex\b/g, ' ex ')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

        const parseCollectorNumber = (value: string): string => {
          const normalized = normalizeNumber(value);
          if (!normalized) return '';
          const left = normalized.split('/')[0] ?? normalized;
          return left.replace(/^0+/, '') || '0';
        };

        const cardNumberNormalized = normalizeNumber(cardNumberRaw);
        const cardCollector = parseCollectorNumber(cardNumberRaw);
        const cardNameNormalized = normalizeName(cardName);

        const matched =
          rows.find((row) => normalizeNumber(row.number ?? '') === cardNumberNormalized) ??
          rows.find((row) => parseCollectorNumber(row.number ?? '') === cardCollector && cardCollector !== '') ??
          rows.find((row) => normalizeName(row.name).includes(cardNameNormalized) && cardNameNormalized.length > 2) ??
          rows.find((row) => row.name.trim().toLowerCase() === cardName.toLowerCase()) ??
          null;

        if (!matched) {
          setModalTcgFallbackPrice(null);
          return;
        }

        const values = matched.variants
          .flatMap((v) => [v.lowPrice, v.midPrice, v.marketPrice])
          .filter((v): v is number => typeof v === 'number');

        const lowUsd = values.length ? Math.min(...values) : null;
        const midValues = matched.variants
          .map((v) => v.midPrice)
          .filter((v): v is number => typeof v === 'number');
        const marketValues = matched.variants
          .map((v) => v.marketPrice)
          .filter((v): v is number => typeof v === 'number');

        const avg = (arr: number[]) =>
          arr.length ? arr.reduce((sum, n) => sum + n, 0) / arr.length : null;
        const toGbp = (v: number | null) =>
          typeof v === 'number' ? Math.round(v * USD_TO_GBP * 100) / 100 : null;

        setModalTcgFallbackPrice({
          low: toGbp(lowUsd),
          mid: toGbp(avg(midValues)),
          market: toGbp(avg(marketValues)),
        });
      } catch {
        if (mounted) setModalTcgFallbackPrice(null);
      }
    };

    loadModalTcgFallback();

    return () => {
      mounted = false;
    };
  }, [selectedCard]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>Loading binder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!binder) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
            Binder not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const modalCard = selectedCard?.card;

  const boxStyle = {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  };

  const boxTitleStyle = {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900' as const,
    marginBottom: 10,
  };
  const showsCompletion = binder.type === 'official';
  const totalNeedsSync = showsCompletion && !totalKnown;
  const missingCount = showsCompletion && totalKnown ? Math.max(0, totalCount - ownedCount) : 0;
  const duplicateCount = cards.reduce((sum, card) => sum + Math.max(0, getDisplayedOwnedQuantity(card) - 1), 0);
  const chaseCount = getShowcaseItems('chase').length;
  const officialSetDisplayName = showsCompletion
    ? binder.source_set_display_name
      ?? getPreferredSetDisplayName({
        id: binder.source_set_id ?? binder.cover_key ?? binder.name,
        sourceId: binder.source_set_id ?? binder.cover_key ?? binder.name,
        setCode: binder.source_set_id ?? binder.cover_key ?? binder.name,
        language: binder.language,
        localName: binder.source_set_local_name ?? binder.name,
        englishDisplayName: binder.source_set_english_display_name ?? null,
        fallbackName: binder.name,
      })
    : null;
  const binderTitle = showsCompletion ? officialSetDisplayName ?? binder.name : binder.name;
  const binderModeLabel = binder.card_mode === 'graded' ? 'Graded binder' : masterSetEnabled ? 'Master set' : binder.type === 'official' ? 'Official set' : 'Custom binder';
  const customNameArt = binder.type === 'custom' ? getCustomBinderNameArt(customNameArtKey) : null;
  const officialSetLogoSource = binder.type === 'official'
    ? getJapaneseSetLogoSourceForSet({
      id: binder.source_set_id ?? binder.cover_key,
      language: binder.language,
      name: officialSetDisplayName ?? binder.name,
      localName: binder.source_set_local_name,
      englishDisplayName: binder.source_set_english_display_name,
    })
    : null;
  const officialSetLogoUrl = binder.type === 'official' && !officialSetLogoSource
    ? binder.source_set_logo_url ?? binder.source_set_symbol_url ?? getPokemonSetLogoUrl(binder.source_set_id ?? binder.cover_key, binder.language)
    : undefined;
  const officialSetArtworkUrl = binder.type === 'official'
    ? officialSetLogoUrl
    : undefined;
  const ownedCardLabel = `${ownedCount} card${ownedCount === 1 ? '' : 's'} owned`;
  const completionLabel = showsCompletion && totalKnown ? `${ownedCount}/${totalCount}` : ownedCardLabel;
  const completionMeta = showsCompletion
    ? totalKnown
      ? `${binderModeLabel} - ${completionLabel} tracked slots`
      : `${binderModeLabel} - total unknown, needs sync`
    : `${binderModeLabel} - ${ownedCardLabel}`;
  const heroCountLabel = showsCompletion
    ? totalNeedsSync
      ? 'Total unknown'
      : `${missingCount} card${missingCount === 1 ? '' : 's'} left`
    : ownedCardLabel;
  const heroStatusLabel = showsCompletion
    ? totalNeedsSync
      ? 'Needs sync'
      : `${progressPercent}% complete`
    : binderModeLabel;
  const heroHelperText = showsCompletion
    ? totalNeedsSync
      ? 'Sync catalogue totals to calculate completion.'
      : missingCount > 0
      ? `${missingCount} card${missingCount === 1 ? '' : 's'} to complete`
      : 'Complete - this binder is fully tracked'
    : 'No set target - keep adding cards to this binder.';
  const switchTrackColor = {
    false: theme.dark ? '#2A2E42' : '#E5E1F4',
    true: theme.colors.primary + '66',
  };
  const getSwitchThumbColor = (active: boolean) =>
    active ? theme.colors.primary : theme.dark ? '#CBD5E1' : '#FFFFFF';
  const quickActionCardTitle = quickActionCard ? getBinderCardDisplayName(quickActionCard, 'Card options') : 'Card options';
  const quickActionSheetActions: StackrQuickAction[] = quickActionCard ? [
    {
      label: 'Details',
      subtitle: 'Open card details and market value.',
      icon: 'information-circle-outline',
      onPress: () => openCardDetail(quickActionCard),
    },
    ...(!isReadOnly ? [
      {
        label: isShowcased(quickActionCard, 'chase') ? 'Remove from Chase' : 'Add to Chase',
        subtitle: isShowcased(quickActionCard, 'chase')
          ? 'Take this card out of your chase list.'
          : 'Keep this card in your chase list.',
        imageIcon: stackrIcons.chase,
        onPress: () => void toggleShowcase(quickActionCard, 'chase'),
      },
      ...(binder?.type === 'custom' ? [
        {
          label: 'Remove from binder',
          subtitle: 'Remove this card from the custom binder.',
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () => handleRemoveCustomBinderCard(quickActionCard),
        },
      ] : []),
    ] : []),
  ] : [];

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <StackrBackdrop />
      <FlatList
        ref={binderListRef}
        data={visibleCards}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
        {...stackrListPerformance.cardGrid(numColumns)}
        onEndReached={hasMoreCardsToRender ? renderMoreCards : undefined}
        onEndReachedThreshold={0.85}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + stackrTabContentPadding.standard,
        }}
        ListHeaderComponent={
          <View>
            <View style={{ height: 32, justifyContent: 'center', marginBottom: 2 }}>
              <StackrBackButton onPress={goBackToBinderLibrary} style={{ width: 34, height: 32 }} />
            </View>

        {/* Header */}
        <View style={{ gap: 8, marginBottom: 10 }}>
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 8,
            overflow: 'hidden',
            shadowColor: '#6136F5',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 5 },
            elevation: 3,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 62,
                minHeight: 70,
                borderRadius: 15,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'visible',
              }}>
                <BinderArtwork
                  coverKey={binder.cover_key}
                  sourceSetId={showsCompletion ? binder.source_set_id : null}
                  sourceSetLanguage={showsCompletion ? binder.language : null}
                  setName={showsCompletion ? binderTitle : null}
                  fallbackLogoUrl={officialSetArtworkUrl}
                  fallbackLogoSource={officialSetLogoSource}
                  fallbackArtSource={customNameArt?.source ?? null}
                  fallbackColor={binder.color}
                  progress={showsCompletion ? progressPercent : 0}
                  width={60}
                  stageHeight={66}
                  artworkWidth={47}
                  artworkHeight={53}
                  progressWidth={42}
                  progressHeight={4}
                  showProgressBar={showsCompletion}
                  showProgressText={false}
                  showFan
                />
              </View>

              <View style={{ flex: 1, minWidth: 0, paddingRight: binder.card_mode === 'graded' ? 42 : 0, position: 'relative' }}>
                {binder.card_mode === 'graded' ? (
                  <View pointerEvents="none" style={{ position: 'absolute', top: -1, right: 0 }}>
                    <BinderModeIconBadge type="graded" size={36} />
                  </View>
                ) : null}

                {(officialSetLogoSource || officialSetLogoUrl) && !setLogoFailed ? (
                  <StackrImage
                    source={officialSetLogoSource}
                    uri={officialSetLogoSource ? null : officialSetLogoUrl}
                    onError={() => setSetLogoFailed(true)}
                    contentFit="contain"
                    priority="high"
                    showFallbackIcon={false}
                    style={{ width: '100%', height: 64, marginBottom: 1, alignSelf: 'flex-start', backgroundColor: 'transparent' }}
                  />
                ) : customNameArt ? (
                  <Image
                    source={customNameArt.source}
                    resizeMode="contain"
                    style={{ width: '100%', height: 32, marginBottom: 1, alignSelf: 'flex-start' }}
                  />
                ) : (
                  <Text style={{ color: theme.colors.text, fontSize: 19, lineHeight: 23, fontWeight: '900' }} numberOfLines={2}>
                    {binderTitle}
                  </Text>
                )}

                {customNameArt ? (
                  <Text style={{ color: theme.colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900', marginTop: 1 }} numberOfLines={1}>
                    {binderTitle}
                  </Text>
                ) : null}

                <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 13, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                  {completionMeta}
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                  {binder.type === 'official' && masterSetEnabled && binder.card_mode !== 'graded' ? <BinderModePill type="master" /> : null}
                  {binder.edition ? (
                    <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: theme.colors.secondary + '18', borderWidth: 1, borderColor: theme.colors.secondary + '35' }}>
                      <Text style={{ color: theme.colors.text, fontSize: 10, fontWeight: '900' }}>
                        {binder.edition === '1st_edition' ? '1st Edition' : 'Unlimited'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={{
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 6,
              paddingHorizontal: 4,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 10.5, lineHeight: 13, fontWeight: '800' }} numberOfLines={1}>
                {heroCountLabel}
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 13, fontWeight: '800' }}>|</Text>
              <Text style={{ color: theme.colors.text, fontSize: 10.5, lineHeight: 13, fontWeight: '800' }} numberOfLines={1}>
                {formatCurrency(binderValue)} est. value
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 13, fontWeight: '800' }}>|</Text>
              <Text style={{ color: theme.colors.primary, fontSize: 10.5, lineHeight: 13, fontWeight: '900' }} numberOfLines={1}>
                {heroStatusLabel}
              </Text>
            </View>

            <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 14, fontWeight: '700', marginTop: 2, textAlign: 'center' }} numberOfLines={1}>
              {heroHelperText}
            </Text>

            {!isReadOnly ? (
              <View style={{ gap: 7, marginTop: 8 }}>
                {binder.card_mode === 'graded' ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
                    <StackrActionButton
                      title="Scan to Binder"
                      imageIcon={stackrIcons.scanCard}
                      variant="scan"
                      size="compact"
                      onPress={handleScanCard}
                      accessibilityLabel="Scan to Binder"
                      showArrow={false}
                      style={{ flex: 1.12, minHeight: 48, borderRadius: 15 }}
                      contentStyle={{ minHeight: 48, borderRadius: 15, paddingVertical: 7, paddingHorizontal: 10 }}
                    />
                    <BinderHeroCompactSwitch
                      label={isPublic ? 'Public' : 'Private'}
                      icon={(
                        <Ionicons
                          name={isPublic ? 'eye-outline' : 'lock-closed-outline'}
                          size={24}
                          color={theme.colors.primary}
                        />
                      )}
                      active={isPublic}
                      disabled={updatingVisibility}
                      onValueChange={togglePublic}
                      trackColor={switchTrackColor}
                      thumbColor={getSwitchThumbColor(isPublic)}
                    />
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
                      <StackrActionButton
                        title="Scan to Binder"
                        imageIcon={stackrIcons.scanCard}
                        variant="scan"
                        size="compact"
                        onPress={handleScanCard}
                        accessibilityLabel="Scan to Binder"
                        showArrow={false}
                        style={{ flex: 1.12, minHeight: 48, borderRadius: 15 }}
                        contentStyle={{ minHeight: 48, borderRadius: 15, paddingVertical: 7, paddingHorizontal: 10 }}
                      />
                      <BinderHeroCompactSwitch
                        label={isPublic ? 'Public' : 'Private'}
                        icon={(
                          <Ionicons
                            name={isPublic ? 'eye-outline' : 'lock-closed-outline'}
                            size={24}
                            color={theme.colors.primary}
                          />
                        )}
                        active={isPublic}
                        disabled={updatingVisibility}
                        onValueChange={togglePublic}
                        trackColor={switchTrackColor}
                        thumbColor={getSwitchThumbColor(isPublic)}
                      />
                    </View>

                    {binder.type === 'official' ? (
                      <BinderHeroCompactSwitch
                        label="Master set"
                        icon={<BinderModeIconBadge type="master" size={30} />}
                        active={masterSetEnabled}
                        disabled={updatingMasterSet}
                        onValueChange={toggleMasterSet}
                        trackColor={switchTrackColor}
                        thumbColor={getSwitchThumbColor(masterSetEnabled)}
                      />
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            {!isReadOnly && binder.type === 'custom' ? (
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                activeOpacity={0.82}
                style={{
                  marginTop: 8,
                  minHeight: 36,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>Add Manually</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {!isReadOnly && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setSortMode('missing')}
                style={{
                  flex: 1,
                  minHeight: 44,
                  backgroundColor: sortMode === 'missing' ? theme.colors.primary + '12' : theme.colors.card,
                  borderRadius: 999,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: sortMode === 'missing' ? theme.colors.primary : theme.colors.border,
                  position: 'relative',
                  overflow: 'hidden',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: sortMode === 'missing' ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 12 }} numberOfLines={1}>
                  Missing {totalNeedsSync ? '--' : missingCount}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSortMode('owned')}
                style={{
                  flex: 1,
                  minHeight: 44,
                  backgroundColor: sortMode === 'owned' ? theme.colors.primary + '12' : theme.colors.card,
                  borderRadius: 999,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: sortMode === 'owned' ? theme.colors.primary : theme.colors.border,
                  position: 'relative',
                  overflow: 'hidden',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: sortMode === 'owned' ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 12 }} numberOfLines={1}>
                  Duplicates {duplicateCount}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowcaseCollapsed((prev) => ({ ...prev, chase: !prev.chase }))}
                style={{
                  flex: 1,
                  minHeight: 44,
                  backgroundColor: !showcaseCollapsed.chase && chaseCount > 0 ? theme.colors.primary + '12' : theme.colors.card,
                  borderRadius: 999,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: !showcaseCollapsed.chase && chaseCount > 0 ? theme.colors.primary : theme.colors.border,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: !showcaseCollapsed.chase && chaseCount > 0 ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 12 }} numberOfLines={1}>
                  Chase {chaseCount}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isReadOnly && (
            <View style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 14,
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <Ionicons name="eye-outline" size={17} color={theme.colors.textSoft} />
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, fontWeight: '700', flex: 1 }}>
                Viewing another collector&apos;s binder - read only
              </Text>
            </View>
          )}

          <View>
            {renderShowcaseStrip('chase', 'Chase Cards')}
          </View>
        </View>

        {/* Sort dropdown */}
        <View style={{ marginBottom: 14, zIndex: 50, elevation: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900', flex: 1 }} numberOfLines={1}>
              {sortMode === 'owned' ? 'Owned Cards' : sortMode === 'missing' ? 'Missing Cards' : 'Binder Cards'}
            </Text>

            <TouchableOpacity
              onPress={() => setSortDropdownOpen((prev) => !prev)}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 999,
                minHeight: 44,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Ionicons name="swap-vertical-outline" size={16} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }} numberOfLines={1}>Sort: {currentSortLabel}</Text>
              <Ionicons
                name={sortDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.colors.textSoft}
              />
            </TouchableOpacity>
          </View>

          {sortDropdownOpen && (
            <View style={{
              alignSelf: 'flex-end',
              width: Math.min(230, width - 40),
              backgroundColor: theme.dark ? theme.colors.card : '#FFFFFF',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
              marginTop: 8,
              shadowColor: '#1B2A4B',
              shadowOpacity: 0.16,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 20,
              zIndex: 80,
            }}>
              {sortOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => { setSortMode(option.value); setSortDropdownOpen(false); }}
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    backgroundColor: sortMode === option.value ? theme.colors.primary + '12' : theme.dark ? theme.colors.card : '#FFFFFF',
                    position: 'relative',
                    overflow: 'hidden',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name={sortMode === option.value ? 'checkmark-circle' : 'ellipse-outline'}
                    size={17}
                    color={sortMode === option.value ? theme.colors.primary : theme.colors.textSoft}
                  />
                  <Text style={{ color: sortMode === option.value ? theme.colors.primary : theme.colors.text, fontWeight: '900', flex: 1 }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

          </View>
        }
        ListFooterComponent={hasMoreCardsToRender ? (
          <View style={{ height: 24, justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
          </View>
        ) : null}
      />
      <ScrollToEndButton
        visible={showBinderEndButton}
        onPress={scrollBinderToEnd}
        bottom={insets.bottom + stackrTabContentPadding.standard - 38}
        accessibilityLabel="Skip to end of binder"
      />

      <StackrQuickActionSheet
        visible={Boolean(quickActionCard)}
        title={quickActionCardTitle}
        subtitle="Quick actions"
        actions={quickActionSheetActions}
        onClose={() => setQuickActionCard(null)}
      />

      {/* ADD CARD MODAL */}
{!isReadOnly && (
  <Modal visible={showAddModal} animationType="slide" presentationStyle="fullScreen">
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: Math.max(24, insets.top + 12), flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginBottom: 14 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900', flex: 1, paddingRight: 12 }}>
            Add Cards
          </Text>
          <TouchableOpacity
            onPress={() => {
              setShowAddModal(false);
              setAddFiltersVisible(false);
              setPendingAddIds({});
              setAddSearch('');
              setAddSearchResults([]);
            }}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: activeAddFilterCount > 0 ? 8 : 12 }}>
          <TextInput
            placeholder="Search by card name..."
            placeholderTextColor={theme.colors.textSoft}
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="words"
            value={addSearch}
            onChangeText={setAddSearch}
            returnKeyType="search"
            onSubmitEditing={() => searchCardsToAdd(addSearch)}
            style={{
              flex: 1,
              backgroundColor: theme.colors.card,
              color: theme.colors.text,
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          />
          <TouchableOpacity
            onPress={() => setAddFiltersVisible(true)}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Filter card search"
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: activeAddFilterCount > 0 ? theme.colors.primary + '12' : theme.colors.card,
              borderWidth: 1,
              borderColor: activeAddFilterCount > 0 ? theme.colors.primary : theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <Ionicons name="options-outline" size={22} color={theme.colors.primary} />
            {activeAddFilterCount > 0 ? (
              <View style={{
                position: 'absolute',
                right: -4,
                top: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                paddingHorizontal: 5,
                backgroundColor: theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.colors.primary,
              }}>
                <Text numeric style={{ color: theme.colors.primary, fontSize: 10, lineHeight: 13, fontWeight: '900' }}>{activeAddFilterCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {activeAddFilterCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
              {activeAddFilterCount} filter{activeAddFilterCount === 1 ? '' : 's'} active
            </Text>
            <TouchableOpacity
              onPress={() => setAddFilters(DEFAULT_ADD_CARD_FILTERS)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Clear card search filters"
            >
              <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>Clear filters</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {binder?.card_mode === 'graded' && (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 14,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 12,
          }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
              Choose grading company and grade
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginBottom: 8 }}>
              This applies to the card you add next.
            </Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 7 }}>
              Company
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {GRADING_COMPANIES.map((company) => {
                const active = addGradeCompany === company;
                const accent = getSlabAccent(company);
                return (
                  <TouchableOpacity
                    key={company}
                    onPress={() => setAddGradeCompany(company)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor: active ? `${accent}18` : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: active ? accent : theme.colors.border,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <Text style={{ color: active ? accent : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{company}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 7 }}>
              Grade
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {GRADES.map((grade) => {
                const active = addGrade.trim() === grade;
                return (
                  <TouchableOpacity
                    key={grade}
                    onPress={() => setAddGrade(grade)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{grade}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={addGrade}
              onChangeText={setAddGrade}
              placeholder="Type exact grade, e.g. GEM MINT 10"
              placeholderTextColor={theme.colors.textSoft}
              autoCapitalize="characters"
              returnKeyType="done"
              style={{
                minHeight: 42,
                borderRadius: 12,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                fontWeight: '800',
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            />
          </View>
        )}

        {/* Select all / count row */}
        {addSearchResults.length > 0 && !addSearchLoading && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            {binder?.card_mode !== 'graded' ? (
              <TouchableOpacity
              onPress={() => {
                const allEligible = addSearchResults.filter((r) => {
                  const setId = getPreviewSetId(r);
                  const language = normalizePokemonCardLanguage(r.language ?? binder?.language);
                  return !cards.some((c) =>
                    c.card_id === r.card_id &&
                    c.set_id === setId &&
                    normalizePokemonCardLanguage(c.language ?? binder?.language) === language
                  );
                });
                const allSelected = allEligible.every((r) => pendingAddIds[r.card_id]);
                if (allSelected) {
                  setPendingAddIds({});
                } else {
                  const next: Record<string, CardPreviewResult> = {};
                  allEligible.forEach((r) => { next[r.card_id] = r; });
                  setPendingAddIds(next);
                }
              }}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderWidth: 1,
                borderColor: theme.colors.border,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                {addSearchResults
                  .filter((r) => {
                    const setId = getPreviewSetId(r);
                    const language = normalizePokemonCardLanguage(r.language ?? binder?.language);
                    return !cards.some((c) =>
                      c.card_id === r.card_id &&
                      c.set_id === setId &&
                      normalizePokemonCardLanguage(c.language ?? binder?.language) === language
                    );
                  })
                  .every((r) => pendingAddIds[r.card_id])
                  ? 'Deselect All'
                  : 'Select All'}
              </Text>
            </TouchableOpacity>
            ) : (
              <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
                Select one card, then add it as {addGradeCompany} {addGrade.trim() || '10'}
              </Text>
            )}

            {pendingAddCount > 0 && (
              <TouchableOpacity
                onPress={handleAddMultipleToCustomBinder}
                disabled={addingCardId === 'bulk'}
                style={{
                  backgroundColor: theme.colors.primary,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  opacity: addingCardId === 'bulk' ? 0.6 : 1,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <StackrButtonPattern tone="purple" compact />
                {addingCardId === 'bulk' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
                    {binder?.card_mode === 'graded'
                      ? `Add ${addGradeCompany} ${addGrade.trim() || '10'}`
                      : `Add ${pendingAddCount}`}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {addSearchLoading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <FlatList
            ref={addCardListRef}
            data={visibleAddSearchResults}
            keyExtractor={(item) => `${getPreviewSetId(item)}-${item.card_id}-${item.language ?? 'en'}`}
            keyboardShouldPersistTaps="always"
            onEndReached={hasMoreAddResultsToRender ? renderMoreAddResults : undefined}
            onEndReachedThreshold={0.75}
            contentContainerStyle={{ paddingBottom: insets.bottom + 320 }}
            ListEmptyComponent={debouncedAddSearch.trim().length >= 2 ? (
              <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                <Ionicons name="search-outline" size={24} color={theme.colors.textSoft} />
                <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 10 }}>
                  {activeAddFilterCount > 0 ? 'No cards match these filters' : 'No matching cards found'}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                  {activeAddFilterCount > 0 ? 'Try clearing a filter or widening the value range.' : 'Try a shorter card name or remove punctuation.'}
                </Text>
              </View>
            ) : null}
            renderItem={({ item }) => {
              const derivedSetId = getPreviewSetId(item);
              const language = normalizePokemonCardLanguage(item.language ?? binder?.language);
              const alreadyInBinder = cards.some(
                (c) =>
                  c.card_id === item.card_id &&
                  c.set_id === derivedSetId &&
                  normalizePokemonCardLanguage(c.language ?? binder?.language) === language
              );
              const isPending = Boolean(pendingAddIds[item.card_id]);
              const isAdding = addingCardId === item.card_id;
              const isActive = alreadyInBinder || isPending || isAdding;
              const displayName = getPreviewCardDisplayName(item, item.name);
              const supportingName = getPreviewCardSupportingName(item, displayName);
              const displaySetName = getPreviewSetDisplayName(item, derivedSetId);
              const supportingSetName = getPreviewSetSupportingName(item, displaySetName);
              const setLine = [
                displaySetName,
                item.number ? `#${item.number}` : null,
              ].filter(Boolean).join(' - ');
              const openSearchResultDetail = () => {
                setShowAddModal(false);
                setAddFiltersVisible(false);
                router.push({
                  pathname: '/card/[id]',
                  params: {
                    id: item.card_id,
                    setId: derivedSetId,
                  },
                });
              };
              const handleSearchResultPress = () => {
                if (addResultLongPressRef.current === item.card_id) {
                  addResultLongPressRef.current = null;
                  return;
                }
                if (isAdding) return;
                if (alreadyInBinder) {
                  Alert.alert('Already added', 'This card is already in this binder.');
                  return;
                }
                void handleAddCardToCustomBinder(item, { closeAfterAdd: false });
              };
              const handleSearchResultLongPress = () => {
                addResultLongPressRef.current = item.card_id;
                openSearchResultDetail();
                setTimeout(() => {
                  if (addResultLongPressRef.current === item.card_id) {
                    addResultLongPressRef.current = null;
                  }
                }, 600);
              };

              return (
                <TouchableOpacity
                  onPress={handleSearchResultPress}
                  onLongPress={handleSearchResultLongPress}
                  delayLongPress={320}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive, disabled: alreadyInBinder, busy: isAdding }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isActive ? theme.colors.primary + '18' : theme.colors.card,
                    borderRadius: 14,
                    padding: 10,
                    marginBottom: 10,
                    opacity: isAdding ? 0.72 : 1,
                    borderWidth: 1,
                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: 50,
                      height: 70,
                      borderRadius: 6,
                      overflow: 'hidden',
                      backgroundColor: theme.colors.surface,
                      opacity: isActive ? 1 : 0.48,
                    }}
                  >
                    {item.image_url ? (
                      <StackrImage
                        uri={item.image_url}
                        style={StyleSheet.absoluteFill}
                        contentFit="contain"
                        priority="low"
                        showFallbackIcon={false}
                      />
                    ) : null}
                    <RaritySymbol
                      rarity={item.rarity}
                      size={12}
                      style={RARITY_SYMBOL_CARD_OVERLAY}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {displayName}
                    </Text>
                    {supportingName ? (
                      <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2, fontWeight: '700' }}>
                        {supportingName}
                      </Text>
                    ) : null}
                    <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                      {setLine || derivedSetId}
                    </Text>
                    {supportingSetName ? (
                      <Text numberOfLines={1} style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 1 }}>
                        {supportingSetName}
                      </Text>
                    ) : null}
                    {item.value != null ? (
                      <Text numberOfLines={1} style={{ color: theme.colors.primary, fontSize: 11, fontWeight: '800', marginTop: 2 }}>
                        {formatCurrency(item.value)}
                      </Text>
                    ) : null}
                  </View>

                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      backgroundColor: alreadyInBinder
                        ? theme.colors.secondary
                        : isActive
                          ? theme.colors.primary
                          : theme.colors.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: alreadyInBinder
                        ? theme.colors.secondary
                        : isActive
                          ? theme.colors.primary
                          : theme.colors.border,
                      marginLeft: 8,
                    }}
                  >
                    {isAdding ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (alreadyInBinder || isPending) ? (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    ) : (
                      <Ionicons name="add" size={22} color={theme.colors.primary} />
                    )}
                  </View>
              </TouchableOpacity>
              );
            }}
            ListFooterComponent={hasMoreAddResultsToRender ? (
              <View style={{ height: 34, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} size="small" />
              </View>
            ) : null}
          />
        )}
        <ScrollToEndButton
          visible={showAddCardsEndButton}
          onPress={scrollAddCardsToEnd}
          bottom={insets.bottom + 118}
          right={22}
          accessibilityLabel="Skip to end of card results"
        />
      </View>
    </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>
)}

      {!isReadOnly && (
        <StackrBottomSheet
          visible={addFiltersVisible}
          title="Search filters"
          subtitle="Narrow results without changing your search."
          onClose={() => setAddFiltersVisible(false)}
          maxHeight="78%"
        >
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', marginBottom: 7 }}>SET</Text>
              <TextInput
                value={addFilters.setQuery}
                onChangeText={(text) => setAddFilters((prev) => ({ ...prev, setQuery: text }))}
                placeholder="Any set, e.g. Crown Zenith"
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                  borderRadius: 13,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  marginBottom: 14,
                }}
              />

              {[
                { label: 'VALUE', options: ADD_VALUE_FILTERS, value: addFilters.value, update: (value: AddCardValueFilter) => setAddFilters((prev) => ({ ...prev, value })) },
                { label: 'TYPE', options: ADD_TYPE_FILTERS, value: addFilters.cardType, update: (value: AddCardTypeFilter) => setAddFilters((prev) => ({ ...prev, cardType: value })) },
                { label: 'FINISH', options: ADD_FINISH_FILTERS, value: addFilters.finish, update: (value: AddCardFinishFilter) => setAddFilters((prev) => ({ ...prev, finish: value })) },
                { label: 'RARITY', options: ADD_RARITY_FILTERS, value: addFilters.rarity, update: (value: AddCardRarityFilter) => setAddFilters((prev) => ({ ...prev, rarity: value })) },
              ].map((section) => (
                <View key={section.label} style={{ marginBottom: 14 }}>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', marginBottom: 8 }}>{section.label}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {section.options.map((option) => {
                      const active = section.value === option.key;
                      return (
                        <TouchableOpacity
                          key={option.key}
                          onPress={() => section.update(option.key as never)}
                          activeOpacity={0.78}
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                            borderWidth: 1,
                            borderColor: active ? theme.colors.primary : theme.colors.border,
                          }}
                        >
                          <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontSize: 12, fontWeight: '900' }}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                <TouchableOpacity
                  onPress={() => setAddFilters(DEFAULT_ADD_CARD_FILTERS)}
                  activeOpacity={0.78}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAddFiltersVisible(false)}
                  activeOpacity={0.82}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: theme.colors.primary,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <StackrButtonPattern tone="purple" compact />
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Apply</Text>
                </TouchableOpacity>
              </View>
        </StackrBottomSheet>
      )}

      {/* GRADED CARD PROMPT */}
      {!isReadOnly && (
        <Modal
          visible={Boolean(gradingCardToAdd)}
          transparent
          animationType="fade"
          onRequestClose={() => setGradingCardToAdd(null)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(27,42,75,0.35)', justifyContent: 'center', padding: 18 }}>
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              ...cardShadow,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '900', marginBottom: 4 }}>
                Add graded card
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginBottom: 14 }}>
                Choose the grading company and grade for this card.
              </Text>

              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
                Company
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {GRADING_COMPANIES.map((company) => {
                  const active = gradingPromptCompany === company;
                  const accent = getSlabAccent(company);
                  return (
                    <TouchableOpacity
                      key={company}
                      onPress={() => setGradingPromptCompany(company)}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: active ? `${accent}18` : theme.colors.surface,
                        borderWidth: 1,
                        borderColor: active ? accent : theme.colors.border,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <Text style={{ color: active ? accent : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{company}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
                Grade
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {GRADES.map((grade) => {
                  const active = gradingPromptGrade.trim() === grade;
                  return (
                    <TouchableOpacity
                      key={grade}
                      onPress={() => setGradingPromptGrade(grade)}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surface,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <Text style={{ color: active ? theme.colors.primary : theme.colors.text, fontWeight: '900', fontSize: 12 }}>{grade}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={gradingPromptGrade}
                onChangeText={setGradingPromptGrade}
                placeholder="Type exact grade, e.g. PRISTINE 10"
                placeholderTextColor={theme.colors.textSoft}
                autoCapitalize="characters"
                returnKeyType="done"
                style={{
                  minHeight: 42,
                  borderRadius: 12,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  fontWeight: '800',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 16,
                }}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setGradingCardToAdd(null)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={confirmGradedCardAdd}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: theme.colors.primary,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <StackrButtonPattern tone="purple" />
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Add {gradingPromptCompany} {gradingPromptGrade.trim() || '10'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* CARD DETAIL MODAL */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDetailModal}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(27,42,75,0.35)' }}>
          <BlurView intensity={45} tint="light" style={{ flex: 1 }}>
            <Pressable onPress={closeDetailModal} style={{ position: 'absolute', inset: 0 }} />

            <Animated.View
              {...modalPanResponder.panHandlers}
              style={{ flex: 1, transform: [{ translateY: modalTranslateY }] }}
            >
              <SafeAreaView style={{ flex: 1 }}>
                <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 4 }}>
                  <View style={{ width: 42, height: 5, borderRadius: 999, backgroundColor: 'rgba(27,42,75,0.35)' }} />
                </View>

                <TouchableOpacity
                  onPress={closeDetailModal}
                  style={{
                    position: 'absolute',
                    top: Math.max(14, insets.top + 8), right: 16,
                    zIndex: 50,
                    backgroundColor: theme.colors.card,
                    borderRadius: 999,
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    overflow: 'hidden',
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Close</Text>
                </TouchableOpacity>

                {selectedCard && (
                  <ScrollView
                    contentContainerStyle={{
                      padding: 16,
                      paddingTop: Math.max(64, insets.top + 52),
                      paddingBottom: insets.bottom + 56,
                    }}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={{
                      width: '100%',
                      aspectRatio: binder.card_mode === 'graded' ? 0.68 : stackrCardImageSizes.cardAspectRatio,
                      maxHeight: screenHeight * 0.62,
                      alignSelf: 'center',
                      borderRadius: 20,
                      overflow: 'hidden',
                    }}>
                      <PinchGestureHandler
                        onGestureEvent={onPinchGestureEvent}
                        onHandlerStateChange={onPinchHandlerStateChange}
                      >
                        <Animated.View style={{ flex: 1, transform: [{ scale: imageScale }] }}>
                          {binder.card_mode === 'graded' ? (
                            <GradedSlabCard
                              item={selectedCard}
                              imageUri={modalCard?.images?.large ?? modalCard?.images?.small ?? null}
                              editionHint={getBinderEditionHint(binder.edition)}
                              size="modal"
                            />
                          ) : (
                            <EditionAwareCardImage
                              uri={modalCard?.images?.large ?? modalCard?.images?.small ?? undefined}
                              cardId={selectedCard.card_id}
                              rawData={modalCard}
                              editionHint={getBinderEditionHint(binder.edition)}
                              sourceSize="large"
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="contain"
                            />
                          )}

                          {/* Variant slices in Modal */}
                          {binder.card_mode !== 'graded' && !isReadOnly && masterSetEnabled && (() => {
                            const modalVariants = getVariants(selectedCard.card, selectedCard.set_id);
                            if (modalVariants.length <= 1) return null;
                            return (
                              <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]} pointerEvents="box-none">
                                {modalVariants.map((variant, i) => {
                                  const variantQuantity = getDisplayedVariantQuantity(selectedCard, variant);
                                  const owned = variantQuantity > 0;
                                  return (
                                    <Pressable
                                      key={variant}
                                      onPress={() => handleToggleVariant(selectedCard.card_id, selectedCard.set_id, variant)}
                                      style={({ pressed }) => ({
                                        flex: 1,
                                        backgroundColor: pressed
                                          ? 'rgba(108,75,255,0.25)'
                                          : 'transparent',
                                        borderLeftWidth: i > 0 ? 1 : 0,
                                        borderColor: 'rgba(255,255,255,0.2)',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      })}
                                    >
                                      <View style={{
                                        position: 'absolute',
                                        bottom: 12,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 34,
                                        height: 34,
                                        borderRadius: 17,
                                        backgroundColor: owned ? theme.colors.primary : theme.colors.card,
                                        borderWidth: 2,
                                        borderColor: theme.colors.card,
                                      }}>
                                        {owned && variantQuantity > 1 ? (
                                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900' }}>
                                            x{variantQuantity}
                                          </Text>
                                        ) : owned ? (
                                          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                        ) : (
                                          <MasterVariantIcon variant={variant} size="medium" active={false} />
                                        )}
                                      </View>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            );
                          })()}
                        </Animated.View>
                      </PinchGestureHandler>

                      {getDisplayedOwnedQuantity(selectedCard) > 1 && (
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            left: 14,
                            bottom: 14,
                            minWidth: 42,
                            height: 34,
                            borderRadius: 17,
                            paddingHorizontal: 11,
                            backgroundColor: theme.colors.primary,
                            borderWidth: 2,
                            borderColor: theme.colors.card,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900' }}>
                            x{getDisplayedOwnedQuantity(selectedCard)}
                          </Text>
                        </View>
                      )}
                      <RaritySymbol
                        rarity={modalCard?.rarity ?? (selectedCard as any).rarity}
                        size={18}
                        style={{
                          position: 'absolute',
                          right: 14,
                          bottom: 14,
                        }}
                      />
                    </View>

                    <StackrCardIdentity
                      name={getBinderCardDisplayName(selectedCard, selectedCard.card_id)}
                      setName={modalCard?.set?.name ?? selectedCard.set_name ?? selectedCard.set_id}
                      number={modalCard?.number ?? selectedCard.card_number ?? null}
                      size="detail"
                      style={{ marginTop: 18 }}
                    />


                    {binder.edition && (
                      <View style={{
                        alignSelf: 'flex-start',
                        marginTop: 6,
                        backgroundColor: binder.edition === '1st_edition' ? '#F59E0B' : theme.colors.surface,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderWidth: 1,
                        borderColor: binder.edition === '1st_edition' ? '#F59E0B' : theme.colors.border,
                      }}>
                        <Text style={{
                          color: binder.edition === '1st_edition' ? '#FFFFFF' : theme.colors.textSoft,
                          fontSize: 11,
                          fontWeight: '900',
                        }}>
                          {binder.edition === '1st_edition' ? '1st Edition' : 'Unlimited'}
                        </Text>
                      </View>
                    )}

                    <View style={boxStyle}>
                      <Text style={boxTitleStyle}>Card Details</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {binder.card_mode === 'graded' ? (
                          <>
                            <DetailInfoPill
                              label="Grader"
                              value={formatSlabCompanyLabel(selectedCard.grade_company ?? 'Seller-confirmed')}
                              accent
                            />
                            <DetailInfoPill
                              label="Grade"
                              value={selectedCard.grade?.trim() || 'Not set'}
                              accent
                            />
                            <DetailInfoPill
                              label="Slab case"
                              value={(selectedCard as any).slab_condition ?? 'Not recorded'}
                            />
                          </>
                        ) : (
                          <DetailInfoPill
                            label="Condition"
                            value={selectedCard.condition || 'Not set'}
                            accent
                          />
                        )}
                        <DetailInfoPill
                          label="Owned"
                          value={`${getDisplayedOwnedQuantity(selectedCard)} cop${getDisplayedOwnedQuantity(selectedCard) === 1 ? 'y' : 'ies'}`}
                        />
                        {getDisplayedOwnedQuantity(selectedCard) > 1 && (
                          <DetailInfoPill
                            label="Duplicates"
                            value={`${Math.max(0, getDisplayedOwnedQuantity(selectedCard) - 1)} extra`}
                          />
                        )}
                        <DetailInfoPill
                          label="Card no."
                          value={modalCard?.number ?? selectedCard.card_number ?? 'Unknown'}
                        />
                        {modalCard?.supertype && (
                          <DetailInfoPill
                            label="Type"
                            value={[
                              modalCard.supertype,
                              Array.isArray(modalCard.subtypes) ? modalCard.subtypes[0] : null,
                            ].filter(Boolean).join(' · ')}
                          />
                        )}
                        {binder.card_mode !== 'graded' && masterSetEnabled && (() => {
                          const modalVariants = getVariants(selectedCard.card, selectedCard.set_id);
                          const ownedVariants = modalVariants.filter((variant) => getDisplayedVariantQuantity(selectedCard, variant) > 0);
                          if (modalVariants.length <= 1) return null;
                          return (
                            <DetailInfoPill
                              label="Variants"
                              value={
                                ownedVariants.length > 0
                                  ? ownedVariants.map((variant) => VARIANT_LABELS[variant] ?? variant).join(', ')
                                  : 'None owned'
                              }
                            />
                          );
                        })()}
                      </View>
                    </View>

                    {/* Price sources */}
                    <View style={boxStyle}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={boxTitleStyle}>Price Sources</Text>
                        {binder.card_mode !== 'graded' && (
                          <TouchableOpacity
                            onPress={() => selectedCard && fetchModalEbayPrice(selectedCard)}
                            disabled={modalEbayLoading}
                            style={{
                              backgroundColor: theme.colors.surface,
                              borderRadius: 999,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              position: 'relative',
                              overflow: 'hidden',
                            }}
                          >
                            <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700' }}>
                              {modalEbayLoading ? 'Fetching...' : 'Refresh'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <PokeTraceMarketInsights
                        cardName={getBinderCardDisplayName(selectedCard, selectedCard.card_id)}
                        setName={modalCard?.set?.name ?? selectedCard.set_name ?? selectedCard.set_id}
                        number={modalCard?.number ?? selectedCard.card_number ?? null}
                        rawCondition={binder.card_mode === 'graded' ? null : selectedCard.condition || 'Near Mint'}
                        gradingCompany={binder.card_mode === 'graded' ? selectedCard.grade_company ?? 'PSA' : null}
                        grade={binder.card_mode === 'graded' ? selectedCard.grade?.trim() || '10' : null}
                        summaryOnly
                      />

                      {binder.card_mode !== 'graded' && (
                        <>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                            Backup lookup - eBay sold (GBP)
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, marginTop: -4, marginBottom: 8 }}>
                            Broader live search used when the primary sold-comps read needs support. Adjusted for {selectedCard.condition || 'Near Mint'}.
                          </Text>

                          {modalEbayLoading ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                              <ActivityIndicator size="small" color={theme.colors.primary} />
                              <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Fetching live prices...</Text>
                            </View>
                          ) : modalEbayError ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                              <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>Could not fetch eBay prices. </Text>
                              <TouchableOpacity onPress={() => selectedCard && fetchModalEbayPrice(selectedCard)}>
                                <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '700' }}>Retry</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <>
                              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                                <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Low</Text>
                                  <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                                    {modalEbayPrice?.low != null
                                      ? formatCurrency(getEstimatedValue(modalEbayPrice.low, selectedCard.condition || 'Near Mint'))
                                      : '--'}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: theme.colors.primary + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.primary }}>
                                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Avg</Text>
                                  <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'center', fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>
                                    {modalEbayPrice?.average != null
                                      ? formatCurrency(getEstimatedValue(modalEbayPrice.average, selectedCard.condition || 'Near Mint'))
                                      : '--'}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                                  <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>High</Text>
                                  <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                                    {modalEbayPrice?.high != null
                                      ? formatCurrency(getEstimatedValue(modalEbayPrice.high, selectedCard.condition || 'Near Mint'))
                                      : '--'}
                                  </Text>
                                </View>
                              </View>

                              {modalEbayPrice?.count != null && modalEbayPrice.count > 0 && (
                                <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                                  Based on {modalEbayPrice.count} listing{modalEbayPrice.count !== 1 ? 's' : ''}
                                </Text>
                              )}
                              {modalEbayPrice?.usedFallback && (modalEbayPrice?.count ?? 0) > 0 && (
                                <Text style={{ color: '#F59E0B', fontSize: 11, marginTop: 2 }}>
                                  Backup lookup used - check against the live sold-comps read.
                                </Text>
                              )}
                              {modalEbayPrice?.count === 0 && (
                                <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 2 }}>
                                  No listings found on eBay
                                </Text>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {binder.card_mode !== 'graded' && (
                        <>
                          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />

                          <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                            Cached daily prices (fallback)
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, marginTop: -4, marginBottom: 8 }}>
                            Stored daily marketplace values. Use these when live sold data is thin or unavailable.
                          </Text>

                          <Row label="Cached eBay" value={formatCurrency(getEstimatedValue(selectedCard?.ebay_price ?? 0, selectedCard.condition || 'Near Mint'))} />
                          <Row
                            label="Cached TCGPlayer"
                            value={formatCurrency(
                              getEstimatedValue(
                                getBinderTcgPrice(selectedCard?.card, binder?.edition) ??
                                  modalTcgFallbackPrice?.market ??
                                  modalTcgFallbackPrice?.mid ??
                                  modalTcgFallbackPrice?.low ??
                                  0,
                                selectedCard.condition || 'Near Mint'
                              )
                            )}
                          />
                          <Row label="Cached CardMarket" value={formatCurrency(getEstimatedValue(getCardmarketPrice(selectedCard) ?? 0, selectedCard.condition || 'Near Mint'))} />

                          <Text style={{ color: theme.colors.textSoft, fontSize: 11, marginTop: 8 }}>
                            Updated daily when price refresh runs
                          </Text>
                        </>
                      )}
                    </View>
                  </ScrollView>
                )}
              </SafeAreaView>
            </Animated.View>
          </BlurView>
        </View>
      </Modal>


      {/* In-app toast */}
      {toastMessage && (
        <View style={{
          position: 'absolute',
          bottom: 40,
          left: 24,
          right: 24,
          backgroundColor: theme.colors.primary,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 18,
          alignItems: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 6,
        }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{toastMessage}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ===============================
// SUB COMPONENTS
// ===============================

function BinderHeroCompactSwitch({
  label,
  helper,
  icon,
  active,
  disabled,
  onValueChange,
  onInfoPress,
  trackColor,
  thumbColor,
}: {
  label: string;
  helper?: string;
  icon?: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  onInfoPress?: () => void;
  trackColor: { false: string; true: string };
  thumbColor: string;
}) {
  return (
    <BinderHeroInfoCard
      title={label}
      helper={helper}
      icon={icon}
      active={active}
      onInfoPress={onInfoPress}
      trailing={(
        <BinderHeroMiniToggle
          active={active}
          disabled={disabled}
          onPress={() => onValueChange(!active)}
          trackColor={active ? trackColor.true : trackColor.false}
          thumbColor={thumbColor}
        />
      )}
    />
  );
}

function BinderHeroMiniToggle({
  active,
  disabled,
  onPress,
  trackColor,
  thumbColor,
}: {
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  trackColor: string;
  thumbColor: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled: Boolean(disabled) }}
      hitSlop={6}
      style={{
        width: 40,
        height: 24,
        borderRadius: 12,
        padding: 2,
        backgroundColor: trackColor,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary + '55' : theme.colors.border,
        opacity: disabled ? 0.55 : 1,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: active ? thumbColor : '#FFFFFF',
          alignSelf: active ? 'flex-end' : 'flex-start',
          shadowColor: '#1B2A4B',
          shadowOpacity: 0.16,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </Pressable>
  );
}

function BinderHeroInfoCard({
  title,
  helper,
  icon,
  active,
  trailing,
  onInfoPress,
  textAlign = 'left',
}: {
  title: string;
  helper?: string;
  icon?: React.ReactNode;
  active?: boolean;
  trailing?: React.ReactNode;
  onInfoPress?: () => void;
  textAlign?: 'left' | 'center';
}) {
  const { theme } = useTheme();
  const centered = textAlign === 'center';
  return (
    <View style={{
      flex: 1,
      minHeight: 48,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: active ? theme.colors.primary + '32' : theme.colors.border,
      backgroundColor: active ? theme.colors.primary + '08' : theme.colors.surface,
      paddingVertical: 6,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: centered ? 'center' : 'flex-start' }}>
        {icon ? (
          <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </View>
        ) : null}
        <View style={{ flex: centered ? 0 : 1, minWidth: 0, alignItems: centered ? 'center' : 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 20, maxWidth: '100%' }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 13.5,
                lineHeight: 17,
                fontWeight: '900',
                flexShrink: 1,
                textAlign: centered ? 'center' : 'left',
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
            {onInfoPress ? (
              <TouchableOpacity
                onPress={onInfoPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="information-circle-outline" size={15} color={theme.colors.textSoft} />
              </TouchableOpacity>
            ) : null}
          </View>
          {helper ? (
            <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, lineHeight: 13, fontWeight: '800', marginTop: 1 }} numberOfLines={1}>
              {helper}
            </Text>
          ) : null}
        </View>
      </View>
      {trailing ? (
        <View style={{ width: 40, minHeight: 28, alignItems: 'flex-end', justifyContent: 'center' }}>
          {trailing}
        </View>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 6 }}>
      <Text style={{ color: theme.colors.textSoft, flex: 1, minWidth: 0 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{ color: theme.colors.text, fontWeight: '900', maxWidth: '46%', textAlign: 'right' }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
      >
        {value}
      </Text>
    </View>
  );
}

function DetailInfoPill({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: 118,
        maxWidth: '100%',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: accent ? theme.colors.primary + '10' : theme.colors.surface,
        borderWidth: 1,
        borderColor: accent ? theme.colors.primary + '45' : theme.colors.border,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: theme.colors.textSoft,
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginBottom: 3,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          color: accent ? theme.colors.primary : theme.colors.text,
          fontSize: 13,
          lineHeight: 17,
          fontWeight: '900',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function MasterVariantIcon({
  variant,
  size = 'small',
  active = false,
}: {
  variant: string;
  size?: 'tiny' | 'small' | 'medium' | 'large';
  active?: boolean;
}) {
  const kind = getMasterVariantKind(variant);
  const width = size === 'large' ? 38 : size === 'medium' ? 30 : size === 'small' ? 25 : 20;
  const height = size === 'large' ? 46 : size === 'medium' ? 36 : size === 'small' ? 30 : 24;
  const iconSize = size === 'large' ? 18 : size === 'medium' ? 14 : size === 'small' ? 12 : 10;
  const purple = '#4B22A2';
  const isEnergyReverse = variant === 'reverseHoloEnergy';
  const isPokeballReverse = variant === 'reverseHoloPokeball';
  const isSpeckled = variant === 'speckledHolofoil';
  const isLineHolo = variant === 'lineHolofoil';
  const isMasterBall = variant === 'masterBallPatternHolofoil';
  const isStamped = variant === 'stampedHolofoil';
  const isFirstEdition = variant === '1stEditionNormal' || variant === '1stEditionHolofoil';
  const isHolo = kind === 'holo';
  const isReverse = kind === 'reverse';

  const baseStyle = {
    width,
    height,
    borderRadius: 5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: isReverse ? 2 : 1,
    borderColor: isReverse ? '#A78BFA' : '#DED1FF',
    overflow: 'hidden' as const,
  };

  if (isEnergyReverse) {
    return (
      <View style={[baseStyle, { backgroundColor: '#F5F0FF' }]}>
        <Ionicons name="flash" size={iconSize + 2} color={purple} />
      </View>
    );
  }

  if (isPokeballReverse) {
    return (
      <View style={[baseStyle, { backgroundColor: '#F5F0FF' }]}>
        <View style={{
          width: iconSize + 8,
          height: iconSize + 8,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: purple,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <View style={{ position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: purple }} />
          <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 2, borderColor: purple, backgroundColor: '#FFFFFF' }} />
        </View>
      </View>
    );
  }

  if (isSpeckled) {
    const speckles = [
      { left: width * 0.25, top: height * 0.22 },
      { left: width * 0.58, top: height * 0.18 },
      { left: width * 0.42, top: height * 0.44 },
      { left: width * 0.7, top: height * 0.62 },
      { left: width * 0.22, top: height * 0.7 },
    ];

    return (
      <LinearGradient
        colors={['#FFF1A8', '#FFD7F7', '#D7F5FF', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={baseStyle}
      >
        {speckles.map((speckle, index) => (
          <View
            key={`speckle-${index}`}
            style={{
              position: 'absolute',
              left: speckle.left,
              top: speckle.top,
              width: Math.max(3, iconSize - 7),
              height: Math.max(3, iconSize - 7),
              borderRadius: 999,
              backgroundColor: purple,
              opacity: 0.78,
            }}
          />
        ))}
        <Ionicons name="sparkles" size={Math.max(8, iconSize - 1)} color={purple} />
      </LinearGradient>
    );
  }

  if (isLineHolo) {
    return (
      <LinearGradient
        colors={['#DDF8F3', '#F4EDFF', '#FFF3B8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={baseStyle}
      >
        {[0, 1, 2, 3].map((line) => (
          <View
            key={`line-${line}`}
            style={{
              position: 'absolute',
              left: 4,
              right: 4,
              top: 6 + line * Math.max(4, iconSize - 5),
              height: 1.5,
              borderRadius: 999,
              backgroundColor: purple,
              opacity: 0.64,
            }}
          />
        ))}
      </LinearGradient>
    );
  }

  if (isMasterBall) {
    return (
      <LinearGradient
        colors={['#F1DEFF', '#FFFFFF', '#FFE6A8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={baseStyle}
      >
        <View style={{
          width: iconSize + 10,
          height: iconSize + 10,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: purple,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.52)',
        }}>
          <Text style={{ color: purple, fontSize: Math.max(8, iconSize - 2), fontWeight: '900' }}>M</Text>
        </View>
      </LinearGradient>
    );
  }

  if (isStamped) {
    return (
      <View style={[baseStyle, { backgroundColor: '#FFF2F6', borderColor: '#FFBCD4' }]}>
        <View style={{
          width: iconSize + 9,
          height: iconSize + 5,
          borderRadius: 3,
          borderWidth: 2,
          borderColor: '#9A2753',
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '-8deg' }],
        }}>
          <Ionicons name="pricetag" size={Math.max(8, iconSize - 2)} color="#9A2753" />
        </View>
      </View>
    );
  }

  if (isReverse) {
    return (
      <LinearGradient
        colors={['#FFE27A', '#F9D6FF', '#D7F5FF', '#FFF0B8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={baseStyle}
      >
        <Ionicons name="sparkles" size={iconSize} color={purple} style={{ position: 'absolute', top: 4, left: 4 }} />
        <Ionicons name="sparkles" size={Math.max(8, iconSize - 2)} color={purple} style={{ position: 'absolute', bottom: 4, right: 4 }} />
      </LinearGradient>
    );
  }

  if (isHolo) {
    return (
      <View style={[baseStyle, { backgroundColor: '#F3EEFF', borderColor: '#C9B6FF' }]}>
        <Ionicons name="sparkles" size={iconSize + 1} color={purple} />
        {isFirstEdition && (
          <Text style={{
            position: 'absolute',
            right: 3,
            bottom: 1,
            color: purple,
            fontSize: Math.max(7, iconSize - 4),
            fontWeight: '900',
          }}>
            1
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[baseStyle, { backgroundColor: '#F3EEFF' }]}>
      <View style={{
        width: '62%',
        height: '72%',
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: purple,
        backgroundColor: active ? '#FFFFFF' : 'transparent',
      }} />
      {isFirstEdition && (
        <Text style={{
          position: 'absolute',
          right: 3,
          bottom: 1,
          color: purple,
          fontSize: Math.max(7, iconSize - 4),
          fontWeight: '900',
        }}>
          1
        </Text>
      )}
    </View>
  );
}




