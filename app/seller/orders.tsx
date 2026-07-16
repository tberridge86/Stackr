import { router } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrPageTitle } from '../../components/StackrScreen';
import { StackrButton } from '../../components/StackrControls';
import { StackrStateBlock } from '../../components/StackrStates';
import { Text } from '../../components/Text';
import { useTheme } from '../../components/theme-context';
import { ROUTES } from '../../lib/routes';
import { stackrTabContentPadding } from '../../lib/stackrSizing';

const requiredServices = [
  'Order records and status history',
  'Payment and payout provider integration',
  'Shipment labels and tracking events',
  'Return and dispute evidence storage',
  'Buyer confirmation and seller action queues',
];

export default function SellerOrdersScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: stackrTabContentPadding.standard }}>
        <View style={{ paddingRight: 56, marginBottom: 14 }}>
          <StackrPageTitle title="Orders" accentText="ers" />
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 4 }}>
            Fulfilment is prepared as a seller workspace, but live order services are not connected yet.
          </Text>
        </View>

        <StackrStateBlock
          tone="info"
          icon="construct-outline"
          title="Backend service required"
          body="Stackr will not show fake orders. Awaiting dispatch, tracking, returns, disputes and payouts need order and payment services before this screen can become operational."
          actionLabel="Open listings"
          onAction={() => router.push(ROUTES.sellerListings as any)}
          secondaryLabel="Seller dashboard"
          onSecondaryAction={() => router.push(ROUTES.sellerDashboard as any)}
        />

        <View style={{ marginTop: 14, borderRadius: 18, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, padding: 14 }}>
          <Text style={{ color: theme.colors.text, fontSize: 16, lineHeight: 21, fontWeight: '900' }}>Required before launch</Text>
          {requiredServices.map((item) => (
            <View key={item} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>•</Text>
              <Text style={{ flex: 1, color: theme.colors.textSoft, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <StackrButton label="Scan Out" icon="exit-outline" variant="primary" onPress={() => router.push(ROUTES.scanSellerOut as any)} style={{ flex: 1 }} />
          <StackrButton label="Inventory" icon="archive-outline" variant="secondary" onPress={() => router.push(ROUTES.sellerInventory as any)} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
