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
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '../../components/Text';
import {
  EmptyStateCard,
  ProgressBadge,
  TrustBadge,
} from '../../components/PremiumUI';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchBinders,
  deleteBinder,
  BinderRecord,
  getEstimatedValue,
} from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { getBinderCover } from '../../lib/binderCovers';
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
  | 'ownedLow';

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
];

const PADDING = 16;
const GAP = 10;
const POKEDEX_ICON = require('../../assets/images/pokedex_icon.png');

const BINDER_LOGO_OVERRIDES: Record<string, string> = {
  me2pt5: 'https://images.scrydex.com/pokemon/me2pt5-logo/logo',
  me3: 'https://images.scrydex.com/pokemon/me3-logo/logo',
  me4: 'https://images.scrydex.com/pokemon/me4-logo/logo',
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
  if (!item.source_set_id) return null;
  if (BINDER_LOGO_OVERRIDES[item.source_set_id]) {
    return BINDER_LOGO_OVERRIDES[item.source_set_id];
  }
  return `https://images.pokemontcg.io/${item.source_set_id}/logo.png`;
};

const isDark = (color?: string): boolean => {
  if (!color || !color.startsWith('#')) return false;
  const c = color.replace('#', '');
  const rgb = parseInt(c, 16);
  if (isNaN(rgb)) return false;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
};

// ===============================
// BINDER CARD COMPONENT
// ===============================

type BinderCardProps = {
  item: BinderRecord;
  counts: BinderCardCountMap;
  masterSets: BinderMasterSetMap;
  value: number | null;
  confirmDeleteBinder: (binder: BinderRecord) => void;
  index: number;
  cardWidth: number;
  columns: number;
};

function BinderCard({ item, counts, masterSets, value, confirmDeleteBinder, index, cardWidth, columns }: BinderCardProps) {
  const { theme } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);

  const progress = counts[item.id] ?? { owned: 0, total: 0 };
  const isMasterSet = masterSets[item.id] === true;
  const isGraded = item.card_mode === 'graded';
  const percentage = progress.total
    ? Math.round((progress.owned / progress.total) * 100)
    : 0;
  const innerWidth = Math.max(96, cardWidth - 18);

  const cover = getBinderCover(item.cover_key);

  const hasGradient = Array.isArray(item.gradient) && item.gradient.length >= 2;
  const backgroundColors = hasGradient
    ? (item.gradient as [string, string])
    : [item.color || theme.colors.card, item.color || theme.colors.card];

  // Column-based rotation
  const col = index % columns;
  const rotation = col === 0 ? '0deg' : col === 2 ? '0deg' : '0deg';

  const handleOptions = () => {
    Alert.alert('Binder options', item.name, [
      {
        text: 'Edit binder',
        onPress: () => router.push({ pathname: '/binder/new', params: { id: item.id } }),
      },
      {
        text: 'Delete binder',
        style: 'destructive',
        onPress: () => confirmDeleteBinder(item),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/binder/[id]', params: { id: item.id } })}
      onLongPress={handleOptions}
      delayLongPress={400}
      activeOpacity={0.85}
      style={{
        width: cardWidth,
        marginBottom: 18,
        backgroundColor: theme.colors.card,
        borderRadius: 18,
        padding: 9,
        borderWidth: 1,
        borderColor: percentage >= 100 ? theme.colors.secondary : theme.colors.border,
        shadowColor: '#1B2A4B',
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
        transform: [{ rotate: rotation }],
      }}
    >
      {/* Binder image */}
      <View style={{
        width: innerWidth,
        height: innerWidth,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}>
        {cover ? (
          <Image
            source={cover.image}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={backgroundColors as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}
          >
            {item.source_set_id && !logoFailed ? (
              <Image
                source={{ uri: getBinderLogoUrl(item) ?? '' }}
                onError={() => setLogoFailed(true)}
                style={{ width: '90%', height: 32 }}
                resizeMode="contain"
              />
            ) : (
              <Text numberOfLines={3} style={{
                color: isDark(item.color) ? '#FFFFFF' : theme.colors.text,
                fontSize: 12,
                fontWeight: '900',
                textAlign: 'center',
              }}>
                {item.name}
              </Text>
            )}
          </LinearGradient>
        )}

        {/* Options button */}
        <Pressable
          onPress={handleOptions}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            position: 'absolute',
            top: 4, right: 4,
            width: 32, height: 32,
            borderRadius: 16,
            backgroundColor: 'rgba(0,0,0,0.6)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900', lineHeight: 16 }}>⋯</Text>
        </Pressable>

        {/* Progress bar */}
        <View style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 3,
          backgroundColor: 'rgba(0,0,0,0.3)',
        }}>
          <View style={{
            width: progress.total ? `${(progress.owned / progress.total) * 100}%` : '0%',
            height: '100%',
            backgroundColor: cover ? cover.accentColor : '#FFFFFF',
          }} />
        </View>
      </View>

      {/* Name + stats */}
      <View style={{ marginTop: 10 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '900' }}>
          {item.name}
        </Text>
        <View style={{ marginTop: 8 }}>
          <ProgressBadge value={percentage} complete={percentage >= 100} label={`${progress.owned}/${progress.total} owned`} />
        </View>
        {(isMasterSet || isGraded) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {isGraded && (
              <TrustBadge label="Graded" icon="shield-outline" tone="purple" />
            )}
            {isMasterSet && (
              <TrustBadge label="Master set" icon="sparkles-outline" tone="gold" />
            )}
          </View>
        )}
        {value !== null && (
          <View style={{ marginTop: 8, backgroundColor: theme.colors.primary + '10', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary + '25', paddingHorizontal: 9, paddingVertical: 6 }}>
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900' }}>
              £{value.toFixed(2)}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
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
  owned: boolean | null;
  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  condition?: string | null;
};

type BinderOfficialCardRow = {
  id: string;
  set_id: string | null;
  name?: string | null;
  number?: string | null;
  rarity?: string | null;
  raw_data?: any;
};

type OwnedVariantRow = {
  card_id: string;
  set_id: string | null;
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
  const { width } = useWindowDimensions();
  const COLUMNS = width >= 900 ? 5 : width >= 600 ? 3 : 2;
  const binderCardWidth = (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [counts, setCounts] = useState<BinderCardCountMap>({});
  const [masterSets, setMasterSets] = useState<BinderMasterSetMap>({});
  const [values, setValues] = useState<BinderValueMap>({});
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
        .select('binder_id, card_id, set_id, owned, ebay_price, tcg_price, cardmarket_price, condition')
        .in('binder_id', binderIds),
      setIds.length
        ? supabase
            .from('pokemon_sets')
            .select('id, printed_total, total')
            .in('id', setIds)
        : Promise.resolve({ data: [], error: null }),
      masterSetIds.length
        ? supabase
            .from('pokemon_cards')
            .select('id, set_id, name, number, rarity, raw_data')
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
        set.id,
        Number(set.printed_total ?? set.total ?? 0),
      ])
    );

    const rowsByBinder = new Map<string, BinderSummaryRow[]>();
    const globalOwnedKeys = new Set(
      rows
        .filter((row) => row.owned)
        .map((row) => `${row.set_id ?? ''}:${row.card_id}`)
    );
    const cardsBySet = new Map<string, BinderOfficialCardRow[]>();
    for (const card of officialCards) {
      if (!card.set_id) continue;
      const current = cardsBySet.get(card.set_id) ?? [];
      current.push(card);
      cardsBySet.set(card.set_id, current);
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
      const key = `${row.set_id}:${row.card_id}`;
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
      const binderRows = rowsByBinder.get(binder.id) ?? [];
      const ownedRows = binderRows.filter((row) => row.owned || globalOwnedKeys.has(`${row.set_id ?? ''}:${row.card_id}`));
      const officialTotal = binder.source_set_id ? setTotals.get(binder.source_set_id) ?? 0 : 0;
      const isMasterSet = nextMasterSets[binder.id] === true;
      const masterCards = binder.source_set_id ? cardsBySet.get(binder.source_set_id) ?? [] : [];
      let total = binder.type === 'official' && officialTotal > 0
        ? officialTotal
        : binderRows.length;
      let owned = ownedRows.length;

      if (isMasterSet && binder.type === 'official' && binder.source_set_id && masterCards.length) {
        const ownedRowsByCard = new Map(ownedRows.map((row) => [`${row.set_id ?? ''}:${row.card_id}`, row]));
        total = 0;
        owned = 0;

        for (const card of masterCards) {
          const variants = getVariants(card, binder.source_set_id);
          const cardKey = `${binder.source_set_id}:${card.id}`;
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
      setBinders(data);
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
    }

    return list;
  }, [binders, counts, sortBy]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? 'Recent';
  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['top']}>
      <FeatureTipGate
        tipKey="binder-library-screen-v1"
        title="Binders"
        subtitle="Your collection lives here, organised by set or custom folders."
        items={[
          { icon: 'book-outline', title: 'Track ownership', body: 'Open a binder to mark cards owned or missing.' },
          { icon: 'albums-outline', title: 'Master sets', body: 'Use Master Set mode inside a binder to track variants.' },
          { icon: 'camera-outline', title: 'Scan cards', body: 'Jump straight into the scanner from this screen.' },
        ]}
      />
      <View style={{ flex: 1, paddingHorizontal: PADDING, paddingTop: 8 }}>

        {/* Header */}
        <View style={{ gap: 14, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' }}>
                Binder Vault
              </Text>
              <Text style={{ color: theme.colors.textSoft, marginTop: 2, fontSize: 12, fontWeight: '700' }}>
                {binders.length} binder{binders.length !== 1 ? 's' : ''} curated across your collection
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/pokedex' as any)}
                accessibilityRole="button"
                accessibilityLabel="Open Pokedex"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  source={POKEDEX_ICON}
                  style={{ width: 34, height: 34 }}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setReorderMode((prev) => !prev)}
                style={{
                  backgroundColor: reorderMode ? theme.colors.secondary : theme.colors.card,
                  width: reorderMode ? undefined : 42,
                  height: 42,
                  paddingHorizontal: reorderMode ? 12 : 0,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: reorderMode ? theme.colors.secondary : theme.colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {reorderMode ? (
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>Done</Text>
                ) : (
                  <Ionicons name="grid-outline" size={23} color={theme.colors.textSoft} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push('/binder/new')}
                style={{
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: 14,
                  height: 42,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>New</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!reorderMode && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={handleScanCard}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.secondary,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
                  Scan Card
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSortOpen((prev) => !prev)}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.card,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
                  Sort: {currentSortLabel}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Sort dropdown */}
        {sortOpen && !reorderMode && (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginBottom: 12,
            overflow: 'hidden',
          }}>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                onPress={() => { setSortBy(option.key); setSortOpen(false); }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  backgroundColor: sortBy === option.key ? theme.colors.secondary : theme.colors.card,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <Text style={{
                  color: sortBy === option.key ? theme.colors.text : theme.colors.textSoft,
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
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item, drag, isActive }) => (
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
                          backgroundColor: isActive ? theme.colors.secondary : theme.colors.card,
                          borderRadius: 14,
                          padding: 12,
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: isActive ? theme.colors.secondary : theme.colors.border,
                          gap: 12,
                        }}
                      >
                        {/* Cover thumbnail */}
                        {getBinderCover(item.cover_key) ? (
                          <Image
                            source={getBinderCover(item.cover_key)!.image}
                            style={{ width: 44, height: 60, borderRadius: 6 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{
                            width: 44, height: 60,
                            borderRadius: 6,
                            backgroundColor: item.color || theme.colors.primary,
                            alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden',
                          }}>
                            <Text style={{
                              color: '#FFFFFF',
                              fontSize: 8,
                              fontWeight: '900',
                              textAlign: 'center',
                              padding: 2,
                            }} numberOfLines={3}>
                              {item.name}
                            </Text>
                          </View>
                        )}

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
              )}
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
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
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
