import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImageSourcePropType } from 'react-native';

export type CustomBinderNameArt = {
  key: string;
  label: string;
  source: ImageSourcePropType;
};

export const CUSTOM_BINDER_NAME_ART_STORAGE_KEY = 'stackr:custom-binder-name-art:v1';

export const CUSTOM_BINDER_NAME_ART: CustomBinderNameArt[] = [
  { key: 'custom-lava', label: 'Lava', source: require('../assets/rev2/05-binder-covers/custom-name-art/1customised.png') as ImageSourcePropType },
  { key: 'custom-bolt', label: 'Bolt', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised-2.png') as ImageSourcePropType },
  { key: 'custom-neon', label: 'Neon', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised-3.png') as ImageSourcePropType },
  { key: 'custom-vault', label: 'Vault', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised-4.png') as ImageSourcePropType },
  { key: 'custom-classic', label: 'Classic', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised-5.png') as ImageSourcePropType },
  { key: 'custom-ice', label: 'Ice', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised-6.png') as ImageSourcePropType },
  { key: 'custom-gold', label: 'Gold', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised-7.png') as ImageSourcePropType },
  { key: 'custom-shadow', label: 'Shadow', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised-8.png') as ImageSourcePropType },
  { key: 'custom-arcade', label: 'Arcade', source: require('../assets/rev2/05-binder-covers/custom-name-art/customised.png') as ImageSourcePropType },
];

const hashSeed = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const getDefaultCustomBinderNameArtKey = (seed?: string | null) => {
  const safeSeed = seed && seed.trim().length ? seed : String(Date.now());
  return CUSTOM_BINDER_NAME_ART[hashSeed(safeSeed) % CUSTOM_BINDER_NAME_ART.length].key;
};

export const getRandomCustomBinderNameArtKey = () =>
  CUSTOM_BINDER_NAME_ART[Math.floor(Math.random() * CUSTOM_BINDER_NAME_ART.length)]?.key ??
  CUSTOM_BINDER_NAME_ART[0].key;

export const getCustomBinderNameArt = (key?: string | null) =>
  CUSTOM_BINDER_NAME_ART.find((item) => item.key === key) ?? null;

export async function loadCustomBinderNameArtMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_BINDER_NAME_ART_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.log('Failed to load custom binder name art map', error);
    return {};
  }
}

export async function getCustomBinderNameArtKeyForBinder(binderId: string, binderName?: string | null) {
  const map = await loadCustomBinderNameArtMap();
  return map[binderId] ?? getDefaultCustomBinderNameArtKey(`${binderId}:${binderName ?? ''}`);
}

export async function setCustomBinderNameArtKeyForBinder(binderId: string, artKey: string) {
  const map = await loadCustomBinderNameArtMap();
  const next = {
    ...map,
    [binderId]: artKey,
  };
  await AsyncStorage.setItem(CUSTOM_BINDER_NAME_ART_STORAGE_KEY, JSON.stringify(next));
}
