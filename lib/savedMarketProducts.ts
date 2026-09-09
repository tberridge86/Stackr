export function parseSavedMarketProductIds(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Saved products could not be read.');
  }
  if (!Array.isArray(parsed)) throw new Error('Saved products could not be read.');

  const ids = parsed.map((value) => typeof value === 'string' ? value.trim() : '');
  if (ids.some((id) => !id || id.length > 200)) throw new Error('Saved products could not be read.');
  return [...new Set(ids)].slice(0, 80);
}

export function hasUsableSavedMarketProductId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200;
}

export function createSavedProductLoadGate() {
  let latest = 0;
  return {
    start: () => ++latest,
    invalidate: () => ++latest,
    isCurrent: (request: number) => request === latest,
  };
}
