import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';

export function StripeAppProvider({ children }: { children: React.ReactElement }) {
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}>
      {children}
    </StripeProvider>
  );
}
