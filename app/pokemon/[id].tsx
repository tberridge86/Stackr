import { useTheme } from '../../components/theme-context';
import { Text } from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../components/RaritySymbol';
import {
  fetchCardsForPokemon,
  fetchOwnedPokedexCards,
  formatPokedexName,
  PokedexCard,
  setPokedexCardOwned,
} from '../../lib/pokedexCollection';
import { getDisplaySetName } from '../../lib/setDisplay';
import { stackrCardImageSizes } from '../../lib/stackrSizing';

type PokemonData = {
  id: number;
  name: string;
  types: { type: { name: string } }[];
};

type FilterKey = 'all' | 'owned' | 'missing';

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const getPokemonArtworkUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const getPokemonSpriteUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

const makeOwnedKey = (card: Pick<PokedexCard, 'id' | 'set_id'>) => `${card.set_id ?? ''}:${card.id}`;

const getParamValue = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

const formatMoney = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `\u00A3${value.toFixed(value >= 100 ? 0 : 2)}`
    : 'Value pending';

export default function PokemonDetailScreen() {
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const id = getParamValue(params.id);
  const routeName = getParamValue(params.name);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 5 : width >= 620 ? 4 : 2;
  const cardWidth = (width - 36 - (columns - 1) * 10) / columns;

  const [pokemon, setPokemon] = useState<PokemonData | null>(null);
  const [cards, setCards] = useState<PokedexCard[]>([]);
  const [ownedKeys, setOwnedKeys] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(new Set());
  const longPressedCardId = useRef<string | null>(null);

  const loadOwnership = useCallback(async () => {
    const owned = await fetchOwnedPokedexCards();
    setOwnedKeys(new Set(Array.from(owned.keys())));
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);

        let nextPokemon: PokemonData | null = null;

        try {
          const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
          if (!response.ok) throw new Error(`PokeAPI returned ${response.status}`);
          const json = await response.json();
          nextPokemon = json as PokemonData;
        } catch (pokemonError) {
          console.log('Pokedex Pokemon metadata lookup failed', {
            id,
            routeName,
            error: pokemonError instanceof Error ? pokemonError.message : String(pokemonError),
          });

          if (routeName) {
            nextPokemon = {
              id: Number(id) || 0,
              name: routeName,
              types: [],
            };
          }
        }

        if (!nextPokemon) throw new Error('Pokemon metadata was unavailable.');
        if (!active) return;

        setPokemon(nextPokemon);

        const pokemonCards = await fetchCardsForPokemon(nextPokemon.name);

        if (!active) return;
        setCards(pokemonCards);
        console.log('Pokedex cards loaded', {
          pokemon: nextPokemon.name,
          count: pokemonCards.length,
        });

        loadOwnership().catch((ownershipError) => {
          console.log('Failed to load Pokemon ownership after cards', ownershipError);
        });
      } catch (error) {
        console.log('Failed to load Pokemon collection page', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (id) load();

    return () => {
      active = false;
    };
  }, [id, loadOwnership, routeName]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setOwnershipLoading(true);
      loadOwnership()
        .catch((error) => {
          console.log('Failed to refresh Pokemon ownership', error);
        })
        .finally(() => {
          if (active) setOwnershipLoading(false);
        });

      return () => {
        active = false;
      };
    }, [loadOwnership])
  );

  const ownedCount = useMemo(
    () => cards.filter((card) => ownedKeys.has(makeOwnedKey(card))).length,
    [cards, ownedKeys]
  );
  const totalCount = cards.length;
  const progress = totalCount ? ownedCount / totalCount : 0;

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const owned = ownedKeys.has(makeOwnedKey(card));
      if (filter === 'owned') return owned;
      if (filter === 'missing') return !owned;
      return true;
    });
  }, [cards, filter, ownedKeys]);

  const toggleCardOwned = useCallback(
    async (card: PokedexCard) => {
      const key = makeOwnedKey(card);
      const nextOwned = !ownedKeys.has(key);

      setBusyCardId(card.id);
      setOwnedKeys((prev) => {
        const next = new Set(prev);
        if (nextOwned) next.add(key);
        else next.delete(key);
        return next;
      });

      try {
        await setPokedexCardOwned(card, nextOwned);
        await loadOwnership();
      } catch (error: any) {
        setOwnedKeys((prev) => {
          const next = new Set(prev);
          if (nextOwned) next.delete(key);
          else next.add(key);
          return next;
        });
        console.log('Failed to update Pokedex card ownership', error);
        Alert.alert('Could not update card', error?.message ?? 'Please try again.');
      } finally {
        setBusyCardId(null);
      }
    },
    [loadOwnership, ownedKeys]
  );

  const renderFilter = (key: FilterKey, label: string) => {
    const active = filter === key;

    return (
      <Pressable
        onPress={() => setFilter(key)}
        style={[styles.filterChip, active && styles.filterChipActive]}
      >
        <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
      </Pressable>
    );
  };

  const renderCard = ({ item }: { item: PokedexCard }) => {
    const owned = ownedKeys.has(makeOwnedKey(item));
    const setName = getDisplaySetName({
      setId: item.set_id,
      setName: item.set_name,
      rawData: item.raw_data,
    });
    const imageUrl = (item.image_urls ?? [item.image_large, item.image_small])
      .filter((url): url is string => Boolean(url))
      .find((url) => !failedImageUrls.has(`${item.id}:${url}`));

    return (
      <Pressable
        delayLongPress={360}
        onLongPress={() => {
          longPressedCardId.current = item.id;
          router.push({
            pathname: '/card/[id]',
            params: { id: item.id, setId: item.set_id ?? undefined },
          });
        }}
        onPress={() => {
          if (longPressedCardId.current === item.id) {
            longPressedCardId.current = null;
            return;
          }
          toggleCardOwned(item);
        }}
        style={({ pressed }) => [
          styles.cardTile,
          { width: cardWidth },
          owned && styles.cardTileOwned,
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardImageWrap}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.cardImage}
              resizeMode="contain"
              onError={() => {
                setFailedImageUrls((prev) => {
                  const next = new Set(prev);
                  next.add(`${item.id}:${imageUrl}`);
                  return next;
                });
              }}
            />
          ) : (
            <Ionicons name="image-outline" size={34} color={theme.colors.textSoft} />
          )}

          <View style={[styles.ownedBadge, owned ? styles.ownedBadgeOn : styles.ownedBadgeOff]}>
            {busyCardId === item.id ? (
              <ActivityIndicator size="small" color={owned ? '#FFFFFF' : theme.colors.primary} />
            ) : (
              <Ionicons
                name={owned ? 'checkmark' : 'add'}
                size={14}
                color={owned ? '#FFFFFF' : theme.colors.primary}
              />
            )}
          </View>
          <RaritySymbol
            rarity={item.rarity}
            size={15}
            style={RARITY_SYMBOL_CARD_OVERLAY}
          />
        </View>

        <Text numberOfLines={2} style={styles.cardName}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.cardMeta}>{setName}</Text>
        <Text numberOfLines={1} style={styles.cardValue}>{formatMoney(item.estimated_value)}</Text>
        <Text numberOfLines={1} style={styles.cardMeta}>
          {item.number ? `#${item.number}` : 'No number'}
        </Text>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading Pokemon cards...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!pokemon) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ color: theme.colors.text }}>Failed to load this Pokemon.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = formatPokedexName(pokemon.name);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <FlatList
          data={filteredCards}
          key={columns}
          numColumns={columns}
          renderItem={renderCard}
          keyExtractor={(item) => `${item.set_id ?? ''}:${item.id}`}
          columnWrapperStyle={{ gap: 10, marginBottom: 12 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
          ListHeaderComponent={
            <View>
              {ownershipLoading && (
                <View style={styles.syncRow}>
                  <ActivityIndicator color={theme.colors.primary} size="small" />
                </View>
              )}

              <View style={styles.hero}>
                <Image
                  source={{ uri: getPokemonArtworkUrl(pokemon.id) }}
                  style={styles.heroImage}
                  resizeMode="contain"
                />
                <View style={styles.heroCopy}>
                  <View style={styles.spriteWrap}>
                    <Image source={{ uri: getPokemonSpriteUrl(pokemon.id) }} style={styles.sprite} />
                  </View>
                  <Text style={styles.name}>{displayName}</Text>
                  <Text style={styles.number}>#{String(pokemon.id).padStart(4, '0')}</Text>
                  <View style={styles.typeRow}>
                    {pokemon.types.map((entry) => (
                      <View key={entry.type.name} style={styles.typeChip}>
                        <Text style={styles.typeText}>{formatPokedexName(entry.type.name)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.progressCard}>
                <View style={styles.progressTop}>
                  <Text style={styles.progressTitle}>Pokemon card collection</Text>
                  <Text style={styles.progressCount}>{ownedCount} / {totalCount}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.progressSub}>
                  Tap cards below to mark them owned. Long hold a card to open its details.
                </Text>
              </View>

              <View style={styles.filterRow}>
                {renderFilter('all', 'All')}
                {renderFilter('owned', 'Owned')}
                {renderFilter('missing', 'Missing')}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No cards found</Text>
              <Text style={styles.emptyText}>
                There are no matching cards in this view yet.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    container: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 0,
    },
    center: {
      flex: 1,
      backgroundColor: theme.colors.bg,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 18,
    },
    loadingText: {
      color: theme.colors.textSoft,
      marginTop: 12,
      fontWeight: '800',
    },
    syncRow: {
      height: 18,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    hero: {
      minHeight: 168,
      backgroundColor: theme.colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      ...cardShadow,
    },
    heroImage: {
      width: 118,
      height: 118,
      marginRight: 10,
    },
    heroCopy: {
      flex: 1,
      alignItems: 'flex-start',
    },
    spriteWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 8,
    },
    sprite: {
      width: 42,
      height: 42,
    },
    name: {
      color: theme.colors.text,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '900',
    },
    number: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: '900',
      marginTop: 4,
    },
    typeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    typeChip: {
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    typeText: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 11,
    },
    progressCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginBottom: 12,
    },
    progressTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    progressTitle: {
      flex: 1,
      color: theme.colors.text,
      fontWeight: '900',
      fontSize: 15,
    },
    progressCount: {
      color: theme.colors.primary,
      fontWeight: '900',
      fontSize: 15,
    },
    progressTrack: {
      height: 9,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
    },
    progressSub: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
      marginTop: 10,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    filterChip: {
      flex: 1,
      backgroundColor: theme.colors.card,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      paddingVertical: 10,
    },
    filterChipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    filterText: {
      color: theme.colors.textSoft,
      fontSize: 12,
      fontWeight: '900',
    },
    filterTextActive: {
      color: '#FFFFFF',
    },
    cardTile: {
      backgroundColor: theme.colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 9,
      ...cardShadow,
    },
    cardTileOwned: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + '10',
    },
    cardPressed: {
      transform: [{ scale: 0.985 }],
      opacity: 0.94,
    },
    cardImageWrap: {
      width: '100%',
      aspectRatio: stackrCardImageSizes.cardAspectRatio,
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: 8,
    },
    cardImage: {
      width: '100%',
      height: '100%',
    },
    ownedBadge: {
      position: 'absolute',
      right: 7,
      top: 7,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.colors.card,
    },
    ownedBadgeOn: {
      backgroundColor: theme.colors.primary,
    },
    ownedBadgeOff: {
      backgroundColor: theme.colors.card,
    },
    cardName: {
      color: theme.colors.text,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '900',
      minHeight: 30,
    },
    cardMeta: {
      color: theme.colors.textSoft,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '700',
      marginTop: 3,
    },
    cardValue: {
      color: theme.colors.primary,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '900',
      marginTop: 4,
    },
    emptyCard: {
      backgroundColor: theme.colors.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...cardShadow,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 6,
    },
    emptyText: {
      color: theme.colors.textSoft,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
  });
}
