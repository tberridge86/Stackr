import { Image, InteractionManager } from 'react-native';
import { PRICE_API_URL } from './config';
import { resolvePokeDataJapaneseSetCode } from './pokedataJapaneseSetIdentity';
import {
  getEnglishCardDisplayName,
  getEnglishSetDisplayName,
  getLocalCardName,
  getPreferredCardDisplayName,
  getLocalSetName,
  getPreferredSetDisplayName,
} from './pokemonDisplayNames';
import {
  getCuratedPokemonCardById,
  getCuratedPokemonCardsForSet,
  getCuratedPokemonSets,
} from './curatedPokemonCatalogue';
import { supabase } from './supabase';
import {
  fetchPreferredStackrCardsForReferences,
  fetchPreferredStackrSets,
  fetchStackrCard,
  fetchStackrCardsForSet,
  fetchStackrSets,
  searchStackrCards,
  type StackrLegacyCard,
  type StackrLegacySet,
} from './stackrDomainAdapter';
import {
  getPokemonSetLanguageFromPrefixedId,
  stripPokemonSetLanguagePrefix,
} from './pokemonSetIdentity';
import { cacheNonEmptyCatalogueRows, readNonEmptyCatalogueRows } from './resilientCatalogueRead';
import {
  fetchForeignPokemonCard,
  fetchForeignPokemonSet,
  invalidateForeignPokemonSetReferenceCache,
  type ForeignPokemonCardBrief,
} from './foreignPokemon';
import {
  defineTcgdexRuntimeImageOverlay,
  enforceTcgdexRuntimeImagePolicy,
  isTcgdexControlledCardReferenceSourceEnabled,
} from './tcgdexControlledCardReference';
import {
  getTcgdexControlledReferenceLookupIdentity,
  matchTcgdexProviderCardFromLiveSet,
  normalizeTcgdexCollectorIdentity,
  type TcgdexControlledReferenceLanguage,
  type TcgdexControlledReferenceLookupIdentity,
} from './tcgdexControlledReferenceLookup';

export type PokemonSet = {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  language?: PokemonCardLanguage;
  region?: string | null;
  localName?: string | null;
  englishDisplayName?: string | null;
  externalIds?: Record<string, any>;
  images?: {
    symbol?: string;
    logo?: string;
    cover?: string;
    artwork?: string;
  };
};

export type PokemonCardLanguage =
  | 'en'
  | 'fr'
  | 'es'
  | 'it'
  | 'pt-br'
  | 'de'
  | 'ja'
  | 'zh-cn'
  | 'zh-tw'
  | 'ko'
  | 'id'
  | 'th';

export type PokemonCard = {
  id: string;
  name: string;
  number: string;
  language?: PokemonCardLanguage;
  region?: string | null;
  externalIds?: Record<string, any>;
  rarity?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set?: { id?: string; name?: string; series?: string };
  tcgplayer?: { prices?: Record<string, any> };
  cardmarket?: { prices?: Record<string, any> };
  artist?: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  flavorText?: string;
  rules?: string[];
  attacks?: any[];
  weaknesses?: any[];
  resistances?: any[];
  retreatCost?: string[];
  raw_data?: any;
  localName?: string | null;
  imageStatus?: string | null;
  pricingStatus?: string | null;
  pricing?: {
    displayPrice?: number | null;
    currency?: string | null;
    originalPrice?: number | null;
    originalCurrency?: string | null;
    priceType?: string | null;
    confidence?: string | null;
    updatedAt?: string | null;
    provider?: string | null;
    pricingStatus?: string | null;
    sourceLabel?: string | null;
  } | null;
};

const POKEMON_TCG_IMAGE_BASE_URL = 'https://images.pokemontcg.io';
const POKEMON_TCG_API_BASE_URL = 'https://api.pokemontcg.io/v2';
const SCRYDEX_IMAGE_BASE_URL = 'https://images.scrydex.com/pokemon';
const POKEDATA_API_BASE_URL = 'https://www.pokedata.io';
const POKEMON_SET_CACHE_TTL_MS = 10 * 60 * 1000;
const POKEMON_SET_CARDS_CACHE_TTL_MS = 10 * 60 * 1000;
const POKEMON_TCG_API_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const POKEDATA_CACHE_TTL_MS = 10 * 60 * 1000;

type PokemonSetLanguageFilter = PokemonCardLanguage | 'all';
type FetchAllSetsOptions = {
  language?: PokemonSetLanguageFilter | string | null;
  preferCanonicalApi?: boolean;
};
type FetchCardsForSetOptions = {
  language?: PokemonCardLanguage | string | null;
  preferCanonicalApi?: boolean;
};

let allSetsCache = new Map<string, { expiresAt: number; value: PokemonSet[] }>();
let allSetsInflight = new Map<string, Promise<PokemonSet[]>>();
const cardsForSetCache = new Map<string, { expiresAt: number; value: PokemonCard[] }>();
const cardsForSetInflight = new Map<string, Promise<PokemonCard[]>>();

/** Reload metadata and approved runtime image references after an explicit retry. */
export function invalidatePokemonCatalogueCardCaches() {
  cardsForSetCache.clear();
  invalidateForeignPokemonSetReferenceCache();
}
const pokemonTcgApiSearchCache = new Map<string, { expiresAt: number; value: PokemonCard[] }>();
const pokemonTcgApiSearchInflight = new Map<string, Promise<PokemonCard[]>>();
let pokeDataSetsCache: { expiresAt: number; value: any[] } | null = null;
let pokeDataSetsInflight: Promise<any[]> | null = null;
const prefetchedSetLogoUrls = new Set<string>();
const approvedSetAssets = new Map<string, PokemonSet['images']>();
const approvedCardAssets = new Map<string, PokemonCard['images']>();

function mergeApprovedSetImages(
  existing: PokemonSet['images'],
  incoming: PokemonSet['images'],
): PokemonSet['images'] {
  return {
    symbol: incoming?.symbol ?? existing?.symbol,
    logo: incoming?.logo ?? existing?.logo,
    cover: incoming?.cover ?? existing?.cover,
    artwork: incoming?.artwork ?? existing?.artwork,
  };
}

function rememberApprovedSetAssets(set: PokemonSet) {
  const key = getSetIdentityKey(set.id, set.language);
  const normalizedSetId = normalizeSetId(set.id);
  const merged = mergeApprovedSetImages(
    approvedSetAssets.get(key) ?? approvedSetAssets.get(normalizedSetId),
    set.images,
  );
  approvedSetAssets.set(key, merged);
  approvedSetAssets.set(normalizedSetId, merged);
}

function rememberApprovedCardAssets(card: PokemonCard) {
  approvedCardAssets.set(card.id, card.images ?? {});
}

function fromStackrSet(set: StackrLegacySet): PokemonSet {
  const mapped = set as PokemonSet;
  rememberApprovedSetAssets(mapped);
  return mapped;
}

function fromStackrCard(card: StackrLegacyCard): PokemonCard {
  const mapped = card as PokemonCard;
  rememberApprovedCardAssets(mapped);
  return mapped;
}

/**
 * Fill display-only gaps from an exact, current provider card record. The
 * issued low reference is kept only on the returned in-memory model.
 */
export async function attachLiveTcgdexCardReferences<T extends PokemonCard>(cards: T[], maxSetRequests = 8): Promise<T[]> {
  if (!isTcgdexControlledCardReferenceSourceEnabled()) return cards;
  type LookupEntry = { card: PokemonCard; identity: TcgdexControlledReferenceLookupIdentity };
  type LookupGroup = { language: TcgdexControlledReferenceLanguage; providerSetId: string; entries: LookupEntry[] };
  const groups = new Map<string, LookupGroup>();
  for (const card of cards) {
    if (card.images?.small || card.images?.large) continue;
    const language = normalizePokemonCardLanguage(card.language);
    if (language !== 'ja' && language !== 'zh-tw' && language !== 'zh-cn') continue;
    const identity = getTcgdexControlledReferenceLookupIdentity(card, language);
    if (!identity) continue;
    const key = `${language}:${identity.providerSetId}`;
    const group = groups.get(key) ?? { language, providerSetId: identity.providerSetId, entries: [] };
    group.entries.push({ card, identity }); groups.set(key, group);
  }
  const selectedGroups = [...groups.values()].slice(0, Math.max(0, Math.floor(maxSetRequests)));
  if (!selectedGroups.length) return cards;
  const liveUrisByCard = new Map<PokemonCard, string>();
  const pendingDetails = new Map<string, { language: TcgdexControlledReferenceLanguage; providerCardId: string; entries: LookupEntry[] }>();
  const liveReferenceUri = (reference: ForeignPokemonCardBrief, identity: TcgdexControlledReferenceLookupIdentity, language: TcgdexControlledReferenceLanguage) => {
    const descriptor = reference.controlledReference;
    if (reference.language !== language || !descriptor || descriptor.sourceCode !== 'tcgdex'
      || descriptor.providerCardId !== reference.providerCardId || descriptor.providerSetId !== identity.providerSetId
      || normalizeTcgdexCollectorIdentity(descriptor.localId) !== identity.collectorKey
      || (identity.providerCardId && descriptor.providerCardId !== identity.providerCardId)) return null;
    return enforceTcgdexRuntimeImagePolicy(reference.imageSmall);
  };
  const queueDetail = (entry: LookupEntry, providerCardId: string, language: TcgdexControlledReferenceLanguage) => {
    const key = `${language}:${providerCardId}`;
    const pending = pendingDetails.get(key) ?? { language, providerCardId, entries: [] };
    pending.entries.push({ card: entry.card, identity: { ...entry.identity, providerCardId } }); pendingDetails.set(key, pending);
  };
  await Promise.all(selectedGroups.map(async (group) => {
    const set = await fetchForeignPokemonSet(group.providerSetId, { language: group.language }).catch(() => null);
    const exactSet = set && set.language === group.language && (set.providerSetId ?? set.id) === group.providerSetId ? set : null;
    for (const entry of group.entries) {
      const candidate = matchTcgdexProviderCardFromLiveSet(entry.identity, exactSet?.cards ?? [], group.language);
      if (candidate) {
        const identity = { ...entry.identity, providerCardId: candidate.providerCardId };
        const uri = liveReferenceUri(candidate, identity, group.language);
        if (uri) { liveUrisByCard.set(entry.card, uri); continue; }
        queueDetail(entry, candidate.providerCardId, group.language);
      } else if (entry.identity.providerCardId) queueDetail(entry, entry.identity.providerCardId, group.language);
    }
  }));
  await Promise.all([...pendingDetails.values()].slice(0, Math.min(24, cards.length, selectedGroups.length * 8)).map(async (pending) => {
    const reference = await fetchForeignPokemonCard(pending.providerCardId, { language: pending.language }).catch(() => null);
    if (!reference) return;
    for (const entry of pending.entries) { const uri = liveReferenceUri(reference, entry.identity, pending.language); if (uri) liveUrisByCard.set(entry.card, uri); }
  }));
  return cards.map((card) => {
    const uri = liveUrisByCard.get(card); if (!uri) return card;
    const displayCard = { ...card, images: { small: uri, large: card.images?.large }, imageStatus: card.images?.large ? card.imageStatus : 'provider_reference_low' } as T;
    return defineTcgdexRuntimeImageOverlay(displayCard, 'images', displayCard.images, uri) as T;
  });
}

const SET_ID_ALIASES: Record<string, string> = {
  'destined rivals': 'sv10',
  'destined-rivals': 'sv10',
  destinedrivals: 'sv10',
  'phantasmal flames': 'me2',
  'phantasmal-flames': 'me2',
  phantasmalflames: 'me2',
  'perfect order': 'me3',
  'perfect-order': 'me3',
  perfectorder: 'me3',
  'perect order': 'me3',
  'perect-order': 'me3',
  perectorder: 'me3',
  'pitch black': 'me5',
  'pitch-black': 'me5',
  pitchblack: 'me5',
  me05: 'me5',
};

const KNOWN_SET_OVERRIDES: PokemonSet[] = [
  {
    id: 'me5',
    name: 'Pitch Black',
    series: 'Mega Evolution',
    printedTotal: 120,
    total: 120,
    releaseDate: '2026/07/17',
    language: 'en',
    region: 'US',
    externalIds: {
      pokemonTcg: 'me5',
      setCode: 'ME05',
    },
    images: {
      symbol: `${SCRYDEX_IMAGE_BASE_URL}/me5-symbol/symbol`,
      logo: `${SCRYDEX_IMAGE_BASE_URL}/me5-logo/logo`,
    },
  },
];

function normalizeSetId(setId?: string | null) {
  const normalized = String(setId ?? '').trim().toLowerCase();
  if (!normalized) return normalized;

  const spaced = normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const dashed = spaced.replace(/\s+/g, '-');
  const compact = spaced.replace(/\s+/g, '');

  return SET_ID_ALIASES[normalized]
    ?? SET_ID_ALIASES[spaced]
    ?? SET_ID_ALIASES[dashed]
    ?? SET_ID_ALIASES[compact]
    ?? dashed;
}

export function normalizePokemonSetId(setId?: string | null) {
  return normalizeSetId(setId);
}

export function getKnownPokemonSetTotal(setId?: string | null, language?: string | null) {
  const normalizedSetId = normalizeSetId(setId);
  if (!normalizedSetId) return null;

  const normalizedLanguage = language ? normalizePokemonCardLanguage(language) : 'en';
  const override = KNOWN_SET_OVERRIDES.find((set) =>
    normalizeSetId(set.id) === normalizedSetId &&
    (!set.language || normalizedLanguage === 'en' || normalizePokemonCardLanguage(set.language) === normalizedLanguage)
  );
  const total = Number(override?.printedTotal ?? override?.total ?? 0);
  return total > 0 ? total : null;
}

function uniqueNonEmpty(values: (string | null | undefined)[]) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

export function getPokemonSetIdLookupCandidates(setId: string, language: PokemonCardLanguage) {
  const raw = String(setId ?? '').trim();
  const normalized = normalizeSetId(raw);
  const stripped = stripPokemonSetLanguagePrefix(raw);
  const normalizedStripped = normalizeSetId(stripped);
  const upperStripped = stripped.toUpperCase();
  const upperNormalizedStripped = normalizedStripped.toUpperCase();

  if (language === 'en') {
    return uniqueNonEmpty([raw, stripped, normalizedStripped]);
  }

  return uniqueNonEmpty([
    raw,
    normalized,
    stripped,
    normalizedStripped,
    upperStripped,
    upperNormalizedStripped,
    `${language}:${stripped}`,
    `${language}:${normalizedStripped}`,
    `${language}:${upperStripped}`,
    `${language}:${upperNormalizedStripped}`,
  ]);
}

function stripSetLanguagePrefix(setId?: string | null) {
  return stripPokemonSetLanguagePrefix(setId);
}

function getSetIdentityKey(setId?: string | null, language?: string | null) {
  return `${normalizePokemonCardLanguage(language)}:${normalizeSetId(stripSetLanguagePrefix(setId))}`;
}

export function inferPokemonSetLanguage(setId?: string | null, language?: string | null): PokemonCardLanguage {
  if (language) return normalizePokemonCardLanguage(language);
  const raw = String(setId ?? '').trim().toLowerCase();
  const prefixedLanguage = getPokemonSetLanguageFromPrefixedId(raw);
  if (prefixedLanguage) return prefixedLanguage;
  if (raw.startsWith('ja:') || raw.startsWith('jp:')) return 'ja';
  if (/^(pokedata|pd):/i.test(raw)) return 'ja';
  if (/^sv\d+[a-z]$/i.test(stripSetLanguagePrefix(raw))) return 'ja';
  return 'en';
}

function isPokeDataSetId(setId?: string | null) {
  return /^(?:(?:en|ja|jp|jpn|zh-cn|zh_cn|zhcn|zh-hans|zh_hans|zhhans|zh-sg|zh_sg|zhsg|zh-tw|zh_tw|zhtw|zh-hant|zh_hant|zhhant|zh):)?(?:pokedata|pd):/i.test(String(setId ?? '').trim());
}

function getPokeDataNumericId(setId?: string | null) {
  const match = String(setId ?? '').trim().match(/^(?:(?:en|ja|jp|jpn|zh-cn|zh_cn|zhcn|zh-hans|zh_hans|zhhans|zh-sg|zh_sg|zhsg|zh-tw|zh_tw|zhtw|zh-hant|zh_hant|zhhant|zh):)?(?:pokedata|pd):(\d+)$/i);
  return match ? match[1] : null;
}

function normalizePokeDataText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/\bjapanese\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPokeDataSetName(value?: string | null) {
  return String(value ?? '').trim().replace(/\s+Japanese$/i, '').trim();
}

const POKEDATA_CARD_FINISH_PATTERNS: { key: string; suffix: RegExp }[] = [
  { key: 'reverseHoloEnergy', suffix: /\s+energy symbol pattern holofoil$/i },
  { key: 'reverseHoloPokeball', suffix: /\s+pok[eé]\s*ball pattern holofoil$/i },
  { key: 'speckledHolofoil', suffix: /\s+(?:speckled|star pattern|stars?)\s+holofoil$/i },
  { key: 'lineHolofoil', suffix: /\s+(?:line|prism|cracked ice)\s+holofoil$/i },
  { key: 'masterBallPatternHolofoil', suffix: /\s+master ball pattern holofoil$/i },
  { key: 'quickBallPatternHolofoil', suffix: /\s+quick ball pattern holofoil$/i },
  { key: 'loveBallPatternHolofoil', suffix: /\s+love ball pattern holofoil$/i },
  { key: 'duskBallPatternHolofoil', suffix: /\s+dusk ball pattern holofoil$/i },
  { key: 'friendBallPatternHolofoil', suffix: /\s+friend ball pattern holofoil$/i },
  { key: 'stampedHolofoil', suffix: /\s+(?:stamped|stamp|logo stamp)(?:\s+holofoil)?$/i },
  { key: 'reverseHolofoil', suffix: /\s+reverse(?:\s+holofoil)?$/i },
  { key: 'holofoil', suffix: /\s+holofoil$/i },
  { key: 'holofoil', suffix: /\s+holo$/i },
  { key: 'normal', suffix: /\s+non[-\s]?holo$/i },
];

function getPokeDataLanguage(value?: string | null): PokemonCardLanguage {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'JAPANESE') return 'ja';
  if (raw === 'CHINESE') return 'zh-tw';
  return normalizePokemonCardLanguage(value);
}

function getPokeDataLanguageLabel(language: PokemonCardLanguage) {
  if (language === 'ja') return 'JAPANESE';
  if (language === 'zh-tw') return 'CHINESE';
  return 'ENGLISH';
}

function getPokeDataRegion(language: PokemonCardLanguage) {
  if (language === 'ja') return 'JP';
  if (language === 'zh-tw') return 'TW';
  return 'US';
}

function getPokeDataCardVariantKey(value?: string | null) {
  const name = String(value ?? '').trim();
  if (!name) return 'normal';
  return POKEDATA_CARD_FINISH_PATTERNS.find((entry) => entry.suffix.test(name))?.key ?? 'normal';
}

function stripPokeDataCardFinish(value?: string | null) {
  let name = String(value ?? '').trim();
  for (const entry of POKEDATA_CARD_FINISH_PATTERNS) {
    name = name.replace(entry.suffix, '').trim();
  }
  return name;
}

function normalizePokeDataDate(value?: string | null) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return String(value ?? '').trim();
  return date.toISOString().slice(0, 10);
}

function getPokeDataSetId(set: any) {
  const language = getPokeDataLanguage(set?.language);
  const sourceId = String(set?.id ?? '').trim();
  const code = String(set?.code ?? '').trim();
  const effectiveCode = language === 'ja'
    ? resolvePokeDataJapaneseSetCode(sourceId, code).effectiveCode
    : code || null;
  if (effectiveCode) {
    const normalizedCode = normalizeSetId(effectiveCode);
    return language === 'zh-tw' ? `zh-tw:${normalizedCode}` : normalizedCode;
  }
  return language === 'zh-tw' ? `zh-tw:pokedata:${set?.id}` : `pokedata:${set?.id}`;
}

function getPokeDataStatAverage(card: any, source: number) {
  const stat = Array.isArray(card?.stats)
    ? card.stats.find((entry: any) => Number(entry?.source) === source)
    : null;
  const value = Number(stat?.avg);
  return Number.isFinite(value) ? value : null;
}

async function fetchPokeDataSets(): Promise<any[]> {
  if (pokeDataSetsCache && pokeDataSetsCache.expiresAt > Date.now()) {
    return pokeDataSetsCache.value;
  }

  if (pokeDataSetsInflight) return pokeDataSetsInflight;

  pokeDataSetsInflight = (async () => {
    const response = await fetch(`${POKEDATA_API_BASE_URL}/api/sets`, {
      headers: { Accept: 'application/json' },
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(json)) {
      throw new Error(`PokeData set fetch failed: ${response.status}`);
    }
    const sets = json.filter((set: any) => String(set?.tcg ?? '').toLowerCase() === 'pokemon');
    pokeDataSetsCache = {
      expiresAt: Date.now() + POKEDATA_CACHE_TTL_MS,
      value: sets,
    };
    return sets;
  })();

  try {
    return await pokeDataSetsInflight;
  } finally {
    pokeDataSetsInflight = null;
  }
}

export function normalizePokemonCardLanguage(language?: string | null): PokemonCardLanguage {
  const cleaned = String(language ?? 'en').trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
  const aliases: Record<string, PokemonCardLanguage> = {
    english: 'en',
    eng: 'en',
    france: 'fr',
    french: 'fr',
    francais: 'fr',
    français: 'fr',
    spanish: 'es',
    espanol: 'es',
    español: 'es',
    italian: 'it',
    deutsch: 'de',
    german: 'de',
    portuguese: 'pt-br',
    portugues: 'pt-br',
    'português': 'pt-br',
    pt: 'pt-br',
    ptbr: 'pt-br',
    'pt_br': 'pt-br',
    jp: 'ja',
    jpn: 'ja',
    japanese: 'ja',
    japan: 'ja',
    'zh-cn': 'zh-cn',
    'zh-hans': 'zh-cn',
    simplified: 'zh-cn',
    'simplified-chinese': 'zh-cn',
    zh: 'zh-tw',
    zhtw: 'zh-tw',
    'zh_tw': 'zh-tw',
    chinese: 'zh-tw',
    'traditional-chinese': 'zh-tw',
    'chinese-traditional': 'zh-tw',
    'cn-traditional': 'zh-tw',
    tw: 'zh-tw',
    taiwan: 'zh-tw',
    ko: 'ko',
    kr: 'ko',
    korean: 'ko',
    indonesian: 'id',
    thai: 'th',
  };
  const aliased = aliases[cleaned] ?? cleaned;
  const supported: readonly PokemonCardLanguage[] = ['en', 'fr', 'es', 'it', 'pt-br', 'de', 'ja', 'zh-cn', 'zh-tw', 'ko', 'id', 'th'];
  return supported.includes(aliased as PokemonCardLanguage) ? aliased as PokemonCardLanguage : 'en';
}

export function getPokemonCardLanguageLabel(language?: string | null) {
  const normalized = normalizePokemonCardLanguage(language);
  const labels: Record<PokemonCardLanguage, string> = {
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    it: 'Italian',
    'pt-br': 'Portuguese',
    de: 'German',
    ja: 'Japanese',
    'zh-cn': 'Simplified Chinese',
    'zh-tw': 'Traditional Chinese',
    ko: 'Korean',
    id: 'Indonesian',
    th: 'Thai',
  };
  return labels[normalized] ?? normalized.toUpperCase();
}

function normalizeSetLanguageFilter(language?: string | null): PokemonSetLanguageFilter {
  const cleaned = String(language ?? 'en').trim().toLowerCase();
  if (cleaned === 'all') return 'all';
  return normalizePokemonCardLanguage(cleaned);
}

function mapPokeDataSet(set: any): PokemonSet {
  const language = getPokeDataLanguage(set?.language);
  const pokedataId = String(set?.id ?? '').trim();
  const setCode = language === 'ja'
    ? resolvePokeDataJapaneseSetCode(pokedataId, set?.code).effectiveCode ?? ''
    : String(set?.code ?? '').trim();
  const setId = getPokeDataSetId(set);
  const displayFallback = cleanPokeDataSetName(set?.name) || setId;
  const englishDisplayName = getEnglishSetDisplayName({
    id: setId,
    sourceId: pokedataId,
    setCode: setCode || setId,
    language,
    localName: set?.name ?? null,
    fallbackName: displayFallback,
    raw: set,
  }) ?? displayFallback;
  const name = getPreferredSetDisplayName({
    id: setId,
    sourceId: pokedataId,
    setCode: setCode || setId,
    language,
    localName: set?.name ?? null,
    englishDisplayName,
    fallbackName: displayFallback,
    raw: set,
  });

  return {
    id: setId,
    name,
    series: String(set?.series ?? ''),
    printedTotal: 0,
    total: 0,
    releaseDate: normalizePokeDataDate(set?.release_date),
    language,
    region: getPokeDataRegion(language),
    localName: String(set?.name ?? '').trim() || null,
    englishDisplayName,
    externalIds: {
      pokedata: pokedataId,
      setCode: setCode || undefined,
    },
    images: {
      symbol: String(set?.symbol_img_url ?? '').trim() || undefined,
      logo: String(set?.img_url ?? '').trim() || undefined,
      cover: String(set?.banner_img_url ?? set?.tile_img_url ?? '').trim() || undefined,
      artwork: String(set?.tile_img_url ?? set?.banner_img_url ?? '').trim() || undefined,
    },
  };
}

async function fetchPokeDataJapaneseSets(): Promise<PokemonSet[] | null> {
  const sets = await fetchPokeDataSets();
  return sets
    .filter((set) => String(set?.language ?? '').toUpperCase() === 'JAPANESE')
    .map(mapPokeDataSet);
}

async function fetchPokeDataChineseSets(): Promise<PokemonSet[] | null> {
  const sets = await fetchPokeDataSets();
  return sets
    .filter((set) => String(set?.language ?? '').toUpperCase() === 'CHINESE')
    .map(mapPokeDataSet);
}

async function findPokeDataSetForLookup(setId: string, language: PokemonCardLanguage) {
  if (!['ja', 'zh-tw'].includes(language) && !isPokeDataSetId(setId)) return null;

  const numericId = getPokeDataNumericId(setId);
  const rawLookup = stripSetLanguagePrefix(setId);
  const lookupCandidates = new Set([
    normalizeSetId(setId),
    normalizeSetId(rawLookup),
    normalizePokeDataText(setId),
    normalizePokeDataText(rawLookup),
  ].filter(Boolean));

  const sets = await fetchPokeDataSets();
  const targetLanguage = getPokeDataLanguageLabel(language);
  const languageSets = sets.filter((set) => String(set?.language ?? '').toUpperCase() === targetLanguage);
  if (numericId) {
    const byId = languageSets.find((set) => String(set?.id ?? '') === numericId);
    if (byId) return byId;
  }

  return languageSets.find((set) => {
    const code = String(set?.code ?? '').trim();
    const names = [
      getPokeDataSetId(set),
      code,
      set?.name,
      cleanPokeDataSetName(set?.name),
    ];
    return names.some((name) =>
      lookupCandidates.has(normalizeSetId(name)) || lookupCandidates.has(normalizePokeDataText(name))
    );
  }) ?? null;
}

function mapPokeDataCard(card: any, set: any, fallbackSetId: string): PokemonCard {
  const language = getPokeDataLanguage(card?.language ?? set?.language);
  const region = getPokeDataRegion(language);
  const setId = language === 'ja' || language === 'zh-tw' || isPokeDataSetId(fallbackSetId)
    ? getPokeDataSetId(set)
    : stripSetLanguagePrefix(fallbackSetId);
  const setName = cleanPokeDataSetName(set?.name) || card?.set_name || setId;
  const rawPrice = getPokeDataStatAverage(card, 0);
  const tcgPlayerPrice = getPokeDataStatAverage(card, 11);
  const ebayPrice = getPokeDataStatAverage(card, 12);
  const displayPrice = rawPrice ?? ebayPrice ?? tcgPlayerPrice;
  const sourceCardId = String(card?.id ?? '').trim();
  const cardId = language === 'ja' ? `pokedata:${sourceCardId}` : `${language}:pokedata:${sourceCardId}`;
  const englishDisplayName = String(card?.name ?? '').trim() || null;
  const variantKey = getPokeDataCardVariantKey(englishDisplayName);
  const displayName = stripPokeDataCardFinish(englishDisplayName) || englishDisplayName;
  const name = getPreferredCardDisplayName({
    id: cardId,
    sourceId: String(card?.id ?? ''),
    setId,
    collectorNumber: card?.num ?? null,
    language,
    localName: null,
    englishDisplayName: displayName,
    fallbackName: displayName ?? cardId,
    raw: card,
  });
  const normalPrice = tcgPlayerPrice ?? rawPrice ?? ebayPrice ?? undefined;

  return {
    id: cardId,
    name,
    localName: null,
    number: String(card?.num ?? ''),
    language,
    region,
    externalIds: {
      pokedata: String(card?.id ?? ''),
    },
    rarity: card?.secret ? 'Secret Rare' : undefined,
    images: {
      small: String(card?.img_url ?? '').trim() || undefined,
      large: String(card?.img_url ?? '').trim() || undefined,
    },
    imageStatus: card?.img_url ? 'available' : null,
    pricingStatus: displayPrice == null ? 'missing' : 'available',
    pricing: displayPrice == null ? null : {
      displayPrice,
      currency: 'USD',
      originalPrice: displayPrice,
      originalCurrency: 'USD',
      priceType: rawPrice != null ? 'raw_average' : ebayPrice != null ? 'ebay_average' : 'tcgplayer_average',
      confidence: 'medium',
      provider: 'pokedata',
      pricingStatus: 'available',
      sourceLabel: rawPrice != null ? 'PokeData raw average' : ebayPrice != null ? 'PokeData eBay average' : 'PokeData TCGPlayer average',
    },
    set: {
      id: setId,
      name: setName,
      series: String(set?.series ?? ''),
    },
    tcgplayer: normalPrice == null ? undefined : {
      prices: {
        [variantKey]: {
          market: normalPrice,
          mid: rawPrice ?? normalPrice,
          low: rawPrice ?? normalPrice,
        },
      },
    },
    raw_data: {
      ...card,
      provider: 'pokedata',
      source_id: String(card?.id ?? ''),
      provider_card_id: String(card?.id ?? ''),
      pokedata_variant: variantKey,
      name,
      local_name: null,
      english_display_name: displayName,
      original_english_display_name: englishDisplayName,
      number: String(card?.num ?? ''),
      localId: String(card?.num ?? ''),
      language,
      region,
      images: {
        small: String(card?.img_url ?? '').trim() || null,
        large: String(card?.img_url ?? '').trim() || null,
      },
      pokedata_stats: {
        raw_average: rawPrice,
        tcgplayer_average: tcgPlayerPrice,
        ebay_average: ebayPrice,
      },
      tcgplayer: normalPrice == null ? undefined : {
        prices: {
          [variantKey]: {
            market: normalPrice,
            mid: rawPrice ?? normalPrice,
            low: rawPrice ?? normalPrice,
          },
        },
      },
      set: {
        id: setId,
        name: setName,
        local_name: String(set?.name ?? '').trim() || null,
        english_display_name: setName,
        set_code: String(set?.code ?? '').trim() || null,
        source_id: String(set?.id ?? ''),
        provider: 'pokedata',
        language,
        region,
      },
    },
  };
}

async function fetchPokeDataCardsForSet(setId: string, language: PokemonCardLanguage): Promise<PokemonCard[] | null> {
  const set = await findPokeDataSetForLookup(setId, language);
  if (!set) return null;

  const setName = String(set?.name ?? '').trim();
  if (!setName) return null;

  const params = `set_name=${encodeURIComponent(setName)}&tcg=Pokemon&stats=kwan`;
  const response = await fetch(`${POKEDATA_API_BASE_URL}/api/cards?${params}`, {
    headers: { Accept: 'application/json' },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(json)) {
    throw new Error(`PokeData card fetch failed: ${response.status}`);
  }
  if (!json.length) return null;

  return mergePokemonCards([], json.map((card: any) => mapPokeDataCard(card, set, setId)))
    .sort((a: PokemonCard, b: PokemonCard) => {
      const left = parseInt(a.number, 10);
      const right = parseInt(b.number, 10);
      if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
      return String(a.number).localeCompare(String(b.number));
    });
}

function normalizeCardMergeName(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCardMergeNumber(value?: string | number | null) {
  return String(value ?? '').trim().replace(/^0+(?=\d)/, '').toLowerCase();
}

function getPokemonCardSetMergeId(card: PokemonCard) {
  return normalizeSetId(stripSetLanguagePrefix(
    card.set?.id
    ?? card.raw_data?.set?.id
    ?? card.raw_data?.set_id
    ?? ''
  ));
}

function isPokeDataCard(card: PokemonCard) {
  return card.id.startsWith('pokedata:')
    || Boolean(card.externalIds?.pokedata)
    || card.raw_data?.provider === 'pokedata';
}

function getPokemonCardRawMergeName(card: PokemonCard) {
  return String(
    card.raw_data?.original_english_display_name
    ?? card.raw_data?.english_display_name
    ?? card.raw_data?.name
    ?? card.name
    ?? ''
  ).trim();
}

function getPokemonCardBaseMergeName(card: PokemonCard) {
  return normalizeCardMergeName(stripPokeDataCardFinish(getPokemonCardRawMergeName(card)));
}

function getPokemonCardVariantKey(card: PokemonCard) {
  return String(card.raw_data?.pokedata_variant ?? getPokeDataCardVariantKey(getPokemonCardRawMergeName(card)));
}

function getPokemonCardMergeKeys(card: PokemonCard) {
  const number = normalizeCardMergeNumber(card.number ?? card.raw_data?.localId ?? card.raw_data?.num ?? '');
  const exactName = normalizeCardMergeName(card.name ?? card.raw_data?.english_display_name ?? card.raw_data?.name ?? '');
  const baseName = getPokemonCardBaseMergeName(card);
  const setId = getPokemonCardSetMergeId(card);
  const language = normalizePokemonCardLanguage(card.language ?? card.raw_data?.language);
  const canMergeBySetNumber = number && setId && (language === 'ja' || isPokeDataCard(card));
  return uniqueNonEmpty([
    card.id ? `id:${card.id}` : null,
    card.externalIds?.pokedata ? `pokedata:${card.externalIds.pokedata}` : null,
    canMergeBySetNumber ? `${language}:set-number:${setId}:${number}` : null,
    number && exactName ? `number-name:${number}:${exactName}` : null,
    number && baseName && baseName !== exactName ? `number-base-name:${number}:${baseName}` : null,
  ]);
}

function mergeTcgplayerData(existing?: any, incoming?: any) {
  if (!existing && !incoming) return undefined;
  const prices = {
    ...(incoming?.prices ?? {}),
    ...(existing?.prices ?? {}),
  };
  return {
    ...(incoming ?? {}),
    ...(existing ?? {}),
    ...(Object.keys(prices).length ? { prices } : {}),
  };
}

function getMergedPokemonCardName(existing: PokemonCard, incoming: PokemonCard) {
  const existingVariant = getPokemonCardVariantKey(existing);
  const incomingVariant = getPokemonCardVariantKey(incoming);
  const existingName = stripPokeDataCardFinish(existing.name) || existing.name;
  const incomingName = stripPokeDataCardFinish(incoming.name) || incoming.name;
  if (existingVariant === 'normal') return existingName || incomingName;
  if (incomingVariant === 'normal') return incomingName || existingName;
  return existingName || incomingName;
}

function mergePokemonCardRecords(existing: PokemonCard, incoming: PokemonCard): PokemonCard {
  const tcgplayer = mergeTcgplayerData(existing.tcgplayer ?? existing.raw_data?.tcgplayer, incoming.tcgplayer ?? incoming.raw_data?.tcgplayer);
  const rawTcgplayer = mergeTcgplayerData(existing.raw_data?.tcgplayer ?? existing.tcgplayer, incoming.raw_data?.tcgplayer ?? incoming.tcgplayer);
  return {
    ...existing,
    name: getMergedPokemonCardName(existing, incoming),
    localName: existing.localName ?? incoming.localName ?? null,
    number: existing.number || incoming.number,
    language: existing.language ?? incoming.language,
    region: existing.region ?? incoming.region,
    externalIds: {
      ...(incoming.externalIds ?? {}),
      ...(existing.externalIds ?? {}),
    },
    rarity: existing.rarity ?? incoming.rarity,
    images: {
      small: existing.images?.small ?? incoming.images?.small,
      large: existing.images?.large ?? incoming.images?.large,
    },
    imageStatus: existing.imageStatus ?? incoming.imageStatus,
    pricingStatus: existing.pricingStatus ?? incoming.pricingStatus,
    pricing: existing.pricing ?? incoming.pricing ?? null,
    set: {
      ...(incoming.set ?? {}),
      ...(existing.set ?? {}),
    },
    tcgplayer,
    cardmarket: existing.cardmarket ?? incoming.cardmarket,
    raw_data: {
      ...(incoming.raw_data ?? {}),
      ...(existing.raw_data ?? {}),
      pokedata_variants: uniqueNonEmpty([
        ...(Array.isArray(incoming.raw_data?.pokedata_variants) ? incoming.raw_data.pokedata_variants : [incoming.raw_data?.pokedata_variant]),
        ...(Array.isArray(existing.raw_data?.pokedata_variants) ? existing.raw_data.pokedata_variants : [existing.raw_data?.pokedata_variant]),
        getPokemonCardVariantKey(incoming),
        getPokemonCardVariantKey(existing),
      ]),
      tcgplayer: rawTcgplayer,
      images: {
        ...(incoming.raw_data?.images ?? {}),
        ...(existing.raw_data?.images ?? {}),
      },
      set: {
        ...(incoming.raw_data?.set ?? {}),
        ...(existing.raw_data?.set ?? {}),
      },
    },
  };
}

function mergePokemonCards(primary: PokemonCard[], secondary: PokemonCard[]) {
  const byKey = new Map<string, PokemonCard>();
  for (const card of [...primary, ...secondary]) {
    const keys = getPokemonCardMergeKeys(card);
    const key = keys.find((candidate) => byKey.has(candidate)) ?? keys[0] ?? `id:${card.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      for (const candidate of keys) byKey.set(candidate, card);
      continue;
    }

    const merged = mergePokemonCardRecords(existing, card);
    for (const candidate of uniqueNonEmpty([
      ...getPokemonCardMergeKeys(existing),
      ...keys,
      ...getPokemonCardMergeKeys(merged),
    ])) {
      byKey.set(candidate, merged);
    }
  }

  return Array.from(new Set(byKey.values())).sort((a, b) => {
    const left = parseInt(String(a.number ?? '').replace(/^0+(?=\d)/, ''), 10);
    const right = parseInt(String(b.number ?? '').replace(/^0+(?=\d)/, ''), 10);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
    return String(a.number ?? '').localeCompare(String(b.number ?? '')) || a.name.localeCompare(b.name);
  });
}

function sortPokemonSetsByReleaseDateDesc(sets: PokemonSet[]) {
  return [...sets].sort((a, b) => {
    const aTime = Date.parse(String(a.releaseDate ?? '').replace(/\//g, '-')) || 0;
    const bTime = Date.parse(String(b.releaseDate ?? '').replace(/\//g, '-')) || 0;
    return bTime - aTime || a.name.localeCompare(b.name);
  });
}

function mergeKnownSetOverrides(sets: PokemonSet[], language: PokemonSetLanguageFilter) {
  if (language !== 'all' && language !== 'en') return sets;

  const nextSets = [...sets];
  const existingIds = new Map(nextSets.map((set, index) => [normalizeSetId(set.id), index]));
  let changed = false;

  for (const override of KNOWN_SET_OVERRIDES) {
    const normalizedOverrideId = normalizeSetId(override.id);
    const existingIndex = existingIds.get(normalizedOverrideId);
    if (existingIndex != null) {
      const existing = nextSets[existingIndex];
      const nextSet = {
        ...override,
        ...existing,
        printedTotal: Number(existing.printedTotal ?? 0) > 0 ? existing.printedTotal : override.printedTotal,
        total: Number(existing.total ?? 0) > 0 ? existing.total : override.total,
        externalIds: {
          ...override.externalIds,
          ...existing.externalIds,
        },
        images: {
          ...override.images,
          ...existing.images,
        },
      };
      changed ||= nextSet.printedTotal !== existing.printedTotal || nextSet.total !== existing.total;
      nextSets[existingIndex] = nextSet;
      continue;
    }
    nextSets.push(override);
    changed = true;
  }

  return changed ? sortPokemonSetsByReleaseDateDesc(nextSets) : sets;
}

function isJapaneseSetLookup(setId?: string | null, language?: string | null) {
  const rawSetId = String(setId ?? '').trim();
  const normalizedSetId = normalizeSetId(rawSetId);
  const normalizedLanguage = normalizePokemonCardLanguage(language);
  return (
    normalizedLanguage === 'ja'
    || normalizedLanguage === 'zh-tw'
    || /^(ja|jp):/i.test(rawSetId)
    || /^(zh-tw|zh_tw|zhtw|zh):/i.test(rawSetId)
    || isPokeDataSetId(rawSetId)
    || /^(s|sv)\d+[a-z]+$/i.test(normalizedSetId)
  );
}

function shouldUseScrydexImages(setId?: string | null) {
  const normalized = normalizeSetId(setId);
  if (normalized === 'me2pt5') return true;

  return /^me\d+$/.test(normalized);
}

export function getPokemonSetLogoUrl(setId?: string | null, language?: string | null): string | undefined {
  if (!setId) return undefined;
  const url = approvedSetAssets.get(getSetIdentityKey(setId, language))?.logo
    ?? approvedSetAssets.get(normalizeSetId(setId))?.logo;
  prefetchPokemonSetLogoUrl(url);
  return url;
}

export function getPokemonSetSymbolUrl(setId?: string | null, language?: string | null): string | undefined {
  if (!setId) return undefined;
  return approvedSetAssets.get(getSetIdentityKey(setId, language))?.symbol
    ?? approvedSetAssets.get(normalizeSetId(setId))?.symbol;
}

export function getPokemonSetArtworkUrl(setId?: string | null): string | undefined {
  return getPokemonSetSymbolUrl(setId);
}

export function getPokemonSetVisualUrl(set?: {
  id?: string | null;
  language?: string | null;
  images?: {
    logo?: string | null;
    symbol?: string | null;
    cover?: string | null;
    artwork?: string | null;
  } | null;
  } | null, fallbackLanguage?: string | null): string | undefined {
  if (!set) return undefined;
  const logoOrSymbol = getPokemonSetLogoOrSymbolUrl(set, fallbackLanguage);
  if (logoOrSymbol) return logoOrSymbol;
  const cover = resolveBackendAssetUrl(set.images?.cover ?? set.images?.artwork) ?? String(set.images?.cover ?? set.images?.artwork ?? '').trim();
  if (cover) return cover;
  return undefined;
}

export function getPokemonSetLogoOrSymbolUrl(set?: {
  id?: string | null;
  language?: string | null;
  images?: {
    logo?: string | null;
    symbol?: string | null;
  } | null;
} | null, fallbackLanguage?: string | null): string | undefined {
  if (!set) return undefined;
  const logo = resolveBackendAssetUrl(set.images?.logo) ?? String(set.images?.logo ?? '').trim();
  if (logo) return logo;
  const symbol = resolveBackendAssetUrl(set.images?.symbol) ?? String(set.images?.symbol ?? '').trim();
  if (symbol) return symbol;
  return (
    getPokemonSetLogoUrl(set.id, set.language ?? fallbackLanguage) ??
    getPokemonSetSymbolUrl(set.id, set.language ?? fallbackLanguage)
  );
}

export function getPokemonSetBranding(setId?: string | null) {
  if (!setId) {
    return {
      normalizedSetId: '',
      logoUrl: undefined,
      artworkUrl: undefined,
      symbolUrl: undefined,
    };
  }

  const normalizedSetId = normalizeSetId(setId);
  const logoUrl = getPokemonSetLogoUrl(normalizedSetId);
  const symbolUrl = getPokemonSetSymbolUrl(normalizedSetId);
  return {
    normalizedSetId,
    logoUrl,
    artworkUrl: symbolUrl,
    symbolUrl,
  };
}

export function getPokemonCardImageUrls(cardId: string, fallbackSetId?: string | null, fallbackNumber?: string | null) {
  void fallbackSetId;
  void fallbackNumber;
  return approvedCardAssets.get(cardId) ?? { small: undefined, large: undefined };
}

function prefetchPokemonSetLogoUrl(url?: string | null) {
  if (!url || prefetchedSetLogoUrls.has(url)) return;
  prefetchedSetLogoUrls.add(url);
  InteractionManager.runAfterInteractions(() => {
    Image.prefetch(url).catch(() => {
      prefetchedSetLogoUrls.delete(url);
    });
  });
}

export function prefetchPokemonSetLogos(setIds: (string | null | undefined)[], language?: string | null) {
  for (const setId of setIds) {
    const url = getPokemonSetLogoUrl(setId, language);
    if (url) prefetchPokemonSetLogoUrl(url);
  }
}

type SetCoverRow = {
  set_id?: string | null;
  cover_image_url?: string | null;
};

async function fetchSetCoverImages(sets: PokemonSet[]) {
  const ids = uniqueNonEmpty(sets.map((set) => set.id));
  if (!ids.length) return new Map<string, string>();

  const bySetId = new Map<string, string>();
  const chunkSize = 100;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from('tcg_set_cover_images')
      .select('set_id, cover_image_url')
      .in('set_id', chunk);

    if (error) {
      console.log('Set cover image lookup failed:', error.message);
      return bySetId;
    }

    for (const row of (data ?? []) as SetCoverRow[]) {
      const setId = String(row.set_id ?? '').trim();
      const url = String(row.cover_image_url ?? '').trim();
      if (setId && url && !bySetId.has(setId)) bySetId.set(setId, url);
    }
  }

  return bySetId;
}

async function attachSetCoverImages(sets: PokemonSet[]) {
  const setsNeedingCover = sets.filter((set) => !set.images?.logo && !set.images?.symbol && !set.images?.cover);
  if (!setsNeedingCover.length) return sets;

  const coverImages = await fetchSetCoverImages(setsNeedingCover);
  if (!coverImages.size) return sets;

  return sets.map((set) => {
    const cover = coverImages.get(set.id);
    if (!cover) return set;
    return {
      ...set,
      images: {
        ...set.images,
        cover,
        artwork: set.images?.artwork ?? cover,
      },
    };
  });
}

function getBestPokemonTcgImages(card: {
  id: string;
  set_id?: string | null;
  language?: string | null;
  number?: string | null;
  image_small?: string | null;
  image_large?: string | null;
  raw_data?: any;
}) {
  const rawImages = card.raw_data?.images;
  const dbSmall = card.image_small ?? null;
  const dbLarge = card.image_large ?? null;
  const rawSmall = rawImages?.small ?? null;
  const rawLarge = rawImages?.large ?? null;

  const hasScryDexImage = [dbSmall, dbLarge, rawSmall, rawLarge].some((url) =>
    String(url ?? '').includes('images.scrydex.com')
  );
  const hasProviderImage = [dbSmall, dbLarge, rawSmall, rawLarge].some((url) => {
    const value = String(url ?? '');
    return value && !value.includes('images.pokemontcg.io');
  });

  if (hasScryDexImage || hasProviderImage || normalizePokemonCardLanguage(card.language) !== 'en') {
    return {
      small: rawSmall ?? dbSmall ?? undefined,
      large: rawLarge ?? dbLarge ?? undefined,
    };
  }

  return getPokemonCardImageUrls(card.id, card.set_id, card.number);
}

function getCatalogueApiBaseUrl() {
  const base = PRICE_API_URL?.replace(/\/$/, '');
  return base || null;
}

function resolveBackendAssetUrl(value?: string | null): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith('/')) return undefined;
  const base = getCatalogueApiBaseUrl();
  return base ? `${base}${raw}` : undefined;
}

function getRawProviderSetLogo(raw: any): string | undefined {
  return resolveBackendAssetUrl(
    raw?.provider_assets?.pokewallet?.image_proxy_url
    ?? raw?.provider_assets?.pokewallet?.image_proxy_path
    ?? raw?.providerAssets?.pokewallet?.imageProxyUrl
    ?? raw?.providerAssets?.pokewallet?.imageProxyPath
  );
}

function normalizeProviderImageUrl(value?: string | null): string | undefined {
  const raw = resolveBackendAssetUrl(value) ?? String(value ?? '').trim();
  if (!raw) return undefined;
  if (!/^https?:\/\//i.test(raw)) return undefined;
  if (/assets\.tcgdex\.net/i.test(raw) && !/\.(png|jpe?g|webp)(\?|$)/i.test(raw)) {
    return `${raw.replace(/\/$/, '')}/high.webp`;
  }
  return raw;
}

function getRawSetCoverImage(raw: any): string | undefined {
  const direct = normalizeProviderImageUrl(
    raw?.cover_image_url
    ?? raw?.coverImageUrl
    ?? raw?.images?.cover
    ?? raw?.images?.artwork
    ?? raw?.image
  );
  if (direct) return direct;

  const cards = Array.isArray(raw?.cards) ? raw.cards : [];
  const cardWithImage = cards.find((card: any) => String(card?.image ?? card?.images?.large ?? card?.images?.small ?? '').trim());
  return normalizeProviderImageUrl(cardWithImage?.image ?? cardWithImage?.images?.large ?? cardWithImage?.images?.small);
}

function mapEnrichedCatalogueSet(set: any): PokemonSet {
  const raw = set?.raw_payload ?? set?.raw ?? {};
  const language = normalizePokemonCardLanguage(set?.language ?? raw.language);
  const localName = getLocalSetName({
    id: set?.id ?? null,
    sourceId: set?.source_id ?? set?.providerSetId ?? raw.id ?? null,
    setCode: set?.set_code ?? set?.providerSetId ?? raw.id ?? null,
    language,
    region: set?.region ?? raw.region ?? null,
    localName: set?.localName ?? set?.local_name ?? raw.local_name ?? raw.name ?? null,
    canonicalName: set?.canonical_name ?? set?.name ?? null,
    raw,
  });
  const englishDisplayName = getEnglishSetDisplayName({
    id: set?.id ?? null,
    sourceId: set?.source_id ?? set?.providerSetId ?? raw.id ?? null,
    setCode: set?.set_code ?? set?.providerSetId ?? raw.id ?? null,
    language,
    region: set?.region ?? raw.region ?? null,
    localName,
    englishDisplayName: set?.englishDisplayName ?? set?.english_display_name ?? raw.english_display_name ?? null,
    canonicalName: set?.canonical_name ?? set?.name ?? null,
    raw,
  });
  const name = getPreferredSetDisplayName({
    id: set?.id ?? null,
    sourceId: set?.source_id ?? set?.providerSetId ?? raw.id ?? null,
    setCode: set?.set_code ?? set?.providerSetId ?? raw.id ?? null,
    language,
    region: set?.region ?? raw.region ?? null,
    localName,
    englishDisplayName,
    canonicalName: set?.canonical_name ?? set?.name ?? null,
    raw,
  });
  const providerLogo = getRawProviderSetLogo(raw);
  const coverImage = getRawSetCoverImage(raw);
  const images = set?.images ?? {};
  return {
    id: String(set?.id ?? set?.source_id ?? raw.id ?? ''),
    name,
    series: set?.series ?? raw.serie?.name ?? raw.serie?.id ?? raw.series ?? '',
    printedTotal: Number(set?.printedTotal ?? set?.printed_total ?? raw.cardCount?.official ?? 0),
    total: Number(set?.total ?? set?.actual_total ?? raw.cardCount?.total ?? set?.printedTotal ?? set?.printed_total ?? 0),
    releaseDate: set?.releaseDate ?? set?.release_date ?? raw.releaseDate ?? '',
    language,
    region: set?.region ?? raw.region ?? null,
    localName,
    englishDisplayName,
    externalIds: {
      ...(raw.external_ids && typeof raw.external_ids === 'object' ? raw.external_ids : {}),
      tcgdex: set?.source_id ?? set?.providerSetId ?? raw.id ?? set?.id,
      setCode: set?.set_code ?? set?.source_id ?? set?.providerSetId ?? raw.id ?? set?.id,
    },
    images: {
      symbol: resolveBackendAssetUrl(images.symbol ?? set?.symbol ?? set?.symbol_url) ?? images.symbol ?? set?.symbol ?? set?.symbol_url ?? getPokemonSetSymbolUrl(set?.id, language),
      logo: resolveBackendAssetUrl(images.logo ?? set?.logo ?? set?.logo_url) ?? images.logo ?? set?.logo ?? set?.logo_url ?? providerLogo ?? getPokemonSetLogoUrl(set?.id, language),
      cover: normalizeProviderImageUrl(images.cover) ?? coverImage,
      artwork: normalizeProviderImageUrl(images.artwork ?? images.cover) ?? coverImage,
    },
  };
}

async function fetchEnrichedCatalogueSets(language: PokemonSetLanguageFilter): Promise<PokemonSet[] | null> {
  const apiBase = getCatalogueApiBaseUrl();
  if (!apiBase) return null;

  const languages = language === 'all' ? ['en', 'ja', 'zh-cn', 'zh-tw'] : [language];
  const supported = languages.filter((entry): entry is PokemonCardLanguage => (
    entry === 'en' || entry === 'ja' || entry === 'zh-cn' || entry === 'zh-tw'
  ));
  if (!supported.length) return null;

  const fetched = await Promise.all(supported.map(async (lang) => {
    const sets: PokemonSet[] = [];
    for (let page = 1; page <= 8; page += 1) {
      const response = await fetch(`${apiBase}/catalogue/${lang}/sets?limit=250&page=${page}`, {
        headers: { Accept: 'application/json' },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.detail?.message ?? json?.detail ?? json?.error ?? `StackR catalogue sets failed: ${response.status}`);
      }
      const rows = Array.isArray(json?.sets) ? json.sets : [];
      sets.push(...rows.map(mapEnrichedCatalogueSet));
      if (rows.length < 250) break;
    }
    return sets;
  }));

  return fetched.flat().filter((set) => set.id);
}

function mapEnrichedCatalogueCard(card: any, fallbackSetId: string): PokemonCard {
  const imageUrl = card?.image?.url ?? null;
  const language = normalizePokemonCardLanguage(card?.language);
  const raw = card?.raw ?? {
    dexId: card?.dexId ?? card?.dexIds ?? null,
    localId: card?.collectorNumber ?? card?.number ?? null,
    name: card?.localName ?? card?.name ?? null,
    language: card?.language ?? null,
    region: card?.region ?? null,
    set: {
      id: card?.setId ?? fallbackSetId,
      name: card?.setName ?? null,
    },
  };
  const localName = getLocalCardName({
    id: card?.id ?? null,
    language,
    region: card?.region ?? null,
    localName: card?.localName ?? null,
    fallbackName: card?.name ?? card?.id ?? null,
    raw,
  });
  const englishDisplayName = getEnglishCardDisplayName({
    id: card?.id ?? null,
    sourceId: card?.externalIds?.tcgdex ?? card?.id ?? null,
    setId: card?.setId ?? fallbackSetId,
    collectorNumber: card?.collectorNumber ?? card?.number ?? null,
    language,
    region: card?.region ?? null,
    localName,
    englishDisplayName: card?.englishDisplayName ?? card?.english_display_name ?? null,
    fallbackName: card?.name ?? card?.id ?? null,
    raw,
  });
  const name = getPreferredCardDisplayName({
    id: card?.id ?? null,
    sourceId: card?.externalIds?.tcgdex ?? card?.id ?? null,
    setId: card?.setId ?? fallbackSetId,
    collectorNumber: card?.collectorNumber ?? card?.number ?? null,
    language,
    region: card?.region ?? null,
    localName,
    englishDisplayName,
    fallbackName: card?.name ?? card?.id ?? null,
    raw,
  });
  const setLocalName = raw?.set?.local_name ?? raw?.set?.name ?? card?.setName ?? null;
  const setEnglishDisplayName = getEnglishSetDisplayName({
    id: card?.setId ?? raw?.set?.id ?? fallbackSetId,
    sourceId: raw?.set?.tcgdex_id ?? raw?.set?.id ?? card?.setId ?? fallbackSetId,
    setCode: raw?.set?.set_code ?? raw?.set?.tcgdex_id ?? raw?.set?.id ?? card?.setId ?? fallbackSetId,
    language,
    region: card?.region ?? null,
    localName: setLocalName,
    englishDisplayName: raw?.set?.english_display_name ?? raw?.set?.englishDisplayName ?? null,
    fallbackName: card?.setName ?? null,
    raw: raw?.set,
  });
  const setDisplayName = getPreferredSetDisplayName({
    id: card?.setId ?? raw?.set?.id ?? fallbackSetId,
    sourceId: raw?.set?.tcgdex_id ?? raw?.set?.id ?? card?.setId ?? fallbackSetId,
    setCode: raw?.set?.set_code ?? raw?.set?.tcgdex_id ?? raw?.set?.id ?? card?.setId ?? fallbackSetId,
    language,
    region: card?.region ?? null,
    localName: setLocalName,
    englishDisplayName: setEnglishDisplayName,
    fallbackName: card?.setName ?? null,
    raw: raw?.set,
  });

  return {
    id: String(card?.id ?? ''),
    name,
    localName,
    number: String(card?.collectorNumber ?? card?.number ?? ''),
    language,
    region: card?.region ?? null,
    externalIds: card?.externalIds ?? {},
    rarity: card?.rarity ?? undefined,
    images: {
      small: imageUrl ?? undefined,
      large: imageUrl ?? undefined,
    },
    imageStatus: card?.image?.status ?? null,
    pricingStatus: card?.pricingStatus ?? card?.pricing?.pricingStatus ?? null,
    pricing: card?.pricing ?? null,
    set: {
      id: card?.setId ?? fallbackSetId,
      name: setDisplayName ?? undefined,
    },
    raw_data: {
      ...raw,
      name,
      local_name: localName,
      english_display_name: englishDisplayName ?? raw?.english_display_name ?? null,
      set: {
        ...(raw?.set ?? {}),
        id: card?.setId ?? raw?.set?.id ?? fallbackSetId,
        name: setDisplayName ?? undefined,
        local_name: setLocalName,
        english_display_name: setEnglishDisplayName,
        display_name: setDisplayName,
      },
    },
  };
}

function mapPokemonSetDbRow(set: any): PokemonSet {
  const language = normalizePokemonCardLanguage(set.language);
  const raw = set.raw_data ?? {};
  const localName = getLocalSetName({
    id: set.id,
    sourceId: set.external_ids?.tcgdex ?? set.provider_id ?? set.id,
    setCode: set.external_ids?.setCode ?? set.id,
    language,
    region: set.region ?? null,
    localName: raw.local_name ?? raw.name ?? null,
    canonicalName: set.name,
    raw,
  });
  const englishDisplayName = getEnglishSetDisplayName({
    id: set.id,
    sourceId: set.external_ids?.tcgdex ?? set.provider_id ?? set.id,
    setCode: set.external_ids?.setCode ?? set.id,
    language,
    region: set.region ?? null,
    localName,
    englishDisplayName: raw.english_display_name ?? raw.englishDisplayName ?? null,
    canonicalName: set.name,
    raw,
  });
  const name = getPreferredSetDisplayName({
    id: set.id,
    sourceId: set.external_ids?.tcgdex ?? set.provider_id ?? set.id,
    setCode: set.external_ids?.setCode ?? set.id,
    language,
    region: set.region ?? null,
    localName,
    englishDisplayName,
    canonicalName: set.name,
    raw,
  });
  const providerLogo = getRawProviderSetLogo(raw);
  const coverImage = getRawSetCoverImage(raw);
  return {
    id: set.id,
    name,
    series: set.series ?? '',
    printedTotal: set.printed_total ?? 0,
    total: set.total ?? 0,
    releaseDate: set.release_date ?? '',
    language,
    region: set.region ?? null,
    localName,
    englishDisplayName,
    externalIds: set.external_ids ?? {},
    images: {
      symbol: resolveBackendAssetUrl(set.symbol_url) ?? set.symbol_url ?? getPokemonSetSymbolUrl(set.id, language),
      logo: resolveBackendAssetUrl(set.logo_url) ?? set.logo_url ?? providerLogo ?? getPokemonSetLogoUrl(set.id, language),
      cover: coverImage,
      artwork: coverImage,
    },
  };
}

function mapCanonicalSetDbRow(set: any): PokemonSet {
  const raw = set.raw_payload ?? {};
  const language = normalizePokemonCardLanguage(set.language ?? raw.language);
  const localName = getLocalSetName({
    id: set.id,
    sourceId: set.source_id ?? raw.id ?? set.id,
    setCode: set.set_code ?? set.source_id ?? raw.id ?? set.id,
    language,
    region: set.region ?? raw.region ?? null,
    localName: set.local_name ?? raw.local_name ?? raw.name ?? null,
    canonicalName: set.canonical_name,
    raw,
  });
  const englishDisplayName = getEnglishSetDisplayName({
    id: set.id,
    sourceId: set.source_id ?? raw.id ?? set.id,
    setCode: set.set_code ?? set.source_id ?? raw.id ?? set.id,
    language,
    region: set.region ?? raw.region ?? null,
    localName,
    englishDisplayName: set.english_display_name ?? raw.english_display_name ?? raw.englishDisplayName ?? null,
    canonicalName: set.canonical_name,
    raw,
  });
  const name = getPreferredSetDisplayName({
    id: set.id,
    sourceId: set.source_id ?? raw.id ?? set.id,
    setCode: set.set_code ?? set.source_id ?? raw.id ?? set.id,
    language,
    region: set.region ?? raw.region ?? null,
    localName,
    englishDisplayName,
    canonicalName: set.canonical_name,
    raw,
  });
  const providerLogo = getRawProviderSetLogo(raw);
  const coverImage = getRawSetCoverImage(raw);
  return {
    id: set.id,
    name,
    series: raw.serie?.name ?? raw.serie?.id ?? raw.series ?? set.set_code ?? set.source_id ?? '',
    printedTotal: set.printed_total ?? raw.cardCount?.official ?? 0,
    total: set.actual_total ?? raw.cardCount?.total ?? set.printed_total ?? 0,
    releaseDate: set.release_date ?? raw.releaseDate ?? '',
    language,
    region: set.region ?? raw.region ?? null,
    localName,
    englishDisplayName,
    externalIds: {
      ...(raw.external_ids && typeof raw.external_ids === 'object' ? raw.external_ids : {}),
      tcgdex: set.source_id ?? raw.id ?? set.id,
      setCode: set.set_code ?? set.source_id ?? raw.id ?? set.id,
    },
    images: {
      symbol: resolveBackendAssetUrl(set.symbol_url) ?? set.symbol_url ?? getPokemonSetSymbolUrl(set.id, language),
      logo: resolveBackendAssetUrl(set.logo_url) ?? set.logo_url ?? providerLogo ?? getPokemonSetLogoUrl(set.id, language),
      cover: coverImage,
      artwork: coverImage,
    },
  };
}

function getSetExternalCode(set: PokemonSet) {
  return String(
    set.externalIds?.setCode
    ?? set.externalIds?.tcgdex
    ?? ''
  ).trim();
}

function getSetNameMergeKey(set: PokemonSet) {
  return normalizePokeDataText(set.englishDisplayName ?? set.name ?? set.localName ?? set.id);
}

function getSetMergeKeys(set: PokemonSet) {
  const language = normalizePokemonCardLanguage(set.language);
  const code = getSetExternalCode(set);
  const name = getSetNameMergeKey(set);
  const localName = normalizePokeDataText(set.localName ?? '');
  const releaseDate = normalizePokeDataDate(set.releaseDate);

  return uniqueNonEmpty([
    getSetIdentityKey(set.id, language),
    code && !/^pokedata:/i.test(code) ? `${language}:code:${normalizeSetId(code)}` : null,
    name && releaseDate ? `${language}:name-date:${name}:${releaseDate}` : null,
    localName && releaseDate ? `${language}:local-date:${localName}:${releaseDate}` : null,
  ]);
}

function hasPokeDataSetSource(set: PokemonSet) {
  return Boolean(String(set.externalIds?.pokedata ?? '').trim());
}

function getMergedSetId(existing: PokemonSet, incoming: PokemonSet) {
  const existingPokeDataNoCode = isPokeDataSetId(existing.id) && !getSetExternalCode(existing);
  const incomingPokeDataNoCode = isPokeDataSetId(incoming.id) && !getSetExternalCode(incoming);
  if (existingPokeDataNoCode) return existing.id;
  if (incomingPokeDataNoCode) return incoming.id;
  if (hasPokeDataSetSource(existing) && !hasPokeDataSetSource(incoming)) return existing.id;
  if (hasPokeDataSetSource(incoming) && !hasPokeDataSetSource(existing)) return incoming.id;
  if (!isPokeDataSetId(existing.id) && isPokeDataSetId(incoming.id)) return existing.id;
  if (isPokeDataSetId(existing.id) && !isPokeDataSetId(incoming.id)) return incoming.id;
  return incoming.id || existing.id;
}

function mergePokemonSetRecords(existing: PokemonSet, incoming: PokemonSet): PokemonSet {
  return {
    ...existing,
    ...incoming,
    id: getMergedSetId(existing, incoming),
    name: existing.name || incoming.name,
    series: existing.series || incoming.series,
    printedTotal: existing.printedTotal || incoming.printedTotal,
    total: existing.total || incoming.total,
    releaseDate: existing.releaseDate || incoming.releaseDate,
    externalIds: {
      ...(incoming.externalIds ?? {}),
      ...(existing.externalIds ?? {}),
    },
    images: {
      symbol: existing.images?.symbol ?? incoming.images?.symbol,
      logo: existing.images?.logo ?? incoming.images?.logo,
      cover: existing.images?.cover ?? incoming.images?.cover,
      artwork: existing.images?.artwork ?? incoming.images?.artwork,
    },
  };
}

function mergePokemonSets(primary: PokemonSet[], secondary: PokemonSet[], language: PokemonSetLanguageFilter) {
  const byKey = new Map<string, PokemonSet>();
  for (const set of [...primary, ...secondary]) {
    const mergeKeys = getSetMergeKeys(set);
    const key = mergeKeys.find((candidate) => byKey.has(candidate)) ?? mergeKeys[0] ?? getSetIdentityKey(set.id, set.language);
    const existing = byKey.get(key);
    if (!existing) {
      for (const candidate of mergeKeys) byKey.set(candidate, set);
      continue;
    }
    const merged = mergePokemonSetRecords(existing, set);
    for (const candidate of uniqueNonEmpty([
      ...getSetMergeKeys(existing),
      ...mergeKeys,
      ...getSetMergeKeys(merged),
    ])) {
      byKey.set(candidate, merged);
    }
  }
  return mergeKnownSetOverrides(Array.from(new Set(byKey.values())), language)
    .sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));
}

async function fetchEnrichedCardsForSet(setId: string, language: PokemonCardLanguage): Promise<PokemonCard[] | null> {
  const apiBase = getCatalogueApiBaseUrl();
  if (!apiBase || (language !== 'en' && language !== 'ja' && language !== 'zh-tw')) return null;

  const providerSetId = stripSetLanguagePrefix(setId);
  const cacheBuster = 0;
  const url = `${apiBase}/catalogue/${language}/sets/${encodeURIComponent(providerSetId)}/cards?limit=500&page=1&v=${cacheBuster}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await response.json().catch(() => null);

  if (!response.ok) {
    console.log('StackR catalogue card fetch failed:', response.status, json?.error ?? json?.detail ?? '');
    return null;
  }

  const cards = Array.isArray(json?.cards) ? json.cards : [];
  if (!cards.length) return null;
  return cards.map((card: any) => mapEnrichedCatalogueCard(card, setId));
}

function mapPokemonTcgApiCard(card: any): PokemonCard {
  const mapped = {
    id: card.id,
    name: card.name,
    number: card.number ?? '',
    language: 'en' as PokemonCardLanguage,
    region: 'US',
    externalIds: {
      pokemonTcg: card.id,
    },
    rarity: card.rarity ?? undefined,
    images: {
      small: card.images?.small ?? undefined,
      large: card.images?.large ?? undefined,
    },
    set: card.set ?? undefined,
    tcgplayer: card.tcgplayer ?? undefined,
    cardmarket: card.cardmarket ?? undefined,
    artist: card.artist ?? undefined,
    supertype: card.supertype ?? undefined,
    subtypes: card.subtypes ?? undefined,
    hp: card.hp ?? undefined,
    types: card.types ?? undefined,
    evolvesFrom: card.evolvesFrom ?? undefined,
    flavorText: card.flavorText ?? undefined,
    rules: card.rules ?? undefined,
    attacks: card.attacks ?? undefined,
    weaknesses: card.weaknesses ?? undefined,
    resistances: card.resistances ?? undefined,
    retreatCost: card.retreatCost ?? undefined,
    raw_data: card,
  };

  return mapped;
}

function mapPokemonTcgApiSet(set: any): PokemonSet {
  const setId = String(set?.id ?? '').trim();
  return {
    id: setId,
    name: String(set?.name ?? setId).trim() || setId,
    series: String(set?.series ?? 'Other').trim() || 'Other',
    printedTotal: Number(set?.printedTotal ?? 0) || 0,
    total: Number(set?.total ?? set?.printedTotal ?? 0) || 0,
    releaseDate: String(set?.releaseDate ?? ''),
    language: 'en',
    region: 'US',
    externalIds: {
      pokemonTcg: setId,
      setCode: setId,
      ...(set?.ptcgoCode ? { ptcgoCode: set.ptcgoCode } : {}),
    },
    images: {
      symbol: set?.images?.symbol ?? undefined,
      logo: set?.images?.logo ?? undefined,
    },
  };
}

function getCardNumberSortValue(number: string) {
  const match = String(number ?? '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

async function fetchPokemonTcgApiSets(): Promise<PokemonSet[]> {
  const pageSize = 250;
  const sets: PokemonSet[] = [];

  for (let page = 1; page < 6; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      orderBy: '-releaseDate',
    });
    const response = await fetch(`${POKEMON_TCG_API_BASE_URL}/sets?${params.toString()}`);
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.error?.message ?? json?.message ?? `Pokemon TCG sets API failed: ${response.status}`);
    }

    const pageSets = (json?.data ?? []).map(mapPokemonTcgApiSet);
    sets.push(...pageSets);

    if (pageSets.length < pageSize) break;
  }

  return sets;
}

async function fetchPokemonTcgApiCardsForSet(setId: string): Promise<PokemonCard[]> {
  const normalizedSetId = normalizeSetId(setId);
  const pageSize = 250;
  const cards: PokemonCard[] = [];

  for (let page = 1; page < 12; page += 1) {
    const params = new URLSearchParams({
      q: `set.id:${normalizedSetId}`,
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await fetch(`${POKEMON_TCG_API_BASE_URL}/cards?${params.toString()}`);
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(json?.error?.message ?? json?.message ?? `Pokemon TCG cards API failed: ${response.status}`);
    }

    const pageCards = (json?.data ?? []).map(mapPokemonTcgApiCard);
    cards.push(...pageCards);

    if (pageCards.length < pageSize) break;
  }

  return cards.sort((a, b) => getCardNumberSortValue(a.number) - getCardNumberSortValue(b.number) || a.number.localeCompare(b.number));
}

export async function fetchPokemonTcgApiCardsByQuery(
  query: string,
  options: { limit?: number } = {}
): Promise<PokemonCard[]> {
  const safeQuery = String(query ?? '').trim();
  if (!safeQuery) return [];

  const limit = Math.max(1, Math.min(250, Math.floor(options.limit ?? 80)));
  const cacheKey = `api-search:${safeQuery}:${limit}`;
  const cached = pokemonTcgApiSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const inflight = pokemonTcgApiSearchInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const cards = await attachLiveTcgdexCardReferences(
      (await searchStackrCards(safeQuery, { limit })).map(fromStackrCard),
      6,
    );

    pokemonTcgApiSearchCache.set(cacheKey, {
      expiresAt: Date.now() + POKEMON_TCG_API_SEARCH_CACHE_TTL_MS,
      value: cards,
    });
    return cards;
  })();

  pokemonTcgApiSearchInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pokemonTcgApiSearchInflight.delete(cacheKey);
  }
}

export async function fetchAllSets(options: FetchAllSetsOptions = {}): Promise<PokemonSet[]> {
  const language = normalizeSetLanguageFilter(options.language);
  const readLane = options.preferCanonicalApi ? 'canonical-api' : 'default';
  const cacheKey = `sets:${language}:${readLane}`;
  const cachedSets = readNonEmptyCatalogueRows(allSetsCache, cacheKey);
  if (cachedSets) {
    return cachedSets;
  }

  const inflight = allSetsInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const loadSets = options.preferCanonicalApi ? fetchPreferredStackrSets : fetchStackrSets;
    const sets = (await loadSets(language === 'all' ? null : language)).map(fromStackrSet);
    prefetchPokemonSetLogos(sets.map((set) => set.id), language === 'all' ? undefined : language);
    cacheNonEmptyCatalogueRows(allSetsCache, cacheKey, sets, Date.now() + POKEMON_SET_CACHE_TTL_MS);
    return sets;
  })();

  allSetsInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    allSetsInflight.delete(cacheKey);
  }
}

export async function fetchCardsForSet(setId: string, options: FetchCardsForSetOptions = {}): Promise<PokemonCard[]> {
  const language = inferPokemonSetLanguage(setId, options.language);
  const setIdCandidates = getPokemonSetIdLookupCandidates(setId, language);
  const readLane = options.preferCanonicalApi ? 'canonical-api' : 'default';
  const cacheKey = `${readLane}:${language}:${setIdCandidates.join('|')}`;
  const cached = readNonEmptyCatalogueRows(cardsForSetCache, cacheKey);
  if (cached) return cached;

  const inflight = cardsForSetInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    let sourceCards: StackrLegacyCard[] = [];
    if (options.preferCanonicalApi) {
      sourceCards = await fetchPreferredStackrCardsForReferences(setIdCandidates, language);
    } else {
      let completedCandidate = false;
      let candidateError: unknown;
      for (const candidate of setIdCandidates) {
        try {
          sourceCards = await fetchStackrCardsForSet(candidate, language);
          completedCandidate = true;
        } catch (error) {
          candidateError = error;
          continue;
        }
        if (sourceCards.length) break;
      }
      if (!completedCandidate && candidateError) throw candidateError;
    }
    const cards = await attachLiveTcgdexCardReferences(
      sourceCards.map(fromStackrCard),
      1,
    );

    cacheNonEmptyCatalogueRows(cardsForSetCache, cacheKey, cards, Date.now() + POKEMON_SET_CARDS_CACHE_TTL_MS);
    return cards;
  })();

  cardsForSetInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    cardsForSetInflight.delete(cacheKey);
  }
}

function mapPokemonCardDbRow(data: any): PokemonCard {
  const images = getBestPokemonTcgImages(data);
  const language = normalizePokemonCardLanguage(data.language);
  const localName = getLocalCardName({
    id: data.id,
    sourceId: data.external_ids?.tcgdex ?? data.id,
    language,
    region: data.region ?? null,
    localName: data.raw_data?.local_name ?? null,
    fallbackName: data.raw_data?.name ?? data.name ?? data.id,
    raw: data.raw_data ?? {},
  });
  const englishDisplayName = getEnglishCardDisplayName({
    id: data.id,
    sourceId: data.external_ids?.tcgdex ?? data.id,
    setId: data.set_id ?? data.raw_data?.set?.id ?? null,
    collectorNumber: data.number ?? data.raw_data?.localId ?? null,
    language,
    region: data.region ?? null,
    localName,
    englishDisplayName: data.raw_data?.english_display_name ?? data.raw_data?.englishDisplayName ?? null,
    fallbackName: data.name ?? data.raw_data?.name ?? data.id,
    raw: data.raw_data ?? {},
  });
  const name = getPreferredCardDisplayName({
    id: data.id,
    sourceId: data.external_ids?.tcgdex ?? data.id,
    setId: data.set_id ?? data.raw_data?.set?.id ?? null,
    collectorNumber: data.number ?? data.raw_data?.localId ?? null,
    language,
    region: data.region ?? null,
    localName,
    englishDisplayName,
    fallbackName: data.name ?? data.raw_data?.name ?? data.id,
    raw: data.raw_data ?? {},
  });
  const setLocalName = data.raw_data?.set?.local_name ?? data.raw_data?.set?.name ?? null;
  const setEnglishDisplayName = getEnglishSetDisplayName({
    id: data.set_id ?? data.raw_data?.set?.id ?? null,
    sourceId: data.raw_data?.set?.tcgdex_id ?? data.raw_data?.set?.source_id ?? data.set_id ?? null,
    setCode: data.raw_data?.set?.set_code ?? data.raw_data?.set?.tcgdex_id ?? data.set_id ?? null,
    language,
    region: data.region ?? data.raw_data?.region ?? null,
    localName: setLocalName,
    englishDisplayName: data.raw_data?.set?.english_display_name ?? data.raw_data?.set?.englishDisplayName ?? null,
    canonicalName: data.raw_data?.set?.name ?? null,
    raw: data.raw_data?.set ?? data.raw_data ?? {},
  });
  const setData = data.raw_data?.set
    ? {
        ...data.raw_data.set,
        name: getPreferredSetDisplayName({
          id: data.set_id ?? data.raw_data?.set?.id ?? null,
          sourceId: data.raw_data?.set?.tcgdex_id ?? data.raw_data?.set?.source_id ?? data.set_id ?? null,
          setCode: data.raw_data?.set?.set_code ?? data.raw_data?.set?.tcgdex_id ?? data.set_id ?? null,
          language,
          region: data.region ?? data.raw_data?.region ?? null,
          localName: setLocalName,
          englishDisplayName: setEnglishDisplayName,
          canonicalName: data.raw_data?.set?.name ?? null,
          raw: data.raw_data?.set ?? data.raw_data ?? {},
        }),
        local_name: setLocalName,
        english_display_name: setEnglishDisplayName,
      }
    : undefined;

  return {
    id: data.id,
    name,
    localName,
    number: data.number ?? '',
    language,
    region: data.region ?? null,
    externalIds: data.external_ids ?? {},
    rarity: data.rarity ?? undefined,
    images,
    set: setData,
    tcgplayer: data.raw_data?.tcgplayer ?? undefined,
    cardmarket: data.raw_data?.cardmarket ?? undefined,
    artist: data.raw_data?.artist ?? undefined,
    supertype: data.raw_data?.supertype ?? undefined,
    subtypes: data.raw_data?.subtypes ?? undefined,
    hp: data.raw_data?.hp ?? undefined,
    types: data.raw_data?.types ?? undefined,
    attacks: data.raw_data?.attacks ?? undefined,
    weaknesses: data.raw_data?.weaknesses ?? undefined,
    resistances: data.raw_data?.resistances ?? undefined,
    raw_data: data.raw_data
      ? {
          ...data.raw_data,
          name,
          local_name: localName,
          english_display_name: englishDisplayName ?? data.raw_data?.english_display_name ?? null,
          set: setData ?? data.raw_data?.set,
        }
      : undefined,
  };
}

function mapCanonicalCardDbRow(data: any): PokemonCard {
  const raw = data.raw_payload ?? {};
  const rawImages = raw.images && typeof raw.images === 'object' ? raw.images : {};
  const storedImages = {
    small: data.image_small_url ?? rawImages.small ?? undefined,
    large: data.image_large_url ?? rawImages.large ?? undefined,
  };
  const images = {
    small: enforceTcgdexRuntimeImagePolicy(storedImages.small) ?? undefined,
    large: enforceTcgdexRuntimeImagePolicy(storedImages.large) ?? undefined,
  };
  const language = normalizePokemonCardLanguage(data.language ?? raw.language);
  const localName = getLocalCardName({
    id: data.id,
    sourceId: data.source_id ?? data.provider_card_id ?? raw.id ?? data.id,
    language,
    region: data.region ?? raw.region ?? null,
    localName: data.local_name ?? raw.local_name ?? null,
    fallbackName: raw.name ?? data.canonical_name ?? data.id,
    raw,
  });
  const englishDisplayName = getEnglishCardDisplayName({
    id: data.id,
    sourceId: data.source_id ?? data.provider_card_id ?? raw.id ?? data.id,
    setId: data.set_id ?? raw.set?.id ?? null,
    collectorNumber: data.collector_number ?? raw.localId ?? raw.number ?? null,
    language,
    region: data.region ?? raw.region ?? null,
    localName,
    englishDisplayName: data.english_display_name ?? raw.english_display_name ?? null,
    canonicalName: data.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: raw.name ?? data.id,
    raw,
  });
  const name = getPreferredCardDisplayName({
    id: data.id,
    sourceId: data.source_id ?? data.provider_card_id ?? raw.id ?? data.id,
    setId: data.set_id ?? raw.set?.id ?? null,
    collectorNumber: data.collector_number ?? raw.localId ?? raw.number ?? null,
    language,
    region: data.region ?? raw.region ?? null,
    localName,
    englishDisplayName,
    canonicalName: data.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: raw.name ?? data.id,
    raw,
  });
  const setLocalName = raw.set?.local_name ?? raw.set?.name ?? null;
  const setEnglishDisplayName = getEnglishSetDisplayName({
    id: data.set_id ?? raw.set?.id ?? null,
    sourceId: raw.set?.tcgdex_id ?? raw.set?.source_id ?? data.source_id ?? data.provider_card_id ?? null,
    setCode: raw.set?.set_code ?? raw.set?.tcgdex_id ?? data.set_id ?? null,
    language,
    region: data.region ?? raw.region ?? null,
    localName: setLocalName,
    englishDisplayName: raw.set?.english_display_name ?? raw.set?.englishDisplayName ?? null,
    canonicalName: raw.set?.name ?? null,
    raw: raw.set ?? raw,
  });
  const setData = raw.set
    ? {
        ...raw.set,
        name: getPreferredSetDisplayName({
          id: data.set_id ?? raw.set?.id ?? null,
          sourceId: raw.set?.tcgdex_id ?? raw.set?.source_id ?? data.source_id ?? data.provider_card_id ?? null,
          setCode: raw.set?.set_code ?? raw.set?.tcgdex_id ?? data.set_id ?? null,
          language,
          region: data.region ?? raw.region ?? null,
          localName: setLocalName,
          englishDisplayName: setEnglishDisplayName,
          canonicalName: raw.set?.name ?? null,
          raw: raw.set ?? raw,
        }),
        local_name: setLocalName,
        english_display_name: setEnglishDisplayName,
      }
    : { id: data.set_id };
  const number = data.collector_number ?? raw.localId ?? raw.number ?? '';

  return {
    id: data.id,
    name,
    localName,
    number: String(number),
    language,
    region: data.region ?? raw.region ?? null,
    externalIds: {
      ...(raw.external_ids && typeof raw.external_ids === 'object' ? raw.external_ids : {}),
      tcgdex: data.source_id ?? data.provider_card_id ?? raw.id ?? data.id,
    },
    rarity: data.rarity ?? raw.rarity ?? undefined,
    images,
    set: setData,
    tcgplayer: raw.tcgplayer ?? undefined,
    cardmarket: raw.cardmarket ?? undefined,
    artist: raw.artist ?? undefined,
    supertype: raw.supertype ?? undefined,
    subtypes: raw.subtypes ?? undefined,
    hp: raw.hp ?? undefined,
    types: raw.types ?? undefined,
    attacks: raw.attacks ?? undefined,
    weaknesses: raw.weaknesses ?? undefined,
    resistances: raw.resistances ?? undefined,
    raw_data: {
      ...raw,
      id: raw.id ?? data.source_id ?? data.provider_card_id ?? data.id,
      name,
      local_name: localName,
      english_display_name: englishDisplayName ?? data.english_display_name ?? raw.english_display_name ?? null,
      number,
      localId: raw.localId ?? number,
      images: storedImages,
      set: setData,
      language: data.language ?? raw.language,
      region: data.region ?? raw.region,
    },
  };
}

export async function fetchCardById(
  cardId: string,
  options: { language?: PokemonCardLanguage | string | null } = {}
): Promise<PokemonCard | null> {
  const card = await fetchStackrCard(cardId, { language: options.language });
  return card ? (await attachLiveTcgdexCardReferences([fromStackrCard(card)], 1))[0] ?? null : null;
}
