import { useTheme } from '../../components/theme-context';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Text } from '../../components/Text';
import { StackrCardIdentity } from '../../components/StackrCardIdentity';
import EditionAwareCardImage from '../../components/EditionAwareCardImage';
import PokeTraceMarketInsights from '../../components/PokeTraceMarketInsights';
import PricingV2Summary from '../../components/PricingV2Summary';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrBackButton } from '../../components/StackrBackButton';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from '../../components/RaritySymbol';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrade } from '../../components/trade-context';
import { deleteMarketplaceListing } from '../../lib/marketplace';
import { stackrIcons } from '../../lib/stackrIcons';
import {
  getCachedCardSync,
  getCachedCardsForSet,
  getCachedSets,
} from '../../lib/pokemonTcgCache';
import { fetchCardById } from '../../lib/pokemonTcg';
import { getDisplaySetLogoUrl } from '../../lib/setDisplay';
import { getJapaneseSetLogoSourceForSet } from '../../lib/japaneseSetLogos';
import { fetchPokeTraceCardPrice } from '../../lib/pricing';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { buildForeignCardPresentation } from '../../lib/foreignCardPresentation';

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
    localName?: string | null;
    englishDisplayName?: string | null;
    images?: {
      logo?: string | null;
      symbol?: string | null;
      cover?: string | null;
      artwork?: string | null;
    } | null;
  };
  number?: string;
  language?: string | null;
  raw_data?: any;
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

type LatestSnapshotPrice = {
  tcg_mid?: number | null;
  tcg_low?: number | null;
  cardmarket_trend?: number | null;
};

export default function CardDetailScreen() {
  const { theme } = useTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroImageHeight = Math.min(430, Math.max(342, (width - 64) * 1.25));
  const params = useLocalSearchParams<{ id?: string; setId?: string; editionHint?: string }>();
  const cardId = typeof params.id === 'string' ? params.id : '';
  const paramSetId = typeof params.setId === 'string' ? params.setId : '';
  const editionHint = params.editionHint === '1st_edition' || params.editionHint === 'unlimited' || params.editionHint === 'shadowless'
    ? params.editionHint
    : null;
  const editionLabel =
    editionHint === '1st_edition'
      ? '1st Edition'
      : editionHint === 'unlimited'
        ? 'Unlimited'
        : editionHint === 'shadowless'
          ? 'Shadowless'
          : null;

  const {
    isWanted,
    toggleWishlistCard,
    myListings,
    marketplaceListings,
    refreshTrade,
  } = useTrade();

  const [card, setCard] = useState<PokemonCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [listingBusy, setListingBusy] = useState(false);

  // Provider-neutral Stackr market state. Legacy names are retained locally to avoid UI churn.
  const [ebayPrice, setEbayPrice] = useState<EbayPriceResult | null>(null);
  const [ebayLoading, setEbayLoading] = useState(false);
  const [ebayError, setEbayError] = useState(false);

  const [latestSnapshotPrice, setLatestSnapshotPrice] = useState<LatestSnapshotPrice | null>(null);

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

        if (!found && cardId) {
          found = await fetchCardById(cardId);
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
  // FETCH STACKR MARKET PRICE
  // ===============================

  const fetchEbay = useCallback(async (cardData: PokemonCard) => {
    try {
      setEbayLoading(true);
      setEbayError(false);

      const pokeTrace = await fetchPokeTraceCardPrice({
        identifier: cardData.id,
        setName: cardData.set?.name ?? null,
        number: cardData.number ?? null,
        language: cardData.language ?? (cardData as any).raw_data?.language ?? null,
        market: 'US',
      });

      if (pokeTrace?.stackr_central != null) {
        setEbayPrice({
          low: pokeTrace.stackr_low ?? null,
          average: pokeTrace.stackr_central,
          high: pokeTrace.stackr_high ?? null,
          count: pokeTrace.ebay_count,
          usedFallback: false,
        });
        setLatestSnapshotPrice({
          tcg_low: pokeTrace.stackr_low,
          tcg_mid: pokeTrace.stackr_central,
          cardmarket_trend: null,
        });
        return;
      }
      setEbayPrice(null);
      setLatestSnapshotPrice(null);
    } catch (err) {
      console.error('Stackr market price fetch failed:', err);
      setEbayError(true);
    } finally {
      setEbayLoading(false);
    }
  }, []);

  // Auto-fetch the provider-neutral Stackr estimate once the card is loaded.
  useEffect(() => {
    if (card) {
      fetchEbay(card);
    }
  }, [card, fetchEbay]);

  // ===============================
  // MEMOS
  // ===============================

  const existingActiveListing = useMemo(() => {
    if (!card) return null;
    return myListings.find(
      (listing) => listing.card_id === card.id && (listing.status === 'published' || String(listing.status) === 'active')
    );
  }, [card, myListings]);

  const resolvedSetId = card?.set?.id ?? paramSetId ?? '';
  const cardPresentation = useMemo(
    () => card ? buildForeignCardPresentation(card) : null,
    [card],
  );
  const setLogoSource = getJapaneseSetLogoSourceForSet({
    id: resolvedSetId,
    language: card?.language ?? card?.raw_data?.language ?? card?.raw_data?.set?.language ?? null,
    setCode: card?.raw_data?.set?.set_code ?? card?.raw_data?.set?.setCode ?? null,
    sourceId: card?.raw_data?.set?.tcgdex_id ?? card?.raw_data?.set?.source_id ?? null,
    name: card?.set?.name ?? card?.raw_data?.set?.display_name ?? null,
    localName: card?.raw_data?.set?.local_name ?? null,
    englishDisplayName: card?.raw_data?.set?.english_display_name ?? card?.raw_data?.set?.englishDisplayName ?? null,
    externalIds: card?.raw_data?.set?.external_ids ?? null,
  });
  const setLogoUrl = setLogoSource ? null : getDisplaySetLogoUrl({
    setId: resolvedSetId,
    set: card?.set ?? null,
    rawData: card?.raw_data,
  });

  const cardMarketListings = useMemo(() => {
    if (!card) return [];
    return marketplaceListings.filter((listing) => {
      if (listing.card_id !== card.id) return false;
      if (resolvedSetId && listing.set_id && listing.set_id !== resolvedSetId) return false;
      return !['archived', 'cancelled', 'completed', 'sold', 'refunded'].includes(String(listing.status));
    });
  }, [card, marketplaceListings, resolvedSetId]);

  const purchaseListings = useMemo(
    () => cardMarketListings.filter((listing) => !listing.trade_only && listing.asking_price != null),
    [cardMarketListings]
  );

  const tradeListings = useMemo(
    () => cardMarketListings.filter((listing) => listing.trade_only || listing.asking_price == null),
    [cardMarketListings]
  );

  const lowestPurchasePrice = useMemo(() => {
    const prices = purchaseListings
      .map((listing) => Number(listing.asking_price))
      .filter((value) => Number.isFinite(value));
    return prices.length ? Math.min(...prices) : null;
  }, [purchaseListings]);


  // TCGPlayer prices — converted from USD to GBP
  const snapshotTcgPrices = !editionHint && (latestSnapshotPrice?.tcg_mid != null || latestSnapshotPrice?.tcg_low != null)
    ? {
        low: latestSnapshotPrice.tcg_low ?? null,
        mid: latestSnapshotPrice.tcg_mid ?? null,
        market: latestSnapshotPrice.tcg_mid ?? null,
      }
    : null;

  const resolvedTcgPrices = snapshotTcgPrices;

  // CardMarket prices — converted from EUR to GBP
  const cardmarketPrice = latestSnapshotPrice?.cardmarket_trend ?? null;

  const estimatedCardValue = ebayPrice?.average ?? resolvedTcgPrices?.market ?? cardmarketPrice ?? null;

  // ===============================
  // HANDLERS
  // ===============================

  const handleListOnMarket = async () => {
    if (!card) {
      Alert.alert('Error', 'Card data not loaded yet.');
      return;
    }

    if (existingActiveListing) {
      Alert.alert('Already listed', 'This card already has an active listing in The Market.');
      return;
    }

    router.push({
      pathname: '/listing/new',
      params: {
        cardId: card.id,
        setId: card.set?.id ?? paramSetId ?? undefined,
        type: 'raw_card',
      },
    });
  };

  const handleDeleteListing = async () => {
    if (!existingActiveListing) return;
    
    Alert.alert(
      'Remove Listing',
      'Are you sure you want to remove this card from The Market?',
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
              Alert.alert('Removed', 'Card has been removed from The Market.');
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
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading card...</Text>
        </View>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Card not found</Text>
          <Text style={styles.errorText}>This card could not be loaded from cache.</Text>
        </View>
      </View>
    );
  }

  const isWishlisted = isWanted(card.id);
  const presentation = cardPresentation ?? buildForeignCardPresentation(card);
  const presentedDetails = presentation.details;
  const hasEbayValues = ebayPrice?.low != null || ebayPrice?.average != null || ebayPrice?.high != null;
  const hasTcgValues = resolvedTcgPrices?.low != null || resolvedTcgPrices?.mid != null || resolvedTcgPrices?.market != null;

  // ===============================
  // RENDER
  // ===============================

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + stackrTabContentPadding.standard,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
      <View style={styles.headerRow}>
        <StackrBackButton onPress={() => router.back()} />
      </View>

      {/* Card Image */}
      <View style={styles.heroCard}>
        <View style={[styles.heroImageFrame, { height: heroImageHeight }]}>
          {card.images?.large || card.images?.small ? (
            <EditionAwareCardImage
              uri={card.images?.large || card.images?.small}
              cardId={card.id}
              rawData={card.raw_data}
              editionHint={editionHint}
              sourceSize="large"
              style={styles.cardImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.imageFallback}>
              <Text style={styles.imageFallbackText}>No image</Text>
            </View>
          )}
          <RaritySymbol
            rarity={card.rarity}
            size={18}
            style={RARITY_SYMBOL_CARD_OVERLAY}
          />
        </View>
      </View>

      <StackrCardIdentity
        name={presentation.name}
        setName={presentation.setName}
        number={card.number ?? null}
        size="hero"
        style={{ marginBottom: 10 }}
      />

      {presentation.isForeign ? (
        <View style={styles.translationPanel}>
          <Text style={styles.translationStatusText}>
            {presentation.languageLabel} card image · {
              presentation.englishDisplayName
                ? 'card identity shown in English'
                : 'English title translation pending'
            }
          </Text>
          {presentation.nativeName && presentation.nativeName !== presentation.englishDisplayName ? (
            <Text style={styles.nativeNameText}>
              Native name: {presentation.nativeName}
            </Text>
          ) : null}
          {presentation.withheldNativeDetails ? (
            <Text style={styles.translationPendingText}>
              English rules and attack text are not verified yet, so native prose is not presented as English.
            </Text>
          ) : null}
        </View>
      ) : null}

      {resolvedSetId ? (
        <TouchableOpacity
          style={styles.setLinkRow}
          activeOpacity={0.82}
          onPress={() => router.push({ pathname: '/set/[id]', params: { id: resolvedSetId } })}
          accessibilityRole="button"
          accessibilityLabel={`Open set ${presentation.setName ?? resolvedSetId}`}
        >
          {setLogoSource ? (
            <Image source={setLogoSource} style={styles.setLogoImage} resizeMode="contain" />
          ) : setLogoUrl ? (
            <Image source={{ uri: setLogoUrl }} style={styles.setLogoImage} resizeMode="contain" />
          ) : null}
          <Text style={styles.setLinkText} numberOfLines={1}>
            View {presentation.setName ?? 'set'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.metaRow}>
        {!!editionLabel && <Text style={styles.metaChip}>{editionLabel}</Text>}
        {!!presentedDetails.supertype && <Text style={styles.metaChip}>{presentedDetails.supertype}</Text>}
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
              {ebayLoading ? 'Fetching...' : 'Refresh'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <PricingV2Summary
            cardId={card.id}
            language={card.language ?? (card as any).raw_data?.language ?? null}
            edition={editionHint}
            productType="raw_card"
          />

          {/* eBay market lookup */}
          <Text style={styles.priceSourceLabel}>Stackr market range (GBP)</Text>

          {ebayLoading ? (
            <View style={styles.ebayLoadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.ebayLoadingText}>Fetching Stackr market evidence...</Text>
            </View>
          ) : ebayError ? (
            <View style={styles.ebayErrorRow}>
              <Text style={styles.ebayErrorText}>
                Could not fetch Stackr market evidence.{' '}
              </Text>
              <TouchableOpacity onPress={() => fetchEbay(card)}>
                <Text style={styles.ebayRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !hasEbayValues ? (
            <View style={styles.pricingEmptyState}>
              <Text style={styles.pricingEmptyTitle}>No supported market estimate yet</Text>
              <Text style={styles.pricingEmptyCopy}>
                Refresh market data or use the other pricing sources as a guide.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.marketButtonsRow}>
                <View style={styles.marketButton}>
                  <Text style={styles.marketButtonLabel}>Low</Text>
                  <Text style={styles.marketButtonValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {ebayPrice?.low != null ? `\u00A3${ebayPrice.low.toFixed(2)}` : '--'}
                  </Text>
                </View>

                <View style={[styles.marketButton, styles.marketButtonHighlight]}>
                  <Text style={styles.marketButtonLabel}>Average</Text>
                  <Text style={[styles.marketButtonValue, styles.marketButtonValueHighlight]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {ebayPrice?.average != null ? `\u00A3${ebayPrice.average.toFixed(2)}` : '--'}
                  </Text>
                </View>

                <View style={styles.marketButton}>
                  <Text style={styles.marketButtonLabel}>High</Text>
                  <Text style={styles.marketButtonValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {ebayPrice?.high != null ? `\u00A3${ebayPrice.high.toFixed(2)}` : '--'}
                  </Text>
                </View>
              </View>

              {/* Sample count + fallback notice */}
              <View style={styles.ebayMetaRow}>
                {ebayPrice?.count != null && ebayPrice.count > 0 && (
                  <Text style={styles.ebayMetaText}>
                    Based on {ebayPrice.count} matched sold observation{ebayPrice.count !== 1 ? 's' : ''}
                  </Text>
                )}
                {ebayPrice?.usedFallback && (
                  <Text style={styles.ebayFallbackText}>
                    Backup lookup used - check against verified sold evidence where available.
                  </Text>
                )}
                {ebayPrice?.count === 0 && (
                  <Text style={styles.ebayMetaText}>No sold observations available</Text>
                )}
              </View>
            </>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* TCGPlayer — GBP */}
          <Text style={styles.priceSourceLabel}>Stackr canonical estimate (GBP)</Text>

          {!hasTcgValues ? (
            <View style={styles.pricingEmptyState}>
              <Text style={styles.pricingEmptyTitle}>No canonical estimate yet</Text>
              <Text style={styles.pricingEmptyCopy}>
                We will show low, mid and market values when this card has a usable price.
              </Text>
            </View>
          ) : (
            <View style={styles.marketButtonsRow}>
              <View style={styles.marketButton}>
                <Text style={styles.marketButtonLabel}>Low</Text>
                <Text style={styles.marketButtonValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {resolvedTcgPrices?.low != null ? `\u00A3${resolvedTcgPrices.low.toFixed(2)}` : '--'}
                </Text>
              </View>

              <View style={styles.marketButton}>
                <Text style={styles.marketButtonLabel}>Mid</Text>
                <Text style={styles.marketButtonValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {resolvedTcgPrices?.mid != null ? `\u00A3${resolvedTcgPrices.mid.toFixed(2)}` : '--'}
                </Text>
              </View>

              <View style={styles.marketButton}>
                <Text style={styles.marketButtonLabel}>Market</Text>
                <Text style={styles.marketButtonValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {resolvedTcgPrices?.market != null ? `\u00A3${resolvedTcgPrices.market.toFixed(2)}` : '--'}
                </Text>
              </View>
            </View>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* CardMarket — GBP */}
          <Text style={styles.priceSourceLabel}>Source-specific trend (GBP)</Text>

          {cardmarketPrice == null ? (
            <View style={styles.pricingEmptyState}>
              <Text style={styles.pricingEmptyTitle}>No separate source trend</Text>
              <Text style={styles.pricingEmptyCopy}>
                A separate trend appears only when the API has attributable evidence.
              </Text>
            </View>
          ) : (
            <View style={styles.marketButtonsRow}>
              <View style={[styles.marketButton, { flex: 0, paddingHorizontal: 20 }]}>
                <Text style={styles.marketButtonLabel}>Trend</Text>
                <Text style={styles.marketButtonValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {'\u00A3'}{cardmarketPrice.toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.marketHint}>
            Verified sold comps are the strongest signal. Cached sources and active listings are fallback guide prices.
          </Text>
        </View>
      </View>

      <PokeTraceMarketInsights
        cardName={card.name ?? card.id}
        setName={card.set?.name ?? null}
        number={card.number ?? null}
        language={card.language ?? (card as any).raw_data?.language ?? null}
      />

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>The Market</Text>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(tabs)/market', params: { mode: 'buy', cardId: card.id, q: card.name ?? card.id } } as any)}
            style={styles.marketLinkButton}
          >
            <Text style={styles.marketLinkButtonText}>View all listings</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoCard}>
          <View style={styles.marketSummaryGrid}>
            <View style={styles.marketSummaryItem}>
              <Text style={styles.marketSummaryLabel}>Lowest active listing</Text>
              <Text style={styles.marketSummaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {lowestPurchasePrice != null ? `\u00A3${lowestPurchasePrice.toFixed(2)}` : 'No active price'}
              </Text>
            </View>
            <View style={styles.marketSummaryItem}>
              <Text style={styles.marketSummaryLabel}>Estimated card value</Text>
              <Text style={styles.marketSummaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {estimatedCardValue != null ? `\u00A3${estimatedCardValue.toFixed(2)}` : 'Price pending'}
              </Text>
            </View>
          </View>
          <View style={styles.marketCountsRow}>
            <Text style={styles.marketCountText}>
              {purchaseListings.length} buy listing{purchaseListings.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.marketCountText}>
              {tradeListings.length} trade listing{tradeListings.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={styles.marketHint}>
            Estimated value is a guide price. Active listings are user-set prices and can differ by condition, grade, protection and delivery.
          </Text>
          <View style={styles.marketActionsRow}>
            <TouchableOpacity
              style={styles.marketSecondaryAction}
              onPress={() => router.push({ pathname: '/(tabs)/market', params: { mode: 'buy', cardId: card.id, q: card.name ?? card.id } } as any)}
            >
              <Text style={styles.marketSecondaryActionText}>Buy listings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.marketSecondaryAction}
              onPress={() => router.push({ pathname: '/(tabs)/market', params: { mode: 'trade', cardId: card.id, q: card.name ?? card.id } } as any)}
            >
              <Text style={styles.marketSecondaryActionText}>Trade listings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Chase */}
      <View style={styles.chasePanel}>
        <TouchableOpacity
          onPress={() => toggleWishlistCard(card.id)}
          style={[
            styles.showcaseButton,
            isWishlisted ? styles.chaseButtonActive : styles.chaseButton,
          ]}
        >
          <Image source={stackrIcons.chase} style={styles.chaseButtonIcon} resizeMode="contain" />
          <Text style={[styles.showcaseButtonText, isWishlisted && styles.chaseButtonActiveText]}>
            {isWishlisted ? 'Remove from Chase' : 'Add to Chase'}
          </Text>
        </TouchableOpacity>
      </View>
      {/* The Market Button(s) */}
      {existingActiveListing ? (
        <View style={styles.marketplaceButtonsRow}>
          <TouchableOpacity
            style={[styles.deleteButton, listingBusy && styles.buttonDisabled]}
            onPress={handleDeleteListing}
            disabled={listingBusy}
          >
            <Text style={styles.deleteButtonText}>
              {listingBusy ? 'Removing...' : 'Remove Listing'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.marketplaceButton,
            listingBusy && styles.buttonDisabled,
          ]}
          onPress={handleListOnMarket}
          disabled={listingBusy}
        >
          <Text style={styles.marketplaceButtonText}>
            {listingBusy ? 'Listing...' : 'List in The Market'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Card Details */}
      {!!presentedDetails.types?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Types</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{presentedDetails.types.join(', ')}</Text>
          </View>
        </View>
      )}

      {!!presentedDetails.subtypes?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subtypes</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{presentedDetails.subtypes.join(', ')}</Text>
          </View>
        </View>
      )}

      {!!presentedDetails.evolvesFrom && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evolves From</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{presentedDetails.evolvesFrom}</Text>
          </View>
        </View>
      )}

      {!!presentedDetails.rules?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rules</Text>
          <View style={styles.infoCard}>
            {presentedDetails.rules.map((rule, index) => (
              <Text key={`${rule}-${index}`} style={styles.infoLine}>
                - {rule}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!!presentedDetails.attacks?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attacks</Text>
          <View style={styles.infoCard}>
            {presentedDetails.attacks.map((attack, index) => (
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

      {!!presentedDetails.weaknesses?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weaknesses</Text>
          <View style={styles.infoCard}>
            {presentedDetails.weaknesses.map((w, index) => (
              <Text key={`${w.type}-${index}`} style={styles.infoLine}>
                {w.type ?? 'Unknown'} {w.value ?? ''}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!!presentedDetails.resistances?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resistances</Text>
          <View style={styles.infoCard}>
            {presentedDetails.resistances.map((r, index) => (
              <Text key={`${r.type}-${index}`} style={styles.infoLine}>
                {r.type ?? 'Unknown'} {r.value ?? ''}
              </Text>
            ))}
          </View>
        </View>
      )}

      {!!presentedDetails.retreatCost?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Retreat Cost</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{presentedDetails.retreatCost.join(', ')}</Text>
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

      {!!presentedDetails.flavorText && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flavour Text</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLine}>{presentedDetails.flavorText}</Text>
          </View>
        </View>
      )}
      </ScrollView>

    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 16,
    gap: 0,
  },
  headerRow: {
    minHeight: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 8,
  },
  centered: {
    flex: 1,
    backgroundColor: 'transparent',
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
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  heroImageFrame: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
  },
  imageFallbackText: {
    color: theme.colors.textSoft,
  },
  setLinkRow: {
    minHeight: 40,
    alignSelf: 'flex-start',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  setLogoImage: {
    width: 48,
    height: 20,
  },
  setLinkText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  translationPanel: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 3,
  },
  translationStatusText: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  nativeNameText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  translationPendingText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
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
    gap: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 0,
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
    fontSize: 10.5,
    lineHeight: 14,
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
  pricingEmptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  pricingEmptyTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },
  pricingEmptyCopy: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 14,
  },
  chasePanel: {
    marginBottom: 18,
  },
  showcaseButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  chaseButton: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  chaseButtonActive: {
    backgroundColor: '#F0ECFF',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  chaseButtonIcon: {
    width: 24,
    height: 24,
  },
  showcaseButtonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 14,
  },
  chaseButtonActiveText: {
    color: theme.colors.primary,
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
    minWidth: 0,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 7,
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
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '900',
    includeFontPadding: false,
  },
  marketButtonValueHighlight: {
    color: theme.colors.primary,
    fontSize: 14,
  },
  marketHint: {
    color: theme.colors.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
  marketLinkButton: {
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '12',
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketLinkButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  marketSummaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  marketSummaryItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 11,
  },
  marketSummaryLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  marketSummaryValue: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    marginTop: 4,
    includeFontPadding: false,
  },
  marketCountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  marketCountText: {
    color: theme.colors.textSoft,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '800',
  },
  marketActionsRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
  },
  marketSecondaryAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketSecondaryActionText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
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
