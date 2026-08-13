import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppMode } from './app-mode-context';
import { StackrBackdrop } from './StackrBackdrop';
import { StackrButton } from './StackrControls';
import { StackrPageTitle } from './StackrScreen';
import { StackrStateBlock } from './StackrStates';
import { Text } from './Text';
import { useTheme } from './theme-context';
import { ROUTES } from '../lib/routes';

export function PremiumSellerLockedScreen() {
  const { theme } = useTheme();
  const { premiumSellerAccess } = useAppMode();
  const releaseDisabled = premiumSellerAccess.reason === 'disabled';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 16 }}>
        <StackrPageTitle title="Premium Seller Mode" accentText="Seller" />
        <StackrStateBlock
          tone="info"
          icon="lock-closed-outline"
          title={releaseDisabled ? 'Premium Seller Mode is not open yet' : 'Premium access required'}
          body={
            releaseDisabled
              ? 'The professional stock workspace is being verified before launch. Collector tools, ordinary Market listings and trades remain available.'
              : 'Premium Seller Mode adds reliable stock intake, stock removal and seller inventory history. Ordinary Market listings and trades remain available to every collector.'
          }
        />
        <View style={{ borderRadius: 18, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, padding: 14 }}>
          <Text style={{ color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' }}>
            Still available to everyone
          </Text>
          <Text style={{ color: theme.colors.textSoft, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 6 }}>
            Collect, scan, manage binders, browse The Market, create listings and trade.
          </Text>
        </View>
        <StackrButton
          label="Open The Market"
          icon="storefront-outline"
          variant="primary"
          onPress={() => router.replace(ROUTES.market as any)}
        />
        <StackrButton
          label="Return to Collector"
          icon="home-outline"
          variant="secondary"
          onPress={() => router.replace(ROUTES.home as any)}
        />
      </View>
    </SafeAreaView>
  );
}

export function PremiumSellerGate({ children }: { children: React.ReactNode }) {
  const { hydrated, premiumSellerAccess } = useAppMode();

  if (!hydrated) return null;
  if (!premiumSellerAccess.allowed) return <PremiumSellerLockedScreen />;
  return <>{children}</>;
}
