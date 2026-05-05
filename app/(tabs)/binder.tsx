import { theme } from '../../lib/theme';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Alert,
  Image,
  Dimensions,
  FlatList,
} from 'react-native';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  fetchBinders,
  fetchBinderCards,
  deleteBinder,
  BinderRecord,
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

const screenWidth = Dimensions.get('window').width;
const COLUMNS = 2;
const PADDING = 16;
const GAP = 10;
const binderCardWidth = (screenWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

const cardShadow = {};

const BINDER_LOGO_OVERRIDES: Record<string, string> = {
  me3: 'https://images.pokemontcg.io/por/logo.png',
};

// ===============================
// HELPERS
// ===============================

const formatCurrency = (value?: number | null): string => {
  if (value === null || value === undefined) return '—';
  return `£${Number(value).toFixed(2)}`;
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
  confirmDeleteBinder: (binder: BinderRecord) => void;
  index: number;
};

function BinderCard({ item, counts, confirmDeleteBinder, index }: BinderCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  const progress = counts[item.id] ?? { owned: 0, total: 0 };
  const percentage = progress.total
    ? Math.round((progress.owned / progress.total) * 100)
    : 0;

  const cover = getBinderCover(item.cover_key);

  const hasGradient = Array.isArray(item.gradient) && item.gradient.length >= 2;
  const backgroundColors = hasGradient
    ? (item.gradient as [string, string])
    : [item.color || theme.colors.card, item.color || theme.colors.card];

  // Column-based rotation
  const col = index % COLUMNS;
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
        width: binderCardWidth,
        marginBottom: 24,
        transform: [{ rotate: rotation }],
      }}
    >
      {/* Binder image */}
      <View style={{
        width: binderCardWidth * 1,
        height: binderCardWidth * 1,
        borderRadius: 6,
        overflow: 'hidden',
        ...cardShadow,
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
          style={{
            position: 'absolute',
            top: 5, right: 5,
            width: 22, height: 22,
            borderRadius: 11,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900', lineHeight: 12 }}>⋯</Text>
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
      <View style={{ marginTop: 6, paddingHorizontal: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 11, fontWeight: '900' }}>
          {item.name}
        </Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 10, marginTop: 2 }}>
          {progress.owned}/{progress.total} · {percentage}%
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ===============================
// MAIN COMPONENT
// ===============================

export default function BinderLibraryScreen() {
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [counts, setCounts] = useState<BinderCardCountMap>({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  // ===============================
  // SCAN (scaffolded — coming soon)
  // ===============================

  const handleScanCard = async () => {
  router.push('/scan');
};

  // ===============================
  // LOAD
  // ===============================

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const data = await fetchBinders();
      setBinders(data);

      const entries = await Promise.all(
        data.map(async (binder) => {
          const cards = await fetchBinderCards(binder.id);
          const owned = cards.filter((c) => c.owned).length;
          return [binder.id, { owned, total: cards.length }] as const;
        })
      );

      setCounts(Object.fromEntries(entries));
    } catch (error) {
      console.log('Failed to load binders', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
      <View style={{ flex: 1, paddingHorizontal: PADDING, paddingTop: 8 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '900' }}>
              Binder
            </Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 2, fontSize: 13 }}>
              {binders.length} binder{binders.length !== 1 ? 's' : ''} in your collection
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Reorder toggle */}
            <TouchableOpacity
              onPress={() => setReorderMode((prev) => !prev)}
              style={{
                backgroundColor: reorderMode ? theme.colors.secondary : theme.colors.card,
                paddingHorizontal: 12, paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: reorderMode ? theme.colors.secondary : theme.colors.border,
              }}
            >
              <Text style={{
                color: reorderMode ? theme.colors.text : theme.colors.textSoft,
                fontWeight: '900',
                fontSize: 13,
              }}>
                {reorderMode ? '✓ Done' : '⇅'}
              </Text>
            </TouchableOpacity>

            {/* New binder */}
            <TouchableOpacity
              onPress={() => router.push('/binder/new')}
              style={{
                backgroundColor: theme.colors.primary,
                paddingHorizontal: 14, paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action row — only show when not in reorder mode */}
        {!reorderMode && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={handleScanCard}
              style={{
                flex: 1,
                backgroundColor: theme.colors.secondary,
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
                📷 Scan Card
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSortOpen((prev) => !prev)}
              style={{
                flex: 1,
                backgroundColor: theme.colors.card,
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 13 }}>
                ↕ {currentSortLabel}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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
                confirmDeleteBinder={confirmDeleteBinder}
                index={index}
              />
            )}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>📚</Text>
                <Text style={{ color: theme.colors.text, textAlign: 'center', fontSize: 18, fontWeight: '900', marginBottom: 8 }}>
                  No binders yet
                </Text>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center', fontSize: 13, lineHeight: 20, marginBottom: 20 }}>
                  Create your first official set binder or a themed custom one.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/binder/new')}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Create Binder</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}