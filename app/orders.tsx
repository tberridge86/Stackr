import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import { MarketEmptyState } from '../components/market/MarketComponents';
import { StackrBackdrop } from '../components/StackrBackdrop';
import { StackrBackButton } from '../components/StackrBackButton';
import { useTheme } from '../components/theme-context';
import { ROUTES } from '../lib/routes';
import { marketIcons } from '../lib/marketIcons';

export default function MarketOrdersScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['left', 'right']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18 }}>
        <StackrBackdrop />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <StackrBackButton onPress={() => router.back()} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900' }}>Orders</Text>
            <Text style={{ color: theme.colors.textSoft, fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>
              Purchases, sales and fulfilment.
            </Text>
          </View>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 70 }}>
          <MarketEmptyState
            icon={marketIcons.delivery}
            title="Orders are being prepared"
            body="Purchase checkout, shipping and buyer/seller order records need backend support before Stackr can show live Market orders here."
            actionLabel="Seller orders"
            onAction={() => router.push(ROUTES.sellerOrders as any)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
