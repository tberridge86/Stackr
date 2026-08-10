import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { StackrPageTitle } from '../components/StackrScreen';
import { Text } from '../components/Text';
import { useAchievements } from '../components/achievement-context';
import { useProfile } from '../components/profile-context';
import { useTheme } from '../components/theme-context';
import { COSMETIC_ITEMS, equipCosmetic, fetchOwnedCosmeticIds, purchaseCosmetic, type CosmeticItem } from '../lib/cosmetics';
import { stackrIcons } from '../lib/stackrIcons';

const SHOP_ICONS = {
  coins: stackrIcons.priceBuilder,
  profile: stackrIcons.profile,
};

function CosmeticShopCard({
  item,
  owned,
  equipped,
  canBuy,
  busy,
  onBuy,
  onEquip,
}: {
  item: CosmeticItem;
  owned: boolean;
  equipped: boolean;
  canBuy: boolean;
  busy: boolean;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ width: '48%', borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: equipped ? item.color : '#E8E1FF', padding: 10 }}>
      <LinearGradient colors={[item.color, item.accentColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 84, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 10 }}>
        {item.type === 'border' ? (
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={SHOP_ICONS.profile} resizeMode="contain" style={{ width: 30, height: 30 }} />
          </View>
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' }}>Profile Banner</Text>
        )}
      </LinearGradient>
      <Text style={{ color: theme.colors.text, fontSize: 13.5, lineHeight: 17, fontWeight: '900', marginTop: 9 }} numberOfLines={1}>{item.name}</Text>
      <Text style={{ color: theme.colors.textSoft, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>{item.description}</Text>
      <TouchableOpacity
        onPress={() => (owned ? onEquip(item.id) : onBuy(item.id))}
        disabled={busy || (!owned && !canBuy)}
        accessibilityRole="button"
        accessibilityLabel={`${owned ? 'Equip' : 'Unlock'} ${item.name}`}
        style={{ minHeight: 38, borderRadius: 14, backgroundColor: equipped ? '#F7F3FF' : owned || canBuy ? theme.colors.primary : '#E8E1FF', alignItems: 'center', justifyContent: 'center', marginTop: 9, opacity: busy ? 0.68 : 1 }}
      >
        {busy ? (
          <ActivityIndicator color={equipped ? theme.colors.primary : '#FFFFFF'} />
        ) : (
          <Text style={{ color: equipped ? theme.colors.primary : owned || canBuy ? '#FFFFFF' : theme.colors.textSoft, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>
            {equipped ? 'Equipped' : owned ? 'Equip' : `${item.price} coins`}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function CoinShopScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { profile, refreshProfile } = useProfile();
  const { coinBalance, refreshCoins } = useAchievements();
  const [ownedCosmetics, setOwnedCosmetics] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  React.useEffect(() => {
    fetchOwnedCosmeticIds().then(setOwnedCosmetics).catch(() => setOwnedCosmetics(new Set()));
  }, []);

  const grouped = useMemo(() => ({
    banners: COSMETIC_ITEMS.filter((item) => item.type === 'banner'),
    borders: COSMETIC_ITEMS.filter((item) => item.type === 'border'),
  }), []);

  const handleBuy = useCallback(async (id: string) => {
    try {
      setBusyId(id);
      const result = await purchaseCosmetic(id);
      if (!result.ok) {
        Alert.alert('Could not unlock', result.message);
        return;
      }
      setOwnedCosmetics(await fetchOwnedCosmeticIds());
      await refreshCoins();
    } finally {
      setBusyId(null);
    }
  }, [refreshCoins]);

  const handleEquip = useCallback(async (id: string) => {
    try {
      setBusyId(id);
      const result = await equipCosmetic(id);
      if (!result.ok) {
        Alert.alert('Could not equip', result.message);
        return;
      }
      await refreshProfile();
    } finally {
      setBusyId(null);
    }
  }, [refreshProfile]);

  const renderSection = (title: string, items: CosmeticItem[]) => (
    <View style={{ marginBottom: 22 }}>
      <Text style={{ color: theme.colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900', marginBottom: 12 }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map((item) => (
          <CosmeticShopCard
            key={item.id}
            item={item}
            owned={ownedCosmetics.has(item.id)}
            equipped={profile?.profile_banner_cosmetic_id === item.id || profile?.profile_border_cosmetic_id === item.id}
            canBuy={coinBalance >= item.price}
            busy={busyId === item.id}
            onBuy={handleBuy}
            onEquip={handleEquip}
          />
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 72 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <StackrPageTitle title="Coin Shop" accentText="Shop" />
            <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>Unlock profile cosmetics with Stackr Coins.</Text>
          </View>
          <View style={{ minHeight: 38, borderRadius: 999, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E1FF' }}>
            <Image source={SHOP_ICONS.coins} resizeMode="contain" style={{ width: 24, height: 24 }} />
            <Text style={{ color: theme.colors.text, fontSize: 12, lineHeight: 15, fontWeight: '900' }}>{coinBalance}</Text>
          </View>
        </View>

        {renderSection('Banners', grouped.banners)}
        {renderSection('Borders', grouped.borders)}
      </ScrollView>
    </SafeAreaView>
  );
}
