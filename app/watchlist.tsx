import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import { MarketEmptyState, MarketListingCard } from '../components/market/MarketComponents';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { useTheme } from '../components/theme-context';
import { useTrade } from '../components/trade-context';
import { fetchSavedMarketListingIds, toggleSavedMarketListing } from '../lib/marketSavedItems';
import { stackrIcons } from '../lib/stackrIcons';
import { supabase } from '../lib/supabase';

export default function FavoritesMarketItemsScreen() {
  const { theme } = useTheme();
  const { marketplaceListings, tradeLoading, refreshTrade } = useTrade();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const authUserIdRef = useRef('');
  const authGenerationRef = useRef(0);

  const bindIdentity = useCallback((userId: string) => {
    if (authUserIdRef.current === userId) return authGenerationRef.current;
    authUserIdRef.current = userId;
    authGenerationRef.current += 1;
    setCurrentUserId(userId);
    setSavedIds([]);
    return authGenerationRef.current;
  }, []);

  const load = useCallback(async (expectedUserId?: string, expectedGeneration?: number) => {
    const startingUserId = authUserIdRef.current;
    const startingGeneration = authGenerationRef.current;
    let attemptedUserId: string | null = null;
    let attemptedGeneration: number | null = null;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      const userId = user?.id ?? '';
      const generation = bindIdentity(userId);
      attemptedUserId = userId;
      attemptedGeneration = generation;
      if (
        expectedUserId !== undefined
        && (expectedUserId !== userId || expectedGeneration !== generation)
      ) return;
      const saved = userId ? await fetchSavedMarketListingIds(userId) : [];
      if (authUserIdRef.current !== userId || authGenerationRef.current !== generation) return;
      setSavedIds(saved);
    } catch {
      if (
        attemptedUserId === null
        && authUserIdRef.current === startingUserId
        && authGenerationRef.current === startingGeneration
      ) {
        bindIdentity('');
        return;
      }
      if (
        attemptedUserId !== null
        && authUserIdRef.current === attemptedUserId
        && authGenerationRef.current === attemptedGeneration
      ) {
        setSavedIds([]);
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18 }}>
        <StackrBackdrop />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>Favorited Listings</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>
              Market listings saved for your Stackr account on this device.
            </Text>
          </View>
        </View>

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
            <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
              <MarketEmptyState
                imageIcon={stackrIcons.favorite}
                title="No favorited listings yet"
                body="Favorite a specific Market listing to return to it later. Chase cards and price watchlists stay separate."
                actionLabel="Browse The Market"
                onAction={() => router.replace('/(tabs)/market' as any)}
              />
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
