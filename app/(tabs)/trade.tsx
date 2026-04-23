import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useTrade } from '../../components/trade-context';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';
import { supabase } from '../../lib/supabase';

type SegmentKey = 'marketplace' | 'myListings' | 'myOffers';

export default function TradeScreen() {
  const [segment, setSegment] = useState<SegmentKey>('marketplace');
  const [cardDetailsMap, setCardDetailsMap] = useState<Record<string, any>>({});
  const [myUserId, setMyUserId] = useState<string>('');

  const {
    marketplaceListings,
    myListings,
    tradeLoading,
    tradeError,
    refreshTrade,
    archiveListing,
  } = useTrade();

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setMyUserId(user?.id ?? '');
    };

    loadUser();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshTrade();
    }, [refreshTrade])
  );

  const currentData = useMemo(() => {
    if (segment === 'marketplace') return marketplaceListings;
    if (segment === 'myListings') return myListings;
    return [];
  }, [segment, marketplaceListings, myListings]);

  useEffect(() => {
    let mounted = true;

    const loadDetails = async () => {
      const nextMap: Record<string, any> = {};

      for (const item of currentData) {
        const setId = item.set_id;
        const cardId = item.card_id;

        if (!setId || !cardId) continue;

        let found = getCachedCardSync(setId, cardId);

        if (!found) {
          const cards = await getCachedCardsForSet(setId);
          found = cards.find((c) => c.id === cardId) ?? null;
        }

        if (found) {
          nextMap[item.id] = found;
        }
      }

      if (mounted) {
        setCardDetailsMap(nextMap);
      }
    };

    if (currentData.length) {
      loadDetails();
    } else {
      setCardDetailsMap({});
    }

    return () => {
      mounted = false;
    };
  }, [currentData]);

  const handleArchive = async (listingId: string) => {
    try {
      await archiveListing(listingId);
      Alert.alert('Archived', 'Listing archived successfully.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not archive listing.';
      Alert.alert('Error', message);
    }
  };

  const handleMakeOffer = (item: any) => {
    const isMyListing = item.user_id === myUserId;

    if (isMyListing) {
      Alert.alert('Not allowed', "You can't offer on your own card.");
      return;
    }

    router.push({
      pathname: '/offer/new',
      params: {
        listingId: item.id,
        targetUserId: item.user_id,
        cardId: item.card_id,
        setId: item.set_id ?? '',
      },
    });
  };

  const renderSegmentButton = (key: SegmentKey, label: string) => {
    const active = segment === key;

    return (
      <TouchableOpacity
        onPress={() => setSegment(key)}
        style={{
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 8,
          marginHorizontal: 4,
          borderRadius: 12,
          backgroundColor: active ? '#2a2a2a' : '#151515',
          borderWidth: 1,
          borderColor: active ? '#4b5563' : '#262626',
        }}
      >
        <Text
          style={{
            color: 'white',
            textAlign: 'center',
            fontWeight: '700',
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderListing = ({ item }: { item: any }) => {
    const sellerName = item?.profiles?.collector_name || 'Collector';
    const cardDetails = cardDetailsMap[item.id];
    const imageUri = cardDetails?.images?.small ?? null;
    const cardName = cardDetails?.name ?? item.card_id ?? 'Unknown card';
    const setName = cardDetails?.set?.name ?? item.set_id ?? 'Unknown set';
    const isMyListing = item.user_id === myUserId;

    return (
      <View
        style={{
          backgroundColor: '#161616',
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: '#262626',
        }}
      >
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: '/card/[id]',
              params: {
                id: item.card_id,
                setId: item.set_id ?? '',
              },
            })
          }
          style={{ flexDirection: 'row' }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{
                width: 72,
                height: 100,
                borderRadius: 10,
                marginRight: 12,
                backgroundColor: '#0f0f0f',
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 100,
                borderRadius: 10,
                marginRight: 12,
                backgroundColor: '#0f0f0f',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#888', fontSize: 12 }}>No image</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: 'white',
                fontSize: 16,
                fontWeight: '700',
                marginBottom: 4,
              }}
            >
              {cardName}
            </Text>

            <Text style={{ color: '#b3b3b3', marginBottom: 4 }}>
              {setName}
            </Text>

            {!!item.condition && (
              <Text style={{ color: '#9ca3af', marginBottom: 4 }}>
                {item.condition}
              </Text>
            )}

            {item.custom_value != null ? (
              <Text style={{ color: '#86efac', marginBottom: 4 }}>
                £{item.custom_value}
              </Text>
            ) : (
              <Text style={{ color: '#93c5fd', marginBottom: 4 }}>
                Open to offers
              </Text>
            )}

            {segment === 'marketplace' ? (
              <TouchableOpacity
                onPress={() => router.push(`/user/${item.user_id}`)}
              >
                <Text style={{ color: '#7dd3fc', marginTop: 2 }}>
                  {sellerName}
                  {isMyListing ? ' • Your listing' : ''}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: '#9ca3af', marginTop: 2 }}>
                Status: {item.status}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {!!item.notes && (
          <Text style={{ color: '#cfcfcf', marginTop: 10 }}>{item.notes}</Text>
        )}

        {segment === 'marketplace' && !isMyListing && (
          <TouchableOpacity
            onPress={() => handleMakeOffer(item)}
            style={{
              marginTop: 12,
              backgroundColor: '#2563eb',
              borderRadius: 12,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: 'white',
                textAlign: 'center',
                fontWeight: '700',
              }}
            >
              Make Offer
            </Text>
          </TouchableOpacity>
        )}

        {segment === 'marketplace' && isMyListing && (
          <View
            style={{
              marginTop: 12,
              backgroundColor: '#1f274d',
              borderRadius: 12,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: '#AAB3D1',
                textAlign: 'center',
                fontWeight: '700',
              }}
            >
              Your listing
            </Text>
          </View>
        )}

        {segment === 'myListings' && item.status === 'active' && (
          <TouchableOpacity
            onPress={() => handleArchive(item.id)}
            style={{
              marginTop: 12,
              backgroundColor: '#3a1f1f',
              borderRadius: 12,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: 'white',
                textAlign: 'center',
                fontWeight: '700',
              }}
            >
              Archive Listing
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmpty = () => {
    if (segment === 'marketplace') {
      return (
        <View style={{ paddingVertical: 50 }}>
          <Text style={{ color: '#a3a3a3', textAlign: 'center' }}>
            No active marketplace listings yet.
          </Text>
        </View>
      );
    }

    if (segment === 'myListings') {
      return (
        <View style={{ paddingVertical: 50 }}>
          <Text style={{ color: '#a3a3a3', textAlign: 'center' }}>
            You have no listings yet.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ paddingVertical: 30 }}>
        <Text style={{ color: '#a3a3a3', textAlign: 'center', marginBottom: 12 }}>
          View offers you’ve sent and received.
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/offers')}
          style={{
            backgroundColor: '#2563eb',
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignSelf: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>
            Open Offers
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0b0b0b',
        paddingHorizontal: 16,
        paddingTop: 16,
      }}
    >
      <Text
        style={{
          color: 'white',
          fontSize: 26,
          fontWeight: '800',
          marginBottom: 16,
        }}
      >
        Trade
      </Text>

      <View style={{ flexDirection: 'row', marginBottom: 16 }}>
        {renderSegmentButton('marketplace', 'Marketplace')}
        {renderSegmentButton('myListings', 'My Listings')}
        {renderSegmentButton('myOffers', 'My Offers')}
      </View>

      {!!tradeError && (
        <View
          style={{
            backgroundColor: '#2a1414',
            borderColor: '#4b1d1d',
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#fca5a5' }}>{tradeError}</Text>
        </View>
      )}

      {segment === 'myOffers' ? (
        renderEmpty()
      ) : tradeLoading && currentData.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : (
        <FlatList
          data={currentData}
          keyExtractor={(item) => item.id}
          renderItem={renderListing}
          contentContainerStyle={{
            paddingBottom: 40,
            flexGrow: currentData.length === 0 ? 1 : 0,
          }}
          refreshControl={
            <RefreshControl
              refreshing={tradeLoading}
              onRefresh={refreshTrade}
              tintColor="#ffffff"
            />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}
    </View>
  );
}