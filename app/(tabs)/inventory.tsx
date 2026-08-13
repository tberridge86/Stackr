import React from 'react';
import { PremiumSellerGate } from '../../components/PremiumSellerGate';
import InventoryScreen from '../../features/inventory/InventoryScreen';

export default function PremiumSellerInventoryRoute() {
  return (
    <PremiumSellerGate>
      <InventoryScreen />
    </PremiumSellerGate>
  );
}
