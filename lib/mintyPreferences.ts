import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  type MintyPersonalisationSettings,
} from './mintyInsights';

export const MINTY_PERSONALISATION_STORAGE_KEY_PREFIX = 'stackr:minty-personalisation:v2';

export const getMintyPersonalisationStorageKey = (userId: string) =>
  `${MINTY_PERSONALISATION_STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;

export type MintyPreferenceStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
export type MintyPreferencesSnapshot = {
  userId: string | null;
  settings: MintyPersonalisationSettings;
  loaded: boolean;
  saving: boolean;
  error: string | null;
};

const defaults = () => ({ ...DEFAULT_MINTY_PERSONALISATION_SETTINGS });

function parseSettings(raw: string | null): MintyPersonalisationSettings {
  if (!raw) return defaults();
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return defaults();
    return Object.fromEntries(Object.keys(DEFAULT_MINTY_PERSONALISATION_SETTINGS).map((key) => [
      key,
      typeof (value as Record<string, unknown>)[key] === 'boolean'
        ? (value as Record<string, boolean>)[key]
        : DEFAULT_MINTY_PERSONALISATION_SETTINGS[key as keyof MintyPersonalisationSettings],
    ])) as MintyPersonalisationSettings;
  } catch {
    return defaults();
  }
}

export function createMintyPreferences(storage: MintyPreferenceStorage) {
  let snapshot: MintyPreferencesSnapshot = {
    userId: null, settings: defaults(), loaded: true, saving: false, error: null,
  };
  let sequence = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const setSnapshot = (next: MintyPreferencesSnapshot) => { snapshot = next; emit(); };

  async function hydrate(userId: string | null | undefined) {
    const owner = userId?.trim() || null;
    const request = ++sequence;
    if (!owner) {
      setSnapshot({ userId: null, settings: defaults(), loaded: true, saving: false, error: null });
      return snapshot.settings;
    }
    setSnapshot({ userId: owner, settings: defaults(), loaded: false, saving: false, error: null });
    try {
      const settings = parseSettings(await storage.getItem(getMintyPersonalisationStorageKey(owner)));
      if (request !== sequence || snapshot.userId !== owner) return snapshot.settings;
      setSnapshot({ userId: owner, settings, loaded: true, saving: false, error: null });
      return settings;
    } catch {
      if (request !== sequence || snapshot.userId !== owner) return snapshot.settings;
      setSnapshot({ userId: owner, settings: defaults(), loaded: true, saving: false, error: 'Minty preferences could not be loaded on this device.' });
      return snapshot.settings;
    }
  }

  async function save(userId: string | null | undefined, updates: Partial<MintyPersonalisationSettings>) {
    const owner = userId?.trim() || null;
    if (!owner || snapshot.userId !== owner || !snapshot.loaded || snapshot.saving) {
      throw new Error('Minty preferences are not ready for this account.');
    }
    const next = { ...snapshot.settings, ...updates };
    const request = ++sequence;
    setSnapshot({ ...snapshot, saving: true, error: null });
    try {
      const body = JSON.stringify(next);
      await storage.setItem(getMintyPersonalisationStorageKey(owner), body);
      if (request !== sequence || snapshot.userId !== owner) throw new Error('Your account changed before Minty preferences could be saved.');
      setSnapshot({ userId: owner, settings: next, loaded: true, saving: false, error: null });
      return next;
    } catch (error) {
      if (snapshot.userId === owner) {
        setSnapshot({ ...snapshot, saving: false, error: error instanceof Error && error.message.includes('account changed')
          ? error.message
          : 'Minty preferences could not be saved. Please try again.' });
      }
      throw error;
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    hydrate,
    save,
  };
}

export const mintyPreferences = createMintyPreferences(AsyncStorage);

export function useMintyPreferences(userId: string | null | undefined) {
  const snapshot = useSyncExternalStore(mintyPreferences.subscribe, mintyPreferences.getSnapshot, mintyPreferences.getSnapshot);
  useEffect(() => { void mintyPreferences.hydrate(userId); }, [userId]);
  return {
    ...snapshot,
    save: (updates: Partial<MintyPersonalisationSettings>) => mintyPreferences.save(userId, updates),
  };
}
