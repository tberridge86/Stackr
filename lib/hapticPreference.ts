import AsyncStorage from '@react-native-async-storage/async-storage';

export const HAPTICS_ENABLED_STORAGE_KEY = 'stackr.preferences.haptics-enabled.v1';

export type HapticPreferenceStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export function createHapticPreference(storage: HapticPreferenceStorage) {
  let enabled = true;
  let hydrated = false;
  let loading: Promise<boolean> | null = null;

  async function hydrate() {
    if (hydrated) return enabled;
    if (!loading) {
      loading = storage.getItem(HAPTICS_ENABLED_STORAGE_KEY)
        .then((stored) => {
          enabled = stored !== 'false';
          hydrated = true;
          return enabled;
        })
        .catch(() => { enabled = false; return false; })
        .finally(() => {
          loading = null;
        });
    }
    return loading;
  }

  async function save(next: boolean) {
    await hydrate();
    await storage.setItem(HAPTICS_ENABLED_STORAGE_KEY, next ? 'true' : 'false');
    enabled = next;
    hydrated = true;
    return enabled;
  }

  return {
    get: () => enabled,
    setTransient: (next: boolean) => { enabled = next; },
    hydrate,
    save,
  };
}

const deviceHapticPreference = createHapticPreference(AsyncStorage);

export const getStoredHapticsEnabled = deviceHapticPreference.get;
export const setTransientHapticsEnabled = deviceHapticPreference.setTransient;
export const hydrateStoredHapticsPreference = deviceHapticPreference.hydrate;
export const saveStoredHapticsEnabled = deviceHapticPreference.save;
