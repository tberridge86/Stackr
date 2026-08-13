import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackrBackdrop } from '../../components/StackrBackdrop';
import { StackrButton } from '../../components/StackrControls';
import { StackrPageTitle } from '../../components/StackrScreen';
import { StackrStateBlock } from '../../components/StackrStates';
import { useTheme } from '../../components/theme-context';
import { ROUTES } from '../../lib/routes';

export default function SellerOnboardingScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StackrBackdrop />
      <View style={{ flex: 1, justifyContent: 'center', gap: 16, padding: 20 }}>
        <StackrPageTitle title="Seller payments" accentText="payments" />
        <StackrStateBlock
          tone="info"
          icon="shield-checkmark-outline"
          title="Payments are not open yet"
          body="Stripe onboarding, checkout and payouts remain off while Stackr completes the authenticated order and payment contract. Collecting, ordinary Market listings and trades are unaffected."
        />
        <StackrButton
          label="Return to The Market"
          icon="storefront-outline"
          variant="primary"
          onPress={() => router.replace(ROUTES.market as any)}
        />
      </View>
    </SafeAreaView>
  );
}
