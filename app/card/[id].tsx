import { theme } from '../../lib/theme';
import React, { useEffect, useMemo, useState } from 'react';
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
import { createMarketplaceListing } from '../../lib/marketplace';
import {
  getCachedCardSync,
  getCachedCardsForSet,
  getCachedSets,
} from '../../lib/pokemonTcgCache';

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

const CONDITIONS = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Played'];

export default function CardDetailScreen() {
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

  const tradeMeta = useMemo(() => {
    return card ? getMeta(card.id) : {};
  }, [card, getMeta]);

  const existingActiveListing = useMemo(() => {
    if (!card) return null;
    return myListings.find(
      (listing) => listing.card_id === card.id && listing.status === 'active'
    );
  }, [card, myListings]);

  const marketGuide = useMemo(() => {
    if (!card) return null;

    const tcgplayerPrices = card.tcgplayer?.prices;
    const cardmarketPrices = card.cardmarket?.prices;

    const firstTcgEntry = tcgplayerPrices ? Object.values(tcgplayerPrices)[0] : null;
    const firstCardmarketEntry = cardmarketPrices ? Object.values(cardmarketPrices)[0] : null;

    const low =
      firstTcgEntry && typeof (firstTcgEntry as any).low === 'number'
        ? (firstTcgEntry as any).low
        : null;

    const mid =
      firstTcgEntry && typeof (firstTcgEntry as any).mid === 'number'
        ? (firstTcgEntry as any).mid
        : null;

    const market =
      firstTcgEntry && typeof (firstTcgEntry as any).market === 'number'
        ? (firstTcgEntry as any).market
        : null;

    const trend =
      firstCardmarketEntry && typeof (firstCardmarketEntry as any).trendPrice === 'number'
        ? (firstCardmarketEntry as any).trendPrice
        : null;

    return { low, mid, market, trend };
  }, [card]);

  const isFavorite =
    !!card &&
    profile?.favorite_card_id === card.id &&
    profile?.favorite_set_id === (card.set?.id ?? paramSetId);

  const isChase =
    !!card &&
    profile?.chase_card_id === card.id &&
    profile?.chase_set_id === (card.set?.id ?? paramSetId);

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
      console.error('Set favourite error:', error);
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
      console.error('Set chase error:', error);
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
        Alert.alert(
          'Already Listed',
          'This card already has an active marketplace listing.'
        );
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
      console.error('Marketplace error:', err);

      const message =
        err instanceof Error ? err.message : 'Failed to list card on marketplace.';

      Alert.alert('Marketplace Error', message);
    } finally {
      setListingBusy(false);
    }
  };

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
            {favoriteBusy
              ? 'Saving...'
              : isFavorite
              ? '⭐ Favourite Card'
              : '⭐ Set as Favourite'}
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
            {chaseBusy
              ? 'Saving...'
              : isChase
              ? '🎯 Chase Card'
              : '🎯 Set as Chase'}
          </Text>
        </TouchableOpacity>
      </View>

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

      <TouchableOpacity
        style={[
          styles.marketplaceButton,
          (listingBusy || !!existingActiveListing) && styles.marketplaceButtonDisabled,
        ]}
        onPress={handleListOnMarketplace}
        disabled={listingBusy || !!existingActiveListing}
      >
        <Text style={styles.marketplaceButtonText}>
          {listingBusy
            ? 'Listing...'
            : existingActiveListing
            ? 'Already Listed on Marketplace'
            : 'List on Marketplace'}
        </Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Market Guide</Text>
        <View style={styles.infoCard}>
          <View style={styles.marketButtonsRow}>
            <TouchableOpacity
              onPress={() => handleQuickValue(marketGuide?.low ?? null)}
              style={styles.marketButton}
            >
              <Text style={styles.marketButtonLabel}>Low</Text>
              <Text style={styles.marketButtonValue}>
                {marketGuide?.low != null ? `£${marketGuide.low}` : 'N/A'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleQuickValue(marketGuide?.mid ?? null)}
              style={styles.marketButton}
            >
              <Text style={styles.marketButtonLabel}>Average</Text>
              <Text style={styles.marketButtonValue}>
                {marketGuide?.mid != null ? `£${marketGuide.mid}` : 'N/A'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleQuickValue(marketGuide?.market ?? null)}
              style={styles.marketButton}
            >
              <Text style={styles.marketButtonLabel}>High</Text>
              <Text style={styles.marketButtonValue}>
                {marketGuide?.market != null ? `£${marketGuide.market}` : 'N/A'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.marketHint}>
            Tap a market value to auto-fill your asking price.
          </Text>
        </View>
      </View>

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
                • {rule}
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

const styles = StyleSheet.create({
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
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  marketHint: {
    color: theme.colors.textSoft,
    fontSize: 12,
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