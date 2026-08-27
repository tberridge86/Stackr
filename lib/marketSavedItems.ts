import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const LEGACY_SAVED_MARKET_LISTINGS_KEY = '@stackr:market:saved-listing-ids';
const SAVED_MARKET_LISTINGS_KEY_PREFIX = '@stackr:market:saved-listing-ids:v2';

let savedMarketMutationQueue: Promise<void> = Promise.resolve();

function normalizeTrustedUserId(userId: string): string {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) {
    throw new Error('A verified user is required for saved Market listings.');
  }
  return normalizedUserId;
}

function normalizeListingId(listingId: string): string {
  const normalizedListingId = String(listingId ?? '').trim();
  if (!normalizedListingId) throw new Error('A listing is required.');
  return normalizedListingId;
}

export function getSavedMarketListingsKey(userId: string): string {
  return `${SAVED_MARKET_LISTINGS_KEY_PREFIX}:${encodeURIComponent(normalizeTrustedUserId(userId))}`;
}

function normaliseIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.flatMap((id) => {
    if (typeof id !== 'string') return [];
    const normalizedId = id.trim();
    return normalizedId ? [normalizedId] : [];
  }))];
}

async function clearLegacySavedMarketListings(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_SAVED_MARKET_LISTINGS_KEY);
}

async function requireVerifiedCurrentUser(expectedUserId: string): Promise<string> {
  const normalizedUserId = normalizeTrustedUserId(expectedUserId);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (user?.id !== normalizedUserId) {
    throw new Error('Your account changed while saved Market listings were being updated.');
  }
  return normalizedUserId;
}

async function readSavedMarketListingIds(userId: string): Promise<string[]> {
  await clearLegacySavedMarketListings();
  const verifiedUserId = await requireVerifiedCurrentUser(userId);
  const raw = await AsyncStorage.getItem(getSavedMarketListingsKey(verifiedUserId));
  if (!raw) return [];
  try {
    return normaliseIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function fetchSavedMarketListingIds(userId: string): Promise<string[]> {
  const ids = await readSavedMarketListingIds(userId);
  await requireVerifiedCurrentUser(userId);
  return ids;
}

async function persistSavedMarketListingIds(userId: string, ids: string[]) {
  await clearLegacySavedMarketListings();
  const verifiedUserId = await requireVerifiedCurrentUser(userId);
  await AsyncStorage.setItem(
    getSavedMarketListingsKey(verifiedUserId),
    JSON.stringify(normaliseIds(ids)),
  );
}

function enqueueSavedMarketMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = savedMarketMutationQueue.then(mutation, mutation);
  savedMarketMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function saveMarketListing(userId: string, listingId: string): Promise<string[]> {
  return enqueueSavedMarketMutation(async () => {
    const normalizedListingId = normalizeListingId(listingId);
    const current = await readSavedMarketListingIds(userId);
    const next = normaliseIds([...current, normalizedListingId]);
    await persistSavedMarketListingIds(userId, next);
    return next;
  });
}

export async function removeSavedMarketListing(userId: string, listingId: string): Promise<string[]> {
  return enqueueSavedMarketMutation(async () => {
    const normalizedListingId = normalizeListingId(listingId);
    const current = await readSavedMarketListingIds(userId);
    const next = current.filter((id) => id !== normalizedListingId);
    await persistSavedMarketListingIds(userId, next);
    return next;
  });
}

export async function toggleSavedMarketListing(userId: string, listingId: string): Promise<string[]> {
  return enqueueSavedMarketMutation(async () => {
    const normalizedListingId = normalizeListingId(listingId);
    const current = await readSavedMarketListingIds(userId);
    const next = current.includes(normalizedListingId)
      ? current.filter((id) => id !== normalizedListingId)
      : normaliseIds([...current, normalizedListingId]);
    await persistSavedMarketListingIds(userId, next);
    return next;
  });
}
