import { Redirect } from 'expo-router';
import React from 'react';
import { ROUTES } from '../lib/routes';
import { useAppMode } from './app-mode-context';

export function PremiumSellerGate({ children }: { children: React.ReactNode }) {
  const { hydrated, premiumSellerAccess } = useAppMode();

  if (!hydrated) return null;
  if (!premiumSellerAccess.allowed) return <Redirect href={ROUTES.home} />;
  return <>{children}</>;
}
