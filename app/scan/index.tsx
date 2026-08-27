import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { PremiumSellerGate } from '../../components/PremiumSellerGate';
import { useAppMode } from '../../components/app-mode-context';
import ScanScreen from '../../features/scan/ScanScreen';
import { isListingScanRequest } from '../../lib/scanIntent';
import { isPremiumSellerInventoryScan } from '../../lib/sellerScanAccess';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ScanRoute() {
  const params = useLocalSearchParams<{
    mode?: string | string[];
    flow?: string | string[];
    intent?: string | string[];
    type?: string | string[];
    binderId?: string | string[];
  }>();
  const { hydrated, premiumSellerAccess } = useAppMode();
  const mode = firstParam(params.mode);
  const flow = firstParam(params.flow);
  const isPremiumSellerFlow = isPremiumSellerInventoryScan({ mode, flow });
  const isTrustedListingFlow = isListingScanRequest(params);

  if (isTrustedListingFlow && !hydrated) return null;
  if (isTrustedListingFlow && !premiumSellerAccess.allowed) {
    return <Redirect href="/(tabs)/market" />;
  }

  if (!isPremiumSellerFlow) return <ScanScreen />;

  return (
    <PremiumSellerGate>
      <ScanScreen />
    </PremiumSellerGate>
  );
}
