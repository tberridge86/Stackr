import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_MARKET_LISTINGS_KEY = '@stackr:market:saved-listing-ids';

function normaliseIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id)).filter(Boolean))];
}

export async function fetchSavedMarketListingIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(SAVED_MARKET_LISTINGS_KEY);
  if (!raw) return [];
  try {
    return normaliseIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function persistSavedMarketListingIds(ids: string[]) {
  await AsyncStorage.setItem(SAVED_MARKET_LISTINGS_KEY, JSON.stringify(normaliseIds(ids)));
}

export async function saveMarketListing(listingId: string): Promise<string[]> {
  const current = await fetchSavedMarketListingIds();
  const next = normaliseIds([...current, listingId]);
  await persistSavedMarketListingIds(next);
  return next;
}

export async function removeSavedMarketListing(listingId: string): Promise<string[]> {
  const current = await fetchSavedMarketListingIds();
  const next = current.filter((id) => id !== listingId);
  await persistSavedMarketListingIds(next);
  return next;
}

export async function toggleSavedMarketListing(listingId: string): Promise<string[]> {
  const current = await fetchSavedMarketListingIds();
  if (current.includes(listingId)) {
    return removeSavedMarketListing(listingId);
  }
  return saveMarketListing(listingId);
}
