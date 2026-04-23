import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { fetchBinders, fetchBinderCards, BinderRecord } from '../../lib/binders';

type BinderCardCountMap = Record<string, { owned: number; total: number }>;

export default function BinderLibraryScreen() {
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [counts, setCounts] = useState<BinderCardCountMap>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchBinders();
      setBinders(data);

      const entries = await Promise.all(
        data.map(async (binder) => {
          const cards = await fetchBinderCards(binder.id);
          const owned = cards.filter((c) => c.owned).length;
          return [binder.id, { owned, total: cards.length }] as const;
        })
      );

      setCounts(Object.fromEntries(entries));
    } catch (error) {
      console.log('Failed to load binders', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const renderBinder = ({ item }: { item: BinderRecord }) => {
    const progress = counts[item.id] ?? { owned: 0, total: 0 };

    return (
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: '/binder/[id]',
            params: { id: item.id },
          })
        }
        style={{
          flexDirection: 'row',
          borderRadius: 22,
          overflow: 'hidden',
          marginBottom: 14,
          minHeight: 122,
          backgroundColor: '#121938',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.05)',
        }}
      >
        <View
          style={{
            width: 20,
            backgroundColor: item.color,
          }}
        />

        <View
          style={{
            flex: 1,
            padding: 16,
            justifyContent: 'space-between',
          }}
        >
          <View>
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(255,255,255,0.06)',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  color: '#AAB3D1',
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 0.8,
                }}
              >
                {item.type === 'official' ? 'OFFICIAL' : 'CUSTOM'}
              </Text>
            </View>

            <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>
              {item.name}
            </Text>

            <Text style={{ color: '#AAB3D1', marginTop: 6 }}>
              {progress.owned} / {progress.total} owned
            </Text>
          </View>

          <View
            style={{
              height: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
              marginTop: 14,
            }}
          >
            <View
              style={{
                width: progress.total ? `${(progress.owned / progress.total) * 100}%` : '0%',
                height: '100%',
                backgroundColor: item.color,
                borderRadius: 999,
              }}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b0b0b' }} edges={['top']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <View>
            <Text style={{ color: 'white', fontSize: 28, fontWeight: '800' }}>
              Binder
            </Text>
            <Text style={{ color: '#AAB3D1', marginTop: 4 }}>
              Your shelf of custom and official binders
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/binder/new')}
            style={{
              backgroundColor: '#2563eb',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: 'white', fontWeight: '800' }}>New Binder</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <FlatList
            data={binders}
            keyExtractor={(item) => item.id}
            renderItem={renderBinder}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />
            }
            contentContainerStyle={{
              paddingBottom: 120,
              flexGrow: binders.length === 0 ? 1 : 0,
            }}
            ListEmptyComponent={
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={{ color: '#AAB3D1', textAlign: 'center', fontSize: 15 }}>
                  No binders yet.
                </Text>
                <Text
                  style={{
                    color: '#7f89b0',
                    textAlign: 'center',
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  Create your first official set binder or a themed custom one.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}