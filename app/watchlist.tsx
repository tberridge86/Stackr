import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import { MarketEmptyState, MarketListingCard } from '../components/market/MarketComponents';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrBottomSheet } from '../components/StackrModalSystem';
import { useTheme } from '../components/theme-context';
import { useTrade } from '../components/trade-context';
import { fetchSavedMarketListingIds, toggleSavedMarketListing } from '../lib/marketSavedItems';
import { stackrIcons } from '../lib/stackrIcons';
import { supabase } from '../lib/supabase';
import { getMarketProductById, type MarketProduct } from '../lib/productSearch';
import { createSavedProductLoadGate, parseSavedMarketProductIds } from '../lib/savedMarketProducts';

const SAVED_PRODUCTS_KEY_PREFIX = '@stackr:search:saved-products:v2:user';
const savedProductsKey = (userId: string) => `${SAVED_PRODUCTS_KEY_PREFIX}:${encodeURIComponent(userId.trim())}`;

function isMissingAuthSessionError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const namedError = error as { name?: unknown; message?: unknown };
  return namedError.name === 'AuthSessionMissingError'
    || /auth session missing|session missing/i.test(String(namedError.message ?? ''));
}

export default function FavoritesMarketItemsScreen() {
  const { theme } = useTheme();
  const { marketplaceListings, tradeLoading, refreshTrade } = useTrade();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedIdsError, setSavedIdsError] = useState<string | null>(null);
  const [savedProducts, setSavedProducts] = useState<MarketProduct[]>([]);
  const [unresolvedProductIds, setUnresolvedProductIds] = useState<string[]>([]);
  const [savedProductsError, setSavedProductsError] = useState<string | null>(null);
  const [savedListingsLoading, setSavedListingsLoading] = useState(true);
  const [savedProductsLoading, setSavedProductsLoading] = useState(true);
  const [removingSavedProduct, setRemovingSavedProduct] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [storageInfoOpen, setStorageInfoOpen] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [authLoadError, setAuthLoadError] = useState<string | null>(null);
  const authUserIdRef = useRef('');
  const authGenerationRef = useRef(0);
  const savedProductsLoadGateRef = useRef(createSavedProductLoadGate());
  const activeRemovalTokenRef = useRef<number | null>(null);
  const removalTokenRef = useRef(0);

  const bindIdentity = useCallback((userId: string) => {
    const identityChanged = authUserIdRef.current !== userId;
    setSignedOut(!userId);
    if (!identityChanged) {
      if (!userId) {
        setSavedListingsLoading(false);
        setSavedProductsLoading(false);
      }
      return authGenerationRef.current;
    }
    authUserIdRef.current = userId;
    authGenerationRef.current += 1;
    savedProductsLoadGateRef.current.invalidate();
    activeRemovalTokenRef.current = null;
    setCurrentUserId(userId);
    setSavedIds([]);
    setSavedIdsError(null);
    setSavedProducts([]);
    setUnresolvedProductIds([]);
    setSavedProductsError(null);
    setAuthLoadError(null);
    setSavedListingsLoading(Boolean(userId));
    setSavedProductsLoading(Boolean(userId));
    setRemovingSavedProduct(false);
    return authGenerationRef.current;
  }, []);

  const load = useCallback(async (expectedUserId?: string, expectedGeneration?: number) => {
    const initialRequest = savedProductsLoadGateRef.current.start();
    const startingUserId = authUserIdRef.current;
    const startingGeneration = authGenerationRef.current;
    let attemptedUserId: string | null = null;
    let attemptedGeneration: number | null = null;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (
        !savedProductsLoadGateRef.current.isCurrent(initialRequest)
        || authUserIdRef.current !== startingUserId
        || authGenerationRef.current !== startingGeneration
      ) return;
      const userId = user?.id ?? '';
      const generation = bindIdentity(userId);
      setAuthLoadError(null);
      const request = savedProductsLoadGateRef.current.start();
      attemptedUserId = userId;
      attemptedGeneration = generation;
      if (
        expectedUserId !== undefined
        && (expectedUserId !== userId || expectedGeneration !== generation)
      ) return;
      const isCurrentLoad = () => (
        savedProductsLoadGateRef.current.isCurrent(request)
        && authUserIdRef.current === userId
        && authGenerationRef.current === generation
      );
      if (!userId) {
        if (!isCurrentLoad()) return;
        setSavedIds([]); setSavedProducts([]); setUnresolvedProductIds([]);
        setSavedListingsLoading(false); setSavedProductsLoading(false);
        return;
      }
      setSavedListingsLoading(true);
      setSavedProductsLoading(true);
      await Promise.all([
        fetchSavedMarketListingIds(userId).then((saved) => {
          if (!isCurrentLoad()) return;
          setSavedIds(saved); setSavedIdsError(null);
        }).catch((error) => {
          if (isCurrentLoad()) setSavedIdsError(error instanceof Error ? error.message : 'Saved listings could not be loaded.');
        }).finally(() => {
          if (isCurrentLoad()) setSavedListingsLoading(false);
        }),
        AsyncStorage.getItem(savedProductsKey(userId)).then(async (raw) => {
          const ids = parseSavedMarketProductIds(raw);
          const resolved = await Promise.all(ids.map((id) => getMarketProductById(id)));
          if (!isCurrentLoad()) return;
          setSavedProducts(resolved.filter(Boolean) as MarketProduct[]);
          setUnresolvedProductIds(ids.filter((_, index) => !resolved[index]));
          setSavedProductsError(null);
        }).catch((error) => {
          if (isCurrentLoad()) setSavedProductsError(error instanceof Error ? error.message : 'Saved products could not be loaded.');
        }).finally(() => {
          if (isCurrentLoad()) setSavedProductsLoading(false);
        }),
      ]);
    } catch (error) {
      if (
        attemptedUserId === null
        && authUserIdRef.current === startingUserId
        && authGenerationRef.current === startingGeneration
        && savedProductsLoadGateRef.current.isCurrent(initialRequest)
      ) {
        if (isMissingAuthSessionError(error)) {
          bindIdentity('');
        } else {
          setAuthLoadError(error instanceof Error ? error.message : 'Your saved items could not be checked.');
          setSavedListingsLoading(false);
          setSavedProductsLoading(false);
        }
        return;
      }
      if (
        attemptedUserId !== null
        && authUserIdRef.current === attemptedUserId
        && authGenerationRef.current === attemptedGeneration
        && savedProductsLoadGateRef.current.isCurrent(initialRequest)
      ) {
        setSavedIdsError(error instanceof Error ? error.message : 'Saved listings could not be loaded.');
        setSavedProductsError(error instanceof Error ? error.message : 'Saved products could not be loaded.');
        setSavedListingsLoading(false);
        setSavedProductsLoading(false);
      }
    }
  }, [bindIdentity]);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const userId = session?.user?.id ?? '';
      const generation = bindIdentity(userId);
      void load(userId, generation);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [bindIdentity, load]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([load(), refreshTrade()]);
    }, [load, refreshTrade])
  );

  const listings = useMemo(() => {
    return savedIds
      .map((id) => marketplaceListings.find((listing) => listing.id === id))
      .filter(Boolean) as typeof marketplaceListings;
  }, [marketplaceListings, savedIds]);
  const removeSavedProduct = useCallback(async (productId: string) => {
    if (!currentUserId || activeRemovalTokenRef.current !== null) return;
    const removalToken = ++removalTokenRef.current;
    activeRemovalTokenRef.current = removalToken;
    savedProductsLoadGateRef.current.invalidate();
    const expectedGeneration = authGenerationRef.current;
    setRemovingSavedProduct(true);
    try {
      const raw = await AsyncStorage.getItem(savedProductsKey(currentUserId));
      const ids = parseSavedMarketProductIds(raw);
      if (authUserIdRef.current !== currentUserId || authGenerationRef.current !== expectedGeneration) return;
      await AsyncStorage.setItem(savedProductsKey(currentUserId), JSON.stringify(ids.filter((id) => id !== productId)));
      if (authUserIdRef.current === currentUserId && authGenerationRef.current === expectedGeneration) await load(currentUserId, expectedGeneration);
    } catch (error) {
      if (authUserIdRef.current === currentUserId && authGenerationRef.current === expectedGeneration) {
        setSavedProductsError(error instanceof Error ? error.message : 'Saved product could not be removed.');
      }
    } finally {
      if (activeRemovalTokenRef.current === removalToken) {
        activeRemovalTokenRef.current = null;
        setRemovingSavedProduct(false);
      }
    }
  }, [currentUserId, load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18 }}>
        <StackrBackdrop />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>Saved market items</Text>
            <TouchableOpacity
              onPress={() => setStorageInfoOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Device-only bookmarks. Learn about moving devices"
              style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}
            >
              <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, lineHeight: 18, fontWeight: '700' }}>
                Saved on this device. Not synced.
              </Text>
              <Text style={{ color: theme.colors.primary, fontSize: 12.5, lineHeight: 18, fontWeight: '800', textDecorationLine: 'underline' }}>
                Moving devices?
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {savedIdsError ? <View style={{ paddingBottom: 10 }}><Text accessibilityRole="alert" style={{ color: '#991B1B', fontSize: 14, lineHeight: 20 }}>{savedIdsError}</Text><TouchableOpacity onPress={() => void load()} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '900' }}>Retry saved listings</Text></TouchableOpacity></View> : null}
        {savedProductsError ? <View style={{ paddingBottom: 10 }}><Text accessibilityRole="alert" style={{ color: '#991B1B', fontSize: 14 }}>{savedProductsError}</Text><TouchableOpacity onPress={() => void load()} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Retry saved products</Text></TouchableOpacity></View> : null}

        {signedOut ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
            <MarketEmptyState
              imageIcon={stackrIcons.favorite}
              title="Sign in to see saved items"
              body="Saved Market listings and products are kept separately for each signed-in account on this device."
              actionLabel="Sign in"
              onAction={() => router.push('/(auth)/login' as any)}
            />
          </View>
        ) : authLoadError ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60, gap: 12 }}>
            <Text accessibilityRole="alert" style={{ color: '#991B1B', textAlign: 'center', fontSize: 14, lineHeight: 20 }}>{authLoadError}</Text>
            <TouchableOpacity onPress={() => void load()} accessibilityRole="button" style={{ alignSelf: 'center', minHeight: 48, justifyContent: 'center' }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MarketListingCard
              item={{
                id: item.id,
                title: item.product_name ?? item.card_id,
                setName: item.set_id,
                imageUri: item.official_image_url ?? item.listing_images?.[0] ?? null,
                condition: item.condition,
                gradeCompany: item.grade_company,
                grade: item.grade,
                price: item.asking_price,
                marketEstimate: item.market_estimate ?? item.prices?.preferred_value ?? null,
                terms: item.trade_only ? 'Trade listing' : 'Open to offers',
                sellerName: item.profiles?.collector_name ?? 'Collector',
                sellerAvatarUrl: item.profiles?.avatar_url ?? null,
                protectionTier: (!item.product_type || item.product_type === 'raw_card' || item.pricing_mode === 'raw')
                  ? item.admin_review_required ? 'Gold' : item.listing_images?.length ? 'Silver' : 'Bronze'
                  : undefined,
                variantType: item.trade_only ? 'trade' : 'openToOffers',
                saved: true,
              }}
              onPress={() => router.push({ pathname: '/(tabs)/market', params: { listingId: item.id } })}
              onSave={async () => {
                if (!currentUserId) return;
                if (authUserIdRef.current !== currentUserId) return;
                const generation = authGenerationRef.current;
                try {
                  const saved = await toggleSavedMarketListing(currentUserId, item.id);
                  if (
                    authUserIdRef.current === currentUserId
                    && authGenerationRef.current === generation
                  ) setSavedIds(saved);
                } catch {
                  await load();
                }
              }}
              onSellerPress={() => router.push({ pathname: '/user/[id]', params: { id: item.user_id } })}
            />
          )}
          refreshControl={<RefreshControl refreshing={tradeLoading} onRefresh={refreshTrade} tintColor={theme.colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140, flexGrow: listings.length === 0 ? 1 : 0 }}
          ListEmptyComponent={
            savedListingsLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
                <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>Loading saved listings…</Text>
              </View>
            ) : savedIdsError ? null : (
              <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
                <MarketEmptyState
                  imageIcon={stackrIcons.favorite}
                  title="No saved listings yet"
                  body="Save a specific Market listing to return to it later. Chase cards and price watchlists stay separate."
                  actionLabel="Browse The Market"
                  onAction={() => router.replace('/(tabs)/market' as any)}
                />
              </View>
            )
          }
          ListHeaderComponent={(savedProductsLoading || savedProducts.length || unresolvedProductIds.length) ? <View style={{ gap: 8, marginBottom: 18 }}><Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Saved products</Text>{savedProductsLoading ? <Text style={{ color: theme.colors.textSoft }}>Loading saved products…</Text> : null}{savedProducts.map((product) => <View key={product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, backgroundColor: theme.colors.card }}><TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } } as any)} style={{ flex: 1 }}><Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '800' }}>{product.name}</Text><Text style={{ color: theme.colors.textSoft, fontSize: 13 }}>{product.set_name ?? 'Saved product'}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${product.name} from saved products`} accessibilityState={{ busy: removingSavedProduct, disabled: removingSavedProduct }} disabled={removingSavedProduct} onPress={() => void removeSavedProduct(product.id)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{removingSavedProduct ? 'Removing…' : 'Remove'}</Text></TouchableOpacity></View>)}{unresolvedProductIds.map((id) => <View key={id} style={{ padding: 12, borderRadius: 12, backgroundColor: theme.colors.card }}><Text style={{ color: theme.colors.textSoft }}>Saved product {id} is currently unavailable.</Text><TouchableOpacity accessibilityRole="button" accessibilityState={{ busy: removingSavedProduct, disabled: removingSavedProduct }} disabled={removingSavedProduct} onPress={() => void removeSavedProduct(id)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{removingSavedProduct ? 'Removing…' : 'Remove unavailable product'}</Text></TouchableOpacity></View>)}</View> : null}
        />
        )}
      </View>
      <StackrBottomSheet visible={storageInfoOpen} title="Saved on this device" onClose={() => setStorageInfoOpen(false)}>
        <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
          Saved listings and products are bookmarks kept on this device for your signed-in account. Stackr does not back up or sync these bookmarks to other devices.
        </Text>
        <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 22 }}>
          Before changing phones, note the items you want to keep and save them again on the new phone. Signing in alone does not restore them. Removing the app or clearing its data can erase these bookmarks.
        </Text>
        <Text style={{ color: theme.colors.textSoft, fontSize: 14, lineHeight: 20 }}>
          Your collection and price watchlists are separate from these Market bookmarks.
        </Text>
      </StackrBottomSheet>
    </SafeAreaView>
  );
}
