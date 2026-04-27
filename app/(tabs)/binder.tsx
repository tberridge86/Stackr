import { uploadCardScan } from '../../lib/storage';
import { theme } from '../../lib/theme';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { fetchBinders, fetchBinderCards, BinderRecord } from '../../lib/binders';

type BinderCardCountMap = Record<string, { owned: number; total: number }>;

type SortKey =
  | 'recent'
  | 'alphabetical'
  | 'completionHigh'
  | 'completionLow'
  | 'ownedHigh'
  | 'ownedLow';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'alphabetical', label: 'A-Z' },
  { key: 'completionHigh', label: 'Most complete' },
  { key: 'completionLow', label: 'Least complete' },
  { key: 'ownedHigh', label: 'Most cards' },
  { key: 'ownedLow', label: 'Fewest cards' },
];

const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—';
  return `£${Number(value).toFixed(2)}`;
};

export default function BinderLibraryScreen() {
  const [binders, setBinders] = useState<BinderRecord[]>([]);
  const [counts, setCounts] = useState<BinderCardCountMap>({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    try {
      setLoading(true);

      const data = await fetchBinders();
      setBinders(data);

      const entries = await Promise.all(
        data.map(async (binder) => {
          const cards = await fetchBinderCards(binder.id);
          const owned = cards.filter((card) => card.owned).length;

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

const scanCardWithAI = async (imageUrl: string) => {
  try {
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_PRICE_API_URL}/scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text);
    }

    return await res.json();
  } catch (error) {
    console.log('AI scan failed', error);
    throw error;
  }
};

  const handleScanCard = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Please allow camera access.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setScanning(true);

      const imageUrl = await uploadCardScan(result.assets[0].uri);

console.log('Uploaded image URL:', imageUrl);

const scanResult = await scanCardWithAI(imageUrl);

console.log('Scan result:', scanResult);

const card = scanResult?.records?.[0]?._objects?.[0];

if (!card) {
  Alert.alert('Scan failed', 'No card detected');
  return;
}

Alert.alert(
  'Card detected',
  `${card.name} (${card.set})`
);
    } catch (error: any) {
  console.log('Scan failed FULL ERROR:', error);

  Alert.alert(
    'Scan failed',
    error?.message ?? 'Could not scan this card.'
  );
} finally {
      setScanning(false);
    }
  };

  const sortedBinders = useMemo(() => {
    const list = [...binders];

    const getProgress = (binderId: string) => {
      const progress = counts[binderId] ?? { owned: 0, total: 0 };
      return progress.total ? progress.owned / progress.total : 0;
    };

    const getOwned = (binderId: string) => counts[binderId]?.owned ?? 0;

    if (sortBy === 'alphabetical') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sortBy === 'completionHigh') {
      list.sort((a, b) => getProgress(b.id) - getProgress(a.id));
    }

    if (sortBy === 'completionLow') {
      list.sort((a, b) => getProgress(a.id) - getProgress(b.id));
    }

    if (sortBy === 'ownedHigh') {
      list.sort((a, b) => getOwned(b.id) - getOwned(a.id));
    }

    if (sortBy === 'ownedLow') {
      list.sort((a, b) => getOwned(a.id) - getOwned(b.id));
    }

    return list;
  }, [binders, counts, sortBy]);

  const renderSortButton = (option: { key: SortKey; label: string }) => {
    const active = sortBy === option.key;

    return (
      <Pressable
        key={option.key}
        onPress={() => setSortBy(option.key)}
        style={{
          backgroundColor: active ? theme.colors.secondary : theme.colors.card,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: active ? theme.colors.secondary : theme.colors.border,
          marginRight: 8,
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            color: active ? theme.colors.text : theme.colors.textSoft,
            fontSize: 12,
            fontWeight: '900',
          }}
        >
          {option.label}
        </Text>
      </Pressable>
    );
  };

  const renderBinder = ({ item }: { item: BinderRecord }) => {
    const progress = counts[item.id] ?? { owned: 0, total: 0 };

    const percentage = progress.total
      ? Math.round((progress.owned / progress.total) * 100)
      : 0;

    const mainValue =
      item.ebay_value ?? item.tcg_value ?? item.cardmarket_value ?? null;

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
          minHeight: 160,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          ...cardShadow,
        }}
      >
        <View
          style={{
            width: 20,
            backgroundColor: item.color || theme.colors.primary,
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
                backgroundColor: theme.colors.surface,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textSoft,
                  fontSize: 10,
                  fontWeight: '900',
                  letterSpacing: 0.8,
                }}
              >
                {item.type === 'official' ? 'OFFICIAL' : 'CUSTOM'}
              </Text>
            </View>

            <Text
              style={{
                color: theme.colors.text,
                fontSize: 20,
                fontWeight: '900',
              }}
            >
              {item.name}
            </Text>

            <Text style={{ color: theme.colors.textSoft, marginTop: 6 }}>
              {progress.owned} / {progress.total} owned · {percentage}%
            </Text>

            <View
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 14,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textSoft,
                  fontSize: 11,
                  fontWeight: '900',
                  marginBottom: 4,
                  letterSpacing: 0.5,
                }}
              >
                ESTIMATED VALUE
              </Text>

              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 18,
                  fontWeight: '900',
                }}
              >
                {formatCurrency(mainValue)}
              </Text>

              <Text
                style={{
                  color: theme.colors.textSoft,
                  fontSize: 12,
                  marginTop: 6,
                  lineHeight: 18,
                }}
              >
                eBay: {formatCurrency(item.ebay_value)} · TCG:{' '}
                {formatCurrency(item.tcg_value)} · CardMarket:{' '}
                {formatCurrency(item.cardmarket_value)}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 8,
              borderRadius: 999,
              backgroundColor: theme.colors.surface,
              overflow: 'hidden',
              marginTop: 14,
            }}
          >
            <View
              style={{
                width: progress.total
                  ? `${(progress.owned / progress.total) * 100}%`
                  : '0%',
                height: '100%',
                backgroundColor: item.color || theme.colors.primary,
                borderRadius: 999,
              }}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      edges={['top']}
    >
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 28,
                fontWeight: '900',
              }}
            >
              Binder
            </Text>

            <Text style={{ color: theme.colors.textSoft, marginTop: 4 }}>
              Your shelf of official sets and custom collections
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/binder/new')}
            style={{
              backgroundColor: theme.colors.primary,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
              New Binder
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleScanCard}
          disabled={scanning}
          style={{
            backgroundColor: theme.colors.secondary,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: 'center',
            marginBottom: 14,
            opacity: scanning ? 0.6 : 1,
          }}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
            {scanning ? 'Scanning...' : 'Scan Card'}
          </Text>
        </TouchableOpacity>

        <View style={{ marginBottom: 10 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 16,
              fontWeight: '900',
              marginBottom: 10,
            }}
          >
            Sort binders
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {SORT_OPTIONS.map(renderSortButton)}
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={sortedBinders}
            keyExtractor={(item) => item.id}
            renderItem={renderBinder}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={load}
                tintColor={theme.colors.primary}
              />
            }
            contentContainerStyle={{
              paddingBottom: 120,
              flexGrow: sortedBinders.length === 0 ? 1 : 0,
            }}
            ListEmptyComponent={
              <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: '900',
                  }}
                >
                  No binders yet.
                </Text>

                <Text
                  style={{
                    color: theme.colors.textSoft,
                    textAlign: 'center',
                    fontSize: 13,
                    marginTop: 8,
                    lineHeight: 20,
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