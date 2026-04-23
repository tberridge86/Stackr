import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { fetchAllSets, fetchCardsForSet, PokemonCard, PokemonSet } from '../lib/pokemonTcg';
import { useOffers } from '../components/offer-context';
import { supabase } from '../lib/supabase';

type LookupMap = Record<string, { card: PokemonCard; set: PokemonSet }>;
type SegmentKey = 'received' | 'sent' | 'history';
type ProfileMap = Record<string, { collector_name: string | null }>;

export default function OffersScreen() {
  const { offers, offersLoading, updateOfferStatus, removeOffer } = useOffers();
  const [lookup, setLookup] = useState<LookupMap>({});
  const [profileMap, setProfileMap] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string>('');
  const [segment, setSegment] = useState<SegmentKey>('received');

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setMe(user?.id ?? '');
    };

    loadUser();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const allSets = await fetchAllSets();

        const uniqueSetIds = Array.from(
          new Set(
            offers.flatMap((offer) => [
              offer.targetSetId,
              ...offer.offeredCards.map((c) => c.setId),
            ])
          )
        );

        const uniqueUserIds = Array.from(
          new Set(
            offers.flatMap((offer) => [offer.fromUserId, offer.toUserId]).filter(Boolean)
          )
        );

        const [setCardsResults, profilesResult] = await Promise.all([
          Promise.all(
            uniqueSetIds.map(async (setId) => {
              const set = allSets.find((s) => s.id === setId);
              if (!set) return null;

              const cards = await fetchCardsForSet(setId);
              return { set, cards };
            })
          ),
          uniqueUserIds.length
            ? supabase
                .from('profiles')
                .select('id, collector_name')
                .in('id', uniqueUserIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        const nextLookup: LookupMap = {};

        setCardsResults.forEach((result) => {
          if (!result) return;

          result.cards.forEach((card) => {
            nextLookup[card.id] = { card, set: result.set };
          });
        });

        const nextProfiles: ProfileMap = {};
        (profilesResult.data ?? []).forEach((profile: any) => {
          nextProfiles[profile.id] = {
            collector_name: profile.collector_name ?? null,
          };
        });

        setLookup(nextLookup);
        setProfileMap(nextProfiles);
      } catch (error) {
        console.log('Failed to load offers', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [offers]);

  const receivedOffers = useMemo(
    () => offers.filter((offer) => offer.toUserId === me && offer.status === 'pending'),
    [offers, me]
  );

  const sentOffers = useMemo(
    () => offers.filter((offer) => offer.fromUserId === me && offer.status === 'pending'),
    [offers, me]
  );

  const historyOffers = useMemo(
    () => offers.filter((offer) => offer.status !== 'pending'),
    [offers]
  );

  const currentOffers = useMemo(() => {
    if (segment === 'received') return receivedOffers;
    if (segment === 'sent') return sentOffers;
    return historyOffers;
  }, [segment, receivedOffers, sentOffers, historyOffers]);

  const renderSegmentButton = (key: SegmentKey, label: string, count: number) => {
    const active = segment === key;

    return (
      <Pressable
        onPress={() => setSegment(key)}
        style={[styles.segmentButton, active && styles.segmentButtonActive]}
      >
        <Text
          style={[
            styles.segmentButtonText,
            active && styles.segmentButtonTextActive,
          ]}
        >
          {label}
        </Text>
        <View
          style={[
            styles.segmentCount,
            active && styles.segmentCountActive,
          ]}
        >
          <Text
            style={[
              styles.segmentCountText,
              active && styles.segmentCountTextActive,
            ]}
          >
            {count}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderOffer = (offerId: string) => {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return null;

    const target = lookup[offer.targetCardId];
    const offeredCards = offer.offeredCards
      .map((ref) => lookup[ref.cardId])
      .filter(Boolean);

    if (!target || offeredCards.length === 0) return null;

    const isReceived = offer.toUserId === me;
    const isPending = offer.status === 'pending';

    const fromName =
      profileMap[offer.fromUserId]?.collector_name || 'Unknown collector';
    const toName =
      profileMap[offer.toUserId]?.collector_name || 'Unknown collector';

    return (
      <View key={offer.id} style={styles.offerCard}>
        <View style={styles.offerTopRow}>
          <Text style={styles.offerTitle}>
            {isReceived ? 'Offer received' : 'Offer sent'}
          </Text>
          <View
            style={[
              styles.statusBadge,
              offer.status === 'pending'
                ? styles.pendingBadge
                : offer.status === 'accepted'
                ? styles.acceptedBadge
                : styles.declinedBadge,
            ]}
          >
            <Text style={styles.statusText}>
              {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.partiesBox}>
          <Text style={styles.partyText}>From: {fromName}</Text>
          <Text style={styles.partyText}>To: {toName}</Text>
        </View>

        <View style={styles.offerRow}>
          <View style={styles.targetSide}>
            {target.card.images?.small ? (
              <Image
                source={{ uri: target.card.images.small }}
                style={styles.targetCardImage}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.sideLabel}>Target card</Text>
            <Text style={styles.cardName} numberOfLines={2}>
              {target.card.name}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={2}>
              {target.set.name}
            </Text>
          </View>

          <View style={styles.middle}>
            <Text style={styles.swapText}>⇄</Text>
            {offer.cashTopUp ? (
              <Text style={styles.cashText}>+ £{offer.cashTopUp}</Text>
            ) : (
              <Text style={styles.cashText}>No cash</Text>
            )}
          </View>

          <View style={styles.offerSide}>
            <Text style={styles.sideLabel}>Offered cards</Text>

            {offeredCards.map((entry, index) => (
              <View key={`${offer.id}-${entry.card.id}-${index}`} style={styles.offerItemRow}>
                {entry.card.images?.small ? (
                  <Image
                    source={{ uri: entry.card.images.small }}
                    style={styles.offerCardImage}
                    resizeMode="contain"
                  />
                ) : null}

                <View style={styles.offerItemText}>
                  <Text style={styles.offerItemName} numberOfLines={1}>
                    {entry.card.name}
                  </Text>
                  <Text style={styles.offerItemMeta} numberOfLines={1}>
                    {entry.set.name}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {offer.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Note</Text>
            <Text style={styles.noteText}>{offer.note}</Text>
          </View>
        ) : null}

        {isPending && isReceived ? (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => updateOfferStatus(offer.id, 'accepted')}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.declineButton]}
              onPress={() => updateOfferStatus(offer.id, 'declined')}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </Pressable>
          </View>
        ) : isPending && !isReceived ? (
          <Pressable
            style={styles.removeButton}
            onPress={() => removeOffer(offer.id)}
          >
            <Text style={styles.removeButtonText}>Withdraw Offer</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.removeButton}
            onPress={() => removeOffer(offer.id)}
          >
            <Text style={styles.removeButtonText}>Remove Offer</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const emptyText =
    segment === 'received'
      ? 'No received offers yet.'
      : segment === 'sent'
      ? 'No sent offers yet.'
      : 'No accepted or declined offers yet.';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.heading}>Offers</Text>
            <Text style={styles.subheading}>
              Review received, sent, and completed offers
            </Text>
          </View>
        </View>

        <View style={styles.segmentRow}>
          {renderSegmentButton('received', 'Received', receivedOffers.length)}
          {renderSegmentButton('sent', 'Sent', sentOffers.length)}
          {renderSegmentButton('history', 'History', historyOffers.length)}
        </View>

       {loading || offersLoading ? (
  <Text style={styles.loadingText}>Loading offers...</Text>
) : currentOffers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        ) : (
          currentOffers.map((offer) => renderOffer(offer.id))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 18, paddingBottom: 120 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#121938',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 26,
    marginTop: -2,
  },
  headerTextWrap: { flex: 1 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  subheading: { color: '#AAB3D1', fontSize: 14 },

  segmentRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    backgroundColor: '#121938',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#2563eb',
  },
  segmentButtonText: {
    color: '#AAB3D1',
    fontWeight: '700',
    fontSize: 13,
  },
  segmentButtonTextActive: {
    color: '#fff',
  },
  segmentCount: {
    marginTop: 6,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#1f274d',
  },
  segmentCountActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  segmentCountText: {
    color: '#AAB3D1',
    fontWeight: '800',
    textAlign: 'center',
    fontSize: 11,
  },
  segmentCountTextActive: {
    color: '#fff',
  },

  loadingText: {
    color: '#AAB3D1',
  },
  emptyCard: {
    backgroundColor: '#121938',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  emptyText: {
    color: '#AAB3D1',
  },

  offerCard: {
    backgroundColor: '#121938',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  offerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },

  partiesBox: {
    backgroundColor: '#111735',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  partyText: {
    color: '#AAB3D1',
    fontSize: 12,
    marginBottom: 2,
  },

  offerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  targetSide: {
    flex: 1,
    alignItems: 'center',
  },
  offerSide: {
    flex: 1.2,
  },
  middle: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 30,
  },
  swapText: {
    color: '#FFD166',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
  },
  cashText: {
    color: '#AAB3D1',
    fontSize: 12,
    textAlign: 'center',
  },

  targetCardImage: {
    width: 74,
    height: 102,
    marginBottom: 8,
  },
  offerCardImage: {
    width: 42,
    height: 58,
    marginRight: 10,
  },

  sideLabel: {
    color: '#8f9bc2',
    fontSize: 11,
    marginBottom: 4,
    textAlign: 'center',
  },
  cardName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  cardMeta: {
    color: '#AAB3D1',
    fontSize: 11,
    textAlign: 'center',
  },

  offerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111735',
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
  },
  offerItemText: {
    flex: 1,
  },
  offerItemName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  offerItemMeta: {
    color: '#AAB3D1',
    fontSize: 11,
    marginTop: 2,
  },

  noteBox: {
    backgroundColor: '#111735',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  noteTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  noteText: {
    color: '#AAB3D1',
    fontSize: 12,
    lineHeight: 18,
  },

  statusBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  pendingBadge: {
    backgroundColor: 'rgba(255,209,102,0.14)',
  },
  acceptedBadge: {
    backgroundColor: 'rgba(94,211,161,0.14)',
  },
  declinedBadge: {
    backgroundColor: 'rgba(255,107,107,0.14)',
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#5ED3A1',
  },
  declineButton: {
    backgroundColor: '#FF6B6B',
  },
  acceptButtonText: {
    color: '#0b0f2a',
    fontWeight: '900',
  },
  declineButtonText: {
    color: '#0b0f2a',
    fontWeight: '900',
  },

  removeButton: {
    backgroundColor: '#1f274d',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  removeButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
});