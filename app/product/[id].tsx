import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrBackButton } from '../../components/StackrBackButton';
import { StackrImage } from '../../components/StackrImage';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { useAppMode } from '../../components/app-mode-context';
import {
  getMarketProductById,
  productLookupLabel,
  type MarketProduct,
} from '../../lib/productSearch';
import { fetchAllSets, getPokemonSetLogoUrl, getPokemonSetVisualUrl, type PokemonSet } from '../../lib/pokemonTcg';
import { normaliseSearchText } from '../../lib/searchNormalisation';
import { stackrIcons } from '../../lib/stackrIcons';
import { stackrTabContentPadding } from '../../lib/stackrSizing';
import { supabase } from '../../lib/supabase';

type ListingSummary = {
  total: number;
  offers: number;
  trade: number;
  lowest: number | null;
};

const LEGACY_SAVED_PRODUCTS_KEY = '@stackr:search:saved-products';
const SAVED_PRODUCTS_KEY_PREFIX = '@stackr:search:saved-products:v2:user';

type VerifiedSavedProductIdentity = {
  userId: string;
  generation: number;
};

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `\u00A3${value.toFixed(2)}`
    : 'Unavailable';

function getSavedProductsKey(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error('A verified user is required for saved products.');
  return `${SAVED_PRODUCTS_KEY_PREFIX}:${encodeURIComponent(normalizedUserId)}`;
}

async function clearLegacySavedProducts() {
  await AsyncStorage.removeItem(LEGACY_SAVED_PRODUCTS_KEY);
}

async function readSavedProducts(userId: string) {
  const [, raw] = await Promise.all([
    clearLegacySavedProducts(),
    AsyncStorage.getItem(getSavedProductsKey(userId)),
  ]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function writeSavedProducts(userId: string, productIds: string[]) {
  await clearLegacySavedProducts();
  await AsyncStorage.setItem(
    getSavedProductsKey(userId),
    JSON.stringify(productIds.slice(0, 80)),
  );
}

async function fetchProductListingSummary(product: MarketProduct): Promise<ListingSummary> {
  const { data } = await supabase
    .from('user_card_flags')
    .select('id, asking_price, trade_only')
    .eq('flag_type', 'trade')
    .or('listing_status.eq.active,listing_status.is.null')
    .eq('product_name', product.name)
    .eq('product_type', product.product_type)
    .limit(80);

  const rows = data ?? [];
  const prices = rows
    .map((row: any) => Number(row.asking_price))
    .filter((value: number) => Number.isFinite(value));

  return {
    total: rows.length,
    offers: rows.filter((row: any) => !row.trade_only).length,
    trade: rows.filter((row: any) => row.trade_only).length,
    lowest: prices.length ? Math.min(...prices) : null,
  };
}

export default function ProductDetailScreen() {
  const { theme } = useTheme();
  const { premiumSellerAccess } = useAppMode();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === 'string' ? params.id : '';
  const [product, setProduct] = useState<MarketProduct | null>(null);
  const [summary, setSummary] = useState<ListingSummary>({ total: 0, offers: 0, trade: 0, lowest: null });
  const [relatedSetId, setRelatedSetId] = useState<string | null>(null);
  const [relatedSet, setRelatedSet] = useState<PokemonSet | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedProductIdentity, setSavedProductIdentity] = useState<VerifiedSavedProductIdentity | null>(null);
  const savedProductMountedRef = useRef(true);
  const observedSavedProductUserIdRef = useRef<string | null | undefined>(undefined);
  const savedProductIdentityRef = useRef<VerifiedSavedProductIdentity | null>(null);
  const savedProductGenerationRef = useRef(0);

  const isCurrentSavedProductIdentity = useCallback((identity: VerifiedSavedProductIdentity) => (
    savedProductMountedRef.current
    && savedProductIdentityRef.current?.userId === identity.userId
    && savedProductIdentityRef.current.generation === identity.generation
    && savedProductGenerationRef.current === identity.generation
  ), []);

  const beginSavedProductAuthBoundary = useCallback((userId: string | null) => {
    if (observedSavedProductUserIdRef.current === userId) {
      return savedProductGenerationRef.current;
    }

    observedSavedProductUserIdRef.current = userId;
    savedProductGenerationRef.current += 1;
    savedProductIdentityRef.current = null;
    setSavedProductIdentity(null);
    setSaved(false);
    void clearLegacySavedProducts().catch(() => {});
    return savedProductGenerationRef.current;
  }, []);

  const invalidateSavedProductIdentity = useCallback(() => {
    observedSavedProductUserIdRef.current = null;
    savedProductGenerationRef.current += 1;
    savedProductIdentityRef.current = null;
    setSavedProductIdentity(null);
    setSaved(false);
    void clearLegacySavedProducts().catch(() => {});
  }, []);

  const activateVerifiedSavedProductIdentity = useCallback((
    userId: string,
    generation: number,
  ) => {
    if (
      !savedProductMountedRef.current
      || savedProductGenerationRef.current !== generation
      || observedSavedProductUserIdRef.current !== userId
    ) return;

    const identity = { userId, generation };
    savedProductIdentityRef.current = identity;
    setSavedProductIdentity(identity);
  }, []);

  const verifySavedProductIdentity = useCallback(async (
    expectedUserId: string,
    generation: number,
  ) => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (
      !user
      || user.id !== expectedUserId
      || savedProductGenerationRef.current !== generation
      || observedSavedProductUserIdRef.current !== expectedUserId
    ) return null;
    return { userId: user.id, generation } satisfies VerifiedSavedProductIdentity;
  }, []);

  useEffect(() => {
    savedProductMountedRef.current = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const candidateUserId = session?.user?.id ?? null;
      const generation = beginSavedProductAuthBoundary(candidateUserId);
      if (!candidateUserId) return;
      setTimeout(() => {
        void verifySavedProductIdentity(candidateUserId, generation)
          .then((identity) => {
            if (identity) {
              activateVerifiedSavedProductIdentity(identity.userId, identity.generation);
            } else if (
              savedProductGenerationRef.current === generation
              && observedSavedProductUserIdRef.current === candidateUserId
            ) {
              invalidateSavedProductIdentity();
            }
          })
          .catch(() => {
            if (
              savedProductGenerationRef.current === generation
              && observedSavedProductUserIdRef.current === candidateUserId
            ) invalidateSavedProductIdentity();
          });
      }, 0);
    });

    const initialGeneration = savedProductGenerationRef.current;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!savedProductMountedRef.current) return;
      if (savedProductGenerationRef.current !== initialGeneration) return;
      if (authError) {
        invalidateSavedProductIdentity();
        return;
      }
      const userId = data.user?.id ?? null;
      const generation = beginSavedProductAuthBoundary(userId);
      if (userId) activateVerifiedSavedProductIdentity(userId, generation);
    });

    return () => {
      savedProductMountedRef.current = false;
      savedProductGenerationRef.current += 1;
      savedProductIdentityRef.current = null;
      subscription.unsubscribe();
    };
  }, [
    activateVerifiedSavedProductIdentity,
    beginSavedProductAuthBoundary,
    invalidateSavedProductIdentity,
    verifySavedProductIdentity,
  ]);

  useEffect(() => {
    let active = true;
    if (!savedProductIdentity || !productId) {
      setSaved(false);
      return () => {
        active = false;
      };
    }

    void readSavedProducts(savedProductIdentity.userId)
      .then((savedProducts) => {
        if (active && isCurrentSavedProductIdentity(savedProductIdentity)) {
          setSaved(savedProducts.includes(productId));
        }
      })
      .catch(() => {
        if (active && isCurrentSavedProductIdentity(savedProductIdentity)) setSaved(false);
      });

    return () => {
      active = false;
    };
  }, [isCurrentSavedProductIdentity, productId, savedProductIdentity]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!productId) {
        setError('Product information is missing.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const loadedProduct = await getMarketProductById(productId);

        if (!active) return;

        if (!loadedProduct) {
          setProduct(null);
          setRelatedSet(null);
          setRelatedSetId(null);
          setError('This sealed product could not be found.');
          return;
        }

        setProduct(loadedProduct);

        const [listingSummary, sets] = await Promise.all([
          fetchProductListingSummary(loadedProduct).catch(() => ({ total: 0, offers: 0, trade: 0, lowest: null })),
          loadedProduct.set_name ? fetchAllSets().catch(() => []) : Promise.resolve([]),
        ]);

        if (!active) return;

        setSummary(listingSummary);
        const productSetName = normaliseSearchText(loadedProduct.set_name);
        const matchedSet = sets.find((set) => normaliseSearchText(set.name) === productSetName) ?? null;
        setRelatedSetId(matchedSet?.id ?? null);
        setRelatedSet(matchedSet);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Product details could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [productId]);

  const toggleSaved = async () => {
    if (!product) return;
    const identity = savedProductIdentityRef.current;
    if (!identity || !isCurrentSavedProductIdentity(identity)) {
      Alert.alert('Sign in needed', 'Sign in to save products to your account on this device.');
      return;
    }

    try {
      const verifiedIdentity = await verifySavedProductIdentity(identity.userId, identity.generation);
      if (!verifiedIdentity || !isCurrentSavedProductIdentity(verifiedIdentity)) {
        if (isCurrentSavedProductIdentity(identity)) invalidateSavedProductIdentity();
        return;
      }
      const current = await readSavedProducts(verifiedIdentity.userId);
      if (!isCurrentSavedProductIdentity(verifiedIdentity)) return;
      const next = current.includes(product.id)
        ? current.filter((id) => id !== product.id)
        : [product.id, ...current].slice(0, 80);
      await writeSavedProducts(verifiedIdentity.userId, next);
      if (isCurrentSavedProductIdentity(verifiedIdentity)) {
        setSaved(next.includes(product.id));
      }
    } catch {
      if (isCurrentSavedProductIdentity(identity)) {
        invalidateSavedProductIdentity();
        Alert.alert('Could not update saved products', 'Please verify your sign-in and try again.');
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading product...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product || error) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <StackrBackdrop />
        <View style={styles.centered}>
          <Ionicons name="cube-outline" size={34} color={theme.colors.textSoft} />
          <Text style={styles.errorTitle}>Product unavailable</Text>
          <Text style={styles.errorText}>{error ?? 'This sealed product could not be loaded.'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(tabs)/search' as any)}>
            <Text style={styles.primaryButtonText}>Return to Search</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const estimatedValue = product.latest_price?.average ?? product.latest_price?.tcgMarket ?? null;
  const rangeAvailable = product.latest_price?.low != null || product.latest_price?.high != null;
  const setLogoUri = getPokemonSetVisualUrl(relatedSet)
    ?? (relatedSetId ? getPokemonSetLogoUrl(relatedSetId, relatedSet?.language) : null);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StackrBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 6,
            paddingBottom: insets.bottom + stackrTabContentPadding.standard,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <StackrBackButton onPress={() => router.back()} style={{ width: 42, height: 42 }} />
          <Text style={styles.headerTitle}>Sealed Product</Text>
          <TouchableOpacity onPress={toggleSaved} style={styles.iconButton} accessibilityLabel={saved ? 'Remove saved product' : 'Save product'}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={19} color={saved ? theme.colors.primary : theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.imagePanel}>
          <StackrImage
            uri={product.image_large_url ?? product.image_url}
            fallbackSource={stackrIcons.marketplace}
            contentFit="contain"
            rounded={18}
            style={styles.productImage}
            showFallbackIcon={false}
          />
        </View>

        <View style={styles.identityBlock}>
          <Text style={styles.productTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.74}>{product.name}</Text>
          <View style={styles.setRow}>
            {setLogoUri ? (
              <StackrImage
                uri={setLogoUri}
                contentFit="contain"
                rounded={0}
                showFallbackIcon={false}
                style={styles.setLogo}
              />
            ) : null}
            <Text style={styles.productSubtitle} numberOfLines={2}>
              {[product.set_name, productLookupLabel(product.product_type)].filter(Boolean).join(' - ')}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Market Guide</Text>
          <View style={styles.valueGrid}>
            <Metric label="Estimated value" value={money(estimatedValue)} />
            <Metric label="Lowest listing" value={summary.lowest == null ? 'No active price' : money(summary.lowest)} />
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.bodyText}>
              {rangeAvailable
                ? `Recent sales range: ${money(product.latest_price?.low)} to ${money(product.latest_price?.high)}.`
                : 'Recent sales range is not available for this product yet.'}
            </Text>
            <Text style={styles.mutedText}>
              Pricing is an estimate from available sources, not a guaranteed sale price.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Market</Text>
          <View style={styles.infoCard}>
            <Text style={styles.bodyText}>
              {summary.total > 0
                ? `${summary.total} active listing${summary.total === 1 ? '' : 's'} found: ${summary.offers} open to offers, ${summary.trade} trade.`
                : 'No active Market listings found for this sealed product.'}
            </Text>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push({ pathname: '/(tabs)/market', params: { mode: 'buy', productId: product.id, q: product.name } } as any)}
              >
                <Text style={styles.primaryButtonText}>View Market listings</Text>
              </TouchableOpacity>
              {premiumSellerAccess.allowed ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push({ pathname: '/listing/new', params: { type: product.product_type, productName: product.name } } as any)}
                >
                  <Text style={styles.secondaryButtonText}>Publish Beta Listing</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product notes</Text>
          <View style={styles.infoCard}>
            <Text style={styles.bodyText}>
              Sealed products can contain randomised packs or cards. Stackr shows product-level pricing and listings only where reliable catalogue data exists.
            </Text>
            {relatedSetId ? (
              <TouchableOpacity
                style={styles.setLink}
                onPress={() => router.push({ pathname: '/set/[id]', params: { id: relatedSetId } })}
              >
                <Ionicons name="library-outline" size={17} color={theme.colors.primary} />
                <Text style={styles.setLinkText}>View associated set</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, padding: 13 }}>
      <Text style={{ color: theme.colors.textSoft, fontSize: 11, fontWeight: '800' }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{ color: theme.colors.text, fontSize: 18, lineHeight: 24, fontWeight: '900', marginTop: 4 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {value}
      </Text>
    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.bg,
      overflow: 'hidden',
    },
    content: {
      paddingHorizontal: 16,
      gap: 16,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 10,
      backgroundColor: 'transparent',
    },
    loadingText: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: '700',
    },
    errorTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '900',
      textAlign: 'center',
    },
    errorText: {
      color: theme.colors.textSoft,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
      textAlign: 'center',
    },
    headerRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '900',
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePanel: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      padding: 14,
    },
    productImage: {
      width: '100%',
      height: 260,
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
    },
    identityBlock: {
      gap: 8,
    },
    productTitle: {
      color: theme.colors.text,
      fontSize: 27,
      lineHeight: 33,
      fontWeight: '900',
    },
    setRow: {
      minHeight: 26,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    setLogo: {
      width: 52,
      height: 22,
      backgroundColor: 'transparent',
    },
    productSubtitle: {
      flex: 1,
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: '800',
    },
    section: {
      gap: 9,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '900',
    },
    valueGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    infoCard: {
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      padding: 14,
      gap: 10,
    },
    bodyText: {
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '800',
    },
    mutedText: {
      color: theme.colors.textSoft,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },
    primaryButton: {
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '900',
    },
    secondaryButton: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '900',
    },
    setLink: {
      minHeight: 40,
      alignSelf: 'flex-start',
      borderRadius: 13,
      backgroundColor: theme.colors.primary + '12',
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    setLinkText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: '900',
    },
  });
}
