import React from 'react';
import { Stack } from 'expo-router';
import { CollectionProvider } from '../components/collection-context';
import { TradeProvider } from '../components/trade-context';

export default function RootLayout() {
  return (
    <CollectionProvider>
      <TradeProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="collection" />
          <Stack.Screen name="binder" />
          <Stack.Screen name="set/[id]" />
          <Stack.Screen name="card/[id]" />
        </Stack>
      </TradeProvider>
    </CollectionProvider>
  );
}