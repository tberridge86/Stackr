import { useTheme } from '../../components/theme-context';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  FlatList,
} from 'react-native';
import { Text } from '../../components/Text';
import EditionAwareCardImage from '../../components/EditionAwareCardImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchBinders } from '../../lib/binders';
import { fetchEbayPrice } from '../../lib/ebay';
import { getPriceFromPokemonCard } from '../../lib/pricing';
import { EUR_TO_GBP, USD_TO_GBP } from '../../lib/config';
import type { ScanEditionHint } from '../../types/scan';

type TCGCard = {
  id: string;
  name: string;
  number: string;
  set_id: string;
  set_name: string;
  set_printed_total?: number | null;
  series: string;
  rarity: string;
  image_small: string;
  image_large?: string | null;
  raw_data?: any;
  release_date: string;
  editionHint?: '1st_edition' | 'unlimited' | 'shadowless' | null;
};

const EDITION_LABELS: Record<NonNullable<TCGCard['editionHint']>, string> = {
  '1st_edition': '1st Edition',
  unlimited: 'Unlimited',
  shadowless: 'Shadowless',
};

type TcgPriceVariant = {
  key: string;
  label: string;
  priceUsd: number;
  editionHint?: ScanEditionHint | null;
};

const TCG_VARIANT_LABELS: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse Holo',
  unlimited: 'Unlimited',
  unlimitedHolofoil: 'Unlimited Holo',
  '1stEditionNormal': '1st Edition Normal',
  '1stEditionHolofoil': '1st Edition Holo',
};

function getTcgVariantLabel(key: string) {
  return TCG_VARIANT_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function getEditionHintForVariantKey(key?: string | null): ScanEditionHint | null {
  if (!key) return null;
  if (key.startsWith('1stEdition')) return '1st_edition';
  if (key.startsWith('unlimited')) return 'unlimited';
  return null;
}

function getPriceValueFromVariant(value: any) {
  const price = value?.market ?? value?.mid ?? value?.low;
  return typeof price === 'number' && Number.isFinite(price) ? price : null;
}

function buildTcgVariantOptions(card: any): TcgPriceVariant[] {
  const prices = card?.tcgplayer?.prices ?? {};
  return Object.entries(prices)
    .map(([key, value]) => {
      const priceUsd = getPriceValueFromVariant(value);
      if (priceUsd == null) return null;
      return {
        key,
        label: getTcgVariantLabel(key),
        priceUsd,
        editionHint: getEditionHintForVariantKey(key),
      };
    })
    .filter(Boolean) as TcgPriceVariant[];
}

function pickDefaultVariantKey(options: TcgPriceVariant[], editionHint?: TCGCard['editionHint']) {
  if (!options.length) return null;
  if (editionHint === '1st_edition') {
    return options.find((option) => option.key === '1stEditionHolofoil')?.key
      ?? options.find((option) => option.key === '1stEditionNormal')?.key
      ?? options[0].key;
  }
  if (editionHint === 'unlimited') {
    return options.find((option) => option.key === 'unlimitedHolofoil')?.key
      ?? options.find((option) => option.key === 'unlimited')?.key
      ?? options.find((option) => option.key === 'holofoil')?.key
      ?? options.find((option) => option.key === 'normal')?.key
      ?? options[0].key;
  }
  return options.find((option) => option.key === 'holofoil')?.key
    ?? options.find((option) => option.key === 'normal')?.key
    ?? options[0].key;
}

type BinderOption = {
  id: string;
  name: string;
  color: string;
  cover_key: string | null;
};

export default function ScanResultScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    imageUrl?: string;
    cardName?: string;
    cardsJson?: string;
  }>();

  const cards: TCGCard[] = params.cardsJson ? JSON.parse(params.cardsJson) : [];

  const getEditionLabel = (card?: TCGCard | null) =>
    card?.editionHint ? EDITION_LABELS[card.editionHint] : null;

  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(
    cards.length === 1 ? cards[0] : null
  );
  const [binders, setBinders] = useState<BinderOption[]>([]);
  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(null);
  const [ebayPrice, setEbayPrice] = useState<{
    low: number | null;
    average: number | null;
    high: number | null;
  } | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [tcgPrice, setTcgPrice] = useState<number | null>(null);
  const [tcgPriceSource, setTcgPriceSource] = useState<string | null>(null);
  const [tcgVariants, setTcgVariants] = useState<TcgPriceVariant[]>([]);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const [tcgLoading, setTcgLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetchBinders().then((data) => {
      setBinders(
        data.map((b) => ({
          id: b.id,
          name: b.name,
          color: b.color,
          cover_key: b.cover_key ?? null,
        }))
      );
    });
  }, []);

  useEffect(() => {
    setSelectedVariantKey(null);
    setTcgVariants([]);
  }, [selectedCard?.id]);

  const selectedTcgVariant = useMemo(
    () => tcgVariants.find((variant) => variant.key === selectedVariantKey) ?? null,
    [selectedVariantKey, tcgVariants]
  );

  useEffect(() => {
    if (!selectedCard) return;

    const run = async () => {
      try {
        setEbayLoading(true);
        setEbayPrice(null);

        const result = await fetchEbayPrice({
          cardId: selectedCard.id,
          name: selectedCard.name,
          setName: selectedCard.set_name,
          number: selectedCard.number,
          setTotal: selectedCard.set_printed_total,
          rarity: [
            selectedCard.rarity,
            selectedTcgVariant?.label,
            selectedTcgVariant?.editionHint === '1st_edition' ? '1st edition' : null,
          ].filter(Boolean).join(' '),
        });
        console.log('eBay result:', result);

        setEbayPrice({
          low: result.low ?? null,
          average: result.average ?? null,
          high: result.high ?? null,
        });
      } catch (err) {
        console.log('eBay fetch error:', err);
        setEbayPrice(null);
      } finally {
        setEbayLoading(false);
      }

      try {
        setTcgLoading(true);
        setTcgPrice(null);
        setTcgPriceSource(null);

        const { data: cachedCard } = await supabase
          .from('pokemon_cards')
          .select('raw_data')
          .eq('id', selectedCard.id)
          .maybeSingle();

        const cachedRaw = cachedCard?.raw_data ?? selectedCard.raw_data;

        const response = await fetch(`https://api.pokemontcg.io/v2/cards/${selectedCard.id}`);
        const json = await response.json();
        const card = json?.data;
        const variants = buildTcgVariantOptions(cachedRaw).length
          ? buildTcgVariantOptions(cachedRaw)
          : buildTcgVariantOptions(card);
        setTcgVariants(variants);

        const nextVariantKey = selectedVariantKey && variants.some((variant) => variant.key === selectedVariantKey)
          ? selectedVariantKey
          : pickDefaultVariantKey(variants, selectedCard.editionHint);
        if (nextVariantKey !== selectedVariantKey) setSelectedVariantKey(nextVariantKey);

        const selectedVariant = variants.find((variant) => variant.key === nextVariantKey);
        if (selectedVariant) {
          setTcgPrice(Number((selectedVariant.priceUsd * USD_TO_GBP).toFixed(2)));
          setTcgPriceSource(`${selectedVariant.label} TCGPlayer`);
          console.log('Scan result TCG variant price selected:', {
            cardId: selectedCard.id,
            variant: selectedVariant.key,
            priceUsd: selectedVariant.priceUsd,
          });
          return;
        }

        const cachedTcgUsd = getPriceFromPokemonCard(cachedRaw, selectedCard.editionHint);
        const price = cachedTcgUsd ?? getPriceFromPokemonCard(card, selectedCard.editionHint);

        if (price != null) {
          setTcgPrice(Number((price * USD_TO_GBP).toFixed(2)));
          setTcgPriceSource(selectedCard.editionHint ? `${getEditionLabel(selectedCard)} TCGPlayer` : 'TCGPlayer');
          console.log('Scan result TCG price selected:', {
            cardId: selectedCard.id,
            editionHint: selectedCard.editionHint,
            source: 'pokemon-tcg-api',
            priceUsd: price,
          });
          return;
        }

        if (selectedCard.editionHint) {
          console.log('Scan result TCG price skipped generic snapshot for edition-specific scan:', {
            cardId: selectedCard.id,
            editionHint: selectedCard.editionHint,
            priceKeys: Object.keys(cachedRaw?.tcgplayer?.prices ?? card?.tcgplayer?.prices ?? {}),
          });
          setTcgPrice(null);
          return;
        }

        const { data: snapshot } = await supabase
          .from('market_price_snapshots')
          .select('tcg_mid, tcg_low, cardmarket_trend, snapshot_at')
          .eq('card_id', selectedCard.id)
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (snapshot?.tcg_mid != null || snapshot?.tcg_low != null) {
          setTcgPrice(Number(snapshot.tcg_mid ?? snapshot.tcg_low));
          setTcgPriceSource('Daily snapshot');
          return;
        }

        const cardmarketEur =
          cachedRaw?.cardmarket?.prices?.trendPrice ??
          cachedRaw?.cardmarket?.prices?.averageSellPrice ??
          cachedRaw?.cardmarket?.prices?.avg30;
        if (typeof cardmarketEur === 'number') {
          setTcgPrice(Number((cardmarketEur * EUR_TO_GBP).toFixed(2)));
          setTcgPriceSource('Cardmarket fallback');
          return;
        }
      } catch {
        setTcgPrice(null);
        setTcgPriceSource(null);
      } finally {
        setTcgLoading(false);
      }
    };

    run();
  }, [selectedCard, selectedTcgVariant?.label, selectedTcgVariant?.editionHint, selectedVariantKey]);

  const handleAddToBinder = async () => {
    if (!selectedBinderId || !selectedCard) return;

    try {
      setAdding(true);

        const { error } = await supabase
          .from('binder_cards')
          .upsert(
          {
            binder_id: selectedBinderId,
            card_id: selectedCard.id,
            set_id: selectedCard.set_id,
            owned: true,
            notes: '',
            card_name: selectedCard.name,
            card_number: selectedCard.number,
            image_url: selectedCard.image_small,
            set_name: selectedCard.set_name,
          },
          {
            onConflict: 'binder_id,card_id',
            ignoreDuplicates: false,
          }
        );

      if (error) throw error;

      if (selectedTcgVariant?.key) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('user_card_variants')
            .delete()
            .eq('user_id', user.id)
            .eq('card_id', selectedCard.id)
            .eq('set_id', selectedCard.set_id)
            .eq('variant', selectedTcgVariant.key);

          const { error: variantError } = await supabase
            .from('user_card_variants')
            .insert({
              user_id: user.id,
              card_id: selectedCard.id,
              set_id: selectedCard.set_id,
              variant: selectedTcgVariant.key,
            });
          if (variantError) throw variantError;
        }
      }

      setAdded(true);
      Alert.alert('✅ Added!', `${selectedCard.name} has been added to your binder.`, [{ text: 'OK' }]);
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not add card.');
    } finally {
      setAdding(false);
    }
  };

  // ===============================
  // RENDER CARD OPTION
  // ===============================

  const renderCardOption = ({ item }: { item: TCGCard }) => {
    const selected = selectedCard?.id === item.id;

    return (
      <TouchableOpacity
        onPress={() => { setSelectedCard(item); setAdded(false); }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: selected ? theme.colors.primary + '18' : theme.colors.card,
          borderRadius: 14,
          padding: 10,
          marginBottom: 8,
          borderWidth: 2,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          gap: 12,
        }}
        activeOpacity={0.8}
      >
        {item.image_small ? (
          <EditionAwareCardImage
            uri={item.image_small}
            cardId={item.id}
            rawData={item.raw_data}
            editionHint={item.editionHint}
            sourceSize="small"
            style={{ width: 50, height: 70, borderRadius: 6 }}
            resizeMode="contain"
          />
        ) : (
          <View style={{
            width: 50, height: 70,
            borderRadius: 6,
            backgroundColor: theme.colors.surface,
          }} />
        )}

        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 14 }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
            {item.set_name} · #{item.number}{getEditionLabel(item) ? ` · ${getEditionLabel(item)}` : ''}
          </Text>
          {item.rarity && (
            <Text style={{ color: '#FFD166', fontSize: 11, marginTop: 2, fontWeight: '700' }}>
              {item.rarity}
            </Text>
          )}
          <Text style={{ color: theme.colors.textSoft, fontSize: 10, marginTop: 2 }}>
            {item.release_date}
          </Text>
        </View>

        {selected && (
          <View style={{
            width: 24, height: 24,
            borderRadius: 12,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ===============================
  // MAIN RENDER
  // ===============================

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 35, paddingBottom: 60 }}
      >
        <View style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, paddingTop: 4 }}>
              <Text style={{ color: theme.colors.text, fontSize: 24 }}>←</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
              {cards.length === 1 ? 'Card Found!' : `${cards.length} Results`}
            </Text>
          </View>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
            {cards.length === 1
              ? 'Confirm and add to your binder'
              : 'Select the correct version'}
          </Text>
        </View>

        {/* If multiple results — show list to pick from */}
        {cards.length > 1 && (
          <View style={{
            backgroundColor: theme.colors.card,
            borderRadius: 18, padding: 14,
            borderWidth: 1, borderColor: theme.colors.border,
            marginBottom: 16,
          }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 12 }}>
              Which version is this?
            </Text>

            <FlatList
              data={cards}
              keyExtractor={(item) => item.id}
              renderItem={renderCardOption}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* Selected card details */}
        {selectedCard && (
          <>
            {/* Card image */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <EditionAwareCardImage
                uri={selectedCard.image_large ?? selectedCard.image_small}
                cardId={selectedCard.id}
                rawData={selectedCard.raw_data}
                editionHint={selectedTcgVariant?.editionHint ?? selectedCard.editionHint}
                sourceSize="large"
                style={{ width: 220, height: 308, borderRadius: 16 }}
                resizeMode="contain"
              />
            </View>

            {/* Card info */}
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18, padding: 16,
              borderWidth: 1, borderColor: theme.colors.border,
              marginBottom: 14,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>
                {selectedCard.name}
              </Text>
              <Text style={{ color: theme.colors.textSoft, fontSize: 14, marginBottom: 4 }}>
                {selectedCard.set_name} · #{selectedCard.number}{getEditionLabel(selectedCard) ? ` · ${getEditionLabel(selectedCard)}` : ''}
              </Text>
              {selectedCard.rarity && (
                <Text style={{ color: '#FFD166', fontSize: 13, fontWeight: '700', marginBottom: 4 }}>
                  {selectedCard.rarity}
                </Text>
              )}
              <Text style={{ color: theme.colors.textSoft, fontSize: 12 }}>
                Released: {selectedCard.release_date}
              </Text>

              {/* View full details */}
              <TouchableOpacity
                onPress={() => router.push(
                  `/card/${selectedCard.id}?setId=${selectedCard.set_id}${selectedTcgVariant?.editionHint ?? selectedCard.editionHint ? `&editionHint=${selectedTcgVariant?.editionHint ?? selectedCard.editionHint}` : ''}`
                )}
                style={{
                  marginTop: 12,
                  backgroundColor: theme.colors.surface,
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 13 }}>
                  View Full Card Details →
                </Text>
              </TouchableOpacity>
            </View>

            {/* eBay price */}
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18, padding: 16,
              borderWidth: 1, borderColor: theme.colors.border,
              marginBottom: 14,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 12 }}>
                eBay Sold Prices (GBP)
              </Text>

              {ebayLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                    Fetching live prices...
                  </Text>
                </View>
              ) : ebayPrice ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Low</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }}>
                      {ebayPrice.low != null ? `£${ebayPrice.low.toFixed(2)}` : '--'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: theme.colors.primary + '18', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.primary }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Avg</Text>
                    <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'center', fontSize: 15 }}>
                      {ebayPrice.average != null ? `£${ebayPrice.average.toFixed(2)}` : '--'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>High</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }}>
                      {ebayPrice.high != null ? `£${ebayPrice.high.toFixed(2)}` : '--'}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                  No eBay price available
                </Text>
              )}
            </View>

            {/* TCG price */}
            <View style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18, padding: 16,
              borderWidth: 1, borderColor: theme.colors.border,
              marginBottom: 14,
            }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 12 }}>
                TCG Market Price (GBP){getEditionLabel(selectedCard) ? ` · ${getEditionLabel(selectedCard)}` : ''}
              </Text>

              {tcgVariants.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                  style={{ marginBottom: 10 }}
                >
                  {tcgVariants.map((variant) => {
                    const selected = selectedVariantKey === variant.key;
                    return (
                      <TouchableOpacity
                        key={variant.key}
                        onPress={() => setSelectedVariantKey(variant.key)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 9,
                          borderRadius: 12,
                          backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                          borderWidth: 1,
                          borderColor: selected ? theme.colors.primary : theme.colors.border,
                        }}
                      >
                        <Text style={{ color: selected ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 12 }}>
                          {variant.label}
                        </Text>
                        <Text style={{ color: selected ? 'rgba(255,255,255,0.8)' : theme.colors.textSoft, fontWeight: '800', fontSize: 10, marginTop: 2, textAlign: 'center' }}>
                          GBP {(variant.priceUsd * USD_TO_GBP).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {tcgLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                    Fetching TCG prices...
                  </Text>
                </View>
              ) : tcgPrice ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>
                    £{tcgPrice.toFixed(2)}
                  </Text>
                  {tcgPriceSource && (
                    <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                      {tcgPriceSource}
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                  No TCG price available
                </Text>
              )}
            </View>

            {/* Add to binder */}
            {!added ? (
              <View style={{
                backgroundColor: theme.colors.card,
                borderRadius: 18, padding: 16,
                borderWidth: 1, borderColor: theme.colors.border,
                marginBottom: 14,
              }}>
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 12 }}>
                  Add to Binder
                </Text>

                {binders.length === 0 ? (
                  <Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>
                    No binders found. Create a binder first.
                  </Text>
                ) : (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                      style={{ marginBottom: 12 }}
                    >
                      {binders.map((binder) => {
                        const selected = selectedBinderId === binder.id;
                        return (
                          <TouchableOpacity
                            key={binder.id}
                            onPress={() => setSelectedBinderId(binder.id)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 10,
                              borderRadius: 12,
                              backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                              borderWidth: 1,
                              borderColor: selected ? theme.colors.primary : theme.colors.border,
                            }}
                          >
                            <Text style={{
                              color: selected ? '#FFFFFF' : theme.colors.text,
                              fontWeight: '900', fontSize: 13,
                            }}>
                              {binder.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      onPress={handleAddToBinder}
                      disabled={!selectedBinderId || adding}
                      style={{
                        backgroundColor: selectedBinderId
                          ? theme.colors.primary
                          : theme.colors.textSoft,
                        borderRadius: 14, paddingVertical: 14,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 8,
                        opacity: adding ? 0.6 : 1,
                      }}
                    >
                      {adding ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                          {selectedBinderId ? `Add to Binder` : 'Select a binder first'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <View style={{
                backgroundColor: '#D1FAE5',
                borderRadius: 18, padding: 16,
                borderWidth: 1, borderColor: '#6EE7B7',
                marginBottom: 14,
                alignItems: 'center',
              }}>
                <Text style={{ color: '#065F46', fontSize: 18, fontWeight: '900', marginBottom: 4 }}>
                  ✅ Added to Binder!
                </Text>
                <Text style={{ color: '#065F46', fontSize: 13 }}>
                  {selectedCard.name} is now in your collection.
                </Text>
              </View>
            )}

            {/* Scan another */}
            <TouchableOpacity
              onPress={() => router.replace('/scan')}
              style={{
                borderRadius: 14, paddingVertical: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                📷 Scan Another Card
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
