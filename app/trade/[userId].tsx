import { theme } from '../../lib/theme';
import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Text } from '../../components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

type TradeListing = {
  id: string;
  card_id: string;
  set_id: string | null;
  card_name: string | null;
  image_url: string | null;
  set_name: string | null;
  asking_price: number | null;
  condition: string | null;
};

export default function UserTradeListingsScreen() {
  const params = useLocalSearchParams<{ userId?: string; userName?: string }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const userName = Array.isArray(params.userName) ? params.userName[0] : params.userName;

  const [listings, setListings] = useState<TradeListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    loadListings();
  }, [userId]);

  async function loadListings() {
    try {
      setLoading(true);

      const { data, error } = await supabase
  .from('trade_listings')
  .select('id, card_id, set_id, card_name, image_url, set_name, asking_price, condition')
  .eq('owner_user_id', userId)
  .eq('status', 'active')
  .order('created_at', { ascending: false });

      if (error) throw error;
      setListings((data ?? []) as TradeListing[]);
    } catch (err) {
      console.log('Failed to load trade listings', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['bottom', 'left', 'right']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>

        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
            {userName ? `${userName}'s Trades` : 'Trade Listings'}
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, marginTop: 2 }}>
            Tap a card to make an offer
          </Text>
        </View>

        {/* Content */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : listings.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Text style={{ fontSize: 40 }}>🤝</Text>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
              No active listings
            </Text>
            <Text style={{ color: theme.colors.textSoft, textAlign: 'center', lineHeight: 20 }}>
              {userName ?? 'This collector'} has no cards available for trade right now.
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                marginTop: 8,
                backgroundColor: theme.colors.primary,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 24,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
          >
            {listings.map((listing) => (
              <TouchableOpacity
                key={listing.id}
                onPress={() => router.push({
                  pathname: '/offer/new',
                  params: {
                    listingId: listing.id,
                    targetUserId: userId,
                    cardId: listing.card_id,
                    setId: listing.set_id ?? '',
                  },
                })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.card,
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  gap: 12,
                }}
              >
                {listing.image_url ? (
                  <Image
                    source={{ uri: listing.image_url }}
                    style={{ width: 60, height: 84, borderRadius: 8, backgroundColor: theme.colors.surface }}
                  />
                ) : (
                  <View style={{
                    width: 60, height: 84,
                    borderRadius: 8,
                    backgroundColor: theme.colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ color: theme.colors.textSoft, fontSize: 10 }}>No image</Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }} numberOfLines={2}>
                    {listing.card_name ?? listing.card_id}
                  </Text>
                  <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 4 }}>
                    {listing.set_name ?? listing.set_id ?? 'Unknown set'}
                  </Text>
                  {listing.condition && (
                    <Text style={{ color: theme.colors.textSoft, fontSize: 12, marginTop: 2 }}>
                      {listing.condition}
                    </Text>
                  )}
                  {listing.asking_price != null && (
                    <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 13, marginTop: 6 }}>
                      £{listing.asking_price.toFixed(2)}
                    </Text>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSoft} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}