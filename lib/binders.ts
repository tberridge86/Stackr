import { supabase } from './supabase';
import { fetchCardsForSet, normalizePokemonCardLanguage, type PokemonCardLanguage } from './pokemonTcg';
import { createActivityPost } from './activity';
import { PRICE_API_URL, USD_TO_GBP } from './config';
import { recordAchievementEvent } from './achievements';
import { getCachedOrFetch, invalidateRequestCache } from './requestCache';
import { bumpCollectionSummaryVersion } from './collectionSummaryInvalidation';
import { getPreferredSetDisplayName } from './pokemonDisplayNames';

export type BinderType = 'official' | 'custom';
export type BinderCardMode = 'raw' | 'graded';

export type BinderRecord = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  gradient?: string[] | null;
  cover_key?: string | null;
  type: BinderType;
  is_public: boolean | null;
  source_set_id: string | null;
  language?: PokemonCardLanguage | null;
  created_at: string;
  ebay_value?: number | null;
  tcg_value?: number | null;
  cardmarket_value?: number | null;
  edition?: string | null;
  default_condition?: string | null;
  master_set_enabled?: boolean | null;
  card_mode?: BinderCardMode | null;
  default_grade_company?: string | null;
  default_grade?: string | null;
  source_set_logo_url?: string | null;
  source_set_symbol_url?: string | null;
  source_set_cover_url?: string | null;
  source_set_display_name?: string | null;
  source_set_local_name?: string | null;
  source_set_english_display_name?: string | null;
};

export type BinderCardRecord = {
  card?: any | null;
  id: string;
  binder_id: string;
  card_id: string;
  set_id: string;
  language?: PokemonCardLanguage | null;
  api_card_id: string | null;
  card_name: string | null;
  api_set_id: string | null;
  card_number: string | null;
  image_url: string | null;
  set_name: string | null;
  set_total: number | null;
  slot_order: number;
  owned: boolean;
  owned_quantity: number;
  condition: string;
  grade_company?: string | null;
  grade?: string | null;
  notes: string;
  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  last_price_update: string | null;
  created_at: string;
};

type BinderSnapshotPriceFields = {
  ebay_price: number | null;
  tcg_price: number | null;
  cardmarket_price: number | null;
  last_price_update: string | null;
};

const LATEST_SNAPSHOT_PRICE_CACHE_TTL_MS = 90 * 1000;
const BINDERS_CACHE_TTL_MS = 30 * 1000;
const BINDER_RECORD_CACHE_TTL_MS = 30 * 1000;
const BINDER_CARDS_CACHE_TTL_MS = 20 * 1000;

const latestSnapshotPriceCache = new Map<string, { expiresAt: number; value: BinderSnapshotPriceFields | null }>();
const latestSnapshotPriceInflight = new Map<string, Promise<Map<string, BinderSnapshotPriceFields>>>();

function inferBinderLanguage(language?: PokemonCardLanguage | string | null, setId?: string | null): PokemonCardLanguage {
  const explicit = String(language ?? '').trim();
  if (explicit) return normalizePokemonCardLanguage(explicit);
  const rawSetId = String(setId ?? '').trim().toLowerCase();
  const strippedSetId = stripSetLanguagePrefix(rawSetId);
  if (/^(zh-tw|zh_tw|zhtw|zh):/i.test(rawSetId)) return 'zh-tw';
  return rawSetId.startsWith('ja:') || rawSetId.startsWith('jp:') || /^sv\d+[a-z]$/i.test(strippedSetId) ? 'ja' : 'en';
}

function stripSetLanguagePrefix(setId?: string | null) {
  return String(setId ?? '').trim().replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, '');
}

function getSetIdentityKey(setId?: string | null, language?: PokemonCardLanguage | string | null) {
  return `${inferBinderLanguage(language, setId)}:${stripSetLanguagePrefix(setId).toLowerCase()}`;
}

function getSetLookupCandidates(setId?: string | null) {
  const raw = String(setId ?? '').trim();
  if (!raw) return [];
  const stripped = stripSetLanguagePrefix(raw);
  return [...new Set([raw, stripped, `ja:${stripped}`, `zh-tw:${stripped}`, `en:${stripped}`].filter(Boolean))];
}

function normalizeBinderCardNumber(value?: string | number | null) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '').toLowerCase();
}

function getBinderCardNumberMergeKey(
  language: PokemonCardLanguage | string | null | undefined,
  setId: string | null | undefined,
  number: string | number | null | undefined
) {
  const normalizedNumber = normalizeBinderCardNumber(number);
  if (!normalizedNumber) return null;
  return `${normalizePokemonCardLanguage(language)}:${stripSetLanguagePrefix(setId).toLowerCase()}:${normalizedNumber}`;
}

function chooseSavedBinderCardRow(current: BinderCardRecord | undefined, incoming: BinderCardRecord) {
  if (!current) return incoming;
  if (incoming.owned && !current.owned) return incoming;
  if ((incoming.owned_quantity ?? 1) > (current.owned_quantity ?? 1)) return incoming;
  return current;
}

function cleanUrl(value?: string | null) {
  const raw = String(value ?? '').trim();
  return raw || null;
}

function resolveBackendAssetUrl(value?: string | null) {
  const raw = cleanUrl(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith('/')) return null;
  const base = String(PRICE_API_URL ?? '').replace(/\/$/, '');
  return base ? `${base}${raw}` : null;
}

function normalizeTcgdexCardImageUrl(value?: string | null) {
  const raw = resolveBackendAssetUrl(value) ?? cleanUrl(value);
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  if (/assets\.tcgdex\.net/i.test(raw) && !/\.(png|jpe?g|webp)(\?|$)/i.test(raw)) {
    return `${raw.replace(/\/$/, '')}/high.webp`;
  }
  return raw;
}

function getRawSetCoverImageUrl(raw: any) {
  const direct = normalizeTcgdexCardImageUrl(
    raw?.cover_image_url
      ?? raw?.coverImageUrl
      ?? raw?.images?.cover
      ?? raw?.images?.artwork
      ?? raw?.image
  );
  if (direct) return direct;

  const cards = Array.isArray(raw?.cards) ? raw.cards : [];
  const cardWithImage = cards.find((card: any) => cleanUrl(card?.image ?? card?.images?.large ?? card?.images?.small));
  return normalizeTcgdexCardImageUrl(cardWithImage?.image ?? cardWithImage?.images?.large ?? cardWithImage?.images?.small);
}

function getRawProviderSetLogo(raw: any) {
  return resolveBackendAssetUrl(
    raw?.provider_assets?.pokewallet?.image_proxy_url
      ?? raw?.provider_assets?.pokewallet?.image_proxy_path
      ?? raw?.providerAssets?.pokewallet?.imageProxyUrl
      ?? raw?.providerAssets?.pokewallet?.imageProxyPath
  );
}

function getBinderSetDisplayNames(binder: BinderRecord, set: any | null, language: PokemonCardLanguage) {
  const raw = set?.raw_payload ?? set?.raw_data ?? {};
  const sourceSetId = binder.source_set_id ?? set?.source_id ?? set?.id ?? null;
  const localName = String(set?.local_name ?? raw?.local_name ?? raw?.name ?? set?.name ?? binder.name ?? '').trim() || null;
  const englishDisplayName = String(set?.english_display_name ?? raw?.english_display_name ?? raw?.englishDisplayName ?? '').trim() || null;
  const displayName = getPreferredSetDisplayName({
    id: set?.id ?? sourceSetId,
    sourceId: set?.source_id ?? raw?.id ?? sourceSetId,
    setCode: set?.set_code ?? set?.external_ids?.setCode ?? set?.source_id ?? raw?.id ?? sourceSetId,
    language,
    region: set?.region ?? raw?.region ?? null,
    localName,
    englishDisplayName,
    canonicalName: set?.canonical_name ?? set?.name ?? null,
    fallbackName: binder.name,
    raw,
  });
  return {
    displayName,
    localName,
    englishDisplayName: englishDisplayName || (displayName !== localName ? displayName : null),
  };
}

function getSnapshotPriceCacheKey(cardId: string, language?: string | null) {
  return `${normalizePokemonCardLanguage(language)}:${cardId}`;
}

export function invalidateBinderCaches(binderId?: string) {
  bumpCollectionSummaryVersion();
  invalidateRequestCache('binders:');
  if (binderId) {
    invalidateRequestCache(`binder:${binderId}:`);
    return;
  }
  invalidateRequestCache('binder:');
}

export async function fetchLatestSnapshotPrices(
  cardIds: string[],
  language: PokemonCardLanguage | string | null = 'en'
): Promise<Map<string, BinderSnapshotPriceFields>> {
  const normalizedLanguage = normalizePokemonCardLanguage(language);
  const uniqueCardIds = [...new Set(cardIds.filter(Boolean))];
  const latestByCardId = new Map<string, BinderSnapshotPriceFields>();

  if (!uniqueCardIds.length) return latestByCardId;

  const now = Date.now();
  const idsNeedingQuery: string[] = [];
  for (const cardId of uniqueCardIds) {
    const cached = latestSnapshotPriceCache.get(getSnapshotPriceCacheKey(cardId, normalizedLanguage));
    if (cached && cached.expiresAt > now) {
      if (cached.value) latestByCardId.set(cardId, cached.value);
      continue;
    }
    idsNeedingQuery.push(cardId);
  }

  if (!idsNeedingQuery.length) return latestByCardId;

  const cacheKey = `${normalizedLanguage}:${[...idsNeedingQuery].sort().join('|')}`;
  const inflight = latestSnapshotPriceInflight.get(cacheKey);
  if (inflight) {
    const inflightPrices = await inflight;
    for (const [cardId, price] of inflightPrices) {
      latestByCardId.set(cardId, price);
    }
    return latestByCardId;
  }

  const request = (async () => {
    const fetchedByCardId = new Map<string, BinderSnapshotPriceFields>();

    const { data, error } = await supabase
      .from('market_price_snapshots')
      .select('card_id, ebay_average, tcg_mid, tcg_low, cardmarket_trend, snapshot_at')
      .in('card_id', idsNeedingQuery)
      .eq('language', normalizedLanguage)
      .order('snapshot_at', { ascending: false });

    if (error) {
      console.log('Latest binder snapshot prices failed:', error.message);
      return fetchedByCardId;
    }

    for (const row of data ?? []) {
      if (fetchedByCardId.has(row.card_id)) continue;

      fetchedByCardId.set(row.card_id, {
        ebay_price: row.ebay_average ?? null,
        tcg_price: row.tcg_mid ?? row.tcg_low ?? null,
        cardmarket_price: row.cardmarket_trend ?? null,
        last_price_update: row.snapshot_at ?? null,
      });
    }

    const missingCardIds = idsNeedingQuery.filter((cardId) => {
      const existing = fetchedByCardId.get(cardId);
      return !existing || existing.tcg_price == null || existing.cardmarket_price == null;
    });

    if (missingCardIds.length) {
      const { data: priceRows, error: priceError } = await supabase
        .from('card_prices')
        .select('entity_id, display_price, market, average, last_sold, low, retrieved_at, price_type, confidence, pricing_status')
        .eq('entity_type', 'card')
        .eq('language', normalizedLanguage)
        .in('entity_id', missingCardIds)
        .order('retrieved_at', { ascending: false });

      if (priceError) {
        console.log('Fallback binder card_prices failed:', priceError.message);
      } else {
        for (const row of priceRows ?? []) {
          if (!row.entity_id || fetchedByCardId.has(row.entity_id)) continue;
          const value = row.display_price ?? row.market ?? row.average ?? row.last_sold ?? row.low ?? null;
          if (value == null) continue;

          fetchedByCardId.set(row.entity_id, {
            ebay_price: null,
            tcg_price: null,
            cardmarket_price: value,
            last_price_update: row.retrieved_at ?? null,
          });
        }
      }
    }

    const cardIdsStillMissing = idsNeedingQuery.filter((cardId) => {
      const existing = fetchedByCardId.get(cardId);
      return !existing || existing.tcg_price == null || existing.cardmarket_price == null;
    });

    if (cardIdsStillMissing.length) {
      const { data: cards, error: cardError } = await supabase
        .from('pokemon_cards')
        .select('id, raw_data')
        .in('id', cardIdsStillMissing)
        .eq('language', normalizedLanguage);

      if (cardError) {
        console.log('Fallback binder card prices failed:', cardError.message);
      } else {
        for (const card of cards ?? []) {
          const raw = card.raw_data ?? {};
          const tcgPrice = getPriceFromPokemonCard(raw);
          const cardmarketPrice = getCardmarketPriceFromPokemonCard(raw);

          const existing = fetchedByCardId.get(card.id);
          if (!existing && tcgPrice == null && cardmarketPrice == null) continue;

          fetchedByCardId.set(card.id, {
            ebay_price: existing?.ebay_price ?? null,
            tcg_price: existing?.tcg_price ?? tcgPrice,
            cardmarket_price: existing?.cardmarket_price ?? cardmarketPrice,
            last_price_update: existing?.last_price_update ?? null,
          });
        }
      }
    }

    const expiresAt = Date.now() + LATEST_SNAPSHOT_PRICE_CACHE_TTL_MS;
    for (const cardId of idsNeedingQuery) {
      latestSnapshotPriceCache.set(getSnapshotPriceCacheKey(cardId, normalizedLanguage), {
        expiresAt,
        value: fetchedByCardId.get(cardId) ?? null,
      });
    }

    return fetchedByCardId;
  })();

  latestSnapshotPriceInflight.set(cacheKey, request);
  try {
    const fetchedPrices = await request;
    for (const [cardId, price] of fetchedPrices) {
      latestByCardId.set(cardId, price);
    }
    return latestByCardId;
  } finally {
    latestSnapshotPriceInflight.delete(cacheKey);
  }
}

async function fetchLatestSnapshotPricesForCards(
  cards: { cardId: string; language?: PokemonCardLanguage | string | null }[],
  fallbackLanguage: PokemonCardLanguage | string | null = 'en'
) {
  const groups = new Map<PokemonCardLanguage, string[]>();

  for (const card of cards) {
    if (!card.cardId) continue;
    const language = normalizePokemonCardLanguage(card.language ?? fallbackLanguage);
    groups.set(language, [...(groups.get(language) ?? []), card.cardId]);
  }

  const byLanguageAndCard = new Map<string, BinderSnapshotPriceFields>();
  for (const [language, ids] of groups) {
    const prices = await fetchLatestSnapshotPrices(ids, language);
    for (const [cardId, price] of prices) {
      byLanguageAndCard.set(getSnapshotPriceCacheKey(cardId, language), price);
    }
  }

  return byLanguageAndCard;
}

async function attachLatestSnapshotPrices<T extends BinderCardRecord>(
  rows: T[],
  fallbackLanguage: PokemonCardLanguage | string | null = 'en'
): Promise<T[]> {
  const latestByCardId = await fetchLatestSnapshotPricesForCards(
    rows.map((row) => ({
      cardId: row.card_id,
      language: row.language,
    })),
    fallbackLanguage
  );

  return rows.map((row) => {
    const ownedQuantity = Math.max(1, Number(row.owned_quantity ?? 1));
    const language = normalizePokemonCardLanguage(row.language ?? fallbackLanguage);
    const snapshot = latestByCardId.get(getSnapshotPriceCacheKey(row.card_id, language));
    if (!snapshot) return { ...row, owned_quantity: ownedQuantity };

    return {
      ...row,
      owned_quantity: ownedQuantity,
      ebay_price: snapshot.ebay_price ?? row.ebay_price ?? null,
      tcg_price: snapshot.tcg_price ?? row.tcg_price ?? null,
      cardmarket_price: snapshot.cardmarket_price ?? row.cardmarket_price ?? null,
      last_price_update: snapshot.last_price_update ?? row.last_price_update ?? null,
    };
  });
}

// ===============================
// VIRTUAL CARD ID HELPERS
// ===============================

function makeVirtualBinderCardId(
  binderId: string,
  setId: string,
  cardId: string
) {
  return `virtual:${binderId}:${encodeURIComponent(setId)}:${encodeURIComponent(cardId)}`;
}

function decodeVirtualBinderPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseVirtualBinderCardId(id: string) {
  const parts = id.split(':');

  if (parts[0] !== 'virtual' || parts.length < 4) {
    return null;
  }

  if (parts.length === 4) {
    return {
      binderId: parts[1],
      setId: decodeVirtualBinderPart(parts[2]),
      cardId: decodeVirtualBinderPart(parts[3]),
    };
  }

  if (['en', 'ja', 'jp'].includes(parts[2]?.toLowerCase()) && parts.length >= 6) {
    return {
      binderId: parts[1],
      setId: `${parts[2]}:${parts[3]}`,
      cardId: parts.slice(4).join(':'),
    };
  }

  return {
    binderId: parts[1],
    setId: parts[2],
    cardId: parts.slice(3).join(':'),
  };
}

export function isVirtualCard(id: string): boolean {
  return id.startsWith('virtual:');
}

// ===============================
// FETCH BINDERS
// ===============================

export const CONDITION_MULTIPLIERS: Record<string, number> = {
  Mint: 1.05,
  'Near Mint': 1,
  'Lightly Played': 0.85,
  'Moderately Played': 0.65,
  'Heavily Played': 0.45,
  Damaged: 0.2,
};

export const getEstimatedValue = (baseValue: number, condition: string): number => {
  const multiplier = CONDITION_MULTIPLIERS[condition] ?? 1;
  return baseValue * multiplier;
};

async function attachSetBrandingToBinders(binders: BinderRecord[]): Promise<BinderRecord[]> {
  const sourceSetIds = [...new Set(
    binders
      .filter((binder) => binder.type === 'official' && binder.source_set_id)
      .flatMap((binder) => getSetLookupCandidates(binder.source_set_id))
  )];

  if (!sourceSetIds.length) return binders;

  const [legacyResult, canonicalResult, coverResult] = await Promise.all([
    supabase
      .from('pokemon_sets')
      .select('id, name, language, region, logo_url, symbol_url, external_ids, raw_data')
      .in('id', sourceSetIds),
    supabase
      .from('tcg_sets')
      .select('id, source_id, set_code, canonical_name, local_name, english_display_name, language, region, logo_url, symbol_url, raw_payload')
      .in('id', sourceSetIds),
    supabase
      .from('tcg_set_cover_images')
      .select('set_id, cover_image_url')
      .in('set_id', sourceSetIds),
  ]);

  if (legacyResult.error && canonicalResult.error) {
    console.log('Binder set branding lookup failed:', legacyResult.error.message);
    return binders;
  }
  if (legacyResult.error) console.log('Binder legacy set branding lookup failed:', legacyResult.error.message);
  if (canonicalResult.error) console.log('Binder canonical set branding lookup failed:', canonicalResult.error.message);
  if (coverResult.error) console.log('Binder set cover lookup skipped:', coverResult.error.message);

  const brandingById = new Map<string, any>();
  const coverById = new Map<string, string>();
  for (const set of legacyResult.data ?? []) {
    const language = inferBinderLanguage((set as any).language, (set as any).id);
    brandingById.set(getSetIdentityKey((set as any).id, language), set);
  }
  for (const set of canonicalResult.data ?? []) {
    const language = inferBinderLanguage((set as any).language, (set as any).id);
    brandingById.set(getSetIdentityKey((set as any).id, language), set);
    if ((set as any).source_id) brandingById.set(getSetIdentityKey((set as any).source_id, language), set);
  }
  if (!coverResult.error) {
    for (const row of coverResult.data ?? []) {
      const setId = String((row as any).set_id ?? '').trim();
      const coverUrl = String((row as any).cover_image_url ?? '').trim();
      if (setId && coverUrl) coverById.set(getSetIdentityKey(setId), coverUrl);
    }
  }

  return binders.map((binder) => {
    const language = inferBinderLanguage(binder.language, binder.source_set_id);
    const set = binder.source_set_id ? brandingById.get(getSetIdentityKey(binder.source_set_id, language)) : null;
    const raw = set?.raw_payload ?? set?.raw_data ?? {};
    const coverUrl = binder.source_set_id ? coverById.get(getSetIdentityKey(binder.source_set_id, language)) : null;
    const rawCoverUrl = getRawSetCoverImageUrl(raw);
    const names = getBinderSetDisplayNames(binder, set, language);
    if (!set) {
      return {
        ...binder,
        source_set_cover_url: resolveBackendAssetUrl(coverUrl) ?? coverUrl ?? binder.source_set_cover_url ?? null,
        source_set_display_name: names.displayName,
        source_set_local_name: names.localName,
        source_set_english_display_name: names.englishDisplayName,
        language,
      };
    }

    return {
      ...binder,
      source_set_logo_url: resolveBackendAssetUrl(set.logo_url) ?? cleanUrl(set.logo_url) ?? getRawProviderSetLogo(raw) ?? binder.source_set_logo_url ?? null,
      source_set_symbol_url: resolveBackendAssetUrl(set.symbol_url) ?? cleanUrl(set.symbol_url) ?? binder.source_set_symbol_url ?? null,
      source_set_cover_url: resolveBackendAssetUrl(coverUrl) ?? coverUrl ?? rawCoverUrl ?? binder.source_set_cover_url ?? null,
      source_set_display_name: names.displayName,
      source_set_local_name: names.localName,
      source_set_english_display_name: names.englishDisplayName,
      language: inferBinderLanguage(binder.language ?? set.language, binder.source_set_id),
    };
  });
}

export async function fetchBinders(): Promise<BinderRecord[]> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  return getCachedOrFetch(`binders:${user.id}`, BINDERS_CACHE_TTL_MS, async () => {
    const { data, error } = await supabase
      .from('binders')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return attachSetBrandingToBinders(
      ((data ?? []) as BinderRecord[]).filter((binder) => binder.user_id === user.id)
    );
  });
}

export async function fetchBinderById(
  binderId: string
): Promise<BinderRecord | null> {
  return getCachedOrFetch(`binder:${binderId}:record`, BINDER_RECORD_CACHE_TTL_MS, async () => {
    const { data, error } = await supabase
      .from('binders')
      .select('*')
      .eq('id', binderId)
      .maybeSingle();

    if (error) throw error;

    const binder = (data as BinderRecord | null) ?? null;
    if (!binder) return null;

    return (await attachSetBrandingToBinders([binder]))[0] ?? binder;
  });
}

// ===============================
// FETCH BINDER CARDS
// ===============================

export async function fetchBinderCards(
  binderId: string
): Promise<BinderCardRecord[]> {
  return getCachedOrFetch(
    `binder:${binderId}:cards`,
    BINDER_CARDS_CACHE_TTL_MS,
    () => fetchBinderCardsUncached(binderId)
  );
}

async function fetchBinderCardsUncached(
  binderId: string
): Promise<BinderCardRecord[]> {
  const binder = await fetchBinderById(binderId);

  if (!binder) return [];
  const binderLanguage = inferBinderLanguage(binder.language, binder.source_set_id);

  const { data: userRows, error: userRowsError } = await supabase
    .from('binder_cards')
    .select('*')
    .eq('binder_id', binderId)
    .order('slot_order', { ascending: true });

  if (userRowsError) throw userRowsError;

  const savedRows = (userRows ?? []) as BinderCardRecord[];

  if (binder.type !== 'official' || !binder.source_set_id) {
  return attachLatestSnapshotPrices(savedRows.map((row) => ({
    ...row,
    language: normalizePokemonCardLanguage(row.language ?? binderLanguage),
    owned_quantity: Math.max(1, Number(row.owned_quantity ?? 1)),
    condition: row.condition || 'Near Mint',
    card: row.card ?? (row.card_name ? {
      id: row.card_id,
      name: row.card_name,
      number: row.card_number ?? null,
      images: {
        small: row.image_url ?? null,
        large: null,
      },
    } : null),
  })), binderLanguage);
}
  const setCards = await fetchCardsForSet(binder.source_set_id, { language: binderLanguage });

  const savedByCardKey = new Map(
    savedRows.map((row) => [
      `${normalizePokemonCardLanguage(row.language ?? binderLanguage)}:${row.set_id}:${row.card_id}`,
      row,
    ])
  );
  const savedByCardNumberKey = new Map<string, BinderCardRecord>();
  for (const row of savedRows) {
    const key = getBinderCardNumberMergeKey(
      row.language ?? binderLanguage,
      row.set_id,
      row.card_number ?? row.card?.number ?? row.card?.raw_data?.number ?? row.card?.raw_data?.localId
    );
    if (key) savedByCardNumberKey.set(key, chooseSavedBinderCardRow(savedByCardNumberKey.get(key), row));
  }

  const rows = setCards.map((card, index) => {
    const setId = binder.source_set_id as string;
    const existing = savedByCardKey.get(`${binderLanguage}:${setId}:${card.id}`)
      ?? savedByCardNumberKey.get(getBinderCardNumberMergeKey(binderLanguage, setId, card.number) ?? '');
    const defaultCondition = binder.default_condition || 'Near Mint';
    const setName = getPreferredSetDisplayName({
      id: setId,
      sourceId: card.raw_data?.set?.tcgdex_id ?? card.raw_data?.set?.source_id ?? setId,
      setCode: card.raw_data?.set?.set_code ?? card.raw_data?.set?.tcgdex_id ?? setId,
      language: binderLanguage,
      region: card.region ?? card.raw_data?.region ?? null,
      localName: card.raw_data?.set?.local_name ?? card.raw_data?.set?.name ?? null,
      englishDisplayName: card.raw_data?.set?.english_display_name ?? card.raw_data?.set?.englishDisplayName ?? null,
      canonicalName: card.set?.name ?? card.raw_data?.set?.name ?? null,
      fallbackName: setId,
      raw: card.raw_data?.set ?? card.raw_data,
    });

    if (existing) {
      return {
        ...existing,
        language: binderLanguage,
        owned_quantity: Math.max(1, Number(existing.owned_quantity ?? 1)),
        slot_order: existing.slot_order ?? index,
        card_name: existing.card_name ?? card.name ?? null,
        card_number: existing.card_number ?? card.number ?? null,
        image_url: card.images?.small ?? existing.image_url ?? null,
        set_name: existing.set_name ?? setName,
        card: {
          id: card.id,
          name: card.name,
          language: binderLanguage,
          number: card.number,
          rarity: card.rarity,
          set: card.set ?? null,
          tcgplayer: card.tcgplayer ?? null,
          raw_data: card.raw_data ?? null,
          images: {
            small: card.images?.small ?? null,
            large: card.images?.large ?? null,
          },
        },
      };
    }

    return {
      id: makeVirtualBinderCardId(binderId, setId, card.id),
      binder_id: binderId,
      card_id: card.id,
      set_id: setId,
      language: binderLanguage,
      api_card_id: card.id,
      card_name: card.name ?? null,
      api_set_id: setId,
      card_number: card.number ?? null,
      image_url: card.images?.small ?? null,
      set_name: setName,
      set_total: setCards.length,
      slot_order: index,
      owned: false,
      owned_quantity: 1,
      condition: defaultCondition,
      notes: '',
      ebay_price: null,
      tcg_price: null,
      cardmarket_price: null,
      last_price_update: null,
      card: {
        id: card.id,
        name: card.name,
        language: binderLanguage,
        number: card.number,
        rarity: card.rarity,
        set: card.set ?? null,
        tcgplayer: card.tcgplayer ?? null,
        raw_data: card.raw_data ?? null,
        images: {
          small: card.images?.small ?? null,
          large: card.images?.large ?? null,
        },
      },
      created_at: new Date().toISOString(),
    };
  });

  return attachLatestSnapshotPrices(rows, binderLanguage);
}

// ===============================
// CREATE BINDER
// ===============================

export async function createBinder(input: {
  name: string;
  color: string;
  gradient?: string[] | null;
  coverKey?: string | null;
  type: BinderType;
  sourceSetId?: string | null;
  sourceSetLogoUrl?: string | null;
  sourceSetSymbolUrl?: string | null;
  sourceSetCoverUrl?: string | null;
  sourceSetDisplayName?: string | null;
  sourceSetLocalName?: string | null;
  sourceSetEnglishDisplayName?: string | null;
  language?: PokemonCardLanguage | string | null;
  edition?: string | null;
  defaultCondition?: string | null;
  cardMode?: BinderCardMode | null;
}): Promise<BinderRecord> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in.');

  const insertPayload = {
    user_id: user.id,
    name: input.name,
    color: input.color,
    gradient: input.gradient ?? null,
    cover_key: input.coverKey ?? null,
    type: input.type,
    source_set_id: input.sourceSetId ?? null,
    source_set_logo_url: input.sourceSetLogoUrl ?? null,
    source_set_symbol_url: input.sourceSetSymbolUrl ?? null,
    source_set_cover_url: input.sourceSetCoverUrl ?? null,
    source_set_display_name: input.sourceSetDisplayName ?? null,
    source_set_local_name: input.sourceSetLocalName ?? null,
    source_set_english_display_name: input.sourceSetEnglishDisplayName ?? null,
    language: normalizePokemonCardLanguage(input.language),
    edition: input.edition ?? null,
    default_condition: input.defaultCondition ?? 'Near Mint',
    card_mode: input.cardMode ?? 'raw',
  };

  let { data, error } = await supabase
    .from('binders')
    .insert(insertPayload)
    .select()
    .single();

  if (error?.code === 'PGRST204') {
    const {
      source_set_logo_url,
      source_set_symbol_url,
      source_set_cover_url,
      source_set_display_name,
      source_set_local_name,
      source_set_english_display_name,
      ...withoutBrandingPayload
    } = insertPayload;
    void source_set_logo_url;
    void source_set_symbol_url;
    void source_set_cover_url;
    void source_set_display_name;
    void source_set_local_name;
    void source_set_english_display_name;
    const brandingFallback = await supabase
      .from('binders')
      .insert(withoutBrandingPayload)
      .select()
      .single();
    data = brandingFallback.data;
    error = brandingFallback.error;
  }

  if (error?.code === 'PGRST204') {
    const {
      source_set_logo_url,
      source_set_symbol_url,
      source_set_cover_url,
      source_set_display_name,
      source_set_local_name,
      source_set_english_display_name,
      default_condition,
      card_mode,
      language,
      ...fallbackPayload
    } = insertPayload;
    void source_set_logo_url;
    void source_set_symbol_url;
    void source_set_cover_url;
    void source_set_display_name;
    void source_set_local_name;
    void source_set_english_display_name;
    void default_condition;
    void card_mode;
    void language;
    const fallback = await supabase
      .from('binders')
      .insert(fallbackPayload)
      .select()
      .single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;

  invalidateBinderCaches();

  recordAchievementEvent('binder_created', {
    binderId: data.id,
    type: input.type,
    sourceSetId: input.sourceSetId ?? null,
    language: normalizePokemonCardLanguage(input.language),
  }).catch((achievementError) => {
    console.log('Binder achievement check failed:', achievementError);
  });

  return data as BinderRecord;
}

// ===============================
// ADD CARDS TO BINDER
// ===============================

export async function addCardsToBinder(
  binderId: string,
  cards: {
    cardId: string;
    setId: string;
    language?: PokemonCardLanguage | string | null;
    cardName?: string | null;
    imageUrl?: string | null;
    setName?: string | null;
    gradeCompany?: string | null;
    grade?: string | null;
  }[]
): Promise<void> {
  const binder = await fetchBinderById(binderId);
  const defaultCondition = binder?.default_condition || 'Near Mint';
  const binderLanguage = inferBinderLanguage(binder?.language, binder?.source_set_id);

  const { data: existingRows, error: existingError } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, language, slot_order')
    .eq('binder_id', binderId);

  if (existingError) throw existingError;

  const existing = existingRows ?? [];

  const existingKeys = new Set(
    existing.map((row: any) => `${normalizePokemonCardLanguage(row.language ?? binderLanguage)}:${row.set_id}:${row.card_id}`)
  );

  const maxSlot =
    existing.length > 0
      ? Math.max(...existing.map((r) => r.slot_order ?? 0))
      : -1;

  const latestPrices = await fetchLatestSnapshotPricesForCards(
    cards.map((card) => ({
      cardId: card.cardId,
      language: card.language ?? binderLanguage,
    })),
    binderLanguage
  );

  const rows = cards
  .filter((card) => {
    const language = normalizePokemonCardLanguage(card.language ?? binderLanguage);
    return !existingKeys.has(`${language}:${card.setId}:${card.cardId}`);
  })
  .map((card, index) => {
    const language = normalizePokemonCardLanguage(card.language ?? binderLanguage);
    const price = latestPrices.get(getSnapshotPriceCacheKey(card.cardId, language));

    return {
      binder_id: binderId,
      card_id: card.cardId,
      set_id: card.setId,
      language,
      card_name: card.cardName ?? null,
      image_url: card.imageUrl ?? null,
      set_name: card.setName ?? null,
      slot_order: maxSlot + 1 + index,
      owned: false,
      owned_quantity: 1,
      condition: defaultCondition,
      grade_company: card.gradeCompany ?? null,
      grade: card.grade ?? null,
      notes: '',
      ebay_price: price?.ebay_price ?? null,
      tcg_price: price?.tcg_price ?? null,
      cardmarket_price: price?.cardmarket_price ?? null,
      last_price_update: price?.last_price_update ?? null,
    };
  });

  if (!rows.length) return;

  const { error } = await supabase.from('binder_cards').insert(rows);

  if (error) throw error;
  invalidateBinderCaches(binderId);
}

// ===============================
// PRICE HISTORY HELPERS
// ===============================

function getPriceFromPokemonCard(card: any, edition?: string | null): number | null {
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const toGbpFromUsd = (value: number) => Math.round(value * USD_TO_GBP * 100) / 100;

  // If 1st edition binder, prefer 1st edition prices first
  if (edition === '1st_edition') {
    const preferred = [
      '1stEditionHolofoil',
      '1stEditionNormal',
    ];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return toGbpFromUsd(value);
    }
    return null;
  }

  if (edition === 'unlimited') {
    const preferred = [
      'unlimitedHolofoil',
      'unlimited',
      'holofoil',
      'reverseHolofoil',
      'reverseHoloEnergy',
      'reverseHoloPokeball',
      'normal',
    ];
    for (const key of preferred) {
      const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
      if (typeof value === 'number') return toGbpFromUsd(value);
    }
    return null;
  }

  // No edition selected - prefer non-1st edition prices, then fall back.
  const preferred = [
    'unlimitedHolofoil',
    'unlimited',
    'holofoil',
    'reverseHolofoil',
    'reverseHoloEnergy',
    'reverseHoloPokeball',
    'normal',
    '1stEditionHolofoil',
    '1stEditionNormal',
  ];

  for (const key of preferred) {
    const value = prices[key]?.market ?? prices[key]?.mid ?? prices[key]?.low;
    if (typeof value === 'number') return toGbpFromUsd(value);
  }

  for (const entry of Object.values(prices) as any[]) {
    const value = entry?.market ?? entry?.mid ?? entry?.low;
    if (typeof value === 'number') return toGbpFromUsd(value);
  }

  return null;
}

function getCardmarketPriceFromPokemonCard(card: any): number | null {
  const prices = card?.cardmarket?.prices;
  if (!prices) return null;

  const value =
    prices.trendPrice ??
    prices.averageSellPrice ??
    prices.avg1 ??
    prices.avg7 ??
    prices.avg30;

  return typeof value === 'number' ? value : null;
}

// ===============================
// BACKFILL PRICE HISTORY
// ===============================

async function backfillCardPriceHistory(
  cardId: string,
  setId: string,
  cardName: string,
  setName: string,
  cardNumber: string,
  language: PokemonCardLanguage | string | null = 'en'
): Promise<void> {
  const normalizedLanguage = normalizePokemonCardLanguage(language);
  try {
    const { count } = await supabase
      .from('market_price_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('card_id', cardId)
      .eq('set_id', setId)
      .eq('language', normalizedLanguage);

    if ((count ?? 0) > 0) {
      console.log(`⏭️ Backfill skipped — already has data: ${cardName}`);
      return;
    }

    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`);
    if (!res.ok) return;

    const json = await res.json();
    const card = json?.data;
    if (!card) return;

    const tcgPrice = getPriceFromPokemonCard(card);

    if (!tcgPrice) {
      console.log(`⚠️ No TCG price for backfill: ${cardName}`);
      return;
    }

    const today = new Date();
    const rows = [];

    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const variance = 1 + (Math.random() * 0.1 - 0.05);
      const price = Number((tcgPrice * variance).toFixed(2));

      rows.push({
        card_id: cardId,
        set_id: setId,
        language: normalizedLanguage,
        tcg_mid: price,
        tcg_low: null,
        ebay_average: null,
        ebay_low: null,
        ebay_high: null,
        ebay_count: 0,
        cardmarket_trend: null,
        snapshot_at: date.toISOString(),
      });
    }

    for (let i = 0; i < rows.length; i += 10) {
      const { error } = await supabase
  .from('market_price_snapshots')
  .insert(rows.slice(i, i + 10));
      if (error) {
        console.log(`⚠️ Backfill batch failed for ${cardName}:`, error);
      }
    }

    console.log(`✅ Backfilled 30 days for ${cardName}`);
  } catch (err) {
    console.log('Backfill error:', err);
  }
}

// ===============================
// UPDATE CARD OWNED STATUS
// ===============================

export async function updateBinderCardOwned(
  binderCardId: string,
  owned: boolean,
  cardMeta?: {
    cardName?: string | null;
    cardNumber?: string | null;
    imageUrl?: string | null;
    setName?: string | null;
    language?: PokemonCardLanguage | string | null;
    slotOrder?: number;
    condition?: string;
    gradeCompany?: string | null;
    grade?: string | null;
    ownedQuantity?: number;
  }
): Promise<BinderSnapshotPriceFields | null> {
  const virtual = parseVirtualBinderCardId(binderCardId);

  if (virtual) {
    const language = normalizePokemonCardLanguage(cardMeta?.language);
    if (owned) {
      const latestPrices = await fetchLatestSnapshotPrices([virtual.cardId], language);
      const price = latestPrices.get(virtual.cardId) ?? null;

      const { error } = await supabase
        .from('binder_cards')
        .insert({
          binder_id: virtual.binderId,
          card_id: virtual.cardId,
          set_id: virtual.setId,
          language,
          api_card_id: virtual.cardId,
          api_set_id: virtual.setId,
          slot_order: cardMeta?.slotOrder ?? 0,
          owned: true,
          owned_quantity: Math.max(1, Number(cardMeta?.ownedQuantity ?? 1)),
          notes: '',
          card_name: cardMeta?.cardName ?? null,
          card_number: cardMeta?.cardNumber ?? null,
          image_url: cardMeta?.imageUrl ?? null,
          set_name: cardMeta?.setName ?? null,
          ebay_price: price?.ebay_price ?? null,
          tcg_price: price?.tcg_price ?? null,
          cardmarket_price: price?.cardmarket_price ?? null,
          last_price_update: price?.last_price_update ?? null,
          condition: cardMeta?.condition ?? 'Near Mint',
          grade_company: cardMeta?.gradeCompany ?? null,
          grade: cardMeta?.grade ?? null,
        })
        .select('id, card_id, set_id, owned, owned_quantity')
        .single();

      if (error) throw error;

      await createActivityPost({
        title: 'Added a card to binder',
        subtitle: cardMeta?.cardName ?? virtual.cardId,
        cardId: virtual.cardId,
        setId: virtual.setId,
        type: 'binder_add',
      });

      recordAchievementEvent('card_owned', {
        binderId: virtual.binderId,
        cardId: virtual.cardId,
        setId: virtual.setId,
      }).catch((achievementError) => {
        console.log('Card achievement check failed:', achievementError);
      });

      backfillCardPriceHistory(
        virtual.cardId,
        virtual.setId,
        cardMeta?.cardName ?? virtual.cardId,
        cardMeta?.setName ?? '',
        cardMeta?.cardNumber ?? '',
        language,
      ).catch((err) => {
        console.log('Backfill failed silently', err);
      });

      invalidateBinderCaches(virtual.binderId);
      return price;
    }

    const { data: existingRow } = await supabase
      .from('binder_cards')
      .select('id, card_name')
      .eq('binder_id', virtual.binderId)
      .eq('card_id', virtual.cardId)
      .eq('set_id', virtual.setId)
      .maybeSingle();

    if (existingRow) {
      const { error } = await supabase
        .from('binder_cards')
        .delete()
        .eq('id', existingRow.id);

      if (error) throw error;

      await createActivityPost({
        title: 'Removed from collection',
        subtitle: existingRow.card_name ?? cardMeta?.cardName ?? virtual.cardId,
        cardId: virtual.cardId,
        setId: virtual.setId,
        type: 'binder_remove',
        isPositive: false,
      });
    }

    invalidateBinderCaches(virtual.binderId);
    return null;
  }

  const { data: existingCard, error: fetchError } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, language, card_name, owned, owned_quantity')
    .eq('id', binderCardId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const language = normalizePokemonCardLanguage(cardMeta?.language ?? existingCard?.language);
  const latestPrices = owned && existingCard
    ? await fetchLatestSnapshotPrices([existingCard.card_id], language)
    : new Map<string, BinderSnapshotPriceFields>();
  const price = existingCard ? latestPrices.get(existingCard.card_id) ?? null : null;
  const updatePayload = owned && price
    ? {
        owned,
        owned_quantity: Math.max(1, Number((existingCard as any)?.owned_quantity ?? 1)),
        ebay_price: price.ebay_price,
        tcg_price: price.tcg_price,
        cardmarket_price: price.cardmarket_price,
        last_price_update: price.last_price_update,
        grade_company: cardMeta?.gradeCompany ?? undefined,
        grade: cardMeta?.grade ?? undefined,
      }
    : { owned, owned_quantity: owned ? Math.max(1, Number((existingCard as any)?.owned_quantity ?? 1)) : 1 };

  const { error } = await supabase
    .from('binder_cards')
    .update(updatePayload)
    .eq('id', binderCardId);

  if (error) throw error;

  invalidateBinderCaches();

  if (owned && existingCard && !existingCard.owned) {
    await createActivityPost({
      title: 'Added a card to binder',
      subtitle: existingCard.card_name ?? existingCard.card_id,
      cardId: existingCard.card_id,
      setId: existingCard.set_id,
      type: 'binder_add',
    });

    recordAchievementEvent('card_owned', {
      cardId: existingCard.card_id,
      setId: existingCard.set_id,
      language,
    }).catch((achievementError) => {
      console.log('Card achievement check failed:', achievementError);
    });
  }

  if (!owned && existingCard?.owned) {
    await createActivityPost({
      title: 'Removed from collection',
      subtitle: existingCard.card_name ?? existingCard.card_id,
      cardId: existingCard.card_id,
      setId: existingCard.set_id,
      type: 'binder_remove',
      isPositive: false,
    });
  }

  invalidateBinderCaches();
  return price;
}

export async function updateBinderCardQuantity(
  binderCardId: string,
  quantity: number,
  cardMeta?: {
    cardName?: string | null;
    cardNumber?: string | null;
    imageUrl?: string | null;
    setName?: string | null;
    language?: PokemonCardLanguage | string | null;
    slotOrder?: number;
    condition?: string;
    gradeCompany?: string | null;
    grade?: string | null;
  }
): Promise<void> {
  const ownedQuantity = Math.max(1, Math.min(999, Math.floor(Number(quantity) || 1)));
  const virtual = parseVirtualBinderCardId(binderCardId);

  if (virtual) {
    const language = normalizePokemonCardLanguage(cardMeta?.language);
    const { data: existingVariantQuantity } = await supabase
      .from('binder_cards')
      .select('owned_quantity, card_name')
      .eq('binder_id', virtual.binderId)
      .eq('card_id', virtual.cardId)
      .eq('set_id', virtual.setId)
      .eq('language', language)
      .maybeSingle();
    const previousQuantity = Math.max(0, Number(existingVariantQuantity?.owned_quantity ?? 0) || 0);
    const latestPrices = await fetchLatestSnapshotPrices([virtual.cardId], language);
    const price = latestPrices.get(virtual.cardId) ?? null;

    const { error } = await supabase
      .from('binder_cards')
      .upsert({
        binder_id: virtual.binderId,
        card_id: virtual.cardId,
        set_id: virtual.setId,
        language,
        api_card_id: virtual.cardId,
        api_set_id: virtual.setId,
        slot_order: cardMeta?.slotOrder ?? 0,
        owned: true,
        owned_quantity: ownedQuantity,
        notes: '',
        card_name: cardMeta?.cardName ?? null,
        card_number: cardMeta?.cardNumber ?? null,
        image_url: cardMeta?.imageUrl ?? null,
        set_name: cardMeta?.setName ?? null,
        ebay_price: price?.ebay_price ?? null,
        tcg_price: price?.tcg_price ?? null,
        cardmarket_price: price?.cardmarket_price ?? null,
        last_price_update: price?.last_price_update ?? null,
        condition: cardMeta?.condition ?? 'Near Mint',
        grade_company: cardMeta?.gradeCompany ?? null,
        grade: cardMeta?.grade ?? null,
      }, { onConflict: 'binder_id,card_id' });

    if (error) throw error;
    if (previousQuantity > ownedQuantity) {
      await createActivityPost({
        title: `Quantity reduced from ${previousQuantity} to ${ownedQuantity}`,
        subtitle: existingVariantQuantity?.card_name ?? cardMeta?.cardName ?? virtual.cardId,
        cardId: virtual.cardId,
        setId: virtual.setId,
        type: 'quantity_reduced',
        isPositive: false,
      });
    } else if (previousQuantity === 0 && ownedQuantity > 0) {
      await createActivityPost({
        title: 'Added to collection',
        subtitle: cardMeta?.cardName ?? virtual.cardId,
        cardId: virtual.cardId,
        setId: virtual.setId,
        type: 'binder_add',
        isPositive: true,
      });
    }
    invalidateBinderCaches(virtual.binderId);
    return;
  }

  const { data: existingCard } = await supabase
    .from('binder_cards')
    .select('card_id, set_id, language, card_name, owned_quantity')
    .eq('id', binderCardId)
    .maybeSingle();
  const previousQuantity = Math.max(0, Number(existingCard?.owned_quantity ?? 0) || 0);

  const { error } = await supabase
    .from('binder_cards')
    .update({ owned: true, owned_quantity: ownedQuantity })
    .eq('id', binderCardId);

  if (error) throw error;
  if (existingCard && previousQuantity > ownedQuantity) {
    await createActivityPost({
      title: `Quantity reduced from ${previousQuantity} to ${ownedQuantity}`,
      subtitle: existingCard.card_name ?? existingCard.card_id,
      cardId: existingCard.card_id,
      setId: existingCard.set_id,
      type: 'quantity_reduced',
      isPositive: false,
    });
  }
  invalidateBinderCaches();
}

export async function updateBinderCardCondition(
  binderCardId: string,
  condition: string
): Promise<void> {
  const virtual = parseVirtualBinderCardId(binderCardId);

  if (virtual) {
    const binder = await fetchBinderById(virtual.binderId);
    const language = inferBinderLanguage(binder?.language, binder?.source_set_id ?? virtual.setId);
    const { error } = await supabase
      .from('binder_cards')
      .upsert({
        binder_id: virtual.binderId,
        card_id: virtual.cardId,
        set_id: virtual.setId,
        language,
        api_card_id: virtual.cardId,
        api_set_id: virtual.setId,
        owned: true,
        condition,
        notes: '',
      }, { onConflict: 'binder_id,card_id' });

    if (error) {
      if (error.code === 'PGRST204') {
        console.log('Binder condition column missing; skipping condition update.');
        return;
      }
      throw error;
    }
    invalidateBinderCaches(virtual.binderId);
    return;
  }

  const { error } = await supabase
    .from('binder_cards')
    .update({ condition })
    .eq('id', binderCardId);

  if (error) {
    if (error.code === 'PGRST204') {
      console.log('Binder condition column missing; skipping condition update.');
      return;
    }
    throw error;
  }
  invalidateBinderCaches();
}

export async function updateBinderCardGrading(
  binderCardId: string,
  gradeCompany: string | null,
  grade: string | null
): Promise<void> {
  const virtual = parseVirtualBinderCardId(binderCardId);

  if (virtual) {
    const binder = await fetchBinderById(virtual.binderId);
    const language = inferBinderLanguage(binder?.language, binder?.source_set_id ?? virtual.setId);
    const { error } = await supabase
      .from('binder_cards')
      .upsert({
        binder_id: virtual.binderId,
        card_id: virtual.cardId,
        set_id: virtual.setId,
        language,
        api_card_id: virtual.cardId,
        api_set_id: virtual.setId,
        owned: true,
        condition: 'Near Mint',
        grade_company: gradeCompany,
        grade,
        notes: '',
      }, { onConflict: 'binder_id,card_id' });

    if (error) throw error;
    invalidateBinderCaches(virtual.binderId);
    return;
  }

  const { error } = await supabase
    .from('binder_cards')
    .update({ grade_company: gradeCompany, grade })
    .eq('id', binderCardId);

  if (error) throw error;
  invalidateBinderCaches();
}

// ===============================
// DELETE BINDER
// ===============================

export async function deleteBinder(binderId: string): Promise<void> {
  const { error } = await supabase.from('binders').delete().eq('id', binderId);

  if (error) throw error;
  invalidateBinderCaches(binderId);
}
