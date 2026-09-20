import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

export const CARD_MOTION_KEY = 'stackr.preferences.reduce-card-motion.v1';
export function createCardMotionPreference(storage: Pick<typeof AsyncStorage, 'getItem' | 'setItem'>) {
  let snapshot = { reduced: true, loaded: false, error: false };
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const hydrate = () => {
    if (snapshot.loaded) return Promise.resolve();
    if (!loading) loading = storage.getItem(CARD_MOTION_KEY).then(value => {
      snapshot = { reduced: value === 'true', loaded: true, error: false };
    }).catch(() => { snapshot = { reduced: true, loaded: false, error: true }; }).finally(() => { loading = null; emit(); });
    return loading;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate,
    save: async (reduced: boolean) => {
      await storage.setItem(CARD_MOTION_KEY, String(reduced));
      snapshot = { reduced, loaded: true, error: false };
      emit();
    },
  };
}
export const cardMotionPreference = createCardMotionPreference(AsyncStorage);
export function useCardMotionPreference() {
  const preference = useSyncExternalStore(cardMotionPreference.subscribe, cardMotionPreference.getSnapshot, cardMotionPreference.getSnapshot);
  useEffect(() => { void cardMotionPreference.hydrate(); }, []);
  return preference;
}
