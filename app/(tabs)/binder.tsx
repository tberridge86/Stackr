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
import { BinderModeIconBadge } from '../../components/BinderModeBadge';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  fetchBinders,
  deleteBinder,
  BinderRecord,
  getEstimatedValue,
} from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { getPokemonSetLogoUrl, normalizePokemonCardLanguage, type PokemonCardLanguage } from '../../lib/pokemonTcg';
import { StackrHeroBackdrop } from '../../components/StackrBackdrop';
import { StackrActionButton } from '../../components/StackrActionButton';
import { StackrButtonPattern } from '../../components/StackrEmboss';
import { StackrImage } from '../../components/StackrImage';
import { StackrPageTitle } from '../../components/StackrScreen';
import { useProfile } from '../../components/profile-context';
import { numericTextStyle, typeScale } from '../../lib/typography';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { stackrListPerformance } from '../../lib/performance';
import { ROUTES } from '../../lib/routes';
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

type BinderCardCountMap = Record<string, { owned: number; total: number }>;
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

const getPreferredBinderCardPrice = (card: any): number => {
  return card?.ebay_price ?? card?.tcg_price ?? card?.cardmarket_price ?? 0;
};

const getBinderLogoUrl = (item: BinderRecord): string | null => {
  return getPokemonSetLogoUrl(item.source_set_id) ?? null;
};

const getLanguageSetKey = (setId?: string | null, language?: string | null) =>
  `${normalizePokemonCardLanguage(language)}:${setId ?? ''}`;

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
        minHeight: 76,
        borderRadius: 18,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: STACKR_BINDER_COLORS.border,
        paddingHorizontal: 9,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        shadowColor: '#6136F5',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 2,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
        }}
      >
        <View
          style={{
            width: 44,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={imageIcon}
            style={{ width: 38, height: 38 }}
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
            fontSize: 12.2,
            lineHeight: 15,
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
  value: number | null;
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
  const progress = counts[item.id] ?? { owned: 0, total: 0 };
  const isMasterSet = masterSets[item.id] === true;
  const isGraded = item.card_mode === 'graded';
  const isJapanese = normalizePokemonCardLanguage(item.language) === 'ja';
  const percentage = progress.total
    ? Math.round((progress.owned / progress.total) * 100)
    : 0;
  const innerWidth = Math.max(106, cardWidth - 16);
  const logoUrl = item.type === 'official' ? getBinderLogoUrl(item) : null;
  const customNameArt = item.type === 'custom'
    ? getCustomBinderNameArt(customNameArtKey ?? getDefaultCustomBinderNameArtKey(`${item.id}:${item.name}`))
    : null;
  const labelLogoUrl = customNameArt ? null : logoUrl;
  const hasBinderLabel = Boolean(customNameArt || labelLogoUrl);
  const shouldShowNameText = !labelLogoUrl;
  const artWidth = Math.min(144, innerWidth + 4);
  const nameIsLong = item.name.length > 24;

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
          borderColor: percentage >= 100 ? `${STACKR_BINDER_COLORS.gold}66` : STACKR_BINDER_COLORS.border,
          ...lavenderShadow,
          transform: [{ rotate: rotation }],
        }}
      >
      {/* Binder art */}
      <View style={{
        width: innerWidth,
        minHeight: 154,
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
          sourceSetId={item.type === 'official' ? item.source_set_id : null}
          setName={item.type === 'official' ? item.name : null}
          fallbackLogoUrl={logoUrl}
          fallbackArtSource={customNameArt?.source ?? null}
          fallbackColor={item.color}
          progress={percentage}
          width={artWidth}
          stageHeight={132}
          plateWidth={94}
          plateHeight={110}
          artworkWidth={104}
          artworkHeight={118}
          progressWidth={92}
          progressHeight={4}
          showProgressText={false}
        />
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
            {percentage}%
          </Text>
        </LinearGradient>

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
      <View style={{ marginTop: 5, minHeight: hasBinderLabel ? 72 : 58 }}>
        {customNameArt ? (
          <View style={{ minHeight: 23, justifyContent: 'center', marginBottom: 1 }}>
            <Image source={customNameArt.source} style={{ width: '100%', height: 20 }} resizeMode="contain" />
          </View>
        ) : labelLogoUrl ? (
          <View style={{ minHeight: 23, justifyContent: 'center', marginBottom: 1 }}>
            <StackrImage
              uri={labelLogoUrl}
              style={{ width: '100%', height: 21, backgroundColor: 'transparent' }}
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
              fontSize: hasBinderLabel ? 11.5 : nameIsLong ? 11.5 : 13,
              lineHeight: hasBinderLabel ? 14 : nameIsLong ? 14 : 16,
              fontWeight: '800',
              textAlign: 'center',
            }}
          >
            {item.name}
          </Text>
        ) : null}
        <View style={{ marginTop: 5, backgroundColor: STACKR_BINDER_COLORS.softLavender, borderRadius: 12, borderWidth: 1, borderColor: STACKR_BINDER_COLORS.border, paddingHorizontal: 8, paddingVertical: 6, gap: 2 }}>
          <Text numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={{ ...numericTextStyle, color: STACKR_BINDER_COLORS.primary, fontSize: 12.5, lineHeight: 15, fontWeight: '900', textAlign: 'center' }}>
            {'\u00A3'}{(value ?? 0).toFixed(2)}
          </Text>
          <Text numberOfLines={1} style={{ ...typeScale.caption, color: STACKR_BINDER_COLORS.textSoft, fontSize: 11.5, lineHeight: 14, fontWeight: '900', textAlign: 'center' }}>
            {progress.owned}/{progress.total} owned
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

type BinderValueMap = Record<string, number>;

type BinderSummaryRow = {
  binder_id: string;
  card_id: string;
  set_id: string | null;
  language?: PokemonCardLanguage | null;
  owned: boolean | null;
  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  condition?: string | null;
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

const getMasterSetStorageKey = (binderId: string) => `stackr:binder-master-set:${binderId}`;

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

  const loadBinderSummaries = useCallback(async (data: BinderRecord[]) => {
    const binderIds = data.map((binder) => binder.id);

    if (!binderIds.length) {
      setCounts({});
      setMasterSets({});
      setValues({});
      return;
    }

    const setIds = data.map((binder) => binder.source_set_id).filter(Boolean) as string[];
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

    const [cardRowsResult, setRowsResult, officialCardsResult, userResult] = await Promise.all([
      supabase
        .from('binder_cards')
        .select('binder_id, card_id, set_id, language, owned, ebay_price, tcg_price, cardmarket_price, condition')
        .in('binder_id', binderIds),
      setIds.length
        ? supabase
            .from('pokemon_sets')
            .select('id, language, printed_total, total')
            .in('id', setIds)
        : Promise.resolve({ data: [], error: null }),
      masterSetIds.length
        ? supabase
            .from('pokemon_cards')
            .select('id, set_id, language, name, number, rarity, raw_data')
            .in('set_id', masterSetIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.auth.getUser(),
    ]);

    if (cardRowsResult.error) throw cardRowsResult.error;
    if (setRowsResult.error) throw setRowsResult.error;
    if (officialCardsResult.error) throw officialCardsResult.error;

    const rows = (cardRowsResult.data ?? []) as BinderSummaryRow[];
    const officialCards = (officialCardsResult.data ?? []) as BinderOfficialCardRow[];
    const setTotals = new Map(
      (setRowsResult.data ?? []).map((set) => [
        getLanguageSetKey(set.id, set.language),
        Number(set.printed_total ?? set.total ?? 0),
      ])
    );

    const rowsByBinder = new Map<string, BinderSummaryRow[]>();
    const globalOwnedKeys = new Set(
      rows
        .filter((row) => row.owned)
        .map((row) => `${getLanguageSetKey(row.set_id, row.language)}:${row.card_id}`)
    );
    const cardsBySet = new Map<string, BinderOfficialCardRow[]>();
    for (const card of officialCards) {
      if (!card.set_id) continue;
      const key = getLanguageSetKey(card.set_id, card.language);
      const current = cardsBySet.get(key) ?? [];
      current.push(card);
      cardsBySet.set(key, current);
    }

    const variantSetIds = [...new Set(masterSetIds)];
    let ownedVariantRows: OwnedVariantRow[] = [];
    const userId = userResult.data.user?.id;
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

    for (const binder of data) {
      const binderLanguage = normalizePokemonCardLanguage(binder.language);
      const binderSetKey = getLanguageSetKey(binder.source_set_id, binderLanguage);
      const binderRows = rowsByBinder.get(binder.id) ?? [];
      const ownedRows = binderRows.filter((row) =>
        row.owned || globalOwnedKeys.has(`${getLanguageSetKey(row.set_id, row.language ?? binderLanguage)}:${row.card_id}`)
      );
      const officialTotal = binder.source_set_id ? setTotals.get(binderSetKey) ?? 0 : 0;
      const isMasterSet = nextMasterSets[binder.id] === true;
      const masterCards = binder.source_set_id ? cardsBySet.get(binderSetKey) ?? [] : [];
      let total = binder.type === 'official' && officialTotal > 0
        ? officialTotal
        : binderRows.length;
      let owned = ownedRows.length;

      if (isMasterSet && binder.type === 'official' && binder.source_set_id && masterCards.length) {
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
      };

      nextValues[binder.id] = ownedRows.reduce((sum, row) => {
        const base = getPreferredBinderCardPrice(row);
        return sum + getEstimatedValue(base, row.condition ?? 'Near Mint');
      }, 0);
    }

    setCounts(nextCounts);
    setMasterSets(nextMasterSets);
    setValues(nextValues);
  }, []);

  const load = useCallback(async () => {
    try {
      if (!loadedOnceRef.current) setLoading(true);

      const data = await fetchBinders();
      const customArtEntries = await Promise.all(
        data
          .filter((binder) => binder.type === 'custom')
          .map(async (binder) => [
            binder.id,
            await getCustomBinderNameArtKeyForBinder(binder.id, binder.name),
          ] as const)
      );
      setBinders(data);
      setCustomNameArtKeys(Object.fromEntries(customArtEntries));
      loadedOnceRef.current = true;
      setLoading(false);

      loadBinderSummaries(data).catch((summaryError) => {
        console.log('Failed to load binder summaries', summaryError);
      });
    } catch (error) {
      console.log('Failed to load binders', error);
      setLoading(false);
    } finally {
    }
  }, [loadBinderSummaries]);

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
              setBinders((prev) => prev.filter((item) => item.id !== binder.id));
              setCounts((prev) => {
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
      const p = counts[id] ?? { owned: 0, total: 0 };
      return p.total ? p.owned / p.total : 0;
    };

    const getOwned = (id: string) => counts[id]?.owned ?? 0;
    const getValue = (id: string) => values[id] ?? 0;

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
          { icon: 'albums-outline', title: 'Master sets', body: 'Use Master Set mode inside a binder to track variants.' },
          { icon: 'camera-outline', title: 'Scan cards', body: 'Jump straight into the scanner from this screen.' },
        ]}
      />
      <View style={{ flex: 1, paddingHorizontal: PADDING, paddingTop: 8 }}>

        {/* Header */}
        <LinearGradient
          colors={['#FFFFFF', '#F7F2FF', '#EEE5FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'relative', gap: 8, marginBottom: 18, borderRadius: 22, padding: 10, overflow: 'hidden', borderWidth: 1, borderColor: STACKR_BINDER_COLORS.border, ...lavenderShadow }}
        >
          <StackrHeroBackdrop opacity={0.20} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <StackrPageTitle
                title="Collection Vault"
                accentText="Vault"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.86}
                style={{
                  maxWidth: heroTitleWidth,
                }}
              />
              <Text style={{ ...typeScale.support, color: STACKR_BINDER_COLORS.textSoft, marginTop: 1, fontSize: 18, lineHeight: 22, fontWeight: '800' }}>
                {binders.length} Live Binder{binders.length !== 1 ? 's' : ''}
              </Text>
            </View>

            <View style={{ width: 84, gap: 5, alignItems: 'stretch' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => router.push(ROUTES.profile as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Open Profile"
                  style={{
                    width: 39,
                    height: 35,
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
                    size={33}
                    borderWidth={1}
                    accessibilityLabel="Open Profile"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setReorderMode((prev) => !prev)}
                  style={{
                    backgroundColor: reorderMode ? `${STACKR_BINDER_COLORS.gold}26` : '#FFFFFF',
                    width: 39,
                    height: 35,
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
                    <Ionicons name="grid-outline" size={21} color={STACKR_BINDER_COLORS.textSoft} />
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
                size="compact"
                onPress={handleScanCard}
                accessibilityLabel="Scan Card. Add or identify."
                style={{ flex: 1.45, minHeight: 48 }}
                contentStyle={{ minHeight: 48 }}
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
                style={{ flex: 0.78, minHeight: 48 }}
                contentStyle={{ minHeight: 48, paddingHorizontal: 10 }}
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
                  minHeight: 44,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: STACKR_BINDER_COLORS.border,
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 13,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  shadowColor: '#6136F5',
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <Text numberOfLines={1} style={{ ...typeScale.buttonPrimary, color: STACKR_BINDER_COLORS.deepNavy, fontWeight: '900', fontSize: 12 }}>
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
                          setName={item.type === 'official' ? item.name : null}
                          fallbackLogoUrl={item.type === 'official' ? getBinderLogoUrl(item) : null}
                          fallbackArtSource={customNameArt?.source ?? null}
                          fallbackColor={item.color}
                          progress={
                            counts[item.id]?.total
                              ? Math.round(((counts[item.id]?.owned ?? 0) / (counts[item.id]?.total ?? 1)) * 100)
                              : 0
                          }
                          width={54}
                          stageHeight={64}
                          plateWidth={44}
                          plateHeight={54}
                          artworkWidth={34}
                          artworkHeight={46}
                          progressWidth={44}
                          progressHeight={3}
                          showFan={false}
                        />

                        {/* Binder info */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 3 }}>
                            {counts[item.id]?.owned ?? 0} / {counts[item.id]?.total ?? 0} owned
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
                onRefresh={load}
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
