import { normaliseShowcaseState, type ProfileShowcaseCard, type ProfileShowcaseSlot, type ProfileShowcaseState } from './profileShowcaseState';
export type { ProfileShowcaseCard, ProfileShowcaseSlot, ProfileShowcaseState } from './profileShowcaseState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const PROFILE_SHOWCASE_SLOT_LABELS: Record<ProfileShowcaseSlot, string> = {
  favorite: 'Featured Card',
  chase: 'Chase Card',
  grail: 'Grail',
  slab: 'Featured Slab',
};

export const PROFILE_SHOWCASE_SEARCH_CONFIG: Record<ProfileShowcaseSlot, {
  category: 'raw_card' | 'graded_slab';
  title: string;
  subtitle: string;
  placeholder: string;
}> = {
  favorite: {
    category: 'raw_card',
    title: 'Choose Featured Card',
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
    title: 'Choose Featured Slab',
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
