import { theme } from '../../lib/theme';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { Text } from '../../components/Text';
import { FeatureTipGate } from '../../components/FeatureTipModal';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StackrCardPlaceholder } from '../../components/StackrCardPlaceholder';
import { StackrScreenHeader } from '../../components/StackrScreenHeader';
import { useTrade } from '../../components/trade-context';
import {
  getCachedCardSync,
  getCachedCardsForSet,
} from '../../lib/pokemonTcgCache';

type SegmentKey = 'marketplace' | 'myListings' | 'myOffers';

export default function MarketScreen() {
  const [segment, setSegment] = useState<SegmentKey>('marketplace');
  const [searchQuery, setSearchQuery] = useState('');
  const [cardDetailsMap, setCardDetailsMap] = useState<Record<string, any>>({});

  const {
    marketplaceListings,
    myListings,
    tradeLoading,
    tradeError,
    refreshTrade,
    archiveListing,
  } = useTrade();

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

  const filteredData = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return currentData;

    return currentData.filter((item: any) => {
      const cardDetails = cardDetailsMap[item.id];
      const cardName = String(cardDetails?.name ?? item.card_id ?? '').toLowerCase();
      const setName = String(cardDetails?.set?.name ?? item.set_id ?? '').toLowerCase();
      const sellerName = String(item?.profiles?.collector_name ?? '').toLowerCase();
      return (
        cardName.includes(trimmed) ||
        setName.includes(trimmed) ||
        sellerName.includes(trimmed)
      );
    });
  }, [cardDetailsMap, currentData, searchQuery]);

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
          borderRadius: 999,
          backgroundColor: active ? theme.colors.primary : theme.colors.card,
          borderWidth: 1,
          borderColor: active ? theme.colors.primary : theme.colors.border,
        }}
      >
        <Text
          style={{
            color: active ? '#FFFFFF' : theme.colors.text,
            textAlign: 'center',
            fontWeight: '900',
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
    const price = item.custom_value != null ? Number(item.custom_value) : null;
    const actionLabel = price != null ? 'Buy' : 'Offer';
    const openOffer = () =>
      router.push({
        pathname: '/offer/new',
        params: {
          listingId: item.id,
          targetUserId: item.user_id,
          cardId: item.card_id,
          setId: item.set_id ?? '',
        },
      });

    return (
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 16,
          padding: 12,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#6D4AFF',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        }}
      >
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: '/card/[id]',
              params: { id: item.card_id, setId: item.set_id ?? '' },
            })
          }
          style={{ flexDirection: 'row', alignItems: 'center' }}
          activeOpacity={0.88}
        >
          <TouchableOpacity style={{ marginRight: 10, alignSelf: 'flex-start', paddingTop: 2 }}>
            <Ionicons name="heart-outline" size={24} color={theme.colors.textSoft} />
          </TouchableOpacity>

          <View style={{ marginRight: 14 }}>
            <StackrCardPlaceholder uri={imageUri} width={72} height={100} borderRadius={12} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 }}>
              {cardName}
            </Text>
            <Text numberOfLines={1} style={{ color: theme.colors.textSoft, marginBottom: 8, fontSize: 13 }}>
              {setName}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {!!item.condition && (
                <Text
                  style={{
                    color: theme.colors.primary,
                    backgroundColor: theme.colors.primary + '12',
                    borderRadius: 999,
                    overflow: 'hidden',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    fontSize: 12,
                    fontWeight: '900',
                  }}
                >
                  {item.condition}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.textSoft, fontSize: 12, fontWeight: '800' }}>
                  4.9
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => router.push(`/user/${item.user_id}`)}>
              <Text numberOfLines={1} style={{ color: theme.colors.textSoft, marginTop: 8, fontWeight: '800', fontSize: 12 }}>
                {sellerName}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ width: 96, alignItems: 'flex-end', marginLeft: 8 }}>
            {price != null ? (
              <>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 19 }}>
                  £{price.toFixed(2)}
                </Text>
                <Text style={{ color: '#0EA371', fontSize: 11, fontWeight: '800', marginTop: 2 }}>
                  Free shipping
                </Text>
              </>
            ) : (
              <Text style={{ color: theme.colors.primary, fontWeight: '900', textAlign: 'right', fontSize: 14 }}>
                Trade Available
              </Text>
            )}

            {segment === 'marketplace' ? (
              <TouchableOpacity
                onPress={openOffer}
                style={{
                  marginTop: 10,
                  backgroundColor: price != null ? theme.colors.primary : 'transparent',
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.primary,
                  minWidth: 84,
                }}
              >
                <Text style={{ color: price != null ? '#FFFFFF' : theme.colors.primary, textAlign: 'center', fontWeight: '900', fontSize: 13 }}>
                  {actionLabel}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: theme.colors.textSoft, marginTop: 10, fontSize: 12, fontWeight: '800' }}>
                {item.status}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {!!item.notes && (
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>{item.notes}</Text>
        )}

        {segment === 'myListings' && item.status === 'active' && (
          <TouchableOpacity
            onPress={() => handleArchive(item.id)}
            style={{
              marginTop: 12,
              backgroundColor: '#FFF2F2',
              borderRadius: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: '#FFD5D5',
            }}
          >
            <Text style={{ color: '#D93434', textAlign: 'center', fontWeight: '900' }}>
              Archive Listing
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );

    // eslint-disable-next-line no-unreachable
    return (
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 14,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#6D4AFF',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
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
          <View style={{ marginRight: 14 }}>
            <StackrCardPlaceholder
              uri={imageUri}
              width={78}
              height={108}
              borderRadius={12}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 17,
                fontWeight: '900',
                marginBottom: 4,
              }}
            >
              {cardName}
            </Text>

            <Text style={{ color: theme.colors.textSoft, marginBottom: 6 }}>
              {setName}
            </Text>

            {!!item.condition && (
              <Text style={{ color: theme.colors.textSoft, marginBottom: 6 }}>
                Condition: {item.condition}
              </Text>
            )}

            {item.custom_value != null ? (
              <Text style={{ color: theme.colors.primary, marginBottom: 6, fontWeight: '900' }}>
                Value: £{item.custom_value}
              </Text>
            ) : (
              <Text style={{ color: '#0EA371', marginBottom: 6, fontWeight: '800' }}>
                Open to offers
              </Text>
            )}

            {segment === 'marketplace' ? (
              <TouchableOpacity onPress={() => router.push(`/user/${item.user_id}`)}>
                <Text style={{ color: theme.colors.primary, marginTop: 2, fontWeight: '800' }}>
                  Seller: {sellerName}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: theme.colors.textSoft, marginTop: 2 }}>
                Status: {item.status}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {!!item.notes && (
          <Text style={{ color: theme.colors.textSoft, marginTop: 12 }}>{item.notes}</Text>
        )}

        {segment === 'marketplace' && (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/offer/new',
                params: {
                  listingId: item.id,
                  targetUserId: item.user_id,
                  cardId: item.card_id,
                  setId: item.set_id ?? '',
                },
              })
            }
            style={{
              marginTop: 12,
              backgroundColor: theme.colors.primary,
              borderRadius: 14,
              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color: 'white',
                textAlign: 'center',
                fontWeight: '900',
              }}
            >
              Make Offer
            </Text>
          </TouchableOpacity>
        )}

        {segment === 'myListings' && item.status === 'active' && (
          <TouchableOpacity
            onPress={() => handleArchive(item.id)}
            style={{
              marginTop: 12,
              backgroundColor: '#FFF2F2',
              borderRadius: 14,
              paddingVertical: 12,
              borderWidth: 1,
              borderColor: '#FFD5D5',
            }}
          >
            <Text
              style={{
                color: '#D93434',
                textAlign: 'center',
                fontWeight: '900',
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
          <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
            No active marketplace listings yet.
          </Text>
        </View>
      );
    }

    if (segment === 'myListings') {
      return (
        <View style={{ paddingVertical: 50 }}>
          <Text style={{ color: theme.colors.textSoft, textAlign: 'center' }}>
            You have no listings yet.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ paddingVertical: 30 }}>
        <Text style={{ color: theme.colors.textSoft, textAlign: 'center', marginBottom: 12 }}>
          View offers you’ve sent and received.
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/offers')}
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 14,
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignSelf: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '900' }}>
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
        backgroundColor: theme.colors.bg,
        paddingHorizontal: 16,
        paddingTop: 16,
      }}
    >
      <StackrScreenHeader
        title="Marketplace"
        subtitle="Find the cards you want"
      />

      <FeatureTipGate
        tipKey="market-screen-v1"
        title="Market Place"
        subtitle="Latest prices, wanted cards, trading tools, and collector listings in one place."
        items={[
          { icon: 'trending-up-outline', title: 'Latest Prices', body: 'Search a specific card and view recent price movement.' },
          { icon: 'heart-outline', title: 'Wanted Cards', body: 'Track cards you are looking for.' },
          { icon: 'calculator-outline', title: 'Price Builder', body: 'Build fair values for trades and bundles.' },
          { icon: 'swap-horizontal-outline', title: 'Trading', body: 'Trade or buy from other collectors on Stackr.' },
        ]}
      />

      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 18,
          padding: 12,
          marginBottom: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#6D4AFF',
          shadowOpacity: 0.06,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="search-outline" size={24} color={theme.colors.text} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search a specific card"
            placeholderTextColor={theme.colors.textSoft}
            style={{
              flex: 1,
              color: theme.colors.text,
              fontSize: 15,
              fontWeight: '800',
              paddingVertical: 10,
            }}
          />
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          marginBottom: 14,
          backgroundColor: '#F8F5FF',
          borderRadius: 999,
          padding: 4,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {renderSegmentButton('marketplace', 'Marketplace')}
        {renderSegmentButton('myListings', 'My Listings')}
        {renderSegmentButton('myOffers', 'My Offers')}
      </View>

      {segment === 'marketplace' && currentData.length > 0 && (
        <View
          style={{
            backgroundColor: theme.colors.primary + '10',
            borderRadius: 18,
            padding: 16,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: theme.colors.primary + '35',
            flexDirection: 'row',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
              New to Stackr?
            </Text>
            <Text style={{ color: theme.colors.textSoft, marginTop: 5, lineHeight: 19 }}>
              Learn how buying and trading works.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/trade')}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 9,
                alignSelf: 'flex-start',
                marginTop: 12,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Learn More</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', marginLeft: 12 }}>
            <View style={{
              width: 48,
              height: 68,
              borderRadius: 9,
              backgroundColor: theme.colors.primary,
              transform: [{ rotate: '-10deg' }],
            }} />
            <View style={{
              width: 48,
              height: 68,
              borderRadius: 9,
              backgroundColor: theme.colors.primary,
              marginLeft: -18,
              opacity: 0.75,
              transform: [{ rotate: '9deg' }],
            }} />
          </View>
        </View>
      )}

      {!!tradeError && (
        <View
          style={{
            backgroundColor: '#FFF2F2',
            borderColor: '#FFD5D5',
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#D93434' }}>{tradeError}</Text>
        </View>
      )}

      {segment === 'myOffers' ? (
        renderEmpty()
      ) : tradeLoading && currentData.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
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
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}
    </View>
  );
}
