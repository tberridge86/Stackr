import { useTheme } from '../../components/theme-context';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Alert,
  Image,
  FlatList,
  Modal,
  StyleSheet,
  type ImageSourcePropType,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '../../components/Text';
import { StackrProfileAvatar } from '../../components/StackrProfileAvatar';
import {
  EmptyStateCard,
} from '../../components/PremiumUI';
import { BinderArtwork } from '../../components/BinderArtwork';
import { BINDER_MODE_BADGE_SOURCES, BinderModeIconBadge } from '../../components/BinderModeBadge';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  fetchBinders,
  deleteBinder,
  BinderRecord,
} from '../../lib/binders';
import {
  loadCollectionPrices,
  type CollectionPriceInput,
} from '../../lib/collectionPricingApi';
import {
  getCollectionPriceCoverageLabel,
  summariseCollectionPricing,
  type CollectionPricingSummary,
} from '../../lib/collectionPricingState';
import { fetchOwnedCardRows, type OwnedCardRow } from '../../lib/ownership';
import { supabase } from '../../lib/supabase';
import {
  getKnownPokemonSetTotal,
  getPokemonSetLogoUrl,
  normalizePokemonCardLanguage,
  normalizePokemonSetId,
  type PokemonCardLanguage,
} from '../../lib/pokemonTcg';
import { getJapaneseSetLogoSourceForSet } from '../../lib/japaneseSetLogos';
import { StackrHeroBackdrop } from '../../components/StackrBackdrop';
import { StackrActionButton } from '../../components/StackrActionButton';
import { StackrButtonPattern } from '../../components/StackrEmboss';
import { StackrImage } from '../../components/StackrImage';
import { useProfile } from '../../components/profile-context';
import { numericTextStyle, typeScale } from '../../lib/typography';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { stackrListPerformance } from '../../lib/performance';
import { ROUTES } from '../../lib/routes';
import { stackrQueryClient, stackrQueryKeys, stackrQueryTiming } from '../../lib/stackrQuery';
import {
  getCustomBinderNameArt,
  getCustomBinderNameArtKeyForBinder,
  getDefaultCustomBinderNameArtKey,
} from '../../lib/customBinderNameArt';
import DraggableFlatList, {
  ScaleDecorator,
  ShadowDecorator,
  OpacityDecorator,
} from 'react-native-draggable-flatlist';

// ===============================
// TYPES
// ===============================

type BinderCardCount = { owned: number; total: number | null; totalKnown: boolean };
type BinderCardCountMap = Record<string, BinderCardCount>;
type BinderMasterSetMap = Record<string, boolean>;

type SortKey =
  | 'recent'
  | 'alphabetical'
  | 'completionHigh'
  | 'completionLow'
  | 'ownedHigh'
  | 'ownedLow'
  | 'valueHigh'
  | 'valueLow';

// ===============================
// CONSTANTS
// ===============================

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'alphabetical', label: 'A-Z' },
  { key: 'completionHigh', label: 'Most complete' },
  { key: 'completionLow', label: 'Least complete' },
  { key: 'ownedHigh', label: 'Most cards' },
  { key: 'ownedLow', label: 'Fewest cards' },
  { key: 'valueHigh', label: 'Highest value' },
  { key: 'valueLow', label: 'Lowest value' },
];

const PADDING = 16;
const GAP = 10;
const BINDER_GRID_ARTWORK = {
  minWidth: 112,
  maxWidth: 136,
  stageHeight: 128,
  plateWidth: 94,
  plateHeight: 110,
  artworkWidth: 104,
  artworkHeight: 116,
  progressWidth: 90,
  progressHeight: 4,
};
const BINDER_GRID_ENGLISH_LOGO_HEIGHT = 31;
const BINDER_GRID_JAPANESE_LOGO_HEIGHT = 52;
const CUSTOM_BINDER_GRID_LOGO_HEIGHT = 22;
const COLLECTION_VAULT_SHORTCUTS: {
  label: string;
  imageIcon: ImageSourcePropType;
  route: '/(tabs)/explore' | '/(tabs)/pokedex' | '/duplicates';
}[] = [
  { label: 'Discover Sets', imageIcon: stackrIcons.setDiscovery, route: '/(tabs)/explore' as const },
  { label: 'Pokédex', imageIcon: stackrIcons.pokedex, route: '/(tabs)/pokedex' as const },
  { label: 'Duplicates', imageIcon: stackrIcons.duplicates, route: '/duplicates' as const },
];

const STACKR_BINDER_COLORS = {
  bg: '#FFFFFF',
  softLavender: '#F7F3FF',
  palePurple: '#EEE7FF',
  border: '#E8E1FF',
  primary: '#6938F5',
  brightPurple: '#7C3CFF',
  deepViolet: '#5226D9',
  navy: '#07145F',
  deepNavy: '#040B3F',
  textSoft: '#716BA8',
  muted: '#8A84B8',
  gold: '#FFBE35',
};

const EMPTY_BINDER_COUNT: BinderCardCount = { owned: 0, total: null, totalKnown: false };

const lavenderShadow = {
  shadowColor: '#6136F5',
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
  elevation: 5,
};

const SET_VARIANT_OVERRIDES: Record<string, Partial<Record<string, string[]>>> = {
  asc: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  me2pt5: {
    Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
  },
  me3: {
    Common: ['normal', 'reverseHolofoil'],
    Uncommon: ['normal', 'reverseHolofoil'],
  },
};

// ===============================
// HELPERS
// ===============================

const getBinderLogoUrl = (item: BinderRecord): string | null => {
  return item.source_set_logo_url
    ?? item.source_set_symbol_url
    ?? getPokemonSetLogoUrl(item.source_set_id, item.language)
    ?? null;
};

const getBinderLogoSource = (item: BinderRecord): ImageSourcePropType | null => {
  return getJapaneseSetLogoSourceForSet({
    id: item.source_set_id,
    language: item.language,
    name: item.source_set_display_name ?? item.name,
    localName: item.source_set_local_name,
    englishDisplayName: item.source_set_english_display_name,
  });
};

const stripSetLanguagePrefix = (setId?: string | null) =>
  String(setId ?? '').trim().replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, '');

const inferBinderLanguage = (language?: string | null, setId?: string | null): PokemonCardLanguage => {
  const explicit = String(language ?? '').trim();
  if (explicit) return normalizePokemonCardLanguage(explicit);
  const rawSetId = String(setId ?? '').trim().toLowerCase();
  const strippedSetId = stripSetLanguagePrefix(rawSetId);
  if (/^(zh-tw|zh_tw|zhtw|zh):/i.test(rawSetId)) return 'zh-tw';
  return rawSetId.startsWith('ja:') || rawSetId.startsWith('jp:') || /^sv\d+[a-z]$/i.test(strippedSetId) ? 'ja' : 'en';
};

const getLanguageSetKey = (setId?: string | null, language?: string | null) =>
  `${inferBinderLanguage(language, setId)}:${normalizePokemonSetId(stripSetLanguagePrefix(setId))}`;

const getSetLookupCandidates = (setId?: string | null) => {
  const raw = String(setId ?? '').trim();
  if (!raw) return [];
  const stripped = stripSetLanguagePrefix(raw);
  return [...new Set([raw, stripped, `ja:${stripped}`, `zh-tw:${stripped}`, `en:${stripped}`].filter(Boolean))];
};

const getCountTotal = (count?: BinderCardCount) =>
  count?.totalKnown && typeof count.total === 'number' && count.total > 0 ? count.total : null;

const getBinderProgressPercent = (count?: BinderCardCount) => {
  const total = getCountTotal(count);
  if (!total) return 0;
  return Math.min(100, Math.round((count?.owned ?? 0) / total * 100));
};

const getBinderOwnedLabel = (count?: BinderCardCount) => {
  const total = getCountTotal(count);
  const owned = count?.owned ?? 0;
  return total ? `${owned}/${total} owned` : owned > 0 ? `${owned} owned - needs sync` : 'Total unknown - needs sync';
};

const readStoredSetTotal = (set: { printed_total?: number | null; total?: number | null }) => {
  const printedTotal = Number(set.printed_total ?? 0);
  if (Number.isFinite(printedTotal) && printedTotal > 0) return printedTotal;
  const total = Number(set.total ?? 0);
  return Number.isFinite(total) && total > 0 ? total : null;
};

function CollectionVaultShortcutButton({
  label,
  imageIcon,
  onPress,
}: {
  label: string;
  imageIcon: ImageSourcePropType;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const displayLabel = /^pok/i.test(label) && /dex/i.test(label) ? 'Pok\u00E9dex' : label;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Open ${displayLabel}`}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 62,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.74)',
        borderWidth: 1,
        borderColor: theme.colors.primary + '18',
        paddingHorizontal: 8,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        shadowColor: '#6136F5',
        shadowOpacity: 0.03,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
        }}
      >
        <View
          style={{
            width: 36,
            height: 34,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={imageIcon}
            style={{ width: 30, height: 30 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.76}
          style={{
            ...typeScale.caption,
            color: STACKR_BINDER_COLORS.deepNavy,
            fontWeight: '900',
            fontSize: 11.4,
            lineHeight: 14,
            textAlign: 'center',
          }}
        >
          {displayLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ===============================
// BINDER CARD COMPONENT
// ===============================

type BinderCardProps = {
  item: BinderRecord;
  counts: BinderCardCountMap;
  masterSets: BinderMasterSetMap;
  value: BinderPricingSummary | null;
  customNameArtKey?: string | null;
  confirmDeleteBinder: (binder: BinderRecord) => void;
  index: number;
  cardWidth: number;
  columns: number;
};

function BinderOptionsSheet({
  binder,
  visible,
  onClose,
  onEdit,
  onDelete,
}: {
  binder: BinderRecord;
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isGraded = binder.card_mode === 'graded';

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4,11,63,0.34)', padding: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close binder options"
          onPress={onClose}
          style={{ ...StyleSheet.absoluteFillObject }}
        />
        <View
          style={{
            borderRadius: 24,
            backgroundColor: STACKR_BINDER_COLORS.bg,
            borderWidth: 1,
            borderColor: STACKR_BINDER_COLORS.border,
            overflow: 'hidden',
            shadowColor: '#6136F5',
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 14 },
            elevation: 10,
          }}
        >
          <StackrHeroBackdrop opacity={0.20} />
          <View style={{ padding: 18, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 17,
                  backgroundColor: STACKR_BINDER_COLORS.softLavender,
                  borderWidth: 1,
                  borderColor: STACKR_BINDER_COLORS.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  source={isGraded ? stackrIcons.profile : stackrIcons.binders}
                  style={{ width: 32, height: 32 }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...typeScale.cardTitle, color: STACKR_BINDER_COLORS.deepNavy, fontSize: 18, lineHeight: 22, fontWeight: '900' }} numberOfLines={1}>
                  Binder options
                </Text>
                <Text style={{ ...typeScale.caption, color: STACKR_BINDER_COLORS.textSoft, fontSize: 12.5, lineHeight: 17, fontWeight: '800' }} numberOfLines={2}>
                  {binder.name}
                </Text>
              </View>
            </View>

            <View style={{ gap: 9 }}>
              <TouchableOpacity
                onPress={onEdit}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${binder.name}`}
                style={{
                  minHeight: 50,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.84)',
                  borderWidth: 1,
                  borderColor: STACKR_BINDER_COLORS.border,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <View style={{ width: 30, height: 30, borderRadius: 12, backgroundColor: STACKR_BINDER_COLORS.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="create-outline" size={17} color={STACKR_BINDER_COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: STACKR_BINDER_COLORS.deepNavy, fontSize: 14, lineHeight: 18, fontWeight: '900' }}>
                    Edit binder
                  </Text>
                  <Text style={{ color: STACKR_BINDER_COLORS.textSoft, fontSize: 11.5, lineHeight: 15, fontWeight: '700' }}>
                    Name, artwork, visibility and setup
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={STACKR_BINDER_COLORS.textSoft} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDelete}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${binder.name}`}
                style={{
                  minHeight: 50,
                  borderRadius: 16,
                  backgroundColor: '#FFF5F5',
                  borderWidth: 1,
                  borderColor: '#FCA5A5',
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <View style={{ width: 30, height: 30, borderRadius: 12, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash-outline" size={17} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#991B1B', fontSize: 14, lineHeight: 18, fontWeight: '900' }}>
                    Delete binder
                  </Text>
                  <Text style={{ color: '#B45309', fontSize: 11.5, lineHeight: 15, fontWeight: '700' }}>
                    Requires confirmation before anything changes
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel="Cancel binder options"
              style={{
                minHeight: 46,
                borderRadius: 16,
                backgroundColor: STACKR_BINDER_COLORS.softLavender,
                borderWidth: 1,
                borderColor: STACKR_BINDER_COLORS.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: STACKR_BINDER_COLORS.deepNavy, fontSize: 13.5, fontWeight: '900' }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BinderCard({ item, counts, masterSets, value, customNameArtKey, confirmDeleteBinder, index, cardWidth, columns }: BinderCardProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const progress = counts[item.id] ?? EMPTY_BINDER_COUNT;
  const isOfficial = item.type === 'official';
  const isMasterSet = masterSets[item.id] === true;
  const isGraded = item.card_mode === 'graded';
  const isJapanese = normalizePokemonCardLanguage(item.language) === 'ja';
  const knownTotal = isOfficial ? getCountTotal(progress) : null;
  const percentage = isOfficial ? getBinderProgressPercent(progress) : 0;
  const innerWidth = Math.max(106, cardWidth - 16);
  const logoSource = isOfficial ? getBinderLogoSource(item) : null;
  const logoUrl = isOfficial && !logoSource ? getBinderLogoUrl(item) : null;
  const customNameArt = item.type === 'custom'
    ? getCustomBinderNameArt(customNameArtKey ?? getDefaultCustomBinderNameArtKey(`${item.id}:${item.name}`))
    : null;
  const labelLogoSource = customNameArt ? null : logoSource;
  const labelLogoUrl = customNameArt ? null : logoUrl;
  const hasBinderLabel = Boolean(customNameArt || labelLogoSource || labelLogoUrl);
  const shouldShowNameText = !labelLogoSource && !labelLogoUrl;
  const artWidth = Math.min(
    BINDER_GRID_ARTWORK.maxWidth,
    Math.max(BINDER_GRID_ARTWORK.minWidth, innerWidth + 2)
  );
  const nameIsLong = item.name.length > 24;
  const officialLogoHeight = isJapanese ? BINDER_GRID_JAPANESE_LOGO_HEIGHT : BINDER_GRID_ENGLISH_LOGO_HEIGHT;
  const officialLogoFrameHeight = officialLogoHeight + (isJapanese ? 14 : 8);
  const officialLogoWidth = isJapanese ? '100%' : '86%';
  const footerMinHeight = hasBinderLabel
    ? customNameArt
      ? 72
      : isJapanese
        ? 108
        : 80
    : 58;
  const fallbackNameFontSize = isJapanese
    ? hasBinderLabel ? 15 : nameIsLong ? 15 : 17
    : hasBinderLabel ? 9 : nameIsLong ? 9 : 10;
  const fallbackNameLineHeight = isJapanese
    ? hasBinderLabel ? 18 : nameIsLong ? 18 : 20
    : hasBinderLabel ? 11 : nameIsLong ? 11 : 12;
  const valueLabel = value?.total != null ? `£${value.total.toFixed(2)}` : 'Price unavailable';
  const valueCaption = value
    ? getCollectionPriceCoverageLabel(value)
    : 'Checking stored prices';
  const staleValue = value?.staleUnits ? ' · may be stale' : '';

  // Column-based rotation
  const col = index % columns;
  const rotation = col === 0 ? '0deg' : col === 2 ? '0deg' : '0deg';

  const handleOptions = () => {
    setOptionsOpen(true);
  };

  const handleEditBinder = () => {
    setOptionsOpen(false);
    router.push({ pathname: '/binder/new', params: { id: item.id } });
  };

  const handleDeleteBinder = () => {
    setOptionsOpen(false);
    requestAnimationFrame(() => confirmDeleteBinder(item));
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/binder/[id]', params: { id: item.id } })}
        onLongPress={handleOptions}
        delayLongPress={400}
        activeOpacity={0.85}
        style={{
          width: cardWidth,
          marginBottom: 16,
          backgroundColor: STACKR_BINDER_COLORS.bg,
          borderRadius: 21,
          padding: 8,
          borderWidth: 1,
          borderColor: isOfficial && knownTotal && percentage >= 100 ? `${STACKR_BINDER_COLORS.gold}66` : STACKR_BINDER_COLORS.border,
          ...lavenderShadow,
          transform: [{ rotate: rotation }],
        }}
      >
      {/* Binder art */}
      <View style={{
        width: innerWidth,
        minHeight: isOfficial ? 154 : 136,
        borderRadius: 18,
        overflow: 'visible',
        borderWidth: 0,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 2,
      }}>
        <BinderArtwork
          coverKey={item.cover_key}
          sourceSetId={isOfficial ? item.source_set_id : null}
          sourceSetLanguage={isOfficial ? item.language : null}
          setName={isOfficial ? item.name : null}
          fallbackLogoUrl={logoUrl}
          fallbackLogoSource={logoSource}
          fallbackArtSource={customNameArt?.source ?? null}
          fallbackColor={item.color}
          progress={percentage}
          width={artWidth}
          stageHeight={BINDER_GRID_ARTWORK.stageHeight}
          plateWidth={BINDER_GRID_ARTWORK.plateWidth}
          plateHeight={BINDER_GRID_ARTWORK.plateHeight}
          artworkWidth={BINDER_GRID_ARTWORK.artworkWidth}
          artworkHeight={BINDER_GRID_ARTWORK.artworkHeight}
          progressWidth={BINDER_GRID_ARTWORK.progressWidth}
          progressHeight={BINDER_GRID_ARTWORK.progressHeight}
          showProgressBar={isOfficial}
          showProgressText={false}
        />
        {isOfficial ? (
          <LinearGradient
            colors={['#8B55FF', '#6938F5', '#5226D9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              alignSelf: 'center',
              marginTop: 3,
              minWidth: 38,
              height: 18,
              paddingHorizontal: 10,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.62)',
              shadowColor: STACKR_BINDER_COLORS.primary,
              shadowOpacity: 0.18,
              shadowRadius: 7,
              shadowOffset: { width: 0, height: 3 },
            }}
          >
            <StackrButtonPattern tone="purple" />
            <Text
              numeric
              style={{
                ...numericTextStyle,
                color: '#FFFFFF',
                fontSize: 9.5,
                lineHeight: 12,
                fontWeight: '900',
              }}
            >
              {knownTotal ? `${percentage}%` : 'Sync'}
            </Text>
          </LinearGradient>
        ) : null}

        {/* Options button */}
        <Pressable
          onPress={handleOptions}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            position: 'absolute',
            top: 8, right: 8,
            width: 30, height: 30,
            borderRadius: 15,
            backgroundColor: 'rgba(247,243,255,0.92)',
            borderWidth: 1,
            borderColor: STACKR_BINDER_COLORS.border,
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            shadowColor: '#6136F5',
            shadowOpacity: 0.10,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={STACKR_BINDER_COLORS.textSoft} />
        </Pressable>
        {(isMasterSet || isGraded || isJapanese) && (
          <View style={{ position: 'absolute', left: 7, top: 7, flexDirection: 'row', gap: 3 }}>
            {isJapanese ? (
              <View style={{
                width: 36,
                height: 22,
                borderRadius: 11,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: STACKR_BINDER_COLORS.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ color: STACKR_BINDER_COLORS.primary, fontSize: 10, fontWeight: '900' }}>
                  JP
                </Text>
              </View>
            ) : null}
            {isGraded ? <BinderModeIconBadge type="graded" size={38} /> : null}
            {isMasterSet ? <BinderModeIconBadge type="master" size={38} /> : null}
          </View>
        )}

      </View>

      {/* Footer */}
      <View style={{ marginTop: 5, minHeight: footerMinHeight, overflow: 'visible' }}>
        {customNameArt ? (
          <View style={{ minHeight: CUSTOM_BINDER_GRID_LOGO_HEIGHT + 4, justifyContent: 'center', marginBottom: 1 }}>
            <Image source={customNameArt.source} style={{ width: '100%', height: CUSTOM_BINDER_GRID_LOGO_HEIGHT }} resizeMode="contain" />
          </View>
        ) : labelLogoSource ? (
          <View style={{ minHeight: officialLogoFrameHeight, justifyContent: 'center', alignItems: 'center', marginBottom: 0, overflow: 'visible', paddingHorizontal: isJapanese ? 2 : 0 }}>
            <Image source={labelLogoSource} style={{ width: officialLogoWidth, height: officialLogoHeight }} resizeMode="contain" />
          </View>
        ) : labelLogoUrl ? (
          <View style={{ minHeight: officialLogoFrameHeight, justifyContent: 'center', alignItems: 'center', marginBottom: 0, overflow: 'visible', paddingHorizontal: isJapanese ? 2 : 0 }}>
            <StackrImage
              uri={labelLogoUrl}
              style={{ width: officialLogoWidth, height: officialLogoHeight, backgroundColor: 'transparent' }}
              contentFit="contain"
              priority="low"
              showFallbackIcon={false}
            />
          </View>
        ) : null}
        {shouldShowNameText ? (
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            style={{
              ...typeScale.cardTitle,
              color: STACKR_BINDER_COLORS.navy,
              fontSize: fallbackNameFontSize,
              lineHeight: fallbackNameLineHeight,
              fontWeight: '800',
              textAlign: 'center',
            }}
          >
            {item.name}
          </Text>
        ) : null}
        <View style={{ marginTop: 5, backgroundColor: STACKR_BINDER_COLORS.softLavender, borderRadius: 12, borderWidth: 1, borderColor: STACKR_BINDER_COLORS.border, paddingHorizontal: 8, paddingVertical: 6, gap: 2 }}>
          <Text numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={{ ...numericTextStyle, color: STACKR_BINDER_COLORS.primary, fontSize: 12.5, lineHeight: 15, fontWeight: '900', textAlign: 'center' }}>
            {valueLabel}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ ...typeScale.caption, color: STACKR_BINDER_COLORS.textSoft, fontSize: 11.5, lineHeight: 14, fontWeight: '900', textAlign: 'center' }}>
            {valueCaption}{staleValue}
          </Text>
        </View>
      </View>
      </TouchableOpacity>
      <BinderOptionsSheet
        binder={item}
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onEdit={handleEditBinder}
        onDelete={handleDeleteBinder}
      />
    </>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

type BinderPricingSummary = CollectionPricingSummary;
type BinderValueMap = Record<string, BinderPricingSummary>;

type BinderSummaryRow = {
  id: string;
  binder_id: string;
  card_id: string;
  api_card_id?: string | null;
  card_name?: string | null;
  set_id: string | null;
  language?: PokemonCardLanguage | null;
  owned: boolean | null;
  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  condition?: string | null;
  owned_quantity?: number | null;
  grade_company?: string | null;
  grade?: string | null;
};

type BinderOfficialCardRow = {
  id: string;
  set_id: string | null;
  language?: PokemonCardLanguage | null;
  name?: string | null;
  number?: string | null;
  rarity?: string | null;
  raw_data?: any;
};

type OwnedVariantRow = {
  card_id: string;
  set_id: string | null;
  language?: PokemonCardLanguage | null;
  variant: string | null;
};

type BinderLibraryOverviewSnapshot = {
  binders: BinderRecord[];
  customNameArtKeys: Record<string, string>;
};

type BinderLibrarySummarySnapshot = {
  counts: BinderCardCountMap;
  masterSets: BinderMasterSetMap;
  values: BinderValueMap;
};

const EMPTY_BINDER_LIBRARY_SUMMARY: BinderLibrarySummarySnapshot = {
  counts: {},
  masterSets: {},
  values: {},
};

const BINDER_SUMMARY_COUNT_VERSION = 'set-total-known-state-v3';
const getMasterSetStorageKey = (binderId: string) => `stackr:binder-master-set:${binderId}`;

const getBinderLibrarySignature = (data: BinderRecord[]) =>
  [BINDER_SUMMARY_COUNT_VERSION, data
    .map((binder) => [
      binder.id,
      binder.created_at ?? '',
      binder.source_set_id ?? '',
      binder.master_set_enabled ? 'master' : 'standard',
      binder.card_mode ?? '',
    ].join(':'))
    .join('|') || 'empty'].join('|');

const getVariants = (card: any, explicitSetId?: string | null): string[] => {
  const setId = String(explicitSetId ?? card?.set?.id ?? card?.set_id ?? '').toLowerCase();
  const setName = String(card?.set?.name ?? card?.raw_data?.set?.name ?? '').toLowerCase();
  let override = SET_VARIANT_OVERRIDES[setId] || SET_VARIANT_OVERRIDES[setId.toUpperCase()];

  if (!override && setName.includes('ascended')) {
    override = {
      Common: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
      Uncommon: ['normal', 'reverseHoloEnergy', 'reverseHoloPokeball'],
    };
  }

  if (override && card?.rarity) {
    const rarity = String(card.rarity);
    const variants =
      override[rarity] ||
      override[rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase()] ||
      override[rarity.toLowerCase()];
    if (variants) return variants;
  }

  const prices = card?.tcgplayer?.prices ?? card?.raw_data?.tcgplayer?.prices;
  const keys = Object.keys(prices ?? {}).filter((key) => key !== 'unlimited');
  if (keys.length > 1) return keys;
  return keys.length > 0 ? [keys[0]] : ['normal'];
};

export default function BinderLibraryScreen() {
  const { theme } = useTheme();
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const COLUMNS = width >= 900 ? 5 : width >= 600 ? 3 : 2;
  const binderCardWidth = (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const heroTitleWidth = Math.min(238, Math.max(204, width - PADDING * 2 - 116));

  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [counts, setCounts] = useState<BinderCardCountMap>({});
  const [masterSets, setMasterSets] = useState<BinderMasterSetMap>({});
  const [values, setValues] = useState<BinderValueMap>({});
  const [customNameArtKeys, setCustomNameArtKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const loadedOnceRef = useRef(false);

  // ===============================
  // SCAN (scaffolded — coming soon)
  // ===============================

  const handleScanCard = async () => {
  router.push('/scan');
};

  // ===============================
  // LOAD
  // ===============================

  const applyBinderOverviewSnapshot = useCallback((snapshot: BinderLibraryOverviewSnapshot) => {
    setBinders(snapshot.binders);
    setCustomNameArtKeys(snapshot.customNameArtKeys);
  }, []);

  const applyBinderSummarySnapshot = useCallback((snapshot: BinderLibrarySummarySnapshot) => {
    setCounts(snapshot.counts);
    setMasterSets(snapshot.masterSets);
    setValues(snapshot.values);
  }, []);

  const fetchBinderOverviewSnapshot = useCallback(async (): Promise<BinderLibraryOverviewSnapshot> => {
    const data = await fetchBinders();
    const customArtEntries = await Promise.all(
      data
        .filter((binder) => binder.type === 'custom')
        .map(async (binder) => [
          binder.id,
          await getCustomBinderNameArtKeyForBinder(binder.id, binder.name),
        ] as const)
    );

    return {
      binders: data,
      customNameArtKeys: Object.fromEntries(customArtEntries),
    };
  }, []);

  const fetchBinderSummarySnapshot = useCallback(async (
    data: BinderRecord[],
    currentUserId?: string | null
  ): Promise<BinderLibrarySummarySnapshot> => {
    const binderIds = data.map((binder) => binder.id);

    if (!binderIds.length) {
      return EMPTY_BINDER_LIBRARY_SUMMARY;
    }

    const setIds = data.map((binder) => binder.source_set_id).filter(Boolean) as string[];
    const setIdCandidates = [...new Set(setIds.flatMap(getSetLookupCandidates))];
    const storedMasterEntries = await Promise.all(
      data.map(async (binder) => {
        const stored = await AsyncStorage.getItem(getMasterSetStorageKey(binder.id));
        return [binder.id, stored === 'true' || binder.master_set_enabled === true] as const;
      })
    );
    const nextMasterSets = Object.fromEntries(storedMasterEntries) as BinderMasterSetMap;
    const masterSetIds = data
      .filter((binder) => binder.source_set_id && nextMasterSets[binder.id])
      .map((binder) => binder.source_set_id as string);
    const masterSetIdCandidates = [...new Set(masterSetIds.flatMap(getSetLookupCandidates))];

    const [
      cardRowsResult,
      setRowsResult,
      canonicalSetRowsResult,
      officialCardsResult,
      canonicalOfficialCardsResult,
    ] = await Promise.all([
      supabase
        .from('binder_cards')
        .select('id, binder_id, card_id, api_card_id, card_name, set_id, language, owned, owned_quantity, condition, grade_company, grade')
        .in('binder_id', binderIds),
      setIdCandidates.length
        ? supabase
            .from('pokemon_sets')
            .select('id, language, printed_total, total')
            .in('id', setIdCandidates)
        : Promise.resolve({ data: [], error: null }),
      setIdCandidates.length
        ? supabase
            .from('tcg_sets')
            .select('id, source_id, language, printed_total, actual_total')
            .in('id', setIdCandidates)
        : Promise.resolve({ data: [], error: null }),
      masterSetIdCandidates.length
        ? supabase
            .from('pokemon_cards')
            .select('id, set_id, language, name, number, rarity, raw_data')
            .in('set_id', masterSetIdCandidates)
        : Promise.resolve({ data: [], error: null }),
      masterSetIdCandidates.length
        ? supabase
            .from('tcg_cards')
            .select('id, set_id, language, canonical_name, local_name, english_display_name, collector_number, rarity, raw_payload')
            .in('set_id', masterSetIdCandidates)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (cardRowsResult.error) throw cardRowsResult.error;
    if (setRowsResult.error) console.log('Binder set totals failed:', setRowsResult.error.message);
    if (canonicalSetRowsResult.error) console.log('Canonical binder set totals failed:', canonicalSetRowsResult.error.message);
    if (officialCardsResult.error) console.log('Binder official catalogue metadata failed:', officialCardsResult.error.message);
    if (canonicalOfficialCardsResult.error) console.log('Canonical binder official cards failed:', canonicalOfficialCardsResult.error.message);

    const rows = (cardRowsResult.data ?? []) as BinderSummaryRow[];
    const canonicalOwnedRows: OwnedCardRow[] = currentUserId
      ? await fetchOwnedCardRows().catch((error) => {
        console.log('Binder canonical ownership failed; using binder ownership only', error);
        return [];
      })
      : [];
    const officialCards = [
      ...((officialCardsResult.data ?? []) as BinderOfficialCardRow[]),
      ...((canonicalOfficialCardsResult.data ?? []) as any[]).map((card): BinderOfficialCardRow => ({
        id: card.id,
        set_id: card.set_id ?? null,
        language: normalizePokemonCardLanguage(card.language),
        name: card.english_display_name ?? card.canonical_name ?? card.local_name ?? null,
        number: card.collector_number ?? card.raw_payload?.localId ?? null,
        rarity: card.rarity ?? card.raw_payload?.rarity ?? null,
        raw_data: card.raw_payload ?? null,
      })),
    ];
    const setTotals = new Map(
      [
        ...(setRowsResult.data ?? []),
        ...((canonicalSetRowsResult.data ?? []) as any[]).map((set) => ({
          id: set.id,
          language: set.language,
          printed_total: set.printed_total,
          total: set.actual_total,
        })),
      ].map((set) => [
        getLanguageSetKey(set.id, set.language),
        readStoredSetTotal(set),
      ])
    );

    const rowsByBinder = new Map<string, BinderSummaryRow[]>();
    const globalOwnedKeys = new Set(
      [
        ...rows
          .filter((row) => row.owned)
          .map((row) => `${getLanguageSetKey(row.set_id, row.language)}:${row.card_id}`),
        ...canonicalOwnedRows.map((row) => `${getLanguageSetKey(row.set_id, null)}:${row.card_id}`),
      ]
    );
    const cardsBySet = new Map<string, BinderOfficialCardRow[]>();
    const officialCardKeys = new Set<string>();
    for (const card of officialCards) {
      if (!card.set_id) continue;
      const key = getLanguageSetKey(card.set_id, card.language);
      const cardKey = `${key}:${card.id}`;
      if (officialCardKeys.has(cardKey)) continue;
      officialCardKeys.add(cardKey);
      const current = cardsBySet.get(key) ?? [];
      current.push(card);
      cardsBySet.set(key, current);
    }

    const variantSetIds = [...new Set(masterSetIds)];
    let ownedVariantRows: OwnedVariantRow[] = [];
    const userId = currentUserId ?? null;
    if (userId && variantSetIds.length) {
      const { data: variantRows, error: variantError } = await supabase
        .from('user_card_variants')
        .select('card_id, set_id, variant')
        .eq('user_id', userId)
        .in('set_id', variantSetIds);

      if (variantError) {
        console.log('Failed to load binder master-set variants', variantError.message);
      } else {
        ownedVariantRows = (variantRows ?? []) as OwnedVariantRow[];
      }
    }

    const ownedVariantsByCard = new Map<string, Set<string>>();
    for (const row of ownedVariantRows) {
      if (!row.card_id || !row.set_id || !row.variant) continue;
      const key = `${getLanguageSetKey(row.set_id, row.language)}:${row.card_id}`;
      if (!ownedVariantsByCard.has(key)) ownedVariantsByCard.set(key, new Set());
      ownedVariantsByCard.get(key)!.add(row.variant);
    }

    for (const row of rows) {
      const current = rowsByBinder.get(row.binder_id) ?? [];
      current.push(row);
      rowsByBinder.set(row.binder_id, current);
    }

    const nextCounts: BinderCardCountMap = {};
    const nextValues: BinderValueMap = {};
    const ownedRowsByBinder = new Map<string, BinderSummaryRow[]>();

    for (const binder of data) {
      const binderLanguage = inferBinderLanguage(binder.language, binder.source_set_id);
      const binderSetKey = getLanguageSetKey(binder.source_set_id, binderLanguage);
      const binderRows = rowsByBinder.get(binder.id) ?? [];
      const ownedRows = binderRows.filter((row) =>
        row.owned || globalOwnedKeys.has(`${getLanguageSetKey(row.set_id, row.language ?? binderLanguage)}:${row.card_id}`)
      );
      ownedRowsByBinder.set(binder.id, ownedRows);
      const storedOfficialTotal = binder.source_set_id ? setTotals.get(binderSetKey) ?? null : null;
      const knownOfficialTotal = getKnownPokemonSetTotal(binder.source_set_id, binderLanguage) ?? null;
      const officialTotal = storedOfficialTotal && storedOfficialTotal > 0
        ? storedOfficialTotal
        : knownOfficialTotal;
      const isMasterSet = nextMasterSets[binder.id] === true;
      const masterCards = binder.source_set_id ? cardsBySet.get(binderSetKey) ?? [] : [];
      const catalogueLooksComplete = binder.type === 'official' && masterCards.length > binderRows.length;
      let total: number | null = binder.type === 'official'
        ? officialTotal ?? (catalogueLooksComplete ? masterCards.length : null)
        : binderRows.length;
      let owned = ownedRows.length;

      if (isMasterSet && binder.type === 'official' && binder.source_set_id && masterCards.length && (officialTotal || catalogueLooksComplete)) {
        const ownedRowsByCard = new Map(ownedRows.map((row) => [`${getLanguageSetKey(row.set_id, row.language ?? binderLanguage)}:${row.card_id}`, row]));
        total = 0;
        owned = 0;

        for (const card of masterCards) {
          const variants = getVariants(card, binder.source_set_id);
          const cardKey = `${binderSetKey}:${card.id}`;
          const ownedVariantCount = variants.filter((variant) => ownedVariantsByCard.get(cardKey)?.has(variant)).length;
          total += variants.length > 1 ? variants.length : 1;
          owned += ownedVariantCount > 0 ? ownedVariantCount : ownedRowsByCard.has(cardKey) ? 1 : 0;
        }
      }

      nextCounts[binder.id] = {
        owned,
        total,
        totalKnown: typeof total === 'number' && total > 0,
      };
    }

    const priceInputs: CollectionPriceInput[] = [];
    const priceKeysByBinder = new Map<string, string[]>();
    for (const binder of data) {
      const keys: string[] = [];
      const binderRows = rowsByBinder.get(binder.id) ?? [];
      const normalizedBinderSetId = normalizePokemonSetId(stripSetLanguagePrefix(binder.source_set_id));
      const rowForOwnedIdentity = (owned: OwnedCardRow) => binderRows.find((row) => (
        row.card_id === owned.card_id
        && normalizePokemonSetId(stripSetLanguagePrefix(row.set_id)) === normalizePokemonSetId(stripSetLanguagePrefix(owned.set_id))
      )) ?? null;
      const canonicalRowsForBinder = canonicalOwnedRows.filter((owned) => {
        if (rowForOwnedIdentity(owned)) return true;
        return binder.type === 'official'
          && Boolean(normalizedBinderSetId)
          && normalizePokemonSetId(stripSetLanguagePrefix(owned.set_id)) === normalizedBinderSetId;
      });
      const canonicalCardKeys = new Set(canonicalRowsForBinder.map((row) => (
        `${normalizePokemonSetId(stripSetLanguagePrefix(row.set_id))}:${row.card_id}`
      )));

      for (const row of canonicalRowsForBinder) {
        const metadata = rowForOwnedIdentity(row);
        const key = `${binder.id}:owned:${row.id ?? [row.set_id, row.card_id, row.variant, row.condition, row.grade_company, row.grade].join(':')}`;
        keys.push(key);
        priceInputs.push({
          key,
          references: [metadata?.api_card_id, row.card_id, metadata?.card_name].filter((value): value is string => Boolean(value)),
          quantity: Math.max(1, Number(row.quantity ?? 1) || 1),
          language: metadata?.language ?? binder.language,
          setId: metadata?.set_id ?? row.set_id ?? binder.source_set_id,
          variantCode: row.variant,
          productType: row.grade_company || row.grade || binder.card_mode === 'graded' ? 'graded_card' : 'raw_card',
          condition: row.condition ?? metadata?.condition ?? binder.default_condition,
          grader: row.grade_company ?? metadata?.grade_company ?? binder.default_grade_company,
          grade: row.grade ?? metadata?.grade ?? binder.default_grade,
        });
      }

      for (const row of ownedRowsByBinder.get(binder.id) ?? []) {
        const canonicalCardKey = `${normalizePokemonSetId(stripSetLanguagePrefix(row.set_id))}:${row.card_id}`;
        if (canonicalCardKeys.has(canonicalCardKey)) continue;
        const key = `${binder.id}:legacy:${row.id}`;
        keys.push(key);
        priceInputs.push({
          key,
          references: [row.api_card_id, row.card_id, row.card_name].filter((value): value is string => Boolean(value)),
          quantity: Math.max(1, Number(row.owned_quantity ?? 1) || 1),
          language: row.language ?? binder.language,
          setId: row.set_id ?? binder.source_set_id,
          productType: row.grade_company || row.grade || binder.card_mode === 'graded' ? 'graded_card' : 'raw_card',
          condition: row.condition ?? binder.default_condition,
          grader: row.grade_company ?? binder.default_grade_company,
          grade: row.grade ?? binder.default_grade,
        });
      }
      priceKeysByBinder.set(binder.id, keys);
    }

    const prices = await loadCollectionPrices(priceInputs);
    const pricesByKey = new Map(prices.map((price) => [price.key, price]));
    for (const binder of data) {
      const priceRows = (priceKeysByBinder.get(binder.id) ?? []).map((key) => pricesByKey.get(key)).filter(Boolean);
      nextValues[binder.id] = summariseCollectionPricing(priceRows.map((price) => ({
        quantity: price!.quantity,
        centralValue: price!.central,
        evidenceStatus: price!.status,
        freshness: price!.freshness,
        calculatedAt: price!.calculatedAt,
        staleAfter: price!.staleAfter,
      })));
    }

    return {
      counts: nextCounts,
      masterSets: nextMasterSets,
      values: nextValues,
    };
  }, []);

  const loadBinderSummaries = useCallback(async (
    data: BinderRecord[],
    currentUserId?: string | null,
    forceRefresh = false
  ) => {
    const summarySignature = getBinderLibrarySignature(data);
    const queryKey = stackrQueryKeys.binderLibrarySummaries(currentUserId, summarySignature);

    if (!forceRefresh) {
      const cached = stackrQueryClient.getQueryData<BinderLibrarySummarySnapshot>(queryKey);
      if (cached) {
        applyBinderSummarySnapshot(cached);
      }
    }

    const snapshot = await stackrQueryClient.fetchQuery({
      queryKey,
      queryFn: () => fetchBinderSummarySnapshot(data, currentUserId),
      staleTime: forceRefresh ? 0 : stackrQueryTiming.hotPathStaleMs,
    });
    applyBinderSummarySnapshot(snapshot);
  }, [applyBinderSummarySnapshot, fetchBinderSummarySnapshot]);

  const load = useCallback(async (forceRefresh = false) => {
    const shouldForceRefresh = forceRefresh === true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const queryKey = stackrQueryKeys.binderLibrary(user?.id ?? null);

      if (shouldForceRefresh) {
        await stackrQueryClient.invalidateQueries({ queryKey: stackrQueryKeys.binderLibraryRoot });
      }

      const cached = shouldForceRefresh
        ? null
        : stackrQueryClient.getQueryData<BinderLibraryOverviewSnapshot>(queryKey);

      if (cached) {
        applyBinderOverviewSnapshot(cached);
        loadedOnceRef.current = true;
        setLoading(false);
        loadBinderSummaries(cached.binders, user?.id ?? null).catch((summaryError) => {
          console.log('Failed to load cached binder summaries', summaryError);
        });
      } else if (!loadedOnceRef.current) {
        setLoading(true);
      }

      const snapshot = await stackrQueryClient.fetchQuery({
        queryKey,
        queryFn: fetchBinderOverviewSnapshot,
        staleTime: shouldForceRefresh ? 0 : stackrQueryTiming.hotPathStaleMs,
      });

      applyBinderOverviewSnapshot(snapshot);
      loadedOnceRef.current = true;
      setLoading(false);

      loadBinderSummaries(snapshot.binders, user?.id ?? null, shouldForceRefresh).catch((summaryError) => {
        console.log('Failed to load binder summaries', summaryError);
      });
    } catch (error) {
      console.log('Failed to load binders', error);
      setLoading(false);
    }
  }, [applyBinderOverviewSnapshot, fetchBinderOverviewSnapshot, loadBinderSummaries]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // ===============================
  // DELETE BINDER
  // ===============================

  const confirmDeleteBinder = useCallback((binder: BinderRecord) => {
    Alert.alert(
      'Delete binder?',
      `Are you sure you want to delete "${binder.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBinder(binder.id);
              await stackrQueryClient.invalidateQueries({ queryKey: stackrQueryKeys.binderLibraryRoot });
              setBinders((prev) => prev.filter((item) => item.id !== binder.id));
              setCounts((prev) => {
                const next = { ...prev };
                delete next[binder.id];
                return next;
              });
              setMasterSets((prev) => {
                const next = { ...prev };
                delete next[binder.id];
                return next;
              });
              setValues((prev) => {
                const next = { ...prev };
                delete next[binder.id];
                return next;
              });
            } catch (error) {
              console.log('Delete binder failed', error);
              Alert.alert('Could not delete binder', 'Please try again.');
            }
          },
        },
      ]
    );
  }, []);

  // ===============================
  // SORT
  // ===============================

  const sortedBinders = useMemo(() => {
    const list = [...binders];

    const getProgress = (id: string) => {
      const p = counts[id] ?? EMPTY_BINDER_COUNT;
      const total = getCountTotal(p);
      return total ? p.owned / total : 0;
    };

    const getOwned = (id: string) => counts[id]?.owned ?? 0;
    // Unknown values sort after known prices; do not treat missing estimates as £0.
    const getValue = (id: string) => values[id]?.total ?? Number.NEGATIVE_INFINITY;

    switch (sortBy) {
      case 'alphabetical':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'completionHigh':
        list.sort((a, b) => getProgress(b.id) - getProgress(a.id));
        break;
      case 'completionLow':
        list.sort((a, b) => getProgress(a.id) - getProgress(b.id));
        break;
      case 'ownedHigh':
        list.sort((a, b) => getOwned(b.id) - getOwned(a.id));
        break;
      case 'ownedLow':
        list.sort((a, b) => getOwned(a.id) - getOwned(b.id));
        break;
      case 'valueHigh':
        list.sort((a, b) => getValue(b.id) - getValue(a.id));
        break;
      case 'valueLow':
        list.sort((a, b) => getValue(a.id) - getValue(b.id));
        break;
    }

    return list;
  }, [binders, counts, sortBy, values]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? 'Recent';
  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg, overflow: 'hidden' }} edges={['top']}>
      <FeatureTipGate
        tipKey="binder-library-screen-v1"
        title="Collection"
        subtitle="Binders, Discover Sets, Pokédex and duplicates now live under one collection destination."
        items={[
          { icon: 'book-outline', title: 'Track ownership', body: 'Open a binder to mark cards owned or missing.' },
          { icon: 'albums-outline', imageIcon: BINDER_MODE_BADGE_SOURCES.master, title: 'Master sets', body: 'Use Master Set mode inside a binder to track variants.' },
          { icon: 'camera-outline', title: 'Scan cards', body: 'Jump straight into the scanner from this screen.' },
        ]}
      />
      <View style={{ flex: 1, paddingHorizontal: PADDING, paddingTop: 8 }}>

        {/* Header */}
        <LinearGradient
          colors={['#FFFFFF', '#F7F2FF', '#EEE5FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'relative', gap: 7, marginBottom: 14, borderRadius: 20, padding: 8, overflow: 'hidden', borderWidth: 1, borderColor: STACKR_BINDER_COLORS.border, ...lavenderShadow }}
        >
          <StackrHeroBackdrop opacity={0.20} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.84}
                style={{
                  maxWidth: heroTitleWidth,
                  color: STACKR_BINDER_COLORS.deepNavy,
                  fontSize: 31,
                  lineHeight: 36,
                  fontWeight: '900',
                  letterSpacing: 0,
                }}
              >
                Collection V<Text style={{ color: STACKR_BINDER_COLORS.primary, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: 0 }}>ault</Text>
              </Text>
              <Text style={{ ...typeScale.support, color: STACKR_BINDER_COLORS.textSoft, marginTop: -1, fontSize: 15, lineHeight: 18, fontWeight: '800' }}>
                {binders.length} Live Binder{binders.length !== 1 ? 's' : ''}
              </Text>
            </View>

            <View style={{ width: 82, gap: 4, alignItems: 'stretch' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => router.push(ROUTES.profile as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Open Profile"
                  style={{
                    width: 38,
                    height: 34,
                    borderRadius: 13,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: STACKR_BINDER_COLORS.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    shadowColor: '#6136F5',
                    shadowOpacity: 0.10,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <StackrProfileAvatar
                    avatarUrl={profile?.avatar_url}
                    avatarPreset={profile?.avatar_preset}
                    size={32}
                    borderWidth={1}
                    accessibilityLabel="Open Profile"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setReorderMode((prev) => !prev)}
                  style={{
                    backgroundColor: reorderMode ? `${STACKR_BINDER_COLORS.gold}26` : '#FFFFFF',
                    width: 38,
                    height: 34,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: reorderMode ? `${STACKR_BINDER_COLORS.gold}80` : STACKR_BINDER_COLORS.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    shadowColor: '#6136F5',
                    shadowOpacity: 0.10,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  {reorderMode ? (
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={{ color: STACKR_BINDER_COLORS.navy, fontWeight: '900', fontSize: 11 }}>Done</Text>
                  ) : (
                    <Ionicons name="grid-outline" size={20} color={STACKR_BINDER_COLORS.textSoft} />
                  )}
                </TouchableOpacity>
              </View>

            </View>
          </View>

          {!reorderMode && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
              <StackrActionButton
                title="Scan Card"
                subtitle="Add or identify"
                imageIcon={stackrIcons.scanCard}
                variant="scan"
                size="hero"
                onPress={handleScanCard}
                accessibilityLabel="Scan Card. Add or identify."
                style={{ flex: 1.45, minHeight: 58 }}
                contentStyle={{ minHeight: 58, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 }}
              />
              <StackrActionButton
                title="New"
                subtitle="Binder"
                icon="add"
                variant="secondary"
                size="compact"
                showArrow={false}
                onPress={() => router.push('/binder/new')}
                accessibilityLabel="Create new binder"
                style={{ flex: 0.78, minHeight: 58 }}
                contentStyle={{ minHeight: 58, paddingHorizontal: 10 }}
              />
            </View>
          )}

          {!reorderMode && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              {COLLECTION_VAULT_SHORTCUTS.map((item) => (
                <CollectionVaultShortcutButton
                  key={item.label}
                  onPress={() => router.push(item.route)}
                  label={item.label}
                  imageIcon={item.imageIcon}
                />
              ))}
            </View>
          )}
        </LinearGradient>

        {!loading && !reorderMode ? (
          <View style={{ marginBottom: 12, backgroundColor: theme.colors.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.colors.text, fontSize: 22, lineHeight: 27, fontWeight: '900' }} numberOfLines={1}>
                  Binder Cards
                </Text>
                <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 17, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                  Official and custom binders
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setSortOpen((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={`Sort binder cards. Current sort: ${currentSortLabel}`}
                style={{
                  minHeight: 42,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.primary + '18',
                  backgroundColor: 'rgba(255,255,255,0.92)',
                  paddingHorizontal: 13,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  shadowColor: '#6136F5',
                  shadowOpacity: 0.03,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <Text numberOfLines={1} style={{ ...typeScale.buttonPrimary, color: STACKR_BINDER_COLORS.deepNavy, fontWeight: '900', fontSize: 12.2 }}>
                  Sort: {currentSortLabel}
                </Text>
                <Ionicons name={sortOpen ? 'chevron-up' : 'chevron-down'} size={16} color={STACKR_BINDER_COLORS.textSoft} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Sort dropdown */}
        {sortOpen && !loading && !reorderMode && (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 10,
            overflow: 'hidden',
          }}>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                onPress={() => { setSortBy(option.key); setSortOpen(false); }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: sortBy === option.key ? theme.colors.primary + '12' : theme.colors.card,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Text style={{
                  color: sortBy === option.key ? theme.colors.primary : theme.colors.textSoft,
                  fontWeight: sortBy === option.key ? '900' : '700',
                }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Loading */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
            <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>
              Loading binders...
            </Text>
          </View>

        ) : reorderMode ? (
          // ===============================
          // REORDER MODE — single column draggable list
          // ===============================
          <>
            <Text style={{
              color: theme.colors.textSoft,
              fontSize: 12,
              textAlign: 'center',
              marginBottom: 12,
            }}>
              Hold and drag to reorder your binders
            </Text>

            <DraggableFlatList
              data={sortedBinders}
              keyExtractor={(item) => item.id}
              onDragEnd={async ({ data }) => {
                setBinders(data);
                await Promise.all(
                  data.map((binder, index) =>
                    supabase
                      .from('binders')
                      .update({ sort_order: index })
                      .eq('id', binder.id)
                  )
                );
                await stackrQueryClient.invalidateQueries({ queryKey: stackrQueryKeys.binderLibraryRoot });
              }}
              activationDistance={10}
              contentContainerStyle={{ paddingBottom: stackrTabContentPadding.standard }}
              renderItem={({ item, drag, isActive }) => {
                const customNameArt = item.type === 'custom'
                  ? getCustomBinderNameArt(customNameArtKeys[item.id] ?? getDefaultCustomBinderNameArtKey(`${item.id}:${item.name}`))
                  : null;

                return (
                <ScaleDecorator>
                  <ShadowDecorator>
                    <OpacityDecorator activeOpacity={0.75}>
                      <TouchableOpacity
                        onLongPress={drag}
                        delayLongPress={200}
                        activeOpacity={0.8}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: isActive ? theme.colors.primary + '12' : theme.colors.card,
                          borderRadius: 14,
                          padding: 12,
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: isActive ? theme.colors.primary : theme.colors.border,
                          gap: 12,
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        <BinderArtwork
                          coverKey={item.cover_key}
                          sourceSetId={item.type === 'official' ? item.source_set_id : null}
                          sourceSetLanguage={item.type === 'official' ? item.language : null}
                          setName={item.type === 'official' ? item.name : null}
                          fallbackLogoUrl={item.type === 'official' ? getBinderLogoUrl(item) : null}
                          fallbackLogoSource={item.type === 'official' ? getBinderLogoSource(item) : null}
                          fallbackArtSource={customNameArt?.source ?? null}
                          fallbackColor={item.color}
                          progress={
                            item.type === 'official' ? getBinderProgressPercent(counts[item.id]) : 0
                          }
                          width={54}
                          stageHeight={64}
                          plateWidth={44}
                          plateHeight={54}
                          artworkWidth={34}
                          artworkHeight={46}
                          progressWidth={44}
                          progressHeight={3}
                          showProgressBar={item.type === 'official'}
                          showFan={false}
                        />

                        {/* Binder info */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                            {item.type === 'official'
                              ? getBinderOwnedLabel(counts[item.id])
                              : `${counts[item.id]?.owned ?? 0} card${(counts[item.id]?.owned ?? 0) === 1 ? '' : 's'} owned`}
                          </Text>
                        </View>

                        {/* Drag handle */}
                        <Text style={{ color: theme.colors.textSoft, fontSize: 20 }}>☰</Text>
                      </TouchableOpacity>
                    </OpacityDecorator>
                  </ShadowDecorator>
                </ScaleDecorator>
                );
              }}
            />
          </>

        ) : (
          // ===============================
          // NORMAL MODE — 3 column grid
          // ===============================
          <FlatList
            data={sortedBinders}
            keyExtractor={(item) => item.id}
            key={COLUMNS}
            numColumns={COLUMNS}
            columnWrapperStyle={{ gap: GAP }}
            {...stackrListPerformance.cardGrid(COLUMNS)}
            showsVerticalScrollIndicator={false}
            style={{ backgroundColor: theme.colors.bg }}
            contentContainerStyle={{ paddingBottom: stackrTabContentPadding.standard, paddingTop: 0 }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => load(true)}
                tintColor={theme.colors.primary}
              />
            }
            renderItem={({ item, index }) => (
              <BinderCard
                item={item}
                counts={counts}
                masterSets={masterSets}
                value={values[item.id] ?? null}
                customNameArtKey={customNameArtKeys[item.id] ?? null}
                confirmDeleteBinder={confirmDeleteBinder}
                index={index}
                cardWidth={binderCardWidth}
                columns={COLUMNS}
              />
            )}
            ListEmptyComponent={
              <View style={{ paddingTop: 34 }}>
                <EmptyStateCard
                  icon="albums-outline"
                  title="No binders yet"
                  body="Create an official set binder or a custom vault, then scan cards straight into it."
                  actionLabel="Create Binder"
                  onAction={() => router.push('/binder/new')}
                />
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
