import { useTheme } from '../../components/theme-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { fetchAllSets, fetchCardsForSet, getKnownPokemonSetTotal, getPokemonSetVisualUrl, PokemonCard, PokemonSet } from '../../lib/pokemonTcg';
import { getLocalSetArtworkSourceForSet } from '../../lib/localSetArtwork';
import { supabase } from '../../lib/supabase';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrBackButton } from '../../components/StackrBackButton';
import { StackrActionButton } from '../../components/StackrActionButton';
import { StackrImage } from '../../components/StackrImage';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../components/RaritySymbol';
import { createActivityPost } from '../../lib/activity';
import { getIncrementalListWindow } from '../../lib/performance';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { getPreferredCardDisplayName } from '../../lib/pokemonDisplayNames';

type FilterType = 'all' | 'owned' | 'missing';
type SortType = 'number' | 'name' | 'rarity';
type CompletionistFinishKey =
  | 'base'
  | 'energyHolo'
  | 'pokeBallHolo'
  | 'speckledHolo'
  | 'lineHolo'
  | 'masterBall'
  | 'stamped';
type FinishSectionKey = 'pattern' | 'texture' | 'masterBall' | 'stamped';
type RarityFilterOption = { key: string; label: string; count: number; rank: number };

type QuantityTarget = {
  card: PokemonCard;
  variant: string;
} | null;

const getVariantKey = (cardId: string, setId: string, variant: string) => `${setId}:${cardId}:${variant}`;

function getRouteSetLanguage(setId?: string | null) {
  const raw = String(setId ?? '').trim().toLowerCase();
  if (/^(zh-tw|zh_tw|zhtw|zh):/i.test(raw)) return 'zh-tw';
  return raw.startsWith('ja:') || raw.startsWith('jp:') ? 'ja' : 'en';
}

function stripRouteSetLanguage(setId?: string | null) {
  return String(setId ?? '').trim().replace(/^(ja|jp|en|zh-tw|zh_tw|zhtw|zh):/i, '');
}

function isSameRouteSetId(candidate?: string | null, target?: string | null) {
  const left = stripRouteSetLanguage(candidate).toLowerCase();
  const right = stripRouteSetLanguage(target).toLowerCase();
  return Boolean(left && right && left === right);
}

const VARIANT_LABELS: Record<string, string> = {
  normal: 'Nrm',
  holofoil: 'Holo',
  reverseHolofoil: 'Rev',
  '1stEditionNormal': '1st',
  '1stEditionHolofoil': '1stH',
  unlimitedHolofoil: '∞H',
  unlimited: '∞',
  reverseHoloEnergy: 'Nrg',
  reverseHoloPokeball: 'Ball',
  speckledHolofoil: 'Spk',
  lineHolofoil: 'Line',
  masterBallPatternHolofoil: 'MB',
  stampedHolofoil: 'Stamp',
};

const FINISH_SECTIONS: {
  key: FinishSectionKey;
  label: string;
  shortLabel: string;
  finishes: CompletionistFinishKey[];
}[] = [
  { key: 'pattern', label: 'Energy + Poke Ball', shortLabel: 'Energy/Ball', finishes: ['base', 'energyHolo', 'pokeBallHolo'] },
  { key: 'texture', label: 'Speckled + Line', shortLabel: 'Speckled/Line', finishes: ['speckledHolo', 'lineHolo'] },
  { key: 'masterBall', label: 'Master Ball', shortLabel: 'Master Ball', finishes: ['masterBall'] },
  { key: 'stamped', label: 'Stamped + Art', shortLabel: 'Stamped', finishes: ['stamped'] },
];

const GEM_PACK_ORDINAL_FINISHES: Record<number, CompletionistFinishKey> = {
  1: 'energyHolo',
  2: 'pokeBallHolo',
  3: 'speckledHolo',
  4: 'lineHolo',
  5: 'masterBall',
  6: 'stamped',
  7: 'stamped',
};

const ALL_RARITY_FILTER = 'All';

const RARITY_FILTER_PATTERNS: { key: string; label: string; rank: number; patterns: RegExp[] }[] = [
  { key: 'SAR', label: 'SAR', rank: 10, patterns: [/\bsar\b/, /\bsir\b/, /\bspecial (?:art|illustration) rare\b/] },
  { key: 'CSR', label: 'CSR', rank: 20, patterns: [/\bcsr\b/, /\bcharacter super rare\b/] },
  { key: 'CHR', label: 'CHR', rank: 30, patterns: [/\bchr\b/, /\bcharacter rare\b/] },
  { key: 'AR', label: 'AR', rank: 35, patterns: [/\bar\b/, /\bir\b/, /\b(?:art|illustration) rare\b/] },
  { key: 'UR', label: 'UR', rank: 40, patterns: [/\bur\b/, /\bultra rare\b/, /\brare ultra\b/] },
  { key: 'HR', label: 'HR', rank: 50, patterns: [/\bhr\b/, /\bhyper rare\b/, /\brainbow rare\b/] },
  { key: 'SR', label: 'SR', rank: 60, patterns: [/\bsr\b/, /\bsuper rare\b/, /\bsecret rare\b/, /\brare secret\b/] },
  { key: 'RRR', label: 'RRR', rank: 70, patterns: [/\brrr\b/, /\btriple rare\b/] },
  { key: 'RR', label: 'RR', rank: 80, patterns: [/\brr\b/, /\bdouble rare\b/] },
  { key: 'Rare Holo', label: 'Rare Holo', rank: 90, patterns: [/\brare holo\b/, /\bholo rare\b/] },
  { key: 'Rare', label: 'Rare', rank: 100, patterns: [/\brare\b/, /\br\b/] },
  { key: 'Uncommon', label: 'Uncommon', rank: 110, patterns: [/\buncommon\b/, /\bu\b/] },
  { key: 'Common', label: 'Common', rank: 120, patterns: [/\bcommon\b/, /\bc\b/] },
  { key: 'Promo', label: 'Promo', rank: 130, patterns: [/\bpromo\b/, /\bpromotional\b/] },
];

// Per-set variant overrides (e.g. for sets with multiple reverse holo patterns)
const SET_VARIANT_OVERRIDES: Record<string, Partial<Record<string, string[]>>> = {
  asc: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  ASC: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  me2pt5: {
    Common: ['normal', 'reverseHolofoil'],
    Uncommon: ['normal', 'reverseHolofoil'],
  },
};

function getVariants(card: PokemonCard, explicitSetId?: string): string[] {
  const setId = (explicitSetId ?? card.set?.id ?? '').toLowerCase();

  // 1. Check for hardcoded set overrides (e.g. Ascended Heroes 3-variant logic)
  const override = SET_VARIANT_OVERRIDES[setId] || SET_VARIANT_OVERRIDES[setId.toUpperCase()];
  if (override && card.rarity) {
    const r = card.rarity;
    const variants = override[r] ||
                     override[r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()] ||
                     override[r.toLowerCase()];
    if (variants) return variants;
  }

  // 2. Try to get variants from TCGPlayer price keys
  const prices = card.tcgplayer?.prices;
  const keys = Object.keys(prices ?? {}).filter(k => k !== 'unlimited');

  // Return multiple variants ONLY if they exist in the database data
  if (keys.length > 1) return keys;

  // 3. Default to single variant
  return keys.length > 0 ? [keys[0]] : ['normal'];
}

function shortVariant(key: string): string {
  return VARIANT_LABELS[key] ?? key.slice(0, 4);
}

function formatMoney(value?: number | null, currency?: string | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalizedCurrency = String(currency || 'GBP').toUpperCase();
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: normalizedCurrency === 'JPY' ? 0 : 2,
    }).format(value);
  } catch {
    const symbol = normalizedCurrency === 'GBP' ? '£' : normalizedCurrency === 'JPY' ? '¥' : `${normalizedCurrency} `;
    return `${symbol}${normalizedCurrency === 'JPY' ? Math.round(value) : value.toFixed(2)}`;
  }
}

function getCardPriceLines(card: PokemonCard) {
  const pricing = card.pricing;
  const primary = formatMoney(pricing?.displayPrice ?? null, pricing?.currency);
  if (!primary) {
    return { primary: 'Price unavailable', context: null };
  }
  const confidence = pricing?.confidence
    ? `${pricing.confidence.charAt(0).toUpperCase()}${pricing.confidence.slice(1)} confidence`
    : null;
  const source = pricing?.sourceLabel ?? (
    pricing?.priceType === 'recent_sold' ? 'Recent sold'
      : pricing?.priceType === 'market' ? 'Market value'
        : pricing?.priceType === 'average_sold' ? 'Average sold'
          : pricing?.priceType === 'low_listing' ? 'Lowest listing'
            : pricing?.priceType === 'estimated' ? 'Estimate'
              : null
  );
  const original = pricing?.originalCurrency && pricing?.originalCurrency !== pricing?.currency
    ? formatMoney(pricing.originalPrice ?? null, pricing.originalCurrency)
    : null;
  const context = [source, confidence, original ? `Source: ${original}` : null].filter(Boolean).join(' - ');
  return { primary, context };
}

function getSetCardDisplayName(card: PokemonCard | null | undefined, fallback = 'Card') {
  if (!card) return fallback;

  const raw = card.raw_data ?? {};
  const language = card.language ?? raw?.language ?? null;
  const isNonEnglish = !/^en$/i.test(String(language ?? 'en'));

  return getPreferredCardDisplayName({
    id: card.id ?? null,
    sourceId: card.externalIds?.tcgdex ?? raw?.source_id ?? raw?.provider_card_id ?? raw?.id ?? card.id ?? null,
    setId: card.set?.id ?? raw?.set?.id ?? null,
    collectorNumber: card.number ?? raw?.localId ?? raw?.number ?? null,
    language,
    region: card.region ?? raw?.region ?? null,
    localName: card.localName ?? raw?.local_name ?? (isNonEnglish ? raw?.name ?? card.name ?? null : null),
    englishDisplayName: raw?.english_display_name ?? raw?.englishDisplayName ?? null,
    canonicalName: raw?.canonical_name ?? null,
    fallbackName: card.name ?? card.id ?? fallback,
    raw,
  });
}

function normalizeCompletionistText(value?: string | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/pok[eé]/g, 'poke')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCollectorNumber(value?: string | number | null) {
  return String(value ?? '')
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .trim()
    .replace(/^#/, '')
    .split('/')[0]?.trim()
    .replace(/[^\d]/g, '') ?? '';
}

function getCardFamilyKey(card: PokemonCard) {
  return normalizeCompletionistText(getSetCardDisplayName(card, card.name));
}

function getFourDigitOrdinalFinish(card: PokemonCard, familyCounts: Map<string, number>): CompletionistFinishKey | null {
  const familyKey = getCardFamilyKey(card);
  if ((familyCounts.get(familyKey) ?? 0) < 4) return null;

  const raw = card.raw_data ?? {};
  const number = normalizeCollectorNumber(card.number ?? raw?.number ?? raw?.num ?? raw?.localId);
  if (!/^\d{4}$/.test(number)) return null;

  const ordinal = Number(number.slice(-2));
  return GEM_PACK_ORDINAL_FINISHES[ordinal] ?? null;
}

function getCompletionistFinishKey(card: PokemonCard, familyCounts: Map<string, number>): CompletionistFinishKey {
  const raw = card.raw_data ?? {};
  const finishText = normalizeCompletionistText([
    raw?.pokedata_variant,
    raw?.original_english_display_name,
    raw?.english_display_name,
    raw?.variant,
    raw?.finish,
    raw?.name,
    card.name,
  ].filter(Boolean).join(' '));

  if (finishText.includes('energy symbol') || finishText.includes('reverseholoenergy') || finishText.includes('energy holo')) return 'energyHolo';
  if (finishText.includes('poke ball') || finishText.includes('pokeball') || finishText.includes('reverseholopokeball')) return 'pokeBallHolo';
  if (finishText.includes('speckled') || finishText.includes('star pattern') || finishText.includes('star holo')) return 'speckledHolo';
  if (finishText.includes('line holo') || finishText.includes('lineholo') || finishText.includes('prism') || finishText.includes('cracked ice')) return 'lineHolo';
  if (finishText.includes('master ball') || finishText.includes('masterball')) return 'masterBall';
  if (finishText.includes('stamped') || finishText.includes('stamp') || finishText.includes('logo')) return 'stamped';

  return getFourDigitOrdinalFinish(card, familyCounts) ?? 'base';
}

function getFinishSectionKey(card: PokemonCard, familyCounts: Map<string, number>): FinishSectionKey {
  const finish = getCompletionistFinishKey(card, familyCounts);
  return FINISH_SECTIONS.find((section) => section.finishes.includes(finish))?.key ?? 'pattern';
}

function isFinishOnlyRarityText(value?: string | null) {
  const normalized = normalizeCompletionistText(value);
  if (!normalized) return true;
  return (
    normalized === 'normal' ||
    normalized === 'holo' ||
    normalized === 'holofoil' ||
    normalized === 'reverse' ||
    normalized === 'reverse holo' ||
    normalized === 'reverse holofoil' ||
    normalized === 'non holo' ||
    normalized.includes('pattern holofoil') ||
    normalized.includes('energy symbol') ||
    normalized.includes('poke ball pattern') ||
    normalized.includes('speckled holo') ||
    normalized.includes('line holo') ||
    normalized.includes('master ball') ||
    normalized.includes('stamped holo') ||
    normalized.includes('logo stamp')
  );
}

function getRarityFilterFromText(value?: string | null, allowRawFallback = true): Omit<RarityFilterOption, 'count'> | null {
  const text = String(value ?? '').trim();
  if (!text || isFinishOnlyRarityText(text)) return null;

  const normalized = normalizeCompletionistText(text);
  const matched = RARITY_FILTER_PATTERNS.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(normalized))
  );
  if (matched) {
    return { key: matched.key, label: matched.label, rank: matched.rank };
  }

  if (!allowRawFallback) return null;

  return {
    key: `raw:${normalized}`,
    label: text,
    rank: 500,
  };
}

function isGemPackArtRareCard(card: PokemonCard) {
  const raw = card.raw_data ?? {};
  const setText = normalizeCompletionistText([
    card.set?.name,
    raw?.set_name,
    raw?.set?.name,
  ].filter(Boolean).join(' '));
  const number = normalizeCollectorNumber(card.number ?? raw?.number ?? raw?.num ?? raw?.localId);
  return setText.includes('gem pack') && /^\d{4}$/.test(number);
}

function getCardRarityFilter(card: PokemonCard): Omit<RarityFilterOption, 'count'> | null {
  const raw = card.raw_data ?? {};
  const directCandidates = [
    card.rarity,
    raw?.rarity,
    raw?.rarity_name,
    raw?.rarityName,
    raw?.rarity_code,
    raw?.rarityCode,
    raw?.card_rarity,
    raw?.cardRarity,
    raw?.printed_rarity,
    raw?.printedRarity,
    raw?.details?.rarity,
  ];

  for (const candidate of directCandidates) {
    const rarity = getRarityFilterFromText(candidate);
    if (rarity) return rarity;
  }

  const searchableSourceText = [
    raw?.rarity,
    raw?.original_english_display_name,
    raw?.english_display_name,
    raw?.original_name,
    raw?.display_name,
    raw?.name,
    card.name,
  ].filter(Boolean).join(' ');
  const inferredFromText = getRarityFilterFromText(searchableSourceText, false);
  if (inferredFromText) return inferredFromText;

  if (raw?.secret === true) {
    return { key: 'SR', label: 'SR', rank: 60 };
  }

  if (isGemPackArtRareCard(card)) {
    return { key: 'AR', label: 'AR', rank: 20 };
  }

  return null;
}

function getCompactChipLabel(value: FilterType | SortType) {
  if (value === 'all') return 'All';
  if (value === 'owned') return 'Owned';
  if (value === 'missing') return 'Missing';
  if (value === 'number') return '#';
  if (value === 'name') return 'A-Z';
  return 'Rarity';
}

// ===============================
// CARD ITEM
// ===============================

type CardItemProps = {
  card: PokemonCard;
  variantQuantities: Map<string, number>;
  setId: string;
  onOpenQuantity: (card: PokemonCard, variant: string) => void;
  onQuickAdd: (card: PokemonCard, variant: string) => void;
};

const CardItem = React.memo(({ card, variantQuantities, setId, onOpenQuantity, onQuickAdd }: CardItemProps) => {
  const { theme } = useTheme();
  const variants = useMemo(() => getVariants(card, setId), [card, setId]);
  const quantities = variants.map((v) => variantQuantities.get(getVariantKey(card.id, setId, v)) ?? 0);
  const totalQuantity = quantities.reduce((sum, qty) => sum + qty, 0);
  const anyOwned = totalQuantity > 0;
  const allOwned = variants.every((v) => (variantQuantities.get(getVariantKey(card.id, setId, v)) ?? 0) > 0);
  const slicePct = 100 / variants.length;
  const quickAddVariant = variants.find((variant) => (variantQuantities.get(getVariantKey(card.id, setId, variant)) ?? 0) > 0) ?? variants[0];
  const priceLines = getCardPriceLines(card);
  const displayName = useMemo(() => getSetCardDisplayName(card, card.name), [card]);
  const rarityFilter = useMemo(() => getCardRarityFilter(card), [card]);

  return (
    <View style={{
      width: '48%',
      borderRadius: 16,
      padding: 9,
      borderWidth: 1,
      backgroundColor: anyOwned ? theme.colors.primary + '0F' : 'rgba(255,255,255,0.94)',
      borderColor: allOwned ? theme.colors.primary : anyOwned ? theme.colors.primary + '44' : theme.colors.border,
      marginBottom: 12,
      shadowColor: '#6136F5',
      shadowOpacity: anyOwned ? 0.12 : 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    }}>
      {/* Header: number badge + detail arrow */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <View style={{
          backgroundColor: anyOwned ? theme.colors.primary + '14' : theme.colors.surface,
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: 999,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: anyOwned ? theme.colors.primary : theme.colors.textSoft }}>
            #{card.number}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push(`/card/${card.id}?setId=${setId}`)}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-up-circle-outline" size={18} color={theme.colors.textSoft} />
        </TouchableOpacity>
      </View>

      {/* Image + variant slices */}
      <View style={{
        width: '100%',
        height: 148,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 9,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}>
        <StackrImage
          uri={card.images?.small ?? null}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          rounded={10}
          cacheKey={`${card.id}:${card.imageStatus ?? 'unknown'}:${card.images?.small ?? 'placeholder'}`}
          placeholderColor={theme.colors.surface}
          accessibilityLabel={`${displayName} card image`}
          onError={() => {
            console.log('Card image failed', { cardId: card.id, imageUrl: card.images?.small ?? null });
          }}
        />

        {variants.map((variant, i) => {
          const quantity = variantQuantities.get(getVariantKey(card.id, setId, variant)) ?? 0;
          const owned = quantity > 0;
          return (
            <TouchableOpacity
              key={`${variant}-${i}`}
              onPress={() => onOpenQuantity(card, variant)}
              activeOpacity={0.7}
              style={{
                position: 'absolute',
                left: `${slicePct * i}%` as any,
                width: `${slicePct}%` as any,
                top: 0,
                bottom: 0,
                backgroundColor: owned ? theme.colors.primary + '33' : 'rgba(7,20,95,0.04)',
                borderLeftWidth: i > 0 ? 1 : 0,
                borderColor: 'rgba(255,255,255,0.4)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {owned && (
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
              )}
              {quantity > 1 && (
                <View style={{
                  position: 'absolute',
                  top: 5,
                  alignSelf: 'center',
                  borderRadius: 999,
                  backgroundColor: 'rgba(11,15,42,0.82)',
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900' }}>
                    x{quantity}
                  </Text>
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 3, alignItems: 'center' }}>
                {variant === 'reverseHoloEnergy' ? (
                  <Ionicons name="flash" size={11} color={owned ? theme.colors.primary : 'rgba(255,255,255,0.92)'} />
                ) : variant === 'reverseHoloPokeball' ? (
                  <Ionicons name="aperture" size={11} color={owned ? theme.colors.primary : 'rgba(255,255,255,0.92)'} />
                ) : (
                  <Text style={{
                    fontSize: 9,
                    fontWeight: '900',
                    color: owned ? theme.colors.primary : 'rgba(255,255,255,0.92)',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 2,
                  }}>
                    {shortVariant(variant)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {totalQuantity > 1 && (
          <View style={{
            position: 'absolute',
            top: 6,
            left: 6,
            minWidth: 28,
            height: 28,
            borderRadius: 14,
            paddingHorizontal: 8,
                    backgroundColor: theme.colors.primary,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>
                x{totalQuantity}
              </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => onQuickAdd(card, quickAddVariant)}
          activeOpacity={0.82}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: theme.colors.primary,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
        </TouchableOpacity>
        <RaritySymbol
          rarity={rarityFilter?.label ?? card.rarity}
          size={15}
          style={RARITY_SYMBOL_CARD_OVERLAY}
        />
      </View>

      {/* Name */}
      <Text numberOfLines={2} style={{
        fontSize: 13,
        fontWeight: '800',
        color: theme.colors.text,
        marginBottom: 4,
        minHeight: 34,
      }}>
        {displayName}
      </Text>
      <Text numberOfLines={1} style={{
        marginTop: 6,
        fontSize: 13,
        fontWeight: '900',
        color: priceLines.primary === 'Price unavailable' ? theme.colors.textSoft : theme.colors.text,
      }}>
        {priceLines.primary}
      </Text>
      {priceLines.context ? (
        <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 10, fontWeight: '700', color: theme.colors.textSoft }}>
          {priceLines.context}
        </Text>
      ) : null}
    </View>
  );
});

CardItem.displayName = 'CardItem';

// ===============================
// MAIN COMPONENT
// ===============================

export default function SetDetailScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const setId = Array.isArray(id) ? id[0] : id;

  const [setInfo, setSetInfo] = useState<PokemonSet | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [setLogoFailed, setSetLogoFailed] = useState(false);
  const [variantQuantities, setVariantQuantities] = useState<Map<string, number>>(new Map());
  const [userId, setUserId] = useState<string | null>(null);
  const [quantityTarget, setQuantityTarget] = useState<QuantityTarget>(null);
  const [quantityDraft, setQuantityDraft] = useState('1');
  const [quantitySaving, setQuantitySaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>(ALL_RARITY_FILTER);
  const [sort, setSort] = useState<SortType>('number');
  const [finishSection, setFinishSection] = useState<FinishSectionKey>('pattern');

  // ===============================
  // LOAD DATA
  // ===============================

  const loadSetData = useCallback(async () => {
    if (!setId) return;
    try {
      setLoading(true);
      const language = getRouteSetLanguage(setId);
      const [allSets, fetchedCards] = await Promise.all([
        fetchAllSets({ language }),
        fetchCardsForSet(setId, { language }),
      ]);
      const currentSet = allSets.find((s) => s.id === setId || isSameRouteSetId(s.id, setId)) ?? null;
      setSetInfo(currentSet);
      setCards(fetchedCards);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        let { data: variantRows, error: variantError } = await supabase
          .from('user_card_variants')
          .select('card_id, variant, quantity')
          .eq('user_id', user.id)
          .eq('set_id', setId);

        if (variantError && variantError.message.includes('quantity')) {
          const fallback = await supabase
            .from('user_card_variants')
            .select('card_id, variant')
            .eq('user_id', user.id)
            .eq('set_id', setId);
          variantRows = fallback.data?.map((row) => ({ ...row, quantity: 1 })) ?? [];
          variantError = fallback.error;
        }

        if (variantError) throw variantError;

        setVariantQuantities(new Map(
          (variantRows ?? []).map((row: any) => [
            getVariantKey(row.card_id, setId, row.variant),
            Math.max(1, Number(row.quantity) || 1),
          ])
        ));
      }
    } catch (e) {
      console.log('Failed to load set data', e);
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => { loadSetData(); }, [loadSetData]);

  useEffect(() => {
    setSetLogoFailed(false);
  }, [setId]);

  // ===============================
  // QUANTITY
  // ===============================

  const openQuantityModal = useCallback((card: PokemonCard, variant: string) => {
    const currentQuantity = variantQuantities.get(getVariantKey(card.id, setId ?? '', variant)) ?? 0;
    setQuantityTarget({ card, variant });
    setQuantityDraft(String(Math.max(1, currentQuantity || 1)));
  }, [setId, variantQuantities]);

  const handleSetVariantQuantity = useCallback(async (cardId: string, variant: string, nextQuantity: number) => {
    if (!userId) return;
    const key = getVariantKey(cardId, setId ?? '', variant);
    const previousQuantity = variantQuantities.get(key) ?? 0;
    const targetCard = cards.find((card) => card.id === cardId);

    setVariantQuantities((prev) => {
      const next = new Map(prev);
      if (nextQuantity <= 0) next.delete(key);
      else next.set(key, nextQuantity);
      return next;
    });

    try {
      if (nextQuantity <= 0) {
        await supabase
          .from('user_card_variants')
          .delete()
          .eq('user_id', userId)
          .eq('card_id', cardId)
          .eq('set_id', setId)
          .eq('variant', variant);
        if (previousQuantity > 0) {
          await createActivityPost({
            title: 'Removed from collection',
            subtitle: `${targetCard?.name ?? cardId} · ${shortVariant(variant)}`,
            cardId,
            setId,
            type: 'binder_remove',
            isPositive: false,
          });
        }
        return;
      }

      const { error } = await supabase
        .from('user_card_variants')
        .upsert(
          { user_id: userId, card_id: cardId, set_id: setId, variant, quantity: nextQuantity },
          { onConflict: 'user_id,card_id,set_id,variant' }
      );
      if (error) throw error;
      if (previousQuantity > nextQuantity) {
        await createActivityPost({
          title: `Quantity reduced from ${previousQuantity} to ${nextQuantity}`,
          subtitle: `${targetCard?.name ?? cardId} · ${shortVariant(variant)}`,
          cardId,
          setId,
          type: 'quantity_reduced',
          isPositive: false,
        });
      } else if (previousQuantity === 0 && nextQuantity > 0) {
        await createActivityPost({
          title: 'Added to collection',
          subtitle: `${targetCard?.name ?? cardId} · ${shortVariant(variant)}`,
          cardId,
          setId,
          type: 'binder_add',
          isPositive: true,
        });
      }
    } catch (error: any) {
      setVariantQuantities((prev) => {
        const next = new Map(prev);
        if (previousQuantity <= 0) next.delete(key);
        else next.set(key, previousQuantity);
        return next;
      });

      console.log('Failed to save card quantity', error);
      Alert.alert(
        'Could not save quantity',
        error?.message?.includes('quantity')
          ? 'Quantity tracking needs the new database migration before it can save.'
          : 'Could not save this card quantity.'
      );
      throw error;
    }
  }, [cards, userId, setId, variantQuantities]);

  const handleQuickAddVariant = useCallback(async (card: PokemonCard, variant: string) => {
    const currentQuantity = variantQuantities.get(getVariantKey(card.id, setId ?? '', variant)) ?? 0;
    await handleSetVariantQuantity(card.id, variant, currentQuantity + 1);
  }, [handleSetVariantQuantity, setId, variantQuantities]);

  const saveQuantityModal = useCallback(async () => {
    if (!quantityTarget) return;
    const nextQuantity = Math.max(1, Math.min(99, Number.parseInt(quantityDraft, 10) || 1));

    try {
      setQuantitySaving(true);
      await handleSetVariantQuantity(quantityTarget.card.id, quantityTarget.variant, nextQuantity);
      setQuantityTarget(null);
    } catch {
      // Error is surfaced in handleSetVariantQuantity.
    } finally {
      setQuantitySaving(false);
    }
  }, [handleSetVariantQuantity, quantityDraft, quantityTarget]);

  const removeQuantityModal = useCallback(async () => {
    if (!quantityTarget) return;

    try {
      setQuantitySaving(true);
      await handleSetVariantQuantity(quantityTarget.card.id, quantityTarget.variant, 0);
      setQuantityTarget(null);
    } catch {
      // Error is surfaced in handleSetVariantQuantity.
    } finally {
      setQuantitySaving(false);
    }
  }, [handleSetVariantQuantity, quantityTarget]);

  // ===============================
  // FILTER + SORT
  // ===============================

  const rarityFilterOptions = useMemo<RarityFilterOption[]>(() => {
    const counts = new Map<string, RarityFilterOption>();
    cards.forEach((card) => {
      const rarity = getCardRarityFilter(card);
      if (!rarity) return;
      const existing = counts.get(rarity.key);
      counts.set(rarity.key, {
        ...rarity,
        count: (existing?.count ?? 0) + 1,
        label: existing?.label ?? rarity.label,
        rank: existing?.rank ?? rarity.rank,
      });
    });

    return [
      { key: ALL_RARITY_FILTER, label: 'All', count: cards.length, rank: -1 },
      ...Array.from(counts.values()).sort((a, b) =>
        a.rank === b.rank ? a.label.localeCompare(b.label) : a.rank - b.rank
      ),
    ];
  }, [cards]);

  const completionistFamilyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    cards.forEach((card) => {
      const key = getCardFamilyKey(card);
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [cards]);

  const availableFinishSections = useMemo(() => {
    const counts = new Map<FinishSectionKey, number>();
    cards.forEach((card) => {
      const section = getFinishSectionKey(card, completionistFamilyCounts);
      counts.set(section, (counts.get(section) ?? 0) + 1);
    });
    return FINISH_SECTIONS
      .map((section) => ({ ...section, count: counts.get(section.key) ?? 0 }))
      .filter((section) => section.count > 0);
  }, [cards, completionistFamilyCounts]);

  const hasCompletionistSections = availableFinishSections.length >= 2;

  useEffect(() => {
    if (!hasCompletionistSections) return;
    if (!availableFinishSections.some((section) => section.key === finishSection)) {
      setFinishSection(availableFinishSections[0].key);
    }
  }, [availableFinishSections, finishSection, hasCompletionistSections]);

  useEffect(() => {
    if (
      selectedRarity !== ALL_RARITY_FILTER &&
      !rarityFilterOptions.some((option) => option.key === selectedRarity)
    ) {
      setSelectedRarity(ALL_RARITY_FILTER);
    }
  }, [rarityFilterOptions, selectedRarity]);

  const filteredCards = useMemo(() => {
    let result = cards.filter((card) => {
      const variants = getVariants(card, setId);
      const anyOwned = variants.some((v) => (variantQuantities.get(getVariantKey(card.id, setId ?? '', v)) ?? 0) > 0);
      const displayName = getSetCardDisplayName(card, card.name);
      const matchesSearch =
        displayName.toLowerCase().includes(search.toLowerCase()) ||
        card.name.toLowerCase().includes(search.toLowerCase()) ||
        String(card.localName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        card.number.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        filter === 'all' ||
        (filter === 'owned' && anyOwned) ||
        (filter === 'missing' && !anyOwned);
      const cardRarity = getCardRarityFilter(card);
      const matchesRarity = selectedRarity === ALL_RARITY_FILTER || cardRarity?.key === selectedRarity;
      const matchesFinishSection = !hasCompletionistSections || getFinishSectionKey(card, completionistFamilyCounts) === finishSection;
      return matchesSearch && matchesFilter && matchesRarity && matchesFinishSection;
    });

    if (sort === 'number') result.sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    else if (sort === 'name') result.sort((a, b) => getSetCardDisplayName(a, a.name).localeCompare(getSetCardDisplayName(b, b.name)));
    else if (sort === 'rarity') result.sort((a, b) => {
      const left = getCardRarityFilter(a);
      const right = getCardRarityFilter(b);
      const rankDelta = (left?.rank ?? 999) - (right?.rank ?? 999);
      if (rankDelta !== 0) return rankDelta;
      return (left?.label ?? a.rarity ?? '').localeCompare(right?.label ?? b.rarity ?? '');
    });

    return result;
  }, [cards, variantQuantities, search, filter, selectedRarity, sort, setId, finishSection, hasCompletionistSections, completionistFamilyCounts]);

  const cardGridWindow = useMemo(
    () => getIncrementalListWindow(2, { initialRows: 8, pageRows: 6, minInitial: 16, minPage: 12 }),
    []
  );
  const [visibleCardCount, setVisibleCardCount] = useState(cardGridWindow.initialCount);

  useEffect(() => {
    setVisibleCardCount(Math.min(filteredCards.length, cardGridWindow.initialCount));
  }, [cardGridWindow.initialCount, filteredCards.length, filter, search, selectedRarity, sort, finishSection]);

  const visibleFilteredCards = useMemo(
    () => filteredCards.slice(0, visibleCardCount),
    [filteredCards, visibleCardCount]
  );
  const hasMoreFilteredCards = visibleCardCount < filteredCards.length;
  const renderMoreFilteredCards = useCallback(() => {
    setVisibleCardCount((current) => Math.min(filteredCards.length, current + cardGridWindow.pageSize));
  }, [cardGridWindow.pageSize, filteredCards.length]);

  const ownedCardCount = useMemo(() =>
    cards.filter((c) => getVariants(c, setId).some((v) => (variantQuantities.get(getVariantKey(c.id, setId ?? '', v)) ?? 0) > 0)).length,
    [cards, variantQuantities, setId]
  );

  const knownSetTotal = getKnownPokemonSetTotal(setInfo?.id ?? setId, setInfo?.language ?? getRouteSetLanguage(setId));
  const setTotalValue = Number(setInfo?.printedTotal ?? 0) > 0
    ? Number(setInfo?.printedTotal)
    : Number(setInfo?.total ?? 0) > 0
      ? Number(setInfo?.total)
      : knownSetTotal ?? cards.length;
  const setTotalNumber = typeof setTotalValue === 'number' && Number.isFinite(setTotalValue) && setTotalValue > 0
    ? setTotalValue
    : 0;
  const progressPercent = setTotalNumber > 0
    ? Math.min(100, (ownedCardCount / setTotalNumber) * 100)
    : 0;
  const setTotalLabel = setTotalNumber > 0 ? `${setTotalNumber} cards` : 'total unknown';
  const setLogoSource = getLocalSetArtworkSourceForSet({
    id: setInfo?.id ?? setId,
    language: setInfo?.language ?? getRouteSetLanguage(setId),
    setCode: setInfo?.externalIds?.setCode,
    sourceId: setInfo?.externalIds?.tcgdex ?? setInfo?.externalIds?.pokedata,
    name: setInfo?.name,
    localName: setInfo?.localName,
    englishDisplayName: setInfo?.englishDisplayName,
    externalIds: setInfo?.externalIds,
  });
  const setLogoUrl = setLogoSource ? null : getPokemonSetVisualUrl(setInfo, setInfo?.language ?? getRouteSetLanguage(setId));

  const renderCard = useCallback(({ item: card }: { item: PokemonCard }) => (
    <CardItem
      card={card}
      variantQuantities={variantQuantities}
      setId={setId ?? ''}
      onOpenQuantity={openQuantityModal}
      onQuickAdd={handleQuickAddVariant}
    />
  ), [variantQuantities, setId, openQuantityModal, handleQuickAddVariant]);

  // ===============================
  // LOADING STATE
  // ===============================

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>Loading set...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!setInfo) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Set not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const selectedVariantQuantity = quantityTarget
    ? variantQuantities.get(getVariantKey(quantityTarget.card.id, setId ?? '', quantityTarget.variant)) ?? 0
    : 0;
  const activeFinishSection = hasCompletionistSections
    ? availableFinishSections.find((section) => section.key === finishSection) ?? availableFinishSections[0]
    : null;
  const activeRarityFilter = selectedRarity !== ALL_RARITY_FILTER
    ? rarityFilterOptions.find((option) => option.key === selectedRarity) ?? null
    : null;
  const selectableRarityCount = Math.max(0, rarityFilterOptions.length - 1);
  const showRarityFilters =
    selectableRarityCount > 1 ||
    (hasCompletionistSections && selectableRarityCount > 0) ||
    selectedRarity !== ALL_RARITY_FILTER;

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />
      <View style={{ paddingHorizontal: 16, paddingTop: 2, marginBottom: 2 }}>
        <StackrBackButton onPress={() => router.back()} />
      </View>

      {/* Progress bar — always pinned */}
      <View style={{
        marginHorizontal: 16,
        marginBottom: 8,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: '#6136F5',
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}>
        <LinearGradient
          colors={['rgba(255,255,255,0.98)', '#F8F4FF', '#F2ECFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>Collection Progress</Text>
            <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '900' }}>
              {setTotalNumber > 0 ? `${ownedCardCount} / ${setTotalNumber}` : `${ownedCardCount} owned`}
            </Text>
          </View>
          <View style={{ height: 5, borderRadius: 999, backgroundColor: 'rgba(105,56,245,0.10)', overflow: 'hidden' }}>
            <LinearGradient
              colors={['#8B55FF', '#6938F5', '#5226D9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                height: '100%',
                borderRadius: 999,
                width: `${progressPercent}%` as any,
              }}
            />
          </View>
          <Text style={{ color: theme.colors.textSoft, fontSize: 10.5, fontWeight: '800', marginTop: 5 }}>
            {setTotalNumber > 0 ? `${progressPercent.toFixed(1)}% complete` : 'Total unknown - needs sync'}
          </Text>
        </LinearGradient>
      </View>

      {/* Header */}
      <View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>

          <View style={{
            borderRadius: 18,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 8,
            shadowColor: '#6136F5',
            shadowOpacity: 0.07,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 5 },
            elevation: 2,
          }}>
            <LinearGradient
              colors={['rgba(255,255,255,0.98)', '#F9F6FF', '#F4EFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10 }}
            >
              {(setLogoSource || setLogoUrl) && !setLogoFailed ? (
                <View style={{
                  width: 94,
                  height: 48,
                  borderRadius: 13,
                  backgroundColor: 'rgba(255,255,255,0.62)',
                  borderWidth: 1,
                  borderColor: 'rgba(105,56,245,0.10)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}>
                  <StackrImage
                    source={setLogoSource}
                    uri={setLogoSource ? null : setLogoUrl}
                    style={{ width: 86, height: 36 }}
                    contentFit="contain"
                    showFallbackIcon={false}
                    placeholderColor="transparent"
                    onError={() => setSetLogoFailed(true)}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>{setInfo.name}</Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                  {[setInfo.series, setTotalLabel].filter(Boolean).join(' - ')}
                </Text>
              </View>
            </LinearGradient>
          </View>

          <StackrActionButton
            title="Create Binder"
            subtitle="Build this set in your vault"
            icon="albums-outline"
            variant="primary"
            size="compact"
            showArrow
            onPress={() => router.push({
              pathname: '/binder/new',
              params: {
                sourceSetId: setInfo?.id ?? setId,
                type: 'official',
                language: setInfo?.language ?? getRouteSetLanguage(setId),
              },
            })}
            style={{ marginBottom: 8 }}
          />

          {/* Search */}
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.96)',
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 8,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            shadowColor: '#6136F5',
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 1,
          }}>
            <Ionicons name="search" size={16} color={theme.colors.textSoft} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search cards..."
              placeholderTextColor={theme.colors.textSoft}
              autoCorrect={false}
              autoCapitalize="words"
              style={{ flex: 1, color: theme.colors.text, fontSize: 15 }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSoft} />
              </TouchableOpacity>
            )}
          </View>

          {hasCompletionistSections ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 7, paddingBottom: 6, alignItems: 'center' }}
            >
              {availableFinishSections.map((section) => {
                const active = finishSection === section.key;
                return (
                  <TouchableOpacity
                    key={section.key}
                    onPress={() => setFinishSection(section.key)}
                    style={{
                      minHeight: 34,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      backgroundColor: active ? theme.colors.primary : 'rgba(255,255,255,0.94)',
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontSize: 12, fontWeight: '900' }}>
                      {section.shortLabel}
                    </Text>
                    <Text style={{ color: active ? 'rgba(255,255,255,0.78)' : theme.colors.textSoft, fontSize: 11, fontWeight: '900' }}>
                      {section.count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 7, paddingBottom: 2, alignItems: 'center' }}
          >
            {(['all', 'owned', 'missing'] as FilterType[]).map((item) => {
              const active = filter === item;
              return (
                <TouchableOpacity
                  key={item}
                  onPress={() => setFilter(item)}
                  style={{
                    minHeight: 32,
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    backgroundColor: active ? theme.colors.primary : 'rgba(255,255,255,0.94)',
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Text style={{ fontWeight: '900', fontSize: 12, color: active ? '#FFFFFF' : theme.colors.textSoft }}>
                    {getCompactChipLabel(item)}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <View style={{ width: 1, height: 22, backgroundColor: theme.colors.border, marginHorizontal: 2 }} />

            {(['number', 'name', 'rarity'] as SortType[]).map((item) => {
              const active = sort === item;
              return (
                <TouchableOpacity
                  key={item}
                  onPress={() => setSort(item)}
                  style={{
                    minHeight: 32,
                    paddingVertical: 7,
                    paddingHorizontal: item === 'number' ? 11 : 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    backgroundColor: active ? theme.colors.primary + '14' : 'rgba(255,255,255,0.94)',
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Text style={{ fontWeight: '900', fontSize: 12, color: active ? theme.colors.primary : theme.colors.textSoft }}>
                    {getCompactChipLabel(item)}
                  </Text>
                </TouchableOpacity>
              );
            })}

          </ScrollView>

          {showRarityFilters ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 7, paddingTop: 6, paddingBottom: 2, alignItems: 'center' }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '900', marginRight: 1 }}>
                Rarity
              </Text>
              {rarityFilterOptions.map((rarity) => {
                const active = selectedRarity === rarity.key;
                return (
                  <TouchableOpacity
                    key={rarity.key}
                    onPress={() => setSelectedRarity(rarity.key)}
                    style={{
                      minHeight: 31,
                      paddingVertical: 7,
                      paddingHorizontal: 11,
                      borderRadius: 999,
                      borderWidth: 1,
                      backgroundColor: active ? theme.colors.primary + '14' : 'rgba(255,255,255,0.94)',
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Text style={{ fontWeight: '900', fontSize: 12, color: active ? theme.colors.primary : theme.colors.textSoft }}>
                      {rarity.label}
                    </Text>
                    {rarity.key !== ALL_RARITY_FILTER ? (
                      <Text style={{ fontWeight: '900', fontSize: 10.5, color: active ? theme.colors.primary : theme.colors.textSoft }}>
                        {rarity.count}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      </View>

      {/* Card grid */}
      <FlatList
        data={visibleFilteredCards}
        keyExtractor={(item, index) => `${setId ?? item.set?.id ?? 'set'}:${item.id}:${item.number ?? 'no-number'}:${item.rarity ?? 'rarity'}:${index}`}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        renderItem={renderCard}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: stackrTabContentPadding.standard, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={12}
        removeClippedSubviews
        onEndReached={hasMoreFilteredCards ? renderMoreFilteredCards : undefined}
        onEndReachedThreshold={0.8}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Cards</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '700' }}>
              {[activeFinishSection?.shortLabel, activeRarityFilter?.label, `${filteredCards.length} shown`].filter(Boolean).join(' - ')}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>No cards match your filters.</Text>
          </View>
        }
        ListFooterComponent={hasMoreFilteredCards ? (
          <View style={{ height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
          </View>
        ) : null}
      />

      <Modal visible={quantityTarget !== null} animationType="slide" transparent>
        <View style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(15,23,42,0.35)',
        }}>
          <View style={{
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: 34,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <StackrImage
                uri={quantityTarget?.card.images?.small ?? null}
                style={{ width: 58, height: 80, borderRadius: 8, backgroundColor: theme.colors.surface }}
                contentFit="contain"
                rounded={8}
                cacheKey={`${quantityTarget?.card.id ?? 'card'}:${quantityTarget?.card.imageStatus ?? 'unknown'}:${quantityTarget?.card.images?.small ?? 'placeholder'}`}
                accessibilityLabel={`${getSetCardDisplayName(quantityTarget?.card, 'Card')} card image`}
                onError={() => {
                  console.log('Card modal image failed', {
                    cardId: quantityTarget?.card.id ?? null,
                    imageUrl: quantityTarget?.card.images?.small ?? null,
                  });
                }}
              />

              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                  {getSetCardDisplayName(quantityTarget?.card, 'Card')}
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800', marginTop: 4 }}>
                  {quantityTarget ? shortVariant(quantityTarget.variant) : ''} · #{quantityTarget?.card.number ?? ''}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setQuantityTarget(null)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13, marginBottom: 8 }}>
              Quantity owned
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => setQuantityDraft((value) => String(Math.max(1, (Number.parseInt(value, 10) || 1) - 1)))}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="remove" size={20} color={theme.colors.text} />
              </TouchableOpacity>

              <TextInput
                value={quantityDraft}
                onChangeText={(value) => setQuantityDraft(value.replace(/[^0-9]/g, '').slice(0, 2) || '1')}
                keyboardType="number-pad"
                selectTextOnFocus
                style={{
                  flex: 1,
                  minHeight: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.bg,
                  color: theme.colors.text,
                  fontSize: 20,
                  fontWeight: '900',
                  textAlign: 'center',
                }}
              />

              <TouchableOpacity
                onPress={() => setQuantityDraft((value) => String(Math.min(99, (Number.parseInt(value, 10) || 1) + 1)))}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={saveQuantityModal}
              disabled={quantitySaving}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: quantitySaving ? 0.65 : 1,
              }}
            >
              {quantitySaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>Save quantity</Text>
              )}
            </TouchableOpacity>

            {selectedVariantQuantity > 0 && (
              <TouchableOpacity
                onPress={removeQuantityModal}
                disabled={quantitySaving}
                style={{ alignItems: 'center', paddingVertical: 13, marginTop: 4 }}
              >
                <Text style={{ color: '#EF4444', fontWeight: '900' }}>Mark as missing</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
