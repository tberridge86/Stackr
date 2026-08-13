import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  canPublishPremiumSellerModeChange,
  getPremiumSellerAccess,
  type PremiumSellerAccess,
} from '../lib/premiumSellerAccess';
import { useAuth } from './auth-context';

export type AppMode = 'collector' | 'seller';

const MODE_KEY = 'stackr:app-mode';
const MODE_CHOSEN_KEY = 'stackr:app-mode-chosen';

function userModeKey(userId: string) {
  return `${MODE_KEY}:${userId}`;
}

function userModeChosenKey(userId: string) {
  return `${MODE_CHOSEN_KEY}:${userId}`;
}

type AppModeContextValue = {
  mode: AppMode;
  hasChosenMode: boolean;
  hydrated: boolean;
  premiumSellerAccess: PremiumSellerAccess;
  setMode: (mode: AppMode) => Promise<boolean>;
};

const AppModeContext = createContext<AppModeContextValue>({
  mode: 'collector',
  hasChosenMode: false,
  hydrated: false,
  premiumSellerAccess: getPremiumSellerAccess(null),
  setMode: async () => false,
});

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [mode, setModeState] = useState<AppMode>('collector');
  const [hasChosenMode, setHasChosenMode] = useState(false);
  const [hydratedForUserId, setHydratedForUserId] = useState<string | null>(null);
  const premiumSellerAccess = getPremiumSellerAccess(user);
  const currentUserIdRef = useRef<string | null>(user?.id ?? null);
  const accessAllowedRef = useRef(premiumSellerAccess.allowed);
  currentUserIdRef.current = user?.id ?? null;
  accessAllowedRef.current = premiumSellerAccess.allowed;
  const currentIdentity = authLoading ? null : user?.id ?? 'signed-out';
  const hydrated = currentIdentity !== null && hydratedForUserId === currentIdentity;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (authLoading) {
        setHydratedForUserId(null);
        return;
      }
      if (!user?.id) {
        if (cancelled) return;
        setModeState('collector');
        setHasChosenMode(false);
        setHydratedForUserId('signed-out');
        return;
      }

      setHydratedForUserId(null);
      try {
        const [storedMode, chosen] = await Promise.all([
          AsyncStorage.getItem(userModeKey(user.id)),
          AsyncStorage.getItem(userModeChosenKey(user.id)),
        ]);
        if (cancelled) return;
        const nextMode = storedMode === 'seller' && premiumSellerAccess.allowed
          ? 'seller'
          : 'collector';
        setModeState(nextMode);
        setHasChosenMode(chosen === 'true' || !premiumSellerAccess.allowed);
        setHydratedForUserId(user.id);
      } catch {
        if (cancelled) return;
        setModeState('collector');
        setHasChosenMode(!premiumSellerAccess.allowed);
        setHydratedForUserId(user.id);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [authLoading, premiumSellerAccess.allowed, user?.id]);

  const setMode = useCallback(async (nextMode: AppMode) => {
    if (!user?.id) return false;
    const expectedUserId = user.id;
    if (nextMode === 'seller' && !premiumSellerAccess.allowed) {
      setModeState('collector');
      return false;
    }

    await AsyncStorage.multiSet([
      [userModeKey(user.id), nextMode],
      [userModeChosenKey(user.id), 'true'],
    ]);
    if (!canPublishPremiumSellerModeChange({
      expectedUserId,
      currentUserId: currentUserIdRef.current,
      accessAllowed: accessAllowedRef.current,
      nextMode,
    })) return false;
    setModeState(nextMode);
    setHasChosenMode(true);
    return true;
  }, [premiumSellerAccess.allowed, user?.id]);

  return (
    <AppModeContext.Provider value={{
      mode: hydrated && premiumSellerAccess.allowed ? mode : 'collector',
      hasChosenMode: hydrated && hasChosenMode,
      hydrated,
      premiumSellerAccess,
      setMode,
    }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
