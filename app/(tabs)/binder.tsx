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
  Image,
  Dimensions,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '../../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  fetchBinders,
  fetchBinderCards,
  deleteBinder,
  BinderRecord,
} from '../../lib/binders';
import { supabase } from '../../lib/supabase';
import DraggableFlatList from 'react-native-draggable-flatlist';

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
const screenWidth = Dimensions.get('window').width;
const gridGap = 12;
const binderCardWidth = (screenWidth - 16 * 2 - gridGap * 2) / 3;

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined) return '—';
  return `£${Number(value).toFixed(2)}`;
};

const BINDER_LOGO_OVERRIDES: Record<string, string> = {
  me3: 'https://images.pokemontcg.io/por/logo.png',
  };

const getBinderLogoUrl = (item: BinderRecord) => {
  if (!item.source_set_id) return null;

  if (BINDER_LOGO_OVERRIDES[item.source_set_id]) {
    return BINDER_LOGO_OVERRIDES[item.source_set_id];
  }

  return `https://images.pokemontcg.io/${item.source_set_id}/logo.png`;
};

type BinderCardProps = {
  item: BinderRecord;
  counts: BinderCardCountMap;
  confirmDeleteBinder: (binder: BinderRecord) => void;
  drag?: () => void;
};

function BinderCard({ item, counts, confirmDeleteBinder, drag }: BinderCardProps) {
  const [isPublic, setIsPublic] = useState(Boolean(item.is_public));
  const [updating, setUpdating] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const togglePublic = async () => {
    try {
      if (updating) return;

      setUpdating(true);

      const newValue = !isPublic;
      setIsPublic(newValue);

      const { error } = await supabase
        .from('binders')
        .update({ is_public: newValue })
        .eq('id', item.id);

      if (error) throw error;
    } catch (err) {
      console.log('Toggle public error:', err);
      setIsPublic((prev) => !prev);
      Alert.alert('Could not update binder', 'Please try again.');
    } finally {
      setUpdating(false);
    }
  };

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
  onLongPress={drag}
  delayLongPress={200}
      style={{
        width: binderCardWidth,
        aspectRatio: 1.5,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 14,
        backgroundColor: theme.colors.card,
        borderWidth: 2,
        borderColor: item.color || theme.colors.primary,
        ...cardShadow,
      }}
    >
      <View
        style={{
          height: 10,
          backgroundColor: item.color || theme.colors.primary,
        }}
      />

      <View
        style={{
          flex: 1,
          padding: 8,
          position: 'relative',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            flexDirection: 'row',
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          <Text style={{ fontSize: 12, marginRight: 3, opacity: 0.75 }}>
            {isPublic ? '🌍' : '🔒'}
          </Text>

          <Switch
            value={isPublic}
            onValueChange={togglePublic}
            disabled={updating}
            style={{
              transform: [{ scaleX: 0.62 }, { scaleY: 0.62 }],
            }}
          />
        </View>

        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: theme.colors.surface,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              color: theme.colors.textSoft,
              fontSize: 9,
              fontWeight: '900',
              letterSpacing: 0.5,
            }}
          >
            {item.type === 'official' ? 'OFFICIAL' : 'CUSTOM'}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}
        >
          
          {item.source_set_id && !logoFailed ? (
  <Image
  source={{
    uri: getBinderLogoUrl(item) || 'https://via.placeholder.com/80x40',
  }}
  onError={() => setLogoFailed(true)}
  style={{
    width: '80%',
    height: 40,
    resizeMode: 'contain',
    marginBottom: 6,
  }}
/>
) : (
  <Text
    numberOfLines={2}
    style={{
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '800',
      textAlign: 'center',
    }}
  >
    {item.name}
  </Text>
)}
          <Text
            style={{
              color: theme.colors.textSoft,
              marginTop: 8,
              fontSize: 12,
              fontWeight: '700',
            }}
          >
            {progress.owned} / {progress.total} owned
          </Text>

          <Text
            style={{
              color: theme.colors.text,
              marginTop: 4,
              fontSize: 14,
              fontWeight: '900',
            }}
          >
            {percentage}%
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              color: theme.colors.textSoft,
              fontSize: 9,
              fontWeight: '900',
              textAlign: 'center',
              marginBottom: 2,
            }}
          >
            EST. VALUE
          </Text>

          <Text
            style={{
              color: theme.colors.text,
              fontSize: 15,
              fontWeight: '900',
              textAlign: 'center',
            }}
          >
            {formatCurrency(mainValue)}
          </Text>
        </View>

        <View
          style={{
            height: 7,
            borderRadius: 999,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
            marginTop: 10,
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
}

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
      const baseUrl = process.env.EXPO_PUBLIC_PRICE_API_URL;

      if (!baseUrl) {
        throw new Error('Missing EXPO_PUBLIC_PRICE_API_URL');
      }

      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/scan/tcg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
      });

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
    Alert.alert(
      'Coming soon',
      'Card scanning is built into the app architecture, but this feature is coming soon.'
    );

    return;

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

      Alert.alert('Card detected', `${card.name} (${card.set})`);
    } catch (error: any) {
      console.log('Scan failed FULL ERROR:', error);

      Alert.alert('Scan failed', error?.message ?? 'Could not scan this card.');
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

  const confirmDeleteBinder = (binder: BinderRecord) => {
    Alert.alert(
      'Delete binder?',
      `Are you sure you want to delete "${binder.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBinder(binder.id);

              setBinders((prev) =>
                prev.filter((item) => item.id !== binder.id)
              );

              setCounts((prev) => {
                const next = { ...prev };
                delete next[binder.id];
                return next;
              });
            } catch (error) {
              console.log('Delete binder failed', error);
              Alert.alert('Could not delete binder', 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderBinder = ({ item, drag }: any) => (
  <BinderCard
    item={item}
    counts={counts}
    confirmDeleteBinder={confirmDeleteBinder}
    drag={drag}
  />
);

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
          <DraggableFlatList
  data={sortedBinders}
  keyExtractor={(item) => item.id}
  renderItem={renderBinder}
  numColumns={3}
  onDragEnd={async ({ data }) => {
    setBinders(data);

    await Promise.all(
      data.map((binder, index) =>
        supabase
          .from('binders')
          .update({ sort_order: index })
          .eq('id', binder.id)
      )
    );
  }}
  activationDistance={12}
  columnWrapperStyle={{
    justifyContent: 'space-between',
  }}
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