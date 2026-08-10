import {
  StackrApiClient,
  stackrApiClient,
  type StackrApiLanguageCode,
  type StackrCard,
  type StackrCatalogueAsset,
  type StackrCardPrice,
  type StackrSearchResult,
  type StackrSet,
} from './stackrApiV1';
import { supabase } from './supabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXACT_CARD_REASONS = new Set([
  'exact_canonical_id',
  'exact_external_id',
  'exact_set_code_collector_number',
  'exact_collector_number',
  'exact_collector_number_in_set',
  'exact_name_in_set',
  'exact_name',
  'exact_alias',
  'exact_translated_name',
]);

export type StackrLegacyLanguageCode = 'en' | 'ja' | 'zh-cn' | 'zh-tw' | 'ko';

export type StackrLegacySet = {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  language: StackrLegacyLanguageCode;
  region: string | null;
  localName: string | null;
  englishDisplayName: string | null;
  externalIds: Record<string, string | null>;
  images: {
    symbol?: string;
    logo?: string;
    cover?: string;
    artwork?: string;
  };
};

export type StackrLegacyCard = {
  id: string;
  name: string;
  number: string;
  language: StackrLegacyLanguageCode;
  region: string | null;
  externalIds: Record<string, string | null>;
  rarity?: string;
  images: { small?: string; large?: string };
  set: { id: string; name: string; series?: string };
  localName: string | null;
  raw_data: Record<string, unknown>;
};

export type StackrResolvedCard = {
  card: StackrCard;
  variantId: string;
  matchedBy: StackrSearchResult['reason'] | 'canonical_uuid';
};

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function useStackrApi(client: StackrApiClient) {
  return client !== stackrApiClient
    || process.env.EXPO_PUBLIC_STACKR_API_ENABLED === 'true'
    || process.env.EXPO_PUBLIC_STACKR_API_ENABLED === '1';
}

function legacyLanguage(value: unknown): StackrLegacyLanguageCode {
  const normalized = String(value ?? '').toLowerCase().replace(/_/g, '-');
  if (normalized === 'ja' || normalized === 'jp') return 'ja';
  if (normalized === 'ko' || normalized === 'kr') return 'ko';
  if (normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-cn';
  if (normalized === 'zh' || normalized === 'zh-tw' || normalized === 'zh-hant') return 'zh-tw';
  return 'en';
}

function legacyRowToCard(row: any): StackrLegacyCard {
  const raw = row.raw_data ?? row.raw_payload ?? {};
  const set = raw.set ?? {};
  const setId = String(row.set_id ?? set.id ?? 'unknown');
  const name = String(row.english_display_name ?? row.canonical_name ?? row.name ?? raw.english_display_name ?? raw.name ?? row.id);
  const localName = clean(row.local_name ?? raw.local_name ?? raw.name);
  return {
    id: String(row.id ?? row.card_id ?? row.provider_card_id),
    name,
    number: String(row.number ?? row.collector_number ?? raw.localId ?? raw.number ?? ''),
    language: legacyLanguage(row.language ?? raw.language),
    region: clean(row.region ?? raw.region),
    externalIds: {
      ...(row.external_ids && typeof row.external_ids === 'object' ? row.external_ids : {}),
      legacy: String(row.provider_card_id ?? row.source_id ?? row.id ?? ''),
    },
    rarity: clean(row.rarity ?? raw.rarity) ?? undefined,
    images: {
      small: clean(row.image_small ?? row.image_small_url ?? row.image_url ?? raw.images?.small) ?? undefined,
      large: clean(row.image_large ?? row.image_large_url ?? row.image_url ?? raw.images?.large) ?? undefined,
    },
    set: {
      id: setId,
      name: String(set.english_display_name ?? set.name ?? row.set_name ?? setId),
      series: clean(set.series) ?? undefined,
    },
    localName,
    raw_data: {
      ...raw,
      id: row.id,
      name,
      local_name: localName,
      number: row.number ?? row.collector_number ?? raw.localId ?? raw.number ?? '',
      language: legacyLanguage(row.language ?? raw.language),
      rarity: row.rarity ?? raw.rarity ?? null,
      images: {
        ...(raw.images ?? {}),
        small: row.image_small ?? row.image_small_url ?? row.image_url ?? raw.images?.small ?? null,
        large: row.image_large ?? row.image_large_url ?? row.image_url ?? raw.images?.large ?? null,
      },
      set: { ...set, id: setId, name: set.name ?? row.set_name ?? setId },
      stackrMigration: { source: 'legacy-read-adapter', quarantinedIdentity: true },
    },
  };
}

function legacyCardToStackrCard(card: StackrLegacyCard): StackrCard {
  const variantId = clean(card.externalIds.stackrVariant) ?? card.id;
  const canonicalId = `legacy:${card.language}:${card.set.id}:${card.number}:unresolved`;
  return {
    cardId: card.id,
    game: 'pokemon',
    languageCode: toStackrApiLanguage(card.language) ?? 'en',
    set: {
      setId: card.set.id,
      setCode: clean((card.raw_data.set as any)?.set_code ?? card.set.id),
      nativeName: clean((card.raw_data.set as any)?.local_name ?? card.set.name),
      englishDisplayName: card.set.name,
    },
    collectorNumber: {
      value: card.number,
      prefix: null,
      sort: Number.parseInt(card.number, 10) || null,
      suffix: null,
      sortKey: card.number,
    },
    names: { native: card.localName ?? card.name, englishDisplay: card.name },
    rarity: { code: card.rarity ?? null, label: card.rarity ?? null },
    defaultVariantId: variantId,
    variants: [{
      variantId,
      canonicalId,
      variantCode: 'legacy-unresolved',
      variantLabel: 'Legacy unresolved',
      finishCode: null,
      finishLabel: null,
      artworkKey: null,
      updatedAt: null,
    }],
    updatedAt: null,
  };
}

async function legacyCardMap(references: string[]) {
  const unique = [...new Set(references.map((value) => String(value ?? '').trim()).filter(Boolean))];
  const map = new Map<string, StackrLegacyCard>();
  if (!unique.length) return map;
  for (let offset = 0; offset < unique.length; offset += 100) {
    const ids = unique.slice(offset, offset + 100);
    const [pokemonResult, canonicalResult, previewResult] = await Promise.all([
      supabase.from('pokemon_cards').select('*').in('id', ids),
      supabase.from('tcg_cards').select('*').in('id', ids),
      supabase.from('card_previews').select('card_id, name, image_url, set_name').in('card_id', ids),
    ]);
    for (const row of [...(pokemonResult.data ?? []), ...(canonicalResult.data ?? [])]) {
      const card = legacyRowToCard(row);
      map.set(card.id, card);
    }
    for (const row of previewResult.data ?? []) {
      if (map.has(row.card_id)) continue;
      const card = legacyRowToCard({ ...row, id: row.card_id });
      map.set(card.id, card);
    }
  }
  return map;
}

async function legacySearchCards(query: string, language?: string | null, limit = 40) {
  const value = String(query ?? '').trim();
  if (value.length < 2) return [];
  let nameQuery = supabase.from('pokemon_cards').select('*').ilike('name', `%${value}%`).limit(limit);
  const normalizedLanguage = language && language !== 'all' ? legacyLanguage(language) : null;
  if (normalizedLanguage) nameQuery = nameQuery.eq('language', normalizedLanguage);
  const { data, error } = await nameQuery;
  if (error) throw error;
  return (data ?? []).map(legacyRowToCard);
}

function legacySetRow(row: any): StackrLegacySet {
  const raw = row.raw_data ?? row.raw_payload ?? {};
  const language = legacyLanguage(row.language ?? raw.language);
  const id = String(row.id ?? row.source_id ?? row.provider_id);
  const name = String(row.english_display_name ?? row.name ?? row.canonical_name ?? raw.english_display_name ?? raw.name ?? id);
  return {
    id,
    name,
    series: String(row.series ?? raw.series ?? 'Other'),
    printedTotal: Number(row.printed_total ?? raw.cardCount?.official ?? 0),
    total: Number(row.total ?? row.actual_total ?? raw.cardCount?.total ?? row.printed_total ?? 0),
    releaseDate: String(row.release_date ?? raw.releaseDate ?? ''),
    language,
    region: clean(row.region ?? raw.region),
    localName: clean(row.local_name ?? raw.local_name ?? raw.name),
    englishDisplayName: clean(row.english_display_name ?? raw.english_display_name ?? name),
    externalIds: {
      ...(row.external_ids && typeof row.external_ids === 'object' ? row.external_ids : {}),
      legacy: clean(row.source_id ?? row.provider_id ?? row.id),
      setCode: clean(row.set_code ?? row.source_id ?? row.id),
    },
    images: {
      symbol: clean(row.symbol_url) ?? undefined,
      logo: clean(row.logo_url) ?? undefined,
      cover: clean(raw.cover_image_url ?? raw.images?.cover) ?? undefined,
      artwork: clean(raw.cover_image_url ?? raw.images?.artwork) ?? undefined,
    },
  };
}

async function legacySets(language?: string | null) {
  const normalizedLanguage = language && language !== 'all' ? legacyLanguage(language) : null;
  let legacyQuery = supabase.from('pokemon_sets').select('*').order('release_date', { ascending: false });
  let canonicalQuery = supabase.from('tcg_sets').select('*').order('release_date', { ascending: false });
  if (normalizedLanguage) {
    legacyQuery = legacyQuery.eq('language', normalizedLanguage);
    canonicalQuery = canonicalQuery.eq('language', normalizedLanguage);
  }
  const [legacyResult, canonicalResult] = await Promise.all([legacyQuery, canonicalQuery]);
  const rows = [...(legacyResult.data ?? []), ...(canonicalResult.data ?? [])].map(legacySetRow);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!rows.length && legacyResult.error && canonicalResult.error) throw legacyResult.error;
  return [...byId.values()];
}

export function toStackrApiLanguage(value?: string | null): StackrApiLanguageCode | null {
  const language = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!language || language === 'all') return null;
  if (language === 'en' || language === 'english') return 'en';
  if (language === 'ja' || language === 'jp' || language === 'japanese') return 'ja';
  if (language === 'ko' || language === 'kr' || language === 'korean') return 'ko';
  if (['zh-cn', 'zh-hans', 'chinese-simplified', 'simplified-chinese'].includes(language)) return 'zh-Hans';
  if (['zh', 'zh-tw', 'zh-hant', 'chinese', 'traditional-chinese'].includes(language)) return 'zh-Hant';
  return null;
}

export function toLegacyLanguage(value?: StackrApiLanguageCode | string | null): StackrLegacyLanguageCode {
  if (value === 'ja') return 'ja';
  if (value === 'ko') return 'ko';
  if (value === 'zh-Hans') return 'zh-cn';
  if (value === 'zh-Hant') return 'zh-tw';
  return 'en';
}

function assetUrl(asset?: StackrCatalogueAsset | null) {
  return clean(asset?.deliveryUrl) ?? clean(asset?.deliveryPath) ?? undefined;
}

function firstAsset(assets: StackrCatalogueAsset[], types: string[]) {
  return assets.find((asset) => types.includes(asset.assetType) && assetUrl(asset));
}

function derivativeUrl(asset: StackrCatalogueAsset | undefined, hints: string[]) {
  if (!asset) return undefined;
  for (const derivative of asset.derivatives ?? []) {
    const key = String(derivative.key ?? derivative.name ?? derivative.type ?? '').toLowerCase();
    const url = clean(derivative.url ?? derivative.deliveryUrl ?? derivative.path);
    if (url && hints.some((hint) => key.includes(hint))) return url;
  }
  return assetUrl(asset);
}

export function stackrSetToLegacySet(set: StackrSet, assets: StackrCatalogueAsset[] = []): StackrLegacySet {
  const logo = firstAsset(assets, ['set_logo']);
  const symbol = firstAsset(assets, ['set_symbol']);
  const cover = firstAsset(assets, ['set_cover', 'set_artwork']);
  const name = set.englishDisplayName ?? set.nativeName ?? set.setCode ?? set.setId;
  return {
    id: set.setId,
    name,
    series: set.seriesEnglishDisplayName ?? set.seriesNativeName ?? 'Other',
    printedTotal: Number(set.printedTotal ?? 0),
    total: Number(set.total ?? set.printedTotal ?? 0),
    releaseDate: set.releaseDate ?? '',
    language: toLegacyLanguage(set.languageCode),
    region: set.regionCode,
    localName: set.nativeName,
    englishDisplayName: set.englishDisplayName,
    externalIds: {
      stackr: set.setId,
      setCode: set.setCode,
    },
    images: {
      logo: assetUrl(logo),
      symbol: assetUrl(symbol),
      cover: assetUrl(cover),
      artwork: assetUrl(cover),
    },
  };
}

export function stackrCardToLegacyCard(card: StackrCard, assets: StackrCatalogueAsset[] = []): StackrLegacyCard {
  const cardAssets = assets.filter((asset) => asset.cardId === card.cardId || card.variants.some((variant) => variant.variantId === asset.variantId));
  const primary = firstAsset(cardAssets, ['card_image']);
  const name = card.names.englishDisplay ?? card.names.native;
  return {
    id: card.cardId,
    name,
    number: card.collectorNumber.value,
    language: toLegacyLanguage(card.languageCode),
    region: null,
    externalIds: {
      stackr: card.cardId,
      stackrVariant: card.defaultVariantId,
      canonicalKey: card.variants.find((variant) => variant.variantId === card.defaultVariantId)?.canonicalId ?? null,
    },
    rarity: card.rarity.label ?? card.rarity.code ?? undefined,
    images: {
      small: derivativeUrl(primary, ['card-grid', 'grid', 'search', 'small', 'thumb']),
      large: derivativeUrl(primary, ['detail', 'large']),
    },
    set: {
      id: card.set.setId,
      name: card.set.englishDisplayName ?? card.set.nativeName ?? card.set.setCode ?? card.set.setId,
    },
    localName: card.names.native,
    raw_data: {
      stackr: {
        cardId: card.cardId,
        defaultVariantId: card.defaultVariantId,
        variants: card.variants,
        canonical: true,
      },
      id: card.cardId,
      name,
      local_name: card.names.native,
      english_display_name: card.names.englishDisplay,
      number: card.collectorNumber.value,
      localId: card.collectorNumber.value,
      language: toLegacyLanguage(card.languageCode),
      rarity: card.rarity.label ?? card.rarity.code,
      images: {
        small: derivativeUrl(primary, ['card-grid', 'grid', 'search', 'small', 'thumb']),
        large: derivativeUrl(primary, ['detail', 'large']),
      },
      set: {
        id: card.set.setId,
        set_code: card.set.setCode,
        name: card.set.englishDisplayName ?? card.set.nativeName ?? card.set.setId,
        local_name: card.set.nativeName,
        english_display_name: card.set.englishDisplayName,
      },
    },
  };
}

async function allPages<T>(load: (cursor: string | null) => Promise<{ rows: T[]; nextCursor: string | null }>) {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const page = await load(cursor);
    rows.push(...page.rows);
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}

export async function fetchStackrSets(
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
) {
  if (!useStackrApi(client)) return legacySets(language);
  const apiLanguage = toStackrApiLanguage(language);
  const sets = await allPages<StackrSet>(async (cursor) => {
    const response = await client.sets({ language: apiLanguage ?? undefined, cursor, limit: 250 });
    return { rows: response.data.sets, nextCursor: response.meta.pagination?.nextCursor ?? null };
  });
  const setAssetTypes = ['set_logo', 'set_symbol', 'set_cover', 'set_artwork'] as const;
  const assets = (await Promise.all(setAssetTypes.map((assetType) => (
    allPages<StackrCatalogueAsset>(async (cursor) => {
      const response = await client.assetManifest({ assetType, cursor, limit: 500 });
      return { rows: response.data.assets, nextCursor: response.meta.pagination?.nextCursor ?? null };
    })
  )))).flat();
  return sets.map((set) => stackrSetToLegacySet(set, assets.filter((asset) => asset.setId === set.setId)));
}

export async function resolveStackrSetId(
  reference: string,
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
) {
  const value = String(reference ?? '').trim();
  if (!value) return null;
  if (!useStackrApi(client)) {
    const sets = await legacySets(language);
    const normalized = value.toLowerCase();
    const exact = sets.find((set) => (
      set.id.toLowerCase() === normalized
      || set.externalIds.setCode?.toLowerCase() === normalized
      || set.externalIds.legacy?.toLowerCase() === normalized
      || set.name.toLowerCase() === normalized
      || set.localName?.toLowerCase() === normalized
    ));
    return exact?.id ?? null;
  }
  if (UUID_PATTERN.test(value)) return value;
  const response = await client.sets({
    language: toStackrApiLanguage(language) ?? undefined,
    setCode: value,
    limit: 25,
  });
  const normalized = value.toLowerCase();
  const exact = response.data.sets.find((set) => (
    set.setCode?.toLowerCase() === normalized
    || set.setId.toLowerCase() === normalized
    || set.nativeName?.toLowerCase() === normalized
    || set.englishDisplayName?.toLowerCase() === normalized
  ));
  return (exact ?? response.data.sets[0])?.setId ?? null;
}

export async function fetchStackrCardsForSet(
  reference: string,
  language?: string | null,
  client: StackrApiClient = stackrApiClient,
) {
  if (!useStackrApi(client)) {
    const setId = await resolveStackrSetId(reference, language, client) ?? reference;
    const normalizedLanguage = language && language !== 'all' ? legacyLanguage(language) : null;
    let pokemonQuery = supabase.from('pokemon_cards').select('*').eq('set_id', setId).order('number', { ascending: true });
    let canonicalQuery = supabase.from('tcg_cards').select('*').eq('set_id', setId).order('collector_number', { ascending: true });
    if (normalizedLanguage) {
      pokemonQuery = pokemonQuery.eq('language', normalizedLanguage);
      canonicalQuery = canonicalQuery.eq('language', normalizedLanguage);
    }
    const [pokemonResult, canonicalResult] = await Promise.all([pokemonQuery, canonicalQuery]);
    const cards = [...(pokemonResult.data ?? []), ...(canonicalResult.data ?? [])].map(legacyRowToCard);
    const byId = new Map(cards.map((card) => [card.id, card]));
    if (!cards.length && pokemonResult.error && canonicalResult.error) throw pokemonResult.error;
    return [...byId.values()];
  }
  const setId = await resolveStackrSetId(reference, language, client);
  if (!setId) return [];
  const cards = await allPages<StackrCard>(async (cursor) => {
    const response = await client.setCards(setId, {
      language: toStackrApiLanguage(language) ?? undefined,
      cursor,
      limit: 250,
    });
    return { rows: response.data.cards, nextCursor: response.meta.pagination?.nextCursor ?? null };
  });
  const [assets, setResponse] = await Promise.all([
    allPages<StackrCatalogueAsset>(async (cursor) => {
      const response = await client.assetManifest({ setId, cursor, limit: 500 });
      return { rows: response.data.assets, nextCursor: response.meta.pagination?.nextCursor ?? null };
    }),
    client.set(setId),
  ]);
  return cards.map((card) => {
    const mapped = stackrCardToLegacyCard(card, assets);
    const rawSet = mapped.raw_data.set as Record<string, unknown>;
    rawSet.printedTotal = setResponse.data.set.printedTotal;
    rawSet.total = setResponse.data.set.total;
    rawSet.releaseDate = setResponse.data.set.releaseDate;
    rawSet.series = setResponse.data.set.seriesEnglishDisplayName ?? setResponse.data.set.seriesNativeName;
    return mapped;
  });
}

function cardResult(results: StackrSearchResult[]) {
  const exact = results.filter((result) => result.type === 'card' && EXACT_CARD_REASONS.has(result.reason) && result.card);
  const candidates = exact.length ? exact : results.filter((result) => result.type === 'card' && result.card);
  const identities = new Set(candidates.map((result) => `${result.cardId ?? ''}:${result.variantId ?? ''}`));
  return identities.size === 1 ? candidates[0] ?? null : null;
}

export async function resolveStackrCard(
  reference: string,
  options: { language?: string | null; setId?: string | null } = {},
  client: StackrApiClient = stackrApiClient,
): Promise<StackrResolvedCard | null> {
  const value = String(reference ?? '').trim();
  if (!value) return null;
  if (!useStackrApi(client)) {
    const exact = await legacyCardMap([value]);
    const exactCard = exact.get(value);
    const candidates = exactCard
      ? [exactCard]
      : await legacySearchCards(value, options.language, 10);
    const constrained = options.setId
      ? candidates.filter((card) => card.set.id === options.setId)
      : candidates;
    if (constrained.length !== 1) return null;
    const card = legacyCardToStackrCard(constrained[0]);
    return { card, variantId: card.defaultVariantId, matchedBy: 'exact_external_id' };
  }
  if (UUID_PATTERN.test(value)) {
    try {
      const response = await client.card(value);
      return { card: response.data.card, variantId: response.data.card.defaultVariantId, matchedBy: 'canonical_uuid' };
    } catch {
      // A UUID may be a variant ID; exact search resolves both printing and variant IDs.
    }
  }
  if (value.length < 2) return null;
  const response = await client.search({
    q: value,
    language: toStackrApiLanguage(options.language) ?? undefined,
    setId: options.setId && UUID_PATTERN.test(options.setId) ? options.setId : undefined,
    limit: 10,
  });
  const result = cardResult(response.data.results);
  if (!result?.card) return null;
  return {
    card: result.card,
    variantId: result.variantId ?? result.card.defaultVariantId,
    matchedBy: result.reason,
  };
}

export async function fetchStackrCard(
  reference: string,
  options: { language?: string | null; setId?: string | null } = {},
  client: StackrApiClient = stackrApiClient,
) {
  if (!useStackrApi(client)) {
    const exact = await legacyCardMap([reference]);
    const card = exact.get(reference);
    if (card) return card;
    const candidates = await legacySearchCards(reference, options.language, 10);
    const constrained = options.setId
      ? candidates.filter((candidate) => candidate.set.id === options.setId)
      : candidates;
    return constrained.length === 1 ? constrained[0] : null;
  }
  const resolved = await resolveStackrCard(reference, options, client);
  if (!resolved) return null;
  const assets = await client.assetManifest({ printingId: resolved.card.cardId, limit: 50 });
  return stackrCardToLegacyCard(resolved.card, assets.data.assets);
}

export function stackrLegacyCardToRow(card: StackrLegacyCard) {
  return {
    id: card.id,
    name: card.name,
    language: card.language,
    region: card.region,
    external_ids: card.externalIds,
    number: card.number,
    rarity: card.rarity ?? null,
    image_small: card.images.small ?? null,
    image_large: card.images.large ?? null,
    set_id: card.set.id,
    set_name: card.set.name,
    raw_data: card.raw_data,
  };
}

export async function fetchStackrCardRows(
  references: string[],
  options: { language?: string | null; concurrency?: number } = {},
  client: StackrApiClient = stackrApiClient,
) {
  const unique = [...new Set(references.map((value) => String(value ?? '').trim()).filter(Boolean))];
  if (!useStackrApi(client)) {
    const cards = await legacyCardMap(unique);
    return new Map([...cards.entries()].map(([reference, card]) => [reference, stackrLegacyCardToRow(card)]));
  }
  const byReference = new Map<string, ReturnType<typeof stackrLegacyCardToRow>>();
  const concurrency = Math.max(1, Math.min(10, options.concurrency ?? 6));
  for (let index = 0; index < unique.length; index += concurrency) {
    const batch = unique.slice(index, index + concurrency);
    const rows = await Promise.all(batch.map(async (reference) => {
      const card = await fetchStackrCard(reference, { language: options.language }, client).catch(() => null);
      return card ? { reference, row: stackrLegacyCardToRow(card) } : null;
    }));
    for (const result of rows) {
      if (!result) continue;
      byReference.set(result.reference, result.row);
      byReference.set(result.row.id, result.row);
    }
  }
  return byReference;
}

export async function fetchStackrSetRows(
  references: string[],
  options: { language?: string | null } = {},
  client: StackrApiClient = stackrApiClient,
) {
  const allSets = await fetchStackrSets(options.language, client);
  const byReference = new Map<string, StackrLegacySet>();
  for (const reference of references) {
    const normalized = String(reference ?? '').trim().toLowerCase();
    const set = allSets.find((candidate) => (
      candidate.id.toLowerCase() === normalized
      || candidate.externalIds.setCode?.toLowerCase() === normalized
      || candidate.name.toLowerCase() === normalized
      || candidate.localName?.toLowerCase() === normalized
    ));
    if (set) byReference.set(reference, set);
  }
  return byReference;
}

export type StackrLegacyPriceSnapshot = {
  card_id: string;
  variant_id: string;
  market_central: number | null;
  market_low: number | null;
  market_high: number | null;
  currency: string;
  evidence_status: StackrCardPrice['status'];
  confidence: StackrCardPrice['confidence'];
  sample_count: number;
  source_breakdown: Array<Record<string, unknown>>;
  snapshot_at: string | null;
  snapshot_date: string | null;
  stale_after: string | null;
};

export async function fetchStackrPriceSnapshots(
  references: string[],
  options: { language?: string | null; concurrency?: number } = {},
  client: StackrApiClient = stackrApiClient,
) {
  const unique = [...new Set(references.map((value) => String(value ?? '').trim()).filter(Boolean))];
  if (!useStackrApi(client)) {
    const byReference = new Map<string, StackrLegacyPriceSnapshot>();
    if (!unique.length) return byReference;
    const { data, error } = await supabase
      .from('market_price_snapshots')
      .select('*')
      .in('card_id', unique)
      .order('snapshot_at', { ascending: false });
    if (error) throw error;
    for (const row of data ?? []) {
      if (byReference.has(row.card_id)) continue;
      const central = Number(row.market_price_gbp ?? row.tcg_mid ?? row.ebay_average ?? NaN);
      const low = Number(row.low_price_gbp ?? row.tcg_low ?? row.ebay_low ?? NaN);
      const high = Number(row.high_price_gbp ?? row.ebay_high ?? NaN);
      const snapshot: StackrLegacyPriceSnapshot = {
        card_id: String(row.card_id),
        variant_id: String(row.variant_id ?? row.card_id),
        market_central: Number.isFinite(central) ? central : null,
        market_low: Number.isFinite(low) ? low : null,
        market_high: Number.isFinite(high) ? high : null,
        currency: String(row.currency ?? 'GBP'),
        evidence_status: Number.isFinite(central) ? 'market_estimate' : 'unavailable',
        confidence: {
          score: Number(row.confidence_score ?? 0),
          label: ['high', 'medium', 'low'].includes(row.confidence_label)
            ? row.confidence_label
            : 'insufficient_evidence',
        },
        sample_count: Number(row.comp_count ?? row.ebay_count ?? 0),
        source_breakdown: Array.isArray(row.source_breakdown) ? row.source_breakdown : [],
        snapshot_at: clean(row.calculated_at ?? row.snapshot_at),
        snapshot_date: clean(row.calculated_at ?? row.snapshot_at)?.slice(0, 10) ?? null,
        stale_after: clean(row.stale_after),
      };
      byReference.set(snapshot.card_id, snapshot);
      byReference.set(snapshot.variant_id, snapshot);
    }
    return byReference;
  }
  const byReference = new Map<string, StackrLegacyPriceSnapshot>();
  const concurrency = Math.max(1, Math.min(10, options.concurrency ?? 6));
  for (let index = 0; index < unique.length; index += concurrency) {
    const batch = unique.slice(index, index + concurrency);
    const rows = await Promise.all(batch.map(async (reference) => {
      const result = await fetchStackrPrice(reference, { language: options.language, currency: 'GBP' }, client).catch(() => null);
      if (!result) return null;
      const price = result.price;
      const snapshot: StackrLegacyPriceSnapshot = {
        card_id: result.resolved.card.cardId,
        variant_id: result.resolved.variantId,
        market_central: price.estimates.central,
        market_low: price.estimates.low,
        market_high: price.estimates.high,
        currency: price.currency,
        evidence_status: price.status,
        confidence: price.confidence,
        sample_count: price.sample.total,
        source_breakdown: price.sourceBreakdown,
        snapshot_at: price.calculatedAt,
        snapshot_date: price.calculatedAt?.slice(0, 10) ?? null,
        stale_after: price.staleAfter,
      };
      return { reference, snapshot };
    }));
    for (const result of rows) {
      if (!result) continue;
      byReference.set(result.reference, result.snapshot);
      byReference.set(result.snapshot.card_id, result.snapshot);
      byReference.set(result.snapshot.variant_id, result.snapshot);
    }
  }
  return byReference;
}

export async function searchStackrCards(
  query: string,
  options: { language?: string | null; setId?: string | null; limit?: number } = {},
  client: StackrApiClient = stackrApiClient,
) {
  const value = String(query ?? '').trim();
  if (value.length < 2) return [];
  if (!useStackrApi(client)) {
    const cards = await legacySearchCards(value, options.language, options.limit ?? 40);
    return options.setId ? cards.filter((card) => card.set.id === options.setId) : cards;
  }
  const response = await client.search({
    q: value,
    language: toStackrApiLanguage(options.language) ?? undefined,
    setId: options.setId && UUID_PATTERN.test(options.setId) ? options.setId : undefined,
    limit: Math.max(1, Math.min(100, options.limit ?? 40)),
  });
  const cards = response.data.results.filter((result) => result.type === 'card' && result.card);
  const printingIds = [...new Set(cards.map((result) => result.card!.cardId))];
  const assets = await Promise.all(printingIds.map(async (printingId) => {
    const manifest = await client.assetManifest({ printingId, limit: 20 });
    return manifest.data.assets;
  }));
  const assetsByPrinting = new Map(printingIds.map((id, index) => [id, assets[index]]));
  return cards.map((result) => stackrCardToLegacyCard(result.card!, assetsByPrinting.get(result.card!.cardId) ?? []));
}

export async function fetchStackrPrice(
  reference: string,
  options: {
    language?: string | null;
    setId?: string | null;
    productType?: 'raw_card' | 'graded_card' | 'sealed_product';
    currency?: string;
    condition?: string | null;
    grader?: string | null;
    grade?: string | number | null;
  } = {},
  client: StackrApiClient = stackrApiClient,
): Promise<{ resolved: StackrResolvedCard; price: StackrCardPrice } | null> {
  const resolved = await resolveStackrCard(reference, { language: options.language, setId: options.setId }, client);
  if (!resolved) return null;
  if (!useStackrApi(client)) {
    const snapshots = await fetchStackrPriceSnapshots([reference, resolved.card.cardId], {
      language: options.language,
    }, client);
    const snapshot = snapshots.get(reference) ?? snapshots.get(resolved.card.cardId);
    const hasEstimate = snapshot?.market_central != null;
    return {
      resolved,
      price: {
        variantId: resolved.variantId,
        productType: options.productType ?? 'raw_card',
        identityKey: null,
        currency: snapshot?.currency ?? options.currency ?? 'GBP',
        status: hasEstimate ? 'market_estimate' : 'unavailable',
        priceType: hasEstimate ? 'market_estimate' : 'unavailable',
        estimates: {
          low: snapshot?.market_low ?? null,
          central: snapshot?.market_central ?? null,
          high: snapshot?.market_high ?? null,
        },
        sample: {
          total: snapshot?.sample_count ?? 0,
          sold: 0,
          active: 0,
          sources: snapshot?.source_breakdown.length ?? 0,
          dateRange: { from: snapshot?.snapshot_at ?? null, to: snapshot?.snapshot_at ?? null },
        },
        confidence: snapshot?.confidence ?? { score: 0, label: 'insufficient_evidence' },
        freshness: 'unknown',
        sourceBreakdown: snapshot?.source_breakdown ?? [],
        outliers: {},
        fallbackEstimate: null,
        unavailableReason: hasEstimate ? null : 'legacy_snapshot_unavailable',
        calculatedAt: snapshot?.snapshot_at ?? null,
        staleAfter: snapshot?.stale_after ?? null,
        estimateVersion: 'legacy-read-adapter-v1',
      },
    };
  }
  const response = await client.cardPrice(resolved.variantId, {
    productType: options.productType,
    currency: options.currency ?? 'GBP',
    condition: clean(options.condition) ?? undefined,
    grader: clean(options.grader) ?? undefined,
    grade: clean(options.grade) ?? undefined,
  });
  return { resolved, price: response.data };
}
