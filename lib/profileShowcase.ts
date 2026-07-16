import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type ProfileShowcaseSlot = 'favorite' | 'chase' | 'grail' | 'slab';

export type ProfileShowcaseCard = {
  id: string;
  setId: string | null;
  name: string;
  setName?: string | null;
  number?: string | null;
  rarity?: string | null;
  imageUri?: string | null;
  estimatedValueGbp?: number | null;
  showcaseKind?: 'card' | 'graded';
  updatedAt: string;
};

export type ProfileShowcaseState = Partial<Record<ProfileShowcaseSlot, ProfileShowcaseCard>>;

export const PROFILE_SHOWCASE_SLOT_LABELS: Record<ProfileShowcaseSlot, string> = {
  favorite: 'Favourite Card',
  chase: 'Chase Card',
  grail: 'Grail',
  slab: 'Favourite Slab',
};

export const PROFILE_SHOWCASE_SEARCH_CONFIG: Record<ProfileShowcaseSlot, {
  category: 'raw_card' | 'graded_slab';
  title: string;
  subtitle: string;
  placeholder: string;
}> = {
  favorite: {
    category: 'raw_card',
    title: 'Choose Favourite Card',
    subtitle: 'Search for the card that represents your collection.',
    placeholder: 'Search cards, sets or card numbers',
  },
  chase: {
    category: 'raw_card',
    title: 'Choose Chase Card',
    subtitle: 'Search for the card you are currently hunting.',
    placeholder: 'Search chase cards, sets or card numbers',
  },
  grail: {
    category: 'raw_card',
    title: 'Choose Grail',
    subtitle: 'Search for the card you are proudest to chase.',
    placeholder: 'Search grail cards, sets or card numbers',
  },
  slab: {
    category: 'graded_slab',
    title: 'Choose Favourite Slab',
    subtitle: 'Search graded cards and slab listings.',
    placeholder: 'Search PSA, CGC, BGS or graded cards',
  },
};

const PROFILE_SHOWCASE_LOCAL_KEY_PREFIX = '@stackr:profile-showcase:v2:';

export function isProfileShowcaseSlot(value: unknown): value is ProfileShowcaseSlot {
  return value === 'favorite' || value === 'chase' || value === 'grail' || value === 'slab';
}

export function getProfileShowcaseSearchConfig(slot: ProfileShowcaseSlot) {
  return PROFILE_SHOWCASE_SEARCH_CONFIG[slot];
}

function getProfileShowcaseStorageKey(userId: string) {
  return `${PROFILE_SHOWCASE_LOCAL_KEY_PREFIX}${userId}`;
}

function normaliseShowcaseState(value: unknown): ProfileShowcaseState {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const next: ProfileShowcaseState = {};

  for (const key of Object.keys(PROFILE_SHOWCASE_SLOT_LABELS)) {
    if (!isProfileShowcaseSlot(key)) continue;
    const card = input[key];
    if (!card || typeof card !== 'object') continue;
    const row = card as Partial<ProfileShowcaseCard>;
    if (!row.id || !row.name) continue;
    next[key] = {
      id: String(row.id),
      setId: row.setId == null ? null : String(row.setId),
      name: String(row.name),
      setName: row.setName == null ? null : String(row.setName),
      number: row.number == null ? null : String(row.number),
      rarity: row.rarity == null ? null : String(row.rarity),
      imageUri: row.imageUri == null ? null : String(row.imageUri),
      estimatedValueGbp: typeof row.estimatedValueGbp === 'number' ? row.estimatedValueGbp : null,
      showcaseKind: row.showcaseKind === 'graded' ? 'graded' : 'card',
      updatedAt: row.updatedAt ? String(row.updatedAt) : new Date().toISOString(),
    };
  }

  return next;
}

export async function loadProfileShowcase(userId: string): Promise<ProfileShowcaseState> {
  const raw = await AsyncStorage.getItem(getProfileShowcaseStorageKey(userId));
  if (!raw) return {};

  try {
    return normaliseShowcaseState(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function saveProfileShowcase(userId: string, state: ProfileShowcaseState) {
  await AsyncStorage.setItem(getProfileShowcaseStorageKey(userId), JSON.stringify(state));
}

async function updateProfileColumns(userId: string, slot: ProfileShowcaseSlot, card: ProfileShowcaseCard | null) {
  if (slot !== 'favorite' && slot !== 'chase') return;

  const updates = slot === 'favorite'
    ? {
        favorite_card_id: card?.id ?? null,
        favorite_set_id: card?.setId ?? null,
      }
    : {
        chase_card_id: card?.id ?? null,
        chase_set_id: card?.setId ?? null,
      };

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) throw error;
}

export async function setProfileShowcaseCard(
  userId: string,
  slot: ProfileShowcaseSlot,
  card: Omit<ProfileShowcaseCard, 'updatedAt'>
) {
  if ((slot === 'favorite' || slot === 'chase') && !card.setId) {
    throw new Error('This card is missing set details, so it cannot be saved to your profile yet.');
  }

  const nextCard: ProfileShowcaseCard = {
    ...card,
    updatedAt: new Date().toISOString(),
  };

  await updateProfileColumns(userId, slot, nextCard);

  const state = await loadProfileShowcase(userId);
  state[slot] = nextCard;
  await saveProfileShowcase(userId, state);
}

export async function removeProfileShowcaseCard(userId: string, slot: ProfileShowcaseSlot) {
  await updateProfileColumns(userId, slot, null);

  const state = await loadProfileShowcase(userId);
  delete state[slot];
  await saveProfileShowcase(userId, state);
}
