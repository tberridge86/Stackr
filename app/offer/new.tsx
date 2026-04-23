import { supabase } from '../../lib/supabase';
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Image,
  TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchAllSets, fetchCardsForSet, PokemonCard, PokemonSet } from '../../lib/pokemonTcg';
import { useTrade } from '../../components/trade-context';
import { useOffers } from '../../components/offer-context';
import { fetchEbayPrice } from '../../lib/ebay';

type OfferedCardOption = {
  card: PokemonCard;
  set: PokemonSet;
};

type PriceSummary = {
  low: string | null;
  average: string | null;
  high: string | null;
  count: number;
};

function toNumber(value?: string | null) {
  if (!value) return null;
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

export default function NewOfferScreen() {
  const params = useLocalSearchParams<{
    listingId?: string;
    targetUserId?: string;
    cardId?: string;
    setId?: string;
  }>();

  const targetCardId = typeof params.cardId === 'string' ? params.cardId : '';
  const targetSetId = typeof params.setId === 'string' ? params.setId : '';

  const { tradeCardIds, getMeta } = useTrade();
  const { createOffer } = useOffers();

  const [targetCard, setTargetCard] = useState<PokemonCard | null>(null);
  const [targetSet, setTargetSet] = useState<PokemonSet | null>(null);
  const [offeredCards, setOfferedCards] = useState<OfferedCardOption[]>([]);
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const [cashTopUp, setCashTopUp] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);

  const [targetPrice, setTargetPrice] = useState<PriceSummary | null>(null);
  const [offeredPriceMap, setOfferedPriceMap] = useState<Record<string, PriceSummary>>({});

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const allSets = await fetchAllSets();

        const foundTargetSet = allSets.find((s) => s.id === targetSetId) ?? null;
        if (!mounted) return;
        setTargetSet(foundTargetSet);

        let foundTargetCard: PokemonCard | null = null;

        if (targetSetId) {
          const targetCards = await fetchCardsForSet(targetSetId);
          foundTargetCard = targetCards.find((c) => c.id === targetCardId) ?? null;
          if (!mounted) return;
          setTargetCard(foundTargetCard);
        }

        const tradeSetIds = Array.from(
          new Set(
            tradeCardIds.map((tradeId) => {
              const parts = tradeId.split('-');
              return parts.slice(0, -1).join('-');
            })
          )
        );

        const optionResults = await Promise.all(
          tradeSetIds.map(async (tradeSetId) => {
            const set = allSets.find((s) => s.id === tradeSetId);
            if (!set) return [];

            const cards = await fetchCardsForSet(tradeSetId);
            return cards
              .filter((c) => tradeCardIds.includes(c.id))
              .map((c) => ({ card: c, set }));
          })
        );

        const flatOptions = optionResults.flat();
        if (!mounted) return;
        setOfferedCards(flatOptions);

        if (foundTargetCard && foundTargetSet) {
          try {
            const query = `${foundTargetCard.name} ${foundTargetSet.name} ${foundTargetCard.number ?? ''}`.trim();
            const data = await fetchEbayPrice(query);

            if (mounted) {
              setTargetPrice({
                low: data.low ?? null,
                average: data.average ?? null,
                high: data.high ?? null,
                count: data.count ?? 0,
              });
            }
          } catch (error) {
            console.log('Failed to fetch target price', error);
          }
        }

        const priceEntries = await Promise.all(
          flatOptions.map(async (option) => {
            try {
              const query = `${option.card.name} ${option.set.name} ${option.card.number ?? ''}`.trim();
              const data = await fetchEbayPrice(query);

              return [
                option.card.id,
                {
                  low: data.low ?? null,
                  average: data.average ?? null,
                  high: data.high ?? null,
                  count: data.count ?? 0,
                } satisfies PriceSummary,
              ] as const;
            } catch {
              return [
                option.card.id,
                {
                  low: null,
                  average: null,
                  high: null,
                  count: 0,
                } satisfies PriceSummary,
              ] as const;
            }
          })
        );

        if (!mounted) return;
        setOfferedPriceMap(Object.fromEntries(priceEntries));
      } catch (error) {
        console.log('Failed to load offer builder', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [targetCardId, targetSetId, tradeCardIds]);

  const selectedOffers = useMemo(() => {
    return offeredCards.filter((option) => selectedOfferIds.includes(option.card.id));
  }, [offeredCards, selectedOfferIds]);

  const selectedCustomTotal = useMemo(() => {
    let total = 0;
    let hasAny = false;

    for (const option of selectedOffers) {
      const meta = getMeta(option.card.id);
      const custom = toNumber(meta?.value);
      if (custom !== null) {
        total += custom;
        hasAny = true;
      }
    }

    return hasAny ? +total.toFixed(2) : null;
  }, [selectedOffers, getMeta]);

  const selectedMarketTotal = useMemo(() => {
    let total = 0;
    let hasAny = false;

    for (const option of selectedOffers) {
      const market = toNumber(offeredPriceMap[option.card.id]?.average);
      if (market !== null) {
        total += market;
        hasAny = true;
      }
    }

    return hasAny ? +total.toFixed(2) : null;
  }, [selectedOffers, offeredPriceMap]);

  const targetMarket = toNumber(targetPrice?.average);
  const offeredBestValue = selectedCustomTotal ?? selectedMarketTotal;

  const suggestedTopUp =
    targetMarket !== null && offeredBestValue !== null
      ? Math.max(0, +(targetMarket - offeredBestValue).toFixed(2))
      : null;

  const toggleOfferCard = (cardId: string) => {
    setSelectedOfferIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId]
    );
  };

  const useSuggestedTopUp = () => {
    if (suggestedTopUp === null) return;
    setCashTopUp(suggestedTopUp.toFixed(2));
  };

const submitOffer = async () => {
  if (!targetCard || !targetSet || selectedOffers.length === 0) return;

  const listingId = typeof params.listingId === 'string' ? params.listingId : '';
  const toUserId = typeof params.targetUserId === 'string' ? params.targetUserId : '';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await createOffer({
    listingId,
    fromUserId: user.id,
    toUserId,
    targetCardId: targetCard.id,
    targetSetId: targetSet.id,
    offeredCards: selectedOffers.map((option) => ({
      cardId: option.card.id,
      setId: option.set.id,
    })),
    cashTopUp,
    note,
  });

  router.replace('/offers');
};

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.heading}>Loading offer builder...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!targetCard || !targetSet) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.heading}>Target card not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹</Text>
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.heading}>Make Offer</Text>
            <Text style={styles.subheading}>Multi-card offer with optional cash top-up</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Target card</Text>
          <View style={styles.targetRow}>
            {targetCard.images?.small ? (
              <Image source={{ uri: targetCard.images.small }} style={styles.targetImage} resizeMode="contain" />
            ) : null}
            <View style={styles.targetText}>
              <Text style={styles.cardTitle}>{targetCard.name}</Text>
              <Text style={styles.cardMeta}>
                {targetSet.name} · #{targetCard.number}
              </Text>

              {targetPrice?.average ? (
                <View style={styles.priceSummaryBox}>
                  <Text style={styles.priceSummaryLabel}>Market guide</Text>
                  <Text style={styles.priceSummaryMain}>£{targetPrice.average}</Text>
                  <Text style={styles.priceSummarySub}>
                    Low £{targetPrice.low ?? 'N/A'} · High £{targetPrice.high ?? 'N/A'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Choose your offer cards</Text>

          <View style={styles.optionList}>
            {offeredCards.length === 0 ? (
              <Text style={styles.emptyText}>You do not have any cards marked For Trade yet.</Text>
            ) : (
              offeredCards.map((option) => {
                const selected = selectedOfferIds.includes(option.card.id);
                const meta = getMeta(option.card.id);
                const price = offeredPriceMap[option.card.id];

                return (
                  <Pressable
                    key={option.card.id}
                    onPress={() => toggleOfferCard(option.card.id)}
                    style={[styles.optionCard, selected && styles.optionCardSelected]}
                  >
                    {option.card.images?.small ? (
                      <Image source={{ uri: option.card.images.small }} style={styles.optionImage} resizeMode="contain" />
                    ) : null}
                    <View style={styles.optionText}>
                      <Text style={styles.cardTitle}>{option.card.name}</Text>
                      <Text style={styles.cardMeta}>
                        {option.set.name} · #{option.card.number}
                      </Text>
                      {meta.value ? (
                        <Text style={styles.smallMeta}>Your ask: £{meta.value}</Text>
                      ) : null}
                      {price?.average ? (
                        <Text style={styles.smallMeta}>Market: £{price.average}</Text>
                      ) : null}
                      {meta.condition ? (
                        <Text style={styles.smallMeta}>Condition: {meta.condition}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        {selectedOffers.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Offer comparison</Text>

            <View style={styles.compareRow}>
              <View style={styles.compareBox}>
                <Text style={styles.compareLabel}>Target market</Text>
                <Text style={styles.compareValue}>
                  {targetMarket !== null ? `£${targetMarket.toFixed(2)}` : 'N/A'}
                </Text>
              </View>

              <View style={styles.compareBox}>
                <Text style={styles.compareLabel}>Your offer value</Text>
                <Text style={styles.compareValue}>
                  {offeredBestValue !== null ? `£${offeredBestValue.toFixed(2)}` : 'N/A'}
                </Text>
                {selectedCustomTotal !== null ? (
                  <Text style={styles.compareSub}>Using combined custom values</Text>
                ) : selectedMarketTotal !== null ? (
                  <Text style={styles.compareSub}>Using combined market values</Text>
                ) : null}
              </View>
            </View>

            {suggestedTopUp !== null ? (
              <View style={styles.suggestedBox}>
                <Text style={styles.suggestedLabel}>Suggested cash top-up</Text>
                <Text style={styles.suggestedValue}>
                  {suggestedTopUp > 0 ? `£${suggestedTopUp.toFixed(2)}` : 'No top-up needed'}
                </Text>

                {suggestedTopUp > 0 ? (
                  <Pressable style={styles.suggestedButton} onPress={useSuggestedTopUp}>
                    <Text style={styles.suggestedButtonText}>Use suggested amount</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.suggestedBox}>
                <Text style={styles.suggestedLabel}>Suggested cash top-up</Text>
                <Text style={styles.suggestedValue}>Not enough pricing data yet</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Cash top-up (£)</Text>
            <TextInput
              value={cashTopUp}
              onChangeText={setCashTopUp}
              placeholder="Optional"
              placeholderTextColor="#8f9bc2"
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Optional note for review"
              placeholderTextColor="#8f9bc2"
              multiline
              style={[styles.input, styles.notesInput]}
            />

            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Offer summary</Text>
              <Text style={styles.summaryText}>
                Cards offered: {selectedOffers.length}
              </Text>
              {selectedOffers.map((option) => (
                <Text key={option.card.id} style={styles.summaryText}>
                  • {option.card.name}
                </Text>
              ))}
              {cashTopUp ? (
                <Text style={styles.summaryText}>Cash top-up: £{cashTopUp}</Text>
              ) : null}
            </View>

            <Pressable style={styles.submitButton} onPress={submitOffer}>
              <Text style={styles.submitButtonText}>Send Offer</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080b1d' },
  container: { padding: 18, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10162f',
    marginRight: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
    lineHeight: 24,
    marginTop: -2,
  },
  headerTextWrap: {
    flex: 1,
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  subheading: {
    color: '#a8b0cb',
    marginTop: 4,
    fontSize: 13,
  },

  sectionCard: {
    backgroundColor: '#0f1731',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1b2750',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 14,
  },

  targetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  targetImage: {
    width: 110,
    height: 154,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: '#0a1024',
  },
  targetText: {
    flex: 1,
  },

  optionList: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    backgroundColor: '#0a1024',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#16224a',
  },
  optionCardSelected: {
    borderColor: '#4da3ff',
    backgroundColor: '#12204a',
  },
  optionImage: {
    width: 74,
    height: 104,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: '#09101f',
  },
  optionText: {
    flex: 1,
    justifyContent: 'center',
  },

  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  cardMeta: {
    color: '#a8b0cb',
    marginTop: 4,
    fontSize: 13,
  },
  smallMeta: {
    color: '#d2d9f0',
    marginTop: 4,
    fontSize: 12,
  },
  emptyText: {
    color: '#a8b0cb',
    fontSize: 14,
  },

  priceSummaryBox: {
    marginTop: 12,
    backgroundColor: '#101b38',
    borderRadius: 12,
    padding: 12,
  },
  priceSummaryLabel: {
    color: '#a8b0cb',
    fontSize: 12,
    marginBottom: 4,
  },
  priceSummaryMain: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  priceSummarySub: {
    color: '#bfc8e8',
    fontSize: 12,
    marginTop: 4,
  },

  compareRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  compareBox: {
    flex: 1,
    backgroundColor: '#0a1024',
    borderRadius: 14,
    padding: 14,
  },
  compareLabel: {
    color: '#8ea0d1',
    fontSize: 12,
    marginBottom: 4,
  },
  compareValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  compareSub: {
    color: '#a8b0cb',
    fontSize: 12,
    marginTop: 6,
  },

  suggestedBox: {
    backgroundColor: '#101b38',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  suggestedLabel: {
    color: '#8ea0d1',
    fontSize: 12,
  },
  suggestedValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
  },
  suggestedButton: {
    marginTop: 10,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  suggestedButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  inputLabel: {
    color: '#d9e0f7',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0a1024',
    borderWidth: 1,
    borderColor: '#1a2b5f',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#fff',
    marginBottom: 14,
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  summaryBox: {
    backgroundColor: '#0a1024',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  summaryText: {
    color: '#d0d8f2',
    fontSize: 13,
    marginBottom: 4,
  },

  submitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});