import AsyncStorage from '@react-native-async-storage/async-storage';

const SEARCH_CARD_CACHE_VERSION = 1;
const SEARCH_CARD_CACHE_PREFIX = 'stackr:canonical-search-cards:v1:';
const SEARCH_CARD_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SEARCH_CARD_CACHE_LIMIT = 48;

type CachedCanonicalSearch = {
  version: number;
  cachedAt: number;
  rows: Record<string, any>[];
};

function cacheKey(query: string, language?: string | null) {
  const normalizedQuery = String(query ?? '').normalize('NFKC').trim().toLowerCase();
  const normalizedLanguage = String(language ?? 'all').trim().toLowerCase() || 'all';
  return `${SEARCH_CARD_CACHE_PREFIX}${encodeURIComponent(normalizedLanguage)}:${encodeURIComponent(normalizedQuery)}`;
}

export async function readCachedCanonicalSearch(
  query: string,
  language?: string | null,
  now = Date.now(),
): Promise<Record<string, any>[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(query, language));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCanonicalSearch;
    if (
      parsed?.version !== SEARCH_CARD_CACHE_VERSION
      || !Number.isFinite(parsed.cachedAt)
      || now - parsed.cachedAt > SEARCH_CARD_CACHE_MAX_AGE_MS
      || !Array.isArray(parsed.rows)
    ) {
      return null;
    }
    return parsed.rows.filter((row) => row && typeof row === 'object' && typeof row.id === 'string').slice(0, SEARCH_CARD_CACHE_LIMIT);
  } catch {
    return null;
  }
}

export async function writeCachedCanonicalSearch(
  query: string,
  language: string | null | undefined,
  rows: Record<string, any>[],
  now = Date.now(),
) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const safeRows = rows
    .filter((row) => row && typeof row === 'object' && typeof row.id === 'string')
    .slice(0, SEARCH_CARD_CACHE_LIMIT);
  if (!safeRows.length) return;
  const payload: CachedCanonicalSearch = {
    version: SEARCH_CARD_CACHE_VERSION,
    cachedAt: now,
    rows: safeRows,
  };
  await AsyncStorage.setItem(cacheKey(query, language), JSON.stringify(payload));
}
