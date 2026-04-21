import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  ScrollView,
  Pressable,
  View,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchAllSets, fetchCardsForSet, PokemonCard, PokemonSet } from '../../lib/pokemonTcg';
import { useTrade } from '../../components/trade-context';

type TradeGroup = {
  set: PokemonSet;
  cards: PokemonCard[];
};

function extractSetIdFromCardId(cardId: string) {
  const parts = cardId.split('-');
  return parts.slice(0, -1).join('-');
}

export default function TradeScreen() {
  const {
    tradeCardIds,
    wishlistCardIds,
    toggleTradeCard,
    toggleWishlistCard,
    getMeta,
  } = useTrade();

  const [tradeGroups, setTradeGroups] = useState<TradeGroup[]>([]);
  const [wishlistGroups, setWishlistGroups] = useState<TradeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTradeData = async () => {
      try {
        const allSets = await fetchAllSets();

        const tradeSetIds = Array.from(new Set(tradeCardIds.map(extractSetIdFromCardId)));
        const wishlistSetIds = Array.from(new Set(wishlistCardIds.map(extractSetIdFromCardId)));
        const allNeededSetIds = Array.from(new Set([...tradeSetIds, ...wishlistSetIds]));

        const cardResults = await Promise.all(
          allNeededSetIds.map(async (setId) => {
            const cards = await fetchCardsForSet(setId);
            return { setId, cards };
          })
        );

        const cardsBySet = Object.fromEntries(
          cardResults.map((entry) => [entry.setId, entry.cards])
        );

        const nextTradeGroups: TradeGroup[] = tradeSetIds
          .map((setId) => {
            const set = allSets.find((s) => s.id === setId);
            if (!set) return null;

            const cards = (cardsBySet[setId] ?? []).filter((card) =>
              tradeCardIds.includes(card.id)
            );

            if (cards.length === 0) return null;

            return { set, cards };
          })
          .filter(Boolean) as TradeGroup[];

        const nextWishlistGroups: TradeGroup[] = wishlistSetIds
          .map((setId) => {
            const set = allSets.find((s) => s.id === setId);
            if (!set) return null;

            const cards = (cardsBySet[setId] ?? []).filter((card) =>
              wishlistCardIds.includes(card.id)
            );

            if (cards.length === 0) return null;

            return { set, cards };
          })
          .filter(Boolean) as TradeGroup[];

        setTradeGroups(nextTradeGroups);
        setWishlistGroups(nextWishlistGroups);
      } catch (error) {
        console.log('Failed to load trade screen', error);
      } finally {
        setLoading(false);
      }
    };

    loadTradeData();
  }, [tradeCardIds, wishlistCardIds]);

  const tradeCount = useMemo(
    () => tradeGroups.reduce((sum, group) => sum + group.cards.length, 0),
    [tradeGroups]
  );

  const wishlistCount = useMemo(
    () => wishlistGroups.reduce((sum, group) => sum + group.cards.length, 0),
    [wishlistGroups]
  );

  const ListingCard = ({
    card,
    set,
    mode,
  }: {
    card: PokemonCard;
    set: PokemonSet;
    mode: 'trade' | 'wanted';
  }) => {
    const isTrade = mode === 'trade';
    const meta = getMeta(card.id);

    return (
      <View style={styles.listingCard}>
        <Pressable
          onPress={() => router.push(`/card/${card.id}?setId=${set.id}`)}
          style={({ pressed }) => [styles.listingMain, pressed && styles.cardPressed]}
        >
          <View style={styles.imageWrap}>
            {card.images?.small ? (
              <Image
                source={{ uri: card.images.small }}
                style={styles.cardImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.cardImageFallback}>
                <Ionicons name="image-outline" size={24} color="#7987b3" />
              </View>
            )}
          </View>

          <View style={styles.listingTextWrap}>
            <Text style={styles.cardName} numberOfLines={2}>
              {card.name}
            </Text>

            <Text style={styles.cardSet} numberOfLines={1}>
              {set.name}
            </Text>

            <Text style={styles.cardMeta} numberOfLines={1}>
              #{card.number} {card.rarity ? `· ${card.rarity}` : ''}
            </Text>

            {meta.condition ? (
              <Text style={styles.metaText}>Condition: {meta.condition}</Text>
            ) : null}

            {meta.value ? (
              <Text style={styles.metaText}>£{meta.value}</Text>
            ) : null}

            {meta.notes ? (
              <Text style={styles.notesText} numberOfLines={2}>
                {meta.notes}
              </Text>
            ) : null}

            <View style={styles.marketRow}>
              <View style={[styles.statusBadge, isTrade ? styles.tradeBadge : styles.wantedBadge]}>
                <Ionicons
                  name={isTrade ? 'swap-horizontal' : 'heart'}
                  size={12}
                  color="#0b0f2a"
                />
                <Text style={styles.statusBadgeText}>
                  {isTrade ? 'For Trade' : 'Wanted'}
                </Text>
              </View>

              <View style={styles.viewListingBadge}>
                <Ionicons name="open-outline" size={12} color="#FFD166" />
                <Text style={styles.viewListingText}>Details</Text>
              </View>
            </View>
          </View>
        </Pressable>

        <Pressable
          onPress={() =>
            isTrade ? toggleTradeCard(card.id) : toggleWishlistCard(card.id)
          }
          style={({ pressed }) => [
            styles.removeButton,
            pressed && styles.removeButtonPressed,
          ]}
        >
          <Ionicons name="close-circle" size={16} color="#FF8B8B" />
          <Text style={styles.removeButtonText}>
            {isTrade ? 'Remove trade' : 'Remove wanted'}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Trade</Text>
        <Text style={styles.subheading}>
          Manage your trade stock and wishlist like a marketplace inventory.
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{tradeCount}</Text>
            <Text style={styles.statLabel}>For Trade</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{wishlistCount}</Text>
            <Text style={styles.statLabel}>Wanted</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderTitle}>Loading trade lists...</Text>
            <Text style={styles.placeholderText}>Gathering your marked cards.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>For Trade</Text>
            {tradeGroups.length === 0 ? (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderTitle}>No trade cards yet</Text>
                <Text style={styles.placeholderText}>
                  Open a card and mark it as “For Trade”.
                </Text>
              </View>
            ) : (
              tradeGroups.map((group) => (
                <View key={`trade-${group.set.id}`} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.set.name}</Text>
                    <Text style={styles.groupMeta}>{group.cards.length} cards</Text>
                  </View>

                  <View style={styles.listingsWrap}>
                    {group.cards.map((card) => (
                      <ListingCard
                        key={card.id}
                        card={card}
                        set={group.set}
                        mode="trade"
                      />
                    ))}
                  </View>
                </View>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Wanted</Text>
            {wishlistGroups.length === 0 ? (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderTitle}>No wanted cards yet</Text>
                <Text style={styles.placeholderText}>
                  Open a card and add it to your wishlist.
                </Text>
              </View>
            ) : (
              wishlistGroups.map((group) => (
                <View key={`wish-${group.set.id}`} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.set.name}</Text>
                    <Text style={styles.groupMeta}>{group.cards.length} cards</Text>
                  </View>

                  <View style={styles.listingsWrap}>
                    {group.cards.map((card) => (
                      <ListingCard
                        key={card.id}
                        card={card}
                        set={group.set}
                        mode="wanted"
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 18, paddingBottom: 120 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subheading: { color: '#AAB3D1', fontSize: 15, lineHeight: 22, marginBottom: 20 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: '#111735',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statValue: {
    color: '#FFD166',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  statLabel: {
    color: '#91A0C8',
    fontSize: 12,
    fontWeight: '700',
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },

  placeholderCard: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  placeholderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  placeholderText: {
    color: '#AAB3D1',
    fontSize: 14,
    lineHeight: 20,
  },

  groupSection: {
    marginBottom: 20,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    alignItems: 'center',
  },
  groupTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    marginRight: 10,
  },
  groupMeta: {
    color: '#FFD166',
    fontSize: 12,
    fontWeight: '800',
  },

  listingsWrap: {
    gap: 12,
  },

  listingCard: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  listingMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageWrap: {
    width: 78,
    marginRight: 12,
  },
  cardImage: {
    width: '100%',
    height: 108,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardImageFallback: {
    width: '100%',
    height: 108,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingTextWrap: {
    flex: 1,
  },
  cardName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSet: {
    color: '#FFD166',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardMeta: {
    color: '#94A0C9',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  metaText: {
    color: '#AAB3D1',
    fontSize: 11,
    marginBottom: 4,
  },
  notesText: {
    color: '#8f9bc2',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },

  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tradeBadge: {
    backgroundColor: '#FFD166',
  },
  wantedBadge: {
    backgroundColor: '#FFB5C9',
  },
  statusBadgeText: {
    color: '#0b0f2a',
    fontSize: 11,
    fontWeight: '900',
  },
  viewListingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,209,102,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.16)',
  },
  viewListingText: {
    color: '#FFD166',
    fontSize: 11,
    fontWeight: '800',
  },

  removeButton: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  removeButtonPressed: {
    opacity: 0.75,
  },
  removeButtonText: {
    color: '#FF8B8B',
    fontSize: 12,
    fontWeight: '800',
  },

  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
});