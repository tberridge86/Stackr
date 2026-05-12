import { useTheme } from '../../components/theme-context';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { Text } from '../../components/Text';
import { useLocalSearchParams } from 'expo-router';
import { useTrade } from '../../components/trade-context';
import { useProfile } from '../../components/profile-context';
import { createMarketplaceListing, deleteMarketplaceListing } from '../../lib/marketplace';
import {
  getCachedCardSync,
  getCachedCardsForSet,
  getCachedSets,
} from '../../lib/pokemonTcgCache';
import { fetchEbayPrice } from '../../lib/ebay';
import { USD_TO_GBP, EUR_TO_GBP } from '../../lib/config';

type PokemonCard = {
  id: string;
  name?: string;
  rarity?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set?: {
    id?: string;
    name?: string;
    series?: string;
  };
  number?: string;
  artist?: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  flavorText?: string;
  rules?: string[];
  attacks?: {
    name?: string;
    damage?: string;
    text?: string;
    cost?: string[];
  }[];
  weaknesses?: {
    type?: string;
    value?: string;
  }[];
  resistances?: {
    type?: string;
    value?: string;
  }[];
  retreatCost?: string[];
  convertedRetreatCost?: number;
  tcgplayer?: {
    updatedAt?: string;
    prices?: Record<string, any>;
  };
  cardmarket?: {
    updatedAt?: string;
    prices?: Record<string, any>;
  };
};

type EbayPriceResult = {
  low: number | null;
  average: number | null;
  high: number | null;
  count: number;
  usedFallback?: boolean;
};

const CONDITIONS = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Played'];

export default function CardDetailScreen() {
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id?: string; setId?: string }>();
  const cardId = typeof params.id === 'string' ? params.id : '';
  const paramSetId = typeof params.setId === 'string' ? params.setId : '';

  const {
    isForTrade,
    isWanted,
    toggleTradeCard,
    toggleWishlistCard,
    getMeta,
    updateTradeMeta,
    myListings,
    refreshTrade,
  } = useTrade();

  const { setFavoriteCard, setChaseCard, profile } = useProfile();

  const [card, setCard] = useState<PokemonCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [listingBusy, setListingBusy] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [chaseBusy, setChaseBusy] = useState(false);

  // eBay price state
  const [ebayPrice, setEbayPrice] = useState<EbayPriceResult | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [ebayError, setEbayError] = useState(false);

  // ===============================
  // LOAD CARD
  // ===============================

  useEffect(() => {
    let mounted = true;

    const loadCard = async () => {
      try {
        setLoading(true);

        let found: PokemonCard | null = null;

        if (paramSetId && cardId) {
          found = getCachedCardSync(paramSetId, cardId);

          if (!found) {
            const cards = await getCachedCardsForSet(paramSetId);
            found = cards.find((c) => c.id === cardId) ?? null;
          }
        }

        if (!found) {
          const sets = await getCachedSets();

          for (const set of sets) {
            let cached = getCachedCardSync(set.id, cardId);

            if (!cached) {
              const cards = await getCachedCardsForSet(set.id);
              cached = cards.find((c) => c.id === cardId) ?? null;
            }

            if (cached) {
              found = cached;
              break;
            }
          }
        }

        if (mounted) {
          setCard(found ?? null);
        }
      } catch (err) {
        console.error('Failed to load card:', err);
        if (mounted) setCard(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (cardId) {
      loadCard();
    } else {
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [cardId, paramSetId]);

  // ===============================
  // FETCH EBAY PRICE
  // ===============================

  const fetchEbay = useCallback(async (cardData: PokemonCard) => {
    try {
      setEbayLoading(true);
      setEbayError(false);

      const result = await fetchEbayPrice({
        cardId: cardData.id,
        name: cardData.name ?? '',
        setName: cardData.set?.name ?? '',
        number: cardData.number ?? '',
        rarity: cardData.rarity ?? '',
      });

      setEbayPrice({
        low: result.low ?? null,
        average: result.average ?? null,
        high: result.high ?? null,
        count: result.count ?? 0,
        usedFallback: result.usedFallback ?? false,
      });
    } catch (err) {
      console.error('eBay price fetch failed:', err);
      setEbayError(true);
    } finally {
      setEbayLoading(false);
    }
  }, []);

  // Auto-fetch eBay price once card is loaded
  useEffect(() => {
    if (card) {
      fetchEbay(card);
    }
  }, [card, fetchEbay]);

  // Fetch TCG/Cardmarket prices directly if missing from cache
  useEffect(() => {
    if (!card || card.tcgplayer || card.cardmarket) return;
    fetch(`https://api.pokemontcg.io/v2/cards/${card.id}`)
      .then(r => r.json())
      .then(json => {
        const d = json?.data;
        if (d) {
          setCard(prev => prev ? {
            ...prev,
            tcgplayer: d.tcgplayer ?? prev.tcgplayer,
            cardmarket: d.cardmarket ?? prev.cardmarket,
          } : prev);
        }
      })
      .catch(() => {});
  }, [card?.id]);

  // ===============================
  // MEMOS
  // ===============================

  const tradeMeta = useMemo(() => {
    return card ? getMeta(card.id) : {};
  }, [card, getMeta]);

  const existingActiveListing = useMemo(() => {
    if (!card) return null;
    return myListings.find(
      (listing) => listing.card_id === card.id && listing.status === 'active'
    );
  }, [card, myListings]);


  // TCGPlayer prices — converted from USD to GBP
  const tcgPrices = useMemo(() => {
    if (!card) return null;
    const prices = card.tcgplayer?.prices;
    if (!prices) return null;

    const preferred = [
      'holofoil',
      'reverseHolofoil',
      'normal',
      '1stEditionHolofoil',
      '1stEditionNormal',
    ];

    let entry: any = null;

    for (const key of preferred) {
      if (prices[key]) {
        entry = prices[key];
        break;
      }
    }

    if (!entry) {
      entry = Object.values(prices)[0] ?? null;
    }

    if (!entry) return null;

    const toGBP = (v: any) => typeof v === 'number' ? Math.round(v * USD_TO_GBP * 100) / 100 : null;

    return {
      low: toGBP(entry.low),
      mid: toGBP(entry.mid),
      market: toGBP(entry.market),
    };
  }, [card]);

  // CardMarket prices — converted from EUR to GBP
  const cardmarketPrice = useMemo(() => {
    if (!card) return null;
    const prices = card.cardmarket?.prices;
    if (!prices) return null;
    const eur = prices.trendPrice ?? prices.averageSellPrice ?? prices.avg30;
    return typeof eur === 'number' ? Math.round(eur * EUR_TO_GBP * 100) / 100 : null;
  }, [card]);

  const isFavorite =
    !!card &&
    profile?.favorite_card_id === card.id &&
    profile?.favorite_set_id === (card.set?.id ?? paramSetId);

  const isChase =
    !!card &&
    profile?.chase_card_id === card.id &&
    profile?.chase_set_id === (card.set?.id ?? paramSetId);

  // ===============================
  // HANDLERS
  // ===============================

  const handleSetCondition = (condition: string) => {
    if (!card) return;
    updateTradeMeta(card.id, { condition });
  };

  const handleSetNotes = (notes: string) => {
    if (!card) return;
    updateTradeMeta(card.id, { notes });
  };

  const handleSetValue = (value: string) => {
    if (!card) return;
    updateTradeMeta(card.id, { value });
  };

  const handleQuickValue = (value: number | null) => {
    if (!card || value == null) return;
    updateTradeMeta(card.id, { value: String(value) });
  };

  const handleSetFavorite = async () => {
    try {
      if (!card) return;
      const setId = card.set?.id ?? paramSetId;
      if (!setId) {
        Alert.alert('Error', 'Set information is missing for this card.');
        return;
      }
      setFavoriteBusy(true);
      await setFavoriteCard(card.id, setId);
      Alert.alert('Favourite updated', `${card.name ?? 'Card'} is now your favourite card.`);
    } catch (error) {
      Alert.alert('Error', 'Could not update favourite card.');
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleSetChase = async () => {
    try {
      if (!card) return;
      const setId = card.set?.id ?? paramSetId;
      if (!setId) {
        Alert.alert('Error', 'Set information is missing for this card.');
        return;
      }
      setChaseBusy(true);
      await setChaseCard(card.id, setId);
      Alert.alert('Chase updated', `${card.name ?? 'Card'} is now your chase card.`);
    } catch (error) {
      Alert.alert('Error', 'Could not update chase card.');
    } finally {
      setChaseBusy(false);
    }
  };

const handleListOnMarketplace = async () => {
    try {
      if (!card) {
        Alert.alert('Error', 'Card data not loaded yet.');
        return;
      }

      if (existingActiveListing) {
        Alert.alert('Already Listed', 'This card already has an active marketplace listing.');
        return;
      }

      setListingBusy(true);

      const result = await createMarketplaceListing({
        card_id: card.id,
        set_id: card.set?.id ?? paramSetId ?? null,
        custom_value:
          tradeMeta?.value && !Number.isNaN(Number(tradeMeta.value))
            ? Number(tradeMeta.value)
            : null,
        condition: tradeMeta?.condition ?? 'Unspecified',
        notes: tradeMeta?.notes ?? null,
      });

      console.log('Marketplace listing created:', result);
      await refreshTrade();
      Alert.alert('Listed', `${card.name ?? 'Card'} has been added to the marketplace.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list card on marketplace.';
      Alert.alert('Marketplace Error', message);
    } finally {
      setListingBusy(false);
    }
  };

  const handleDeleteListing = async () => {
    if (!existingActiveListing) return;
    
    Alert.alert(
      'Remove Listing',
      'Are you sure you want to remove this card from the marketplace?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setListingBusy(true);
              await deleteMarketplaceListing(existingActiveListing.id);
              await refreshTrade();
              Alert.alert('Removed', 'Card has been removed from the marketplace.');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to remove listing.';
              Alert.alert('Error', message);
            } finally {
              setListingBusy(false);
            }
          },
        },
      ]
    );
  };

  // ===============================
  // LOADING / ERROR STATES
  // ===============================

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading card...</Text>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Card not found</Text>
        <Text style={styles.errorText}>This card could not be loaded from cache.</Text>
      </View>
    );
  }

  const isTradeMarked = isForTrade(card.id);
  const isWishlisted = isWanted(card.id);

  // ===============================
  // RENDER
  // ===============================

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Card Image */}
      <View style={styles.heroCard}>
        {card.images?.large || card.images?.small ? (
          <Image
            source={{ uri: card.images?.large || card.images?.small }}
            style={styles.cardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.imageFallback}>
            <Text style={styles.imageFallbackText}>No image</Text>
          </View>
        )}
      </View>

      {/* Title + Meta */}
      <Text style={styles.title}>{card.name ?? 'Unknown card'}</Text>
      <Text style={styles.subtitle}>
        {card.set?.name ?? 'Unknown set'}
        {card.number ? ` • #${card.number}` : ''}
      </Text>

      <View style={styles.metaRow}>
        {!!card.rarity && <Text style={styles.metaChip}>{card.rarity}</Text>}
        {!!card.supertype && <Text style={styles.metaChip}>{card.supertype}</Text>}
        {!!card.hp && <Text style={styles.metaChip}>HP {card.hp}</Text>}
      </View>

      {/* ===============================
          MARKET GUIDE (moved up)
      =============================== */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Market Guide</Text>
          <TouchableOpacity
            onPress={() => fetchEbay(card)}
            disabled={ebayLoading}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshButtonText}>
              {ebayLoading ? 'Fetching...' : '↻ Refresh'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>

          {/* eBay Live Prices */}
          <Text style={styles.priceSourceLabel}>eBay Sold Prices · GBP</Text>

          {ebayLoading ? (
            <View style={styles.ebayLoadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.ebayLoadingText}>Fetching live eBay prices...</Text>
            </View>
          ) : ebayError ? (
            <View style={styles.ebayErrorRow}>
              <Text style={styles.ebayErrorText}>
                Could not fetch eBay prices.{' '}
              </Text>
              <TouchableOpacity onPress={() => fetchEbay(card)}>
                <Text style={styles.ebayRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.marketButtonsRow}>
                <TouchableOpacity
                  onPress={() => handleQuickValue(ebayPrice?.low ?? null)}
                  style={styles.marketButton}
                  disabled={ebayPrice?.low == null}
                >
                  <Text style={styles.marketButtonLabel}>Low</Text>
                  <Text style={styles.marketButtonValue}>
                    {ebayPrice?.low != null ? `£${ebayPrice.low.toFixed(2)}` : 'N/A'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleQuickValue(ebayPrice?.average ?? null)}
                  style={[styles.marketButton, styles.marketButtonHighlight]}
                  disabled={ebayPrice?.average == null}
                >
                  <Text style={styles.marketButtonLabel}>Average</Text>
                  <Text style={[styles.marketButtonValue, styles.marketButtonValueHighlight]}>
                    {ebayPrice?.average != null ? `£${ebayPrice.average.toFixed(2)}` : 'N/A'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleQuickValue(ebayPrice?.high ?? null)}
                  style={styles.marketButton}
                  disabled={ebayPrice?.high == null}
                >
                  <Text style={styles.marketButtonLabel}>High</Text>
                  <Text style={styles.marketButtonValue}>
                    {ebayPrice?.high != null ? `£${ebayPrice.high.toFixed(2)}` : 'N/A'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sample count + fallback notice */}
              <View style={styles.ebayMetaRow}>
                {ebayPrice?.count != null && ebayPrice.count > 0 && (
                  <Text style={styles.ebayMetaText}>
                    Based on {ebayPrice.count} listing{ebayPrice.count !== 1 ? 's' : ''}
                  </Text>
                )}
                {ebayPrice?.usedFallback && (
                  <Text style={styles.ebayFallbackText}>
                    ⚠️ Broad search used — results may be less specific
                  </Text>
                )}
                {ebayPrice?.count === 0 && (
                  <Text style={styles.ebayMetaText}>No listings found on eBay</Text>
                )}
              </View>
            </>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* TCGPlayer — GBP */}
          <Text style={styles.priceSourceLabel}>TCGPlayer · GBP</Text>

          {(card.set?.name ?? '').toLowerCase().includes('perfect order') && (
            <View style={{
              backgroundColor: '#FEF9C3',
              borderRadius: 10,
              padding: 10,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: '#FDE047',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <Text style={{ color: '#854D0E', fontSize: 12, flex: 1, fontWeight: '600' }}>
                ⚠️ Perfect Order cards aren't yet available on TCGPlayer — pricing data unavailable.
              </Text>
            </View>
          )}

          <View style={styles.marketButtonsRow}>
            <View style={styles.marketButton}>
              <Text style={styles.marketButtonLabel}>Low</Text>
              <Text style={styles.marketButtonValue}>
                {tcgPrices?.low != null ? `£${tcgPrices.low.toFixed(2)}` : 'N/A'}
              </Text>
            </View>

            <View style={styles.marketButton}>
              <Text style={styles.marketButtonLabel}>Mid</Text>
              <Text style={styles.marketButtonValue}>
                {tcgPrices?.mid != null ? `£${tcgPrices.mid.toFixed(2)}` : 'N/A'}
              </Text>
            </View>

            <View style={styles.marketButton}>
              <Text style={styles.marketButtonLabel}>Market</Text>
              <Text style={styles.marketButtonValue}>
                {tcgPrices?.market != null ? `£${tcgPrices.market.toFixed(2)}` : 'N/A'}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* CardMarket — GBP */}
          <Text style={styles.priceSourceLabel}>CardMarket · GBP</Text>

          <View style={styles.marketButtonsRow}>
            <View style={[styles.marketButton, { flex: 0, paddingHorizontal: 20 }]}>
              <Text style={styles.marketButtonLabel}>Trend</Text>
              <Text style={styles.marketButtonValue}>
                {cardmarketPrice != null ? `£${cardmarketPrice.toFixed(2)}` : 'N/A'}
              </Text>
            </View>
          </View>

          <Text style={styles.marketHint}>
            Tap an eBay value to auto-fill your asking price.
          </Text>
        </View>
      </View>

      {/* Trade Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, isTradeMarked && styles.actionButtonActive]}
          onPress={() => toggleTradeCard(card.id)}
        >
          <Text style={styles.actionButtonText}>
            {isTradeMarked ? 'Remove from Trade' : 'Mark for Trade'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, isWishlisted && styles.actionButtonActiveAlt]}
          onPress={() => toggleWishlistCard(card.id)}
        >
          <Text style={styles.actionButtonText}>
            {isWishlisted ? 'Remove Wanted' : 'Mark Wanted'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Favourite / Chase */}
      <View style={styles.showcaseRow}>
        <TouchableOpacity
          onPress={handleSetFavorite}
          disabled={favoriteBusy}
          style={[
            styles.showcaseButton,
            styles.favoriteButton,
            isFavorite && styles.favoriteButtonActive,
          ]}
        >
          <Text style={styles.showcaseButtonText}>
            {favoriteBusy ? 'Saving...' : isFavorite ? '⭐ Favourite Card' : '⭐ Set as Favourite'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSetChase}
          disabled={chaseBusy}
          style={[
            styles.showcaseButton,
            styles.chaseButton,
            isChase && styles.chaseButtonActive,
          ]}
        >
          <Text style={styles.showcaseButtonText}>
            {chaseBusy ? 'Saving...' : isChase ? '🎯 Chase Card' : '🎯 Set as Chase'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Trade Setup */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trade Setup</Text>
        <View style={styles.infoCard}>
          <Text style={styles.label}>Condition</Text>
          <View style={styles.chipWrap}>
            {CONDITIONS.map((condition) => {
              const active = tradeMeta?.condition === condition;
              return (
                <TouchableOpacity
                  key={condition}
                  onPress={() => handleSetCondition(condition)}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                >
                  <Text style={styles.choiceChipText}>{condition}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Asking value (£)</Text>
          <TextInput
            value={tradeMeta?.value ?? ''}
            onChangeText={handleSetValue}
            keyboardType="numeric"
            placeholder="Enter asking value"
            placeholderTextColor="#777"
            style={styles.input}
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={tradeMeta?.notes ?? ''}
            onChangeText={handleSetNotes}
            placeholder="Add notes about condition, extras, wants..."
            placeholderTextColor="#777"
            multiline
            style={[styles.input, styles.notesInput]}
          />
        </View>
      </View>

{/* Marketplace Button(s) */}
      {existingActiveListing ? (
        <View style={styles.marketplaceButtonsRow}>
          <TouchableOpacity
            style={[styles.deleteButton, listingBusy && styles.buttonDisabled]}
            onPress={handleDeleteListing}
            disabled={listingBusy}
          >
            <Text style={styles.deleteButtonText}>
              {listingBusy ? 'Removing...' : '🗑️ Remove Listing'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.marketplaceButton,
            listingBusy && styles.buttonDisabled,
          ]}
          onPress={handleListOnMarketplace}
          disabled={listingBusy}
        >
          <Text style={styles.marketplaceButtonText}>
            {listingBusy ? 'Listing...' : 'List on Marketplace'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Card Details */}
      {!!card.types?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Types</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{card.types.join(', ')}</Text>
          </View>
        </View>
      )}

      {!!card.subtypes?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subtypes</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{card.subtypes.join(', ')}</Text>
          </View>
        </View>
      )}

      {!!card.evolvesFrom && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evolves From</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{card.evolvesFrom}</Text>
          </View>
        </View>
      )}

      {!!card.rules?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rules</Text>
          <View style={styles.infoCard}>
            {card.rules.map((rule, index) => (
              <Text key={`${rule}-${index}`} style={styles.infoLine}>
                - {rule}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!!card.attacks?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attacks</Text>
          <View style={styles.infoCard}>
            {card.attacks.map((attack, index) => (
              <View key={`${attack.name}-${index}`} style={styles.attackBlock}>
                <Text style={styles.attackTitle}>
                  {attack.name ?? 'Attack'}
                  {attack.damage ? ` • ${attack.damage}` : ''}
                </Text>
                {!!attack.text && <Text style={styles.infoLine}>{attack.text}</Text>}
                {!!attack.cost?.length && (
                  <Text style={styles.infoLine}>Cost: {attack.cost.join(', ')}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {!!card.weaknesses?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weaknesses</Text>
          <View style={styles.infoCard}>
            {card.weaknesses.map((w, index) => (
              <Text key={`${w.type}-${index}`} style={styles.infoLine}>
                {w.type ?? 'Unknown'} {w.value ?? ''}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!!card.resistances?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resistances</Text>
          <View style={styles.infoCard}>
            {card.resistances.map((r, index) => (
              <Text key={`${r.type}-${index}`} style={styles.infoLine}>
                {r.type ?? 'Unknown'} {r.value ?? ''}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!!card.retreatCost?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Retreat Cost</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{card.retreatCost.join(', ')}</Text>
          </View>
        </View>
      )}

      {!!card.artist && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Artist</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{card.artist}</Text>
          </View>
        </View>
      )}

      {!!card.flavorText && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flavour Text</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{card.flavorText}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: theme.colors.textSoft,
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  errorText: {
    color: theme.colors.textSoft,
    textAlign: 'center',
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  cardImage: {
    width: '100%',
    height: 420,
  },
  imageFallback: {
    width: '100%',
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
  },
  imageFallbackText: {
    color: theme.colors.textSoft,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: theme.colors.textSoft,
    fontSize: 15,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  metaChip: {
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  refreshButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshButtonText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  priceSourceLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  ebayLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  ebayLoadingText: {
    color: theme.colors.textSoft,
    fontSize: 13,
  },
  ebayErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  ebayErrorText: {
    color: theme.colors.textSoft,
    fontSize: 13,
  },
  ebayRetryText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  ebayMetaRow: {
    marginTop: 4,
    marginBottom: 4,
    gap: 4,
  },
  ebayMetaText: {
    color: theme.colors.textSoft,
    fontSize: 11,
  },
  ebayFallbackText: {
    color: '#F59E0B',
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 14,
  },
  actions: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButtonActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  actionButtonActiveAlt: {
    backgroundColor: '#F0ECFF',
    borderColor: theme.colors.primary,
  },
  actionButtonText: {
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
  },
  showcaseRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  showcaseButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  favoriteButton: {
    backgroundColor: theme.colors.secondary,
    marginRight: 8,
  },
  favoriteButtonActive: {
    backgroundColor: theme.colors.secondary,
  },
  chaseButton: {
    backgroundColor: theme.colors.primary,
    marginLeft: 8,
  },
  chaseButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  showcaseButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 13,
  },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  choiceChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  choiceChipActive: {
    backgroundColor: '#F0ECFF',
    borderColor: theme.colors.primary,
  },
  choiceChipText: {
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
marketplaceButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  marketplaceButtonDisabled: {
    backgroundColor: theme.colors.textSoft,
  },
  marketplaceButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  marketplaceButtonsRow: {
    marginBottom: 18,
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteButtonText: {
    color: '#DC2626',
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 14,
  },
  marketButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  marketButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  marketButtonHighlight: {
    backgroundColor: theme.colors.primary + '18',
    borderColor: theme.colors.primary,
  },
  marketButtonLabel: {
    color: theme.colors.textSoft,
    textAlign: 'center',
    fontSize: 12,
    marginBottom: 4,
  },
  marketButtonValue: {
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: '700',
  },
  marketButtonValueHighlight: {
    color: theme.colors.primary,
    fontSize: 15,
  },
  marketHint: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
  infoLine: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  attackBlock: {
    marginBottom: 12,
  },
  attackTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
});
}