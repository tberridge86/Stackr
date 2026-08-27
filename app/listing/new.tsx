import { Redirect } from 'expo-router';
import React from 'react';
import { useAppMode } from '../../components/app-mode-context';
import CreateListingScreen from '../../features/listing/CreateListingScreen';

export default function CreateListingRoute() {
  const { hydrated, premiumSellerAccess } = useAppMode();

  if (!hydrated) return null;
  if (!premiumSellerAccess.allowed) return <Redirect href="/(tabs)/market" />;
  return <CreateListingScreen />;
}
