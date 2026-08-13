import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { PremiumSellerGate } from '../../components/PremiumSellerGate';
import ScanScreen from '../../features/scan/ScanScreen';
import { isPremiumSellerInventoryScan } from '../../lib/sellerScanAccess';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ScanRoute() {
  const params = useLocalSearchParams<{
    mode?: string | string[];
    flow?: string | string[];
  }>();
  const mode = firstParam(params.mode);
  const flow = firstParam(params.flow);
  const isPremiumSellerFlow = isPremiumSellerInventoryScan({ mode, flow });

  if (!isPremiumSellerFlow) return <ScanScreen />;

  return (
    <PremiumSellerGate>
      <ScanScreen />
    </PremiumSellerGate>
  );
}
