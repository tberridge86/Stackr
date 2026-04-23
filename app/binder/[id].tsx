import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  fetchBinderById,
  fetchBinderCards,
  updateBinderCardOwned,
} from '../../lib/binders';
import { getCachedCardSync, getCachedCardsForSet } from '../../lib/pokemonTcgCache';

export default function BinderDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const binderId = typeof params.id === 'string' ? params.id : '';

  const [binder, setBinder] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const isOwner = useMemo(() => {
    return !!binder?.user_id && binder.user_id === currentUserId;
  }, [binder?.user_id, currentUserId]);

  const load = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? '');

      const binderData = await fetchBinderById(binderId);
      const binderCards = await fetchBinderCards(binderId);

      const enriched = await Promise.all(
        binderCards.map(async (item) => {
          let card = getCachedCardSync(item.set_id, item.card_id);

          if (!card) {
            const setCards = await getCachedCardsForSet(item.set_id);
            card = setCards.find((c) => c.id === item.card_id) ?? null;
          }

          return {
            ...item,
            card,
          };
        })
      );

      setBinder(binderData);
      setCards(enriched);
    } catch (error) {
      console.log('Binder load error', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (binderId) load();
  }, [binderId]);

  const handleCardPress = async (item: any) => {
    try {
      if (isOwner) {
        await updateBinderCardOwned(item.id, !item.owned);

        setCards((prev) =>
          prev.map((c) =>
            c.id === item.id ? { ...c, owned: !item.owned } : c
          )
        );
        return;
      }

      router.push({
        pathname: '/card/[id]',
        params: {
          id: item.card_id,
          setId: item.set_id,
        },
      });
    } catch (error) {
      console.log('Card press error', error);
      Alert.alert('Error', 'Could not update this card.');
    }
  };

  const ownedCount = cards.filter((c) => c.owned).length;
  const totalCount = cards.length;
  const progressPercent = totalCount ? Math.round((ownedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b0b0b', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!binder) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0b0b0b',
          padding: 24,
        }}
      >
        <Text style={{ color: 'white', fontSize: 22, fontWeight: '800', marginBottom: 8 }}>
          Binder not found
        </Text>
        <Text style={{ color: '#AAB3D1', textAlign: 'center' }}>
          This binder could not be loaded.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0b0b' }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            backgroundColor: binder.color || '#2563eb',
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 18,
            borderBottomLeftRadius: 26,
            borderBottomRightRadius: 26,
          }}
        >
          <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>
            {binder.name}
          </Text>

          <Text style={{ color: 'rgba(255,255,255,0.82)', marginTop: 4 }}>
            {binder.type === 'official' ? 'Official binder' : 'Custom binder'}
          </Text>

          <View
            style={{
              marginTop: 14,
              backgroundColor: 'rgba(0,0,0,0.18)',
              borderRadius: 14,
              padding: 12,
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800', marginBottom: 8 }}>
              Progress
            </Text>

            <Text style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 10 }}>
              {ownedCount} / {totalCount} owned • {progressPercent}%
            </Text>

            <View
              style={{
                height: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.2)',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  backgroundColor: '#ffffff',
                  borderRadius: 999,
                }}
              />
            </View>
          </View>

          {isOwner && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/binder/add-cards',
                  params: { binderId },
                })
              }
              style={{
                marginTop: 14,
                backgroundColor: 'rgba(0,0,0,0.18)',
                alignSelf: 'flex-start',
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '800' }}>Add Cards</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={{
            paddingHorizontal: 10,
            paddingTop: 16,
            paddingBottom: 120,
          }}
          renderItem={({ item }) => {
            const card = item.card;

            return (
              <TouchableOpacity
                onPress={() => handleCardPress(item)}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  margin: 6,
                  borderRadius: 18,
                  overflow: 'hidden',
                  backgroundColor: '#151a33',
                  borderWidth: 1,
                  borderColor: '#232a4d',
                  padding: 8,
                  alignItems: 'center',
                  minHeight: 165,
                }}
              >
                <View
                  style={{
                    width: '100%',
                    flex: 1,
                    borderRadius: 12,
                    backgroundColor: '#0d1226',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {card?.images?.small ? (
                    <Image
                      source={{ uri: card.images.small }}
                      style={{ width: 82, height: 114 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={{ color: '#777', fontSize: 10 }}>
                      No image
                    </Text>
                  )}

                  {!item.owned && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.58)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#cbd5e1', fontSize: 11, fontWeight: '700' }}>
                        Missing
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  numberOfLines={2}
                  style={{
                    color: 'white',
                    fontSize: 10,
                    marginTop: 8,
                    textAlign: 'center',
                    fontWeight: '700',
                    minHeight: 28,
                  }}
                >
                  {card?.name ?? 'Card'}
                </Text>

                <Text
                  style={{
                    color: '#94A0C9',
                    fontSize: 10,
                    marginTop: 4,
                    fontWeight: '700',
                  }}
                >
                  {isOwner ? 'Tap to toggle' : 'Tap to view'}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <Text style={{ color: '#AAB3D1', fontSize: 15 }}>
                No cards in this binder yet.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}