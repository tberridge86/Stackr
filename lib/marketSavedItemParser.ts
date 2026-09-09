export function parseSavedMarketListingIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) {
      throw new Error('invalid saved listing shape');
    }
    return [...new Set(value.map((id) => id.trim()))];
  } catch {
    throw new Error('Saved listing data on this device could not be read.');
  }
}
