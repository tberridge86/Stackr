import { theme } from '../../lib/theme';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Dimensions,
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { Text } from '../../components/Text';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useCollection } from '../../components/collection-context';
import { fetchAllSets, PokemonSet } from '../../lib/pokemonTcg';
import { fetchBinders, fetchBinderCards } from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import { createActivityPost } from '../../lib/activity';

type ChartRange = '1D' | '7D' | '30D' | 'ALL';
type ChartMode = 'TCG' | 'EBAY' | 'BOTH';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActivityRow({
  icon,
  title,
  subtitle,
  time,
  positive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  time: string;
  positive?: boolean | null;
}) {
  return (
    <View style={styles.activityRow}>
      <View style={styles.activityIconWrap}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>

      <View style={styles.activityTextWrap}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text
          style={[
            styles.activitySubtitle,
            positive === true && styles.positiveText,
            positive === false && styles.negativeText,
          ]}
        >
          {subtitle}
        </Text>
      </View>

      <Text style={styles.activityTime}>{time}</Text>
    </View>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && styles.cardPressed]}
    >
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>

      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
    </Pressable>
  );
}

const formatMoney = (value: number) => `£${value.toFixed(2)}`;

const formatSignedMoney = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}£${value.toFixed(2)}`;
};

const formatSignedPercent = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const getRangeStartDate = (range: ChartRange) => {
  if (range === 'ALL') return null;

  const date = new Date();

  if (range === '1D') date.setDate(date.getDate() - 1);
  if (range === '7D') date.setDate(date.getDate() - 7);
  if (range === '30D') date.setDate(date.getDate() - 30);

  return date.toISOString();
};

const getPriceFromSnapshot = (
  row: any,
  source: 'tcg' | 'ebay'
): number | null => {
  const price = source === 'tcg' ? row?.tcg_mid : row?.ebay_average;
  return typeof price === 'number' ? price : null;
};

const getPriceFromPokemonCard = (card: any): number | null => {
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
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return value;
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return value;
  }

  return null;
};

const fetchLivePricesForCardIds = async (cardIds: string[]) => {
  const chunks: string[][] = [];

  for (let i = 0; i < cardIds.length; i += 20) {
    chunks.push(cardIds.slice(i, i + 20));
  }

  const priceMap: Record<string, number> = {};

  for (const chunk of chunks) {
    const q = chunk.map((id) => `id:${id}`).join(' OR ');
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=20`;

    const response = await fetch(url);
    const json = await response.json();

    for (const card of json?.data ?? []) {
      const price = getPriceFromPokemonCard(card);
      if (typeof price === 'number') {
        priceMap[card.id] = price;
      }
    }
  }

  return priceMap;
};

const normaliseChartValues = (values: number[]) =>
  values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0];

export default function HubScreen() {
  const { trackedSetIds } = useCollection();

  const [allSets, setAllSets] = useState<PokemonSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentListings, setRecentListings] = useState<any[]>([]);

  const [chartRange, setChartRange] = useState<ChartRange>('7D');
  const [chartMode, setChartMode] = useState<ChartMode>('TCG');

  const [chartData, setChartData] = useState<{
    tcg: number[];
    ebay: number[];
  }>({
    tcg: [],
    ebay: [],
  });

  const [collectionTotal, setCollectionTotal] = useState(0);
  const [collectionChangeAmount, setCollectionChangeAmount] = useState(0);
  const [collectionChangePercent, setCollectionChangePercent] = useState(0);

  const [ownedCardCount, setOwnedCardCount] = useState(0);
  const [unpricedCardCount, setUnpricedCardCount] = useState(0);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const valuePostKeyRef = useRef<string | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const collectionUp = collectionChangeAmount >= 0;
  const collectionValue = formatMoney(collectionTotal);

  useEffect(() => {
    const loadSets = async () => {
      try {
        const sets = await fetchAllSets();
        setAllSets(sets);
      } catch (error) {
        console.log('Failed to fetch sets', error);
      } finally {
        setLoading(false);
      }
    };

    loadSets();
  }, []);

  useEffect(() => {
    const loadWatchlistCount = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setWatchlistCount(0);
          return;
        }

        const { count, error } = await supabase
          .from('market_watchlist')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (error) throw error;

        setWatchlistCount(count ?? 0);
      } catch (error) {
        console.log('Failed to load watchlist count', error);
        setWatchlistCount(0);
      }
    };

    loadWatchlistCount();
  }, []);

useEffect(() => {
  const loadNotifications = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUnreadNotificationCount(0);
        return;
      }

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setUnreadNotificationCount(count ?? 0);
    } catch (error) {
      console.log('Failed to load notifications', error);
      setUnreadNotificationCount(0);
    }
  };

  loadNotifications();
}, []);

useEffect(() => {
  const loadRecentListings = async () => {
    try {
      const { data: listings, error } = await supabase
  .from('trade_listings')
  .select('*')
  .eq('status', 'live')
  .order('created_at', { ascending: false })
  .limit(8);
      if (error) throw error;

      const cardIds = [...new Set((listings ?? []).map((item) => item.card_id))];

      const { data: previews, error: previewError } = await supabase
        .from('card_previews')
        .select('card_id, name, set_name, image_url')
        .in('card_id', cardIds);

      if (previewError) throw previewError;

      const previewMap: Record<string, any> = {};

      for (const preview of previews ?? []) {
        previewMap[preview.card_id] = preview;
      }

      const enrichedListings = (listings ?? []).map((item) => ({
        ...item,
        preview: previewMap[item.card_id] ?? null,
      }));

      setRecentListings(enrichedListings);
    } catch (err) {
      console.log('Failed to load recent listings', err);
      setRecentListings([]);
    }
  };

  loadRecentListings();
}, []);

  useEffect(() => {
    const loadCollectionValue = async () => {
      try {
        const binders = await fetchBinders();

        const allCards = (
          await Promise.all(binders.map((binder) => fetchBinderCards(binder.id)))
        ).flat();

        const ownedCards = allCards.filter((card) => card.owned);
        setOwnedCardCount(ownedCards.length);

        const cardIds = [
          ...new Set(
            ownedCards.map((card: any) => card.api_card_id || card.card_id)
          ),
        ];

        const storedCardIds = [...new Set(ownedCards.map((card) => card.card_id))];

        if (!storedCardIds.length) {
          setCollectionTotal(0);
          setCollectionChangeAmount(0);
          setCollectionChangePercent(0);
          setUnpricedCardCount(0);
          setChartData({ tcg: [], ebay: [] });
          return;
        }

        let snapshotQuery = supabase
          .from('market_price_snapshots')
          .select('card_id, ebay_average, tcg_mid, cardmarket_trend, snapshot_at')
          .in('card_id', storedCardIds)
          .order('snapshot_at', { ascending: true });

        const rangeStart = getRangeStartDate(chartRange);

        if (rangeStart) {
          snapshotQuery = snapshotQuery.gte('snapshot_at', rangeStart);
        }

        const { data, error } = await snapshotQuery;

        if (error) throw error;

        const groupedByCard: Record<string, any[]> = {};
        const groupedByDay: Record<
          string,
          {
            tcg: Record<string, number>;
            ebay: Record<string, number>;
          }
        > = {};

        for (const row of data || []) {
          if (!groupedByCard[row.card_id]) groupedByCard[row.card_id] = [];
          groupedByCard[row.card_id].push(row);

          const day = String(row.snapshot_at).split('T')[0];

          if (!groupedByDay[day]) {
            groupedByDay[day] = {
              tcg: {},
              ebay: {},
            };
          }

          const tcgPrice = getPriceFromSnapshot(row, 'tcg');
          const ebayPrice = getPriceFromSnapshot(row, 'ebay');

          if (tcgPrice != null) groupedByDay[day].tcg[row.card_id] = tcgPrice;
          if (ebayPrice != null) groupedByDay[day].ebay[row.card_id] = ebayPrice;
        }

        let totalLatest = 0;
        let totalPrevious = 0;
        let cardsWithPrevious = 0;
        let unpriced = 0;

        const activeSource: 'tcg' | 'ebay' =
          chartMode === 'EBAY' ? 'ebay' : 'tcg';

        for (const card of ownedCards) {
          const snapshots = groupedByCard[card.card_id] || [];
          const latest = snapshots[snapshots.length - 1];
          const previous = snapshots[snapshots.length - 2];

          const latestPrice = getPriceFromSnapshot(latest, activeSource);
          const previousPrice = getPriceFromSnapshot(previous, activeSource);

          if (typeof latestPrice === 'number') {
            totalLatest += latestPrice;
          } else {
            unpriced += 1;
          }

          if (typeof latestPrice === 'number' && typeof previousPrice === 'number') {
            totalPrevious += previousPrice;
            cardsWithPrevious += 1;
          }
        }

        if (totalLatest === 0 && activeSource === 'tcg') {
          const livePriceMap = await fetchLivePricesForCardIds(cardIds);

          let liveTotal = 0;
          let liveUnpriced = 0;

          for (const card of ownedCards as any[]) {
            const lookupId = card.api_card_id || card.card_id;
            const price = livePriceMap[lookupId];

            if (typeof price === 'number') {
              liveTotal += price;
            } else {
              liveUnpriced += 1;
            }
          }

          totalLatest = liveTotal;
          unpriced = liveUnpriced;
        }

        const change = cardsWithPrevious > 0 ? totalLatest - totalPrevious : 0;

        const percent =
          cardsWithPrevious > 0 && totalPrevious !== 0
            ? (change / totalPrevious) * 100
            : 0;

        const days = Object.keys(groupedByDay).sort();

        const buildValues = (source: 'tcg' | 'ebay') =>
          days
            .map((day) => {
              const pricesForDay = groupedByDay[day][source];
              let dayTotal = 0;

              for (const cardId of storedCardIds) {
                const price = pricesForDay[cardId];
                if (typeof price === 'number') {
                  dayTotal += price;
                }
              }

              return dayTotal;
            })
            .filter((value) => Number.isFinite(value) && value > 0);

        const cleanTcgValues = buildValues('tcg');
        const cleanEbayValues = buildValues('ebay');

        setCollectionTotal(totalLatest);
        setCollectionChangeAmount(change);
        setCollectionChangePercent(percent);
        setUnpricedCardCount(unpriced);
        setChartData({
          tcg: cleanTcgValues,
          ebay: cleanEbayValues,
        });

        if (chartRange === '7D' && cardsWithPrevious > 0 && Math.abs(change) > 1) {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { data: existingValuePost, error: existingValuePostError } =
              await supabase
                .from('activity_feed')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'value_change')
                .gte('created_at', today.toISOString())
                .limit(1);

            if (existingValuePostError) {
              console.log('Failed to check existing value post', existingValuePostError);
            }

            const alreadyPostedToday =
              Array.isArray(existingValuePost) && existingValuePost.length > 0;

            const postKey = `${user.id}-${today.toISOString()}-${change.toFixed(2)}`;

            if (!alreadyPostedToday && valuePostKeyRef.current !== postKey) {
              valuePostKeyRef.current = postKey;

              createActivityPost({
                type: 'value_change',
                title:
                  change > 0
                    ? 'Collection value is up today'
                    : 'Collection value is down today',
                subtitle: `${formatSignedMoney(change)} (${formatSignedPercent(
                  percent
                )}) · Total ${formatMoney(totalLatest)}`,
                valueChange: change,
                isPositive: change > 0,
              }).catch((activityError) => {
                console.log('Failed to create value activity post', activityError);
              });
            }
          }
        }
      } catch (error) {
        console.log('Failed to calculate collection value', error);
        setCollectionTotal(0);
        setCollectionChangeAmount(0);
        setCollectionChangePercent(0);
        setUnpricedCardCount(0);
        setChartData({ tcg: [], ebay: [] });
      }
    };

    loadCollectionValue();
  }, [chartRange, chartMode]);

  const quickStats = useMemo(
    () => ({
      ownedCards: String(ownedCardCount),
      trackedSets: String(trackedSetIds.length),
      availableSets: loading ? '...' : String(allSets.length),
      unpriced: String(unpricedCardCount),
      watchlist: String(watchlistCount),
      collectionValue,
    }),
    [
      ownedCardCount,
      trackedSetIds.length,
      allSets.length,
      loading,
      unpricedCardCount,
      watchlistCount,
      collectionValue,
    ]
  );

  const tcgChartValues = normaliseChartValues(chartData.tcg);
  const ebayChartValues = normaliseChartValues(chartData.ebay);

  const activeChartValues =
    chartMode === 'EBAY' ? ebayChartValues : tcgChartValues;

  const hasChartData = chartData.tcg.length > 0 || chartData.ebay.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topBarBrand}>PocketVault</Text>
            <Text style={styles.topBarSubtitle}>Collector dashboard</Text>
          </View>

          <View style={styles.topBarActions}>
  <Pressable
    onPress={() => router.push('/notifications')}
    style={({ pressed }) => [styles.profileButton, pressed && styles.cardPressed]}
  >
    <Ionicons name="notifications-outline" size={26} color={theme.colors.text} />

    {unreadNotificationCount > 0 && (
      <View style={styles.notificationBadge}>
        <Text style={styles.notificationBadgeText}>
          {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
        </Text>
      </View>
    )}
  </Pressable>

  <Pressable
    onPress={() => router.push('/profile')}
    style={({ pressed }) => [styles.profileButton, pressed && styles.cardPressed]}
  >
    <Ionicons name="person-circle-outline" size={30} color={theme.colors.text} />
  </Pressable>
</View>
        </View>

        <View style={styles.portfolioCard}>
          <View style={styles.heroGlow} />

          <Text style={styles.portfolioLabel}>
            Collection Value ({chartMode === 'EBAY' ? 'eBay' : 'TCG'})
          </Text>
          <Text style={styles.portfolioValue}>{collectionValue}</Text>

          <View style={styles.portfolioChangeRow}>
            <Ionicons
              name={collectionUp ? 'arrow-up-circle' : 'arrow-down-circle'}
              size={18}
              color={collectionUp ? '#22C55E' : '#EF4444'}
            />
            <Text
              style={[
                styles.portfolioChange,
                collectionUp ? styles.positiveText : styles.negativeText,
              ]}
            >
              {formatSignedMoney(collectionChangeAmount)} ({formatSignedPercent(collectionChangePercent)}) today
            </Text>
          </View>

          <Text style={styles.updatedText}>
            Based on owned binder cards with available price snapshots
          </Text>

          <View style={styles.graphBox}>
            <View style={styles.graphHeader}>
              <Text style={styles.graphTitle}>Portfolio trend</Text>
            </View>

            <View style={styles.graphControls}>
              <View style={styles.graphTabs}>
                {(['TCG', 'EBAY', 'BOTH'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setChartMode(mode)}
                    style={[
                      styles.graphTab,
                      chartMode === mode && styles.graphTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.graphTabText,
                        chartMode === mode && styles.graphTabTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.graphTabs}>
                {(['1D', '7D', '30D', 'ALL'] as const).map((range) => (
                  <Pressable
                    key={range}
                    onPress={() => setChartRange(range)}
                    style={[
                      styles.graphTab,
                      chartRange === range && styles.graphTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.graphTabText,
                        chartRange === range && styles.graphTabTextActive,
                      ]}
                    >
                      {range}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <LineChart
              data={{
                labels: activeChartValues.map(() => ''),
                datasets:
                  chartMode === 'BOTH'
                    ? [
                        {
                          data: tcgChartValues,
                          color: (opacity = 1) => `rgba(108,75,255,${opacity})`,
                        },
                        {
                          data: ebayChartValues,
                          color: (opacity = 1) => `rgba(234,179,8,${opacity})`,
                        },
                      ]
                    : [
                        {
                          data: activeChartValues,
                          color: (opacity = 1) =>
                            chartMode === 'EBAY'
                              ? `rgba(234,179,8,${opacity})`
                              : `rgba(108,75,255,${opacity})`,
                        },
                      ],
              }}
              width={screenWidth - 64}
              height={145}
              withDots={false}
              withInnerLines={true}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={true}
              fromZero={false}
              bezier
              chartConfig={{
                backgroundGradientFrom: theme.colors.card,
                backgroundGradientTo: theme.colors.card,
                decimalPlaces: 2,
                color: (opacity = 1) => `rgba(108,75,255,${opacity})`,
                labelColor: () => theme.colors.textSoft,
                propsForBackgroundLines: {
                  stroke: '#E2E5EB',
                },
                propsForLabels: {
                  fontSize: 9,
                },
              }}
              style={styles.chart}
            />

            {chartMode === 'BOTH' && (
              <View style={styles.graphLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.tcgDot]} />
                  <Text style={styles.legendText}>TCG</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.ebayDot]} />
                  <Text style={styles.legendText}>eBay</Text>
                </View>
              </View>
            )}

            {!hasChartData && (
              <Text style={styles.noChartText}>
                No price history yet. Your graph will build as daily TCG and eBay snapshots are saved.
              </Text>
            )}
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Quick stats</Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Owned cards" value={quickStats.ownedCards} />
          <StatCard label="Collection value" value={quickStats.collectionValue} />
          <StatCard label="Tracked sets" value={quickStats.trackedSets} />
          <StatCard label="Available sets" value={quickStats.availableSets} />
          <StatCard label="Unpriced cards" value={quickStats.unpriced} />
          <StatCard label="Watchlist" value={quickStats.watchlist} />
        </View>

        <View style={styles.sectionRow}>
  <Text style={styles.sectionTitle}>Recent Additions</Text>

  <Pressable onPress={() => router.push('/binder')}>
    <Text style={styles.viewAllText}>View all</Text>
  </Pressable>
</View>

        <View style={styles.sectionRow}>
  <Text style={styles.sectionTitle}>Recent Trade Listings</Text>

  <Pressable onPress={() => router.push('/trade')}>
    <Text style={styles.viewAllText}>View all</Text>
  </Pressable>
</View>

<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.recentListingsScroll}
>
  {recentListings.map((item) => {
   const imageUri = item.image_url ?? null;
const cardName = item.card_name ?? item.card_id ?? 'Unknown card';
const setName = item.set_name ?? item.set_id ?? 'Unknown set';

    return (
      <Pressable
        key={item.id}
        onPress={() => router.push('/trade')}
        style={({ pressed }) => [
          styles.recentCard,
          pressed && styles.cardPressed,
        ]}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.recentCardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.recentImageFallback}>
            <Ionicons name="albums-outline" size={30} color={theme.colors.primary} />
          </View>
        )}

        <Text style={styles.recentCardName} numberOfLines={1}>
          {cardName}
        </Text>

        <Text style={styles.recentCardSet} numberOfLines={1}>
          {setName}
        </Text>

        <Text style={styles.recentCardValue}>Newly listed</Text>
      </Pressable>
    );
  })}
</ScrollView>
</ScrollView>
    </SafeAreaView>
    );  
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  container: { padding: 18, paddingBottom: 120 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  topBarBrand: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  topBarSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 13,
    marginTop: 4,
  },
  profileButton: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  
topBarActions: {
  flexDirection: 'row',
  gap: 10,
},

notificationBadge: {
  position: 'absolute',
  top: -4,
  right: -4,
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  backgroundColor: '#EF4444',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 4,
},

notificationBadgeText: {
  color: '#FFFFFF',
  fontSize: 10,
  fontWeight: '900',
},

  portfolioCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    padding: 20,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  heroGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(108,75,255,0.08)',
    top: -80,
    right: -60,
  },
  portfolioLabel: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  portfolioValue: {
    color: theme.colors.text,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  portfolioChangeRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  portfolioChange: {
    fontSize: 15,
    fontWeight: '800',
  },
  updatedText: {
    marginTop: 7,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },

  graphBox: {
    marginTop: 18,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  graphTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  graphControls: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  graphTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  graphTab: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  graphTabActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  graphTabText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  graphTabTextActive: {
    color: '#FFFFFF',
  },
  graphLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  tcgDot: {
    backgroundColor: '#6C4BFF',
  },
  ebayDot: {
    backgroundColor: '#EAB308',
  },
  legendText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  chart: {
    marginTop: 12,
    marginLeft: -18,
    borderRadius: 14,
  },
  noChartText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...cardShadow,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
  },
  statLabel: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },

  activityCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: 22,
    ...cardShadow,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  activityIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  activityTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  activitySubtitle: {
    color: theme.colors.textSoft,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  activityTime: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  actionGrid: {
    gap: 12,
  },
  actionTile: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...cardShadow,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 3,
  },
  actionSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },

  positiveText: {
    color: '#22C55E',
  },
  negativeText: {
    color: '#EF4444',
  },
  viewAllText: {
  color: theme.colors.primary,
  fontSize: 13,
  fontWeight: '900',
},
viewAllText: {
  color: theme.colors.primary,
  fontSize: 13,
  fontWeight: '900',
},

recentListingsScroll: {
  gap: 12,
  paddingRight: 10,
  marginBottom: 24,
},

recentCard: {
  width: 128,
  backgroundColor: theme.colors.card,
  borderRadius: 20,
  padding: 10,
  borderWidth: 1,
  borderColor: theme.colors.border,
  ...cardShadow,
},

recentCardImage: {
  width: '100%',
  height: 130,
  marginBottom: 8,
},

recentImageFallback: {
  height: 130,
  borderRadius: 16,
  backgroundColor: theme.colors.surface,
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 8,
},

recentCardName: {
  color: theme.colors.text,
  fontSize: 13,
  fontWeight: '900',
},

recentCardSet: {
  color: theme.colors.textSoft,
  fontSize: 11,
  marginTop: 3,
},

recentCardValue: {
  color: theme.colors.primary,
  fontSize: 12,
  fontWeight: '900',
  marginTop: 8,
},
});