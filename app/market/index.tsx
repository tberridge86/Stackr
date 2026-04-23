import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

type PokemonCard = {
  id: string
  name: string
  number?: string
  rarity?: string
  images?: {
    small?: string
    large?: string
  }
  set?: {
    id?: string
    name?: string
    series?: string
  }
  tcgplayer?: {
    prices?: Record<
      string,
      {
        low?: number
        mid?: number
        high?: number
        market?: number
      }
    >
  }
  cardmarket?: {
    prices?: {
      averageSellPrice?: number
      trendPrice?: number
      lowPriceExPlus?: number
      avg1?: number
      avg7?: number
      avg30?: number
      reverseHoloTrend?: number
      lowPrice?: number
    }
  }
}

type WatchlistRow = {
  id?: string
  user_id?: string
  card_id: string
  set_id?: string | null
  created_at?: string
}

type WatchlistPriceState = {
  latestPrice: number | null
  previousPrice: number | null
  change: number | null
  hasHistory: boolean
}

type WatchlistPriceMap = Record<string, WatchlistPriceState>

type EbayDetailData = {
  low?: number | null
  average?: number | null
  high?: number | null
  count?: number | null
} | null

const POKEMON_TCG_API = 'https://api.pokemontcg.io/v2/cards'
const PRICE_API_URL = process.env.EXPO_PUBLIC_PRICE_API_URL || ''

const formatCurrency = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '--'
  return `£${value.toFixed(2)}`
}

const formatDelta = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}£${value.toFixed(2)}`
}

const getBestTcgMid = (card: PokemonCard): number | null => {
  const prices = card?.tcgplayer?.prices
  if (!prices) return null

  const preferredOrder = [
    'holofoil',
    'reverseHolofoil',
    'normal',
    '1stEditionHolofoil',
    '1stEditionNormal',
  ]

  for (const key of preferredOrder) {
    const mid = prices[key]?.mid
    if (typeof mid === 'number') return mid
  }

  for (const value of Object.values(prices)) {
    if (typeof value?.mid === 'number') return value.mid
  }

  return null
}

const getBestTcgLow = (card: PokemonCard): number | null => {
  const prices = card?.tcgplayer?.prices
  if (!prices) return null

  const preferredOrder = [
    'holofoil',
    'reverseHolofoil',
    'normal',
    '1stEditionHolofoil',
    '1stEditionNormal',
  ]

  for (const key of preferredOrder) {
    const low = prices[key]?.low
    if (typeof low === 'number') return low
  }

  for (const value of Object.values(prices)) {
    if (typeof value?.low === 'number') return value.low
  }

  return null
}

export default function MarketScreen() {
  console.log('API URL:', process.env.EXPO_PUBLIC_PRICE_API_URL)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<PokemonCard[]>([])
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)

  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([])
  const [watchlistLoading, setWatchlistLoading] = useState(true)
  const [watchlistPriceMap, setWatchlistPriceMap] = useState<WatchlistPriceMap>({})
  const [loadingWatchlistPrices, setLoadingWatchlistPrices] = useState(false)

  const [detailEbayData, setDetailEbayData] = useState<EbayDetailData>(null)
  const [detailPriceLoading, setDetailPriceLoading] = useState(false)

  const [watchlistCards, setWatchlistCards] = useState<PokemonCard[]>([])
  const [watchlistCardsLoading, setWatchlistCardsLoading] = useState(false)

  const watchedCardIds = useMemo(() => {
    return new Set(watchlist.map((item) => item.card_id))
  }, [watchlist])

  const isWatching = useCallback(
    (cardId: string) => watchedCardIds.has(cardId),
    [watchedCardIds]
  )

  const getCurrentUser = async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      console.error('Error getting user:', error)
      setUserId(null)
      return
    }
    setUserId(data.user?.id ?? null)
  }

  const loadWatchlistPriceChanges = async (watchedCards: { card_id: string }[]) => {
    try {
      if (!watchedCards?.length) {
        setWatchlistPriceMap({})
        return
      }

      setLoadingWatchlistPrices(true)

      const cardIds = [...new Set(watchedCards.map((c) => c.card_id).filter(Boolean))]

      const { data, error } = await supabase
        .from('market_price_snapshots')
        .select('card_id, ebay_average, tcg_mid, snapshot_at')
        .in('card_id', cardIds)
        .order('snapshot_at', { ascending: false })

      if (error) {
        console.error('Error loading watchlist price snapshots:', error)
        return
      }

      const grouped: Record<string, any[]> = {}

      for (const row of data || []) {
        if (!grouped[row.card_id]) grouped[row.card_id] = []
        if (grouped[row.card_id].length < 2) {
          grouped[row.card_id].push(row)
        }
      }

      const nextMap: WatchlistPriceMap = {}

      for (const cardId of cardIds) {
        const snapshots = grouped[cardId] || []
        const latest = snapshots[0]
        const previous = snapshots[1]

        const latestPrice = latest?.ebay_average ?? latest?.tcg_mid ?? null
        const previousPrice = previous?.ebay_average ?? previous?.tcg_mid ?? null

        nextMap[cardId] = {
          latestPrice,
          previousPrice,
          change:
            latestPrice != null && previousPrice != null
              ? latestPrice - previousPrice
              : null,
          hasHistory: snapshots.length > 1,
        }
      }

      setWatchlistPriceMap(nextMap)
    } catch (err) {
      console.error('Unexpected error loading watchlist price changes:', err)
    } finally {
      setLoadingWatchlistPrices(false)
    }
  }

  const loadWatchlist = async () => {
    try {
      setWatchlistLoading(true)

      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = authData.user?.id ?? null
      setUserId(currentUserId)

      if (!currentUserId) {
        setWatchlist([])
        setWatchlistPriceMap({})
        return
      }

      const { data, error } = await supabase
        .from('market_watchlist')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading watchlist:', error)
        return
      }

      const rows = (data || []) as WatchlistRow[]
      setWatchlist(rows)
      await loadWatchlistPriceChanges(rows)
    } catch (err) {
      console.error('Unexpected error loading watchlist:', err)
    } finally {
      setWatchlistLoading(false)
    }
  }

  const searchCards = async () => {
    try {
      if (!query.trim()) {
        setSearchResults([])
        return
      }

      setSearching(true)

      const cleanQuery = query.trim().replace(/"/g, '')
      const url = `${POKEMON_TCG_API}?q=name:${encodeURIComponent(cleanQuery)}*&orderBy=set.releaseDate&pageSize=30`

      const response = await fetch(url)
      const json = await response.json()

      const cards = Array.isArray(json?.data) ? json.data : []
      setSearchResults(cards)
    } catch (err) {
      console.error('Error searching cards:', err)
    } finally {
      setSearching(false)
    }
  }

  const fetchDetailEbayData = async (card: PokemonCard) => {
    try {
      if (!PRICE_API_URL) {
        setDetailEbayData(null)
        return
      }

      setDetailPriceLoading(true)
      setDetailEbayData(null)

      const params = new URLSearchParams({
        cardId: card.id,
        name: card.name || '',
        setName: card.set?.name || '',
        number: card.number || '',
      })

      const url = `${PRICE_API_URL}/api/price/ebay?${params.toString()}`
      console.log('eBay request URL:', url)

      const response = await fetch(url)
      const rawText = await response.text()

      console.log('eBay status:', response.status)
      console.log('eBay raw response:', rawText.slice(0, 500))

      if (!response.ok) {
        console.error('eBay endpoint returned non-200 response')
        setDetailEbayData(null)
        return
      }

      let json: any
      try {
        json = JSON.parse(rawText)
      } catch (parseError) {
        console.error('API returned non-JSON:', rawText.slice(0, 500))
        setDetailEbayData(null)
        return
      }

      setDetailEbayData({
        low: json?.low ?? null,
        average: json?.average ?? null,
        high: json?.high ?? null,
        count: json?.count ?? null,
      })
    } catch (err) {
      console.error('Error fetching eBay data:', err)
      setDetailEbayData(null)
    } finally {
      setDetailPriceLoading(false)
    }
  }

  const openCardDetail = async (card: PokemonCard) => {
    setSelectedCard(card)
    setDetailVisible(true)
    await fetchDetailEbayData(card)
  }

  const addToWatchlist = async (card: PokemonCard) => {
    try {
      if (!userId) return

      const payload = {
        user_id: userId,
        card_id: card.id,
        set_id: card.set?.id ?? null,
      }

      const { error } = await supabase.from('market_watchlist').insert(payload)

      if (error) {
        console.error('Error adding to watchlist:', error)
        return
      }

      await loadWatchlist()
    } catch (err) {
      console.error('Unexpected error adding to watchlist:', err)
    }
  }

  const removeFromWatchlist = async (card: PokemonCard) => {
    try {
      if (!userId) return

      const { error } = await supabase
        .from('market_watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('card_id', card.id)

      if (error) {
        console.error('Error removing from watchlist:', error)
        return
      }

      await loadWatchlist()
    } catch (err) {
      console.error('Unexpected error removing from watchlist:', err)
    }
  }

  const toggleWatchlist = async (card: PokemonCard) => {
    if (isWatching(card.id)) {
      await removeFromWatchlist(card)
    } else {
      await addToWatchlist(card)
    }
  }

  const fetchCardsByIds = async (cardIds: string[]) => {
    if (!cardIds.length) return []

    const chunks: string[][] = []
    for (let i = 0; i < cardIds.length; i += 20) {
      chunks.push(cardIds.slice(i, i + 20))
    }

    const allCards: PokemonCard[] = []

    for (const chunk of chunks) {
      const q = chunk.map((id) => `id:${id}`).join(' OR ')
      const url = `${POKEMON_TCG_API}?q=${encodeURIComponent(q)}&pageSize=20`
      const response = await fetch(url)
      const json = await response.json()
      if (Array.isArray(json?.data)) {
        allCards.push(...json.data)
      }
    }

    return allCards
  }

  const loadWatchlistCards = async () => {
    try {
      if (!watchlist.length) {
        setWatchlistCards([])
        return
      }

      setWatchlistCardsLoading(true)
      const cards = await fetchCardsByIds(watchlist.map((w) => w.card_id))
      setWatchlistCards(cards)
    } catch (err) {
      console.error('Error loading watchlist card data:', err)
    } finally {
      setWatchlistCardsLoading(false)
    }
  }

  const onRefresh = async () => {
    try {
      setRefreshing(true)
      await loadWatchlist()
      await loadWatchlistCards()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    getCurrentUser()
    loadWatchlist()
  }, [])

  useEffect(() => {
    loadWatchlistCards()
  }, [watchlist])

  const renderPriceChange = (cardId: string) => {
    const priceData = watchlistPriceMap[cardId]

    if (!priceData) {
      return <Text style={styles.marketPriceSubtle}>--</Text>
    }

    const { latestPrice, change, hasHistory } = priceData

    let deltaStyle = styles.marketPriceNeutral
    if (change != null) {
      if (change > 0) deltaStyle = styles.marketPriceUp
      if (change < 0) deltaStyle = styles.marketPriceDown
    }

    return (
      <View style={styles.marketPriceRow}>
        <Text style={styles.marketPriceValue}>{formatCurrency(latestPrice)}</Text>
        <Text style={deltaStyle}>{hasHistory ? formatDelta(change) : '--'}</Text>
      </View>
    )
  }

  const renderCard = ({ item }: { item: PokemonCard }) => {
    const watching = isWatching(item.id)

    return (
      <Pressable style={styles.card} onPress={() => openCardDetail(item)}>
        <Image
          source={{ uri: item.images?.small || item.images?.large }}
          style={styles.cardImage}
          resizeMode="contain"
        />

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={styles.cardMeta} numberOfLines={1}>
            {item.set?.name || 'Unknown set'}
            {item.number ? ` • #${item.number}` : ''}
          </Text>

          <View style={styles.inlinePriceRow}>
            <Text style={styles.inlinePriceLabel}>TCG</Text>
            <Text style={styles.inlinePriceValue}>{formatCurrency(getBestTcgMid(item))}</Text>
          </View>

          <Pressable
            style={[styles.watchButton, watching && styles.watchButtonActive]}
            onPress={() => toggleWatchlist(item)}
          >
            <Text style={[styles.watchButtonText, watching && styles.watchButtonTextActive]}>
              {watching ? '✓ Watching' : 'Watch'}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    )
  }

  const renderWatchlistCard = ({ item }: { item: PokemonCard }) => {
    const watching = isWatching(item.id)

    return (
      <Pressable style={styles.watchlistCard} onPress={() => openCardDetail(item)}>
        <Image
          source={{ uri: item.images?.small || item.images?.large }}
          style={styles.watchlistImage}
          resizeMode="contain"
        />

        <View style={styles.watchlistInfo}>
          <Text style={styles.watchlistName} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={styles.watchlistSet} numberOfLines={1}>
            {item.set?.name || 'Unknown set'}
            {item.number ? ` • #${item.number}` : ''}
          </Text>

          {renderPriceChange(item.id)}

          <Pressable
            style={[styles.watchButtonSmall, watching && styles.watchButtonActive]}
            onPress={() => toggleWatchlist(item)}
          >
            <Text style={[styles.watchButtonText, watching && styles.watchButtonTextActive]}>
              {watching ? '✓ Watching' : 'Watch'}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Market</Text>
            <Text style={{ color: '#FFFFFF', marginTop: 6 }}>
              API: {process.env.EXPO_PUBLIC_PRICE_API_URL || 'NOT FOUND'}
            </Text>
            <Text style={styles.subtitle}>
              Search cards, watch prices, and track daily movement.
            </Text>

            <View style={styles.searchRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search card name..."
                placeholderTextColor="#7C8AA0"
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={searchCards}
              />
              <Pressable style={styles.searchButton} onPress={searchCards}>
                <Text style={styles.searchButtonText}>Search</Text>
              </Pressable>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Watchlist</Text>
              {loadingWatchlistPrices || watchlistLoading || watchlistCardsLoading ? (
                <ActivityIndicator color="#94A3B8" />
              ) : null}
            </View>

            {!userId ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Sign in to use your market watchlist.</Text>
              </View>
            ) : watchlistCardsLoading || watchlistLoading ? (
              <View style={styles.emptyBox}>
                <ActivityIndicator color="#94A3B8" />
              </View>
            ) : watchlistCards.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No watched cards yet.</Text>
              </View>
            ) : (
              <FlatList
                data={watchlistCards}
                keyExtractor={(item) => `watch-${item.id}`}
                renderItem={renderWatchlistCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.watchlistList}
              />
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Search Results</Text>
              {searching ? <ActivityIndicator color="#94A3B8" /> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          searching ? (
            <View style={styles.emptyBox}>
              <ActivityIndicator color="#94A3B8" />
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Search for a Pokémon card to view pricing and add it to your watchlist.
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      <Modal
        visible={detailVisible}
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Card Details</Text>
            <Pressable onPress={() => setDetailVisible(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {selectedCard ? (
              <>
                <Image
                  source={{ uri: selectedCard.images?.large || selectedCard.images?.small }}
                  style={styles.detailImage}
                  resizeMode="contain"
                />

                <Text style={styles.detailName}>{selectedCard.name}</Text>
                <Text style={styles.detailMeta}>
                  {selectedCard.set?.name || 'Unknown set'}
                  {selectedCard.number ? ` • #${selectedCard.number}` : ''}
                </Text>

                <Pressable
                  style={[
                    styles.watchButtonLarge,
                    isWatching(selectedCard.id) && styles.watchButtonActive,
                  ]}
                  onPress={() => toggleWatchlist(selectedCard)}
                >
                  <Text
                    style={[
                      styles.watchButtonText,
                      isWatching(selectedCard.id) && styles.watchButtonTextActive,
                    ]}
                  >
                    {isWatching(selectedCard.id) ? '✓ Watching' : 'Watch'}
                  </Text>
                </Pressable>

                <View style={styles.priceSection}>
                  <Text style={styles.priceSectionTitle}>TCGPlayer</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Low</Text>
                    <Text style={styles.priceValue}>
                      {formatCurrency(getBestTcgLow(selectedCard))}
                    </Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Mid</Text>
                    <Text style={styles.priceValue}>
                      {formatCurrency(getBestTcgMid(selectedCard))}
                    </Text>
                  </View>
                </View>

                <View style={styles.priceSection}>
                  <Text style={styles.priceSectionTitle}>Cardmarket</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Trend</Text>
                    <Text style={styles.priceValue}>
                      {formatCurrency(selectedCard.cardmarket?.prices?.trendPrice ?? null)}
                    </Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>30d Avg</Text>
                    <Text style={styles.priceValue}>
                      {formatCurrency(selectedCard.cardmarket?.prices?.avg30 ?? null)}
                    </Text>
                  </View>
                </View>

                <View style={styles.priceSection}>
                  <Text style={styles.priceSectionTitle}>eBay Sold</Text>

                  {detailPriceLoading ? (
                    <ActivityIndicator color="#94A3B8" />
                  ) : (
                    <>
                      <View style={styles.priceRow}>
                        <Text style={styles.priceLabel}>Low</Text>
                        <Text style={styles.priceValue}>
                          {formatCurrency(detailEbayData?.low ?? null)}
                        </Text>
                      </View>
                      <View style={styles.priceRow}>
                        <Text style={styles.priceLabel}>Average</Text>
                        <Text style={styles.priceValue}>
                          {formatCurrency(detailEbayData?.average ?? null)}
                        </Text>
                      </View>
                      <View style={styles.priceRow}>
                        <Text style={styles.priceLabel}>High</Text>
                        <Text style={styles.priceValue}>
                          {formatCurrency(detailEbayData?.high ?? null)}
                        </Text>
                      </View>
                      <View style={styles.priceRow}>
                        <Text style={styles.priceLabel}>Sales count</Text>
                        <Text style={styles.priceValue}>{detailEbayData?.count ?? '--'}</Text>
                      </View>
                    </>
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  listContent: {
    paddingBottom: 40,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#94A3B8',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#111A2B',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#22314D',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyBox: {
    backgroundColor: '#111A2B',
    borderRadius: 16,
    padding: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyText: {
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  watchlistList: {
    paddingBottom: 4,
    gap: 12,
  },
  watchlistCard: {
    width: 270,
    flexDirection: 'row',
    backgroundColor: '#111A2B',
    borderRadius: 18,
    padding: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#1C2A44',
  },
  watchlistImage: {
    width: 82,
    height: 114,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  watchlistInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  watchlistName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  watchlistSet: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
  marketPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  marketPriceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  marketPriceUp: {
    fontSize: 14,
    fontWeight: '700',
    color: '#22C55E',
  },
  marketPriceDown: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  marketPriceNeutral: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  marketPriceSubtle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 6,
  },
  card: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#111A2B',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1C2A44',
  },
  cardImage: {
    width: 86,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  cardName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  cardMeta: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
  inlinePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  inlinePriceLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  inlinePriceValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  watchButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  watchButtonSmall: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  watchButtonLarge: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  watchButtonActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  watchButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  watchButtonTextActive: {
    color: '#166534',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C2A44',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalContent: {
    padding: 16,
    paddingBottom: 40,
  },
  detailImage: {
    width: '100%',
    height: 360,
    backgroundColor: '#111A2B',
    borderRadius: 18,
  },
  detailName: {
    marginTop: 16,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  detailMeta: {
    marginTop: 6,
    color: '#94A3B8',
    fontSize: 15,
  },
  priceSection: {
    marginTop: 18,
    backgroundColor: '#111A2B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1C2A44',
  },
  priceSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  priceLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },
  priceValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
})