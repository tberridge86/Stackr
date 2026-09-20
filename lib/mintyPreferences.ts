import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_MINTY_PERSONALISATION_SETTINGS,
  type MintyPersonalisationSettings,
} from './mintyInsights';

export const MINTY_PERSONALISATION_STORAGE_KEY_PREFIX = 'stackr:minty-personalisation:v2';
// This key was shared across accounts. It is never read: remove it after an
// account-scoped preference load so an upgrade cannot leave private choices on
// the device for another account to encounter.
export const LEGACY_MINTY_PERSONALISATION_STORAGE_KEY = 'stackr:minty-personalisation:v1';

export const getMintyPersonalisationStorageKey = (userId: string) =>
  `${MINTY_PERSONALISATION_STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;

export type MintyPreferenceStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
export type MintyPreferencesSnapshot = {
  userId: string | null;
  settings: MintyPersonalisationSettings;
  loaded: boolean;
  saving: boolean;
  error: string | null;
};

const defaults = () => ({ ...DEFAULT_MINTY_PERSONALISATION_SETTINGS });
const failedReadSettings = () => ({ ...defaults(), personalisedInsights: false });

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
  let knownSettingsOwner: string | null = null;
  let hydration: { owner: string; promise: Promise<MintyPersonalisationSettings> } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const setSnapshot = (next: MintyPreferencesSnapshot) => { snapshot = next; emit(); };

  function hydrate(userId: string | null | undefined, { retry = false } = {}) {
    const owner = userId?.trim() || null;
    if (!owner) {
      sequence += 1;
      hydration = null;
      knownSettingsOwner = null;
      setSnapshot({ userId: null, settings: defaults(), loaded: true, saving: false, error: null });
      return Promise.resolve(snapshot.settings);
    }
    if (snapshot.userId === owner && snapshot.loaded && !retry) return Promise.resolve(snapshot.settings);
    if (hydration?.owner === owner) return hydration.promise;
    const request = ++sequence;
    const hadKnownSettings = knownSettingsOwner === owner;
    if (!hadKnownSettings) setSnapshot({ userId: owner, settings: defaults(), loaded: false, saving: false, error: null });
    const promise = Promise.all([
      storage.getItem(getMintyPersonalisationStorageKey(owner)),
      // Cleanup is deliberately best-effort. A stale v1 value must not make a
      // per-account preference unavailable.
      storage.removeItem(LEGACY_MINTY_PERSONALISATION_STORAGE_KEY).catch(() => undefined),
    ]).then(([raw]) => {
      const settings = parseSettings(raw);
      if (request !== sequence || snapshot.userId !== owner) return snapshot.settings;
      knownSettingsOwner = owner;
      setSnapshot({ userId: owner, settings, loaded: true, saving: false, error: null });
      return settings;
    }).catch(() => {
      if (request !== sequence || snapshot.userId !== owner) return snapshot.settings;
      if (hadKnownSettings) {
        setSnapshot({ ...snapshot, saving: false, error: 'Minty preferences could not be reloaded. Your saved choices are still active.' });
      } else {
        setSnapshot({ userId: owner, settings: failedReadSettings(), loaded: false, saving: false, error: 'Minty preferences could not be loaded on this device. Retry to enable personalisation.' });
      }
      return snapshot.settings;
    }).finally(() => {
      if (hydration?.owner === owner) hydration = null;
    });
    hydration = { owner, promise };
    return promise;
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
      knownSettingsOwner = owner;
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

export function visibleMintyPreferenceSnapshot(snapshot: MintyPreferencesSnapshot, userId: string | null | undefined) {
  const owner = userId?.trim() || null;
  if (snapshot.userId === owner) return snapshot;
  return { userId: owner, settings: defaults(), loaded: owner === null, saving: false, error: null };
}

export function useMintyPreferences(userId: string | null | undefined) {
  const snapshot = useSyncExternalStore(mintyPreferences.subscribe, mintyPreferences.getSnapshot, mintyPreferences.getSnapshot);
  useEffect(() => { void mintyPreferences.hydrate(userId); }, [userId]);
  const visible = visibleMintyPreferenceSnapshot(snapshot, userId);
  return {
    ...visible,
    save: (updates: Partial<MintyPersonalisationSettings>) => mintyPreferences.save(userId, updates),
    reload: () => mintyPreferences.hydrate(userId, { retry: true }),
  };
}
