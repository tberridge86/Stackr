import { supabase } from './supabase';
import { getLocalCardIndex } from './localCardIndex';
import { findCuratedPokemonSearchRows } from './curatedPokemonCatalogue';
import { correctPokemonNameQuery } from './pokemonNameAutocorrect';
import { searchStackrCards } from './stackrDomainAdapter';
import {
  getEnglishCardDisplayName,
  getLocalCardName,
  getPreferredCardDisplayName,
  getPreferredSetDisplayName,
} from './pokemonDisplayNames';
import {
  fetchAllSets,
  fetchPokemonTcgApiCardsByQuery,
  normalizePokemonCardLanguage,
  type PokemonCard,
  type PokemonCardLanguage,
} from './pokemonTcg';

type SearchRow = Record<string, any>;

type SearchOptions = {
  limit?: number;
  select?: string;
  language?: PokemonCardLanguage | 'all' | string | null;
  skipSetDetection?: boolean;
  enableShortSetDetection?: boolean;
  skipApiBackedSearch?: boolean;
  skipIndexFallback?: boolean;
  skipNameCorrection?: boolean;
};

type ParsedSearch = {
  original: string;
  normalizedOriginal: string;
  nameTerms: string[];
  matchedSetIds: string[];
  rarityHints: string[];
  styleHints: string[];
  cardNumberHints: string[];
  setTotalHint: string | null;
};

const rarityAliases: Record<string, string[]> = {
  sar: ['special art rare', 'special illustration rare', 'rare special illustration', 'sar'],
  sir: ['special illustration rare', 'rare special illustration', 'sir'],
  'special art rare': ['special art rare', 'special illustration rare', 'rare special illustration', 'sar'],
  'special illustration rare': ['special illustration rare', 'rare special illustration', 'sir'],
  'special illustration': ['special illustration rare', 'rare special illustration', 'sir'],
  ir: ['illustration rare'],
  'illustration rare': ['illustration rare'],
  'ultra rare': ['ultra rare'],
  'secret rare': ['secret rare'],
  holo: ['holo'],
  reverse: ['reverse'],
  'full art': ['full art'],
  'alt art': ['alternate art', 'special illustration rare', 'illustration rare'],
  'alternate art': ['alternate art', 'special illustration rare', 'illustration rare'],
  'alternate artwork': ['alternate art', 'special illustration rare', 'illustration rare'],
  rainbow: ['rainbow', 'rare rainbow', 'rare secret'],
  shiny: ['shiny'],
  radiant: ['radiant'],
};

const styleAliases = new Set([
  'ex',
  'gx',
  'v',
  'vmax',
  'vstar',
  'tag team',
  'trainer gallery',
  'gallery',
  'promo',
  'full art',
  'alt art',
  'alternate art',
  'alternate artwork',
  'rainbow',
  'shiny',
  'radiant',
  'mega',
  'prism star',
  'amazing rare',
  'ace spec',
]);

const fillerTerms = new Set(['card', 'cards', 'pokemon', 'tcg']);
const apiBackedSetIds = new Set(['me5']);

const japaneseNameSearchAliases: Record<string, string[]> = {
  zac: ['ザシアン'],
  zacian: ['ザシアン'],
  zamazenta: ['ザマゼンタ'],
  pikachu: ['ピカチュウ'],
  charizard: ['リザードン'],
  mewtwo: ['ミュウツー'],
  mew: ['ミュウ'],
  eevee: ['イーブイ'],
  gengar: ['ゲンガー'],
  lucario: ['ルカリオ'],
  rayquaza: ['レックウザ'],
  gardevoir: ['サーナイト'],
  umbreon: ['ブラッキー'],
  espeon: ['エーフィ'],
  sylveon: ['ニンフィア'],
  glaceon: ['グレイシア'],
  leafeon: ['リーフィア'],
  vaporeon: ['シャワーズ'],
  jolteon: ['サンダース'],
  flareon: ['ブースター'],
  arceus: ['アルセウス'],
  giratina: ['ギラティナ'],
  dialga: ['ディアルガ'],
  palkia: ['パルキア'],
};

const normalise = (value: string) =>
  String(value ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/\u2640/g, ' female ')
    .replace(/\u2642/g, ' male ')
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/([a-z])'s\b/g, '$1s')
    .replace(/'/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compact = (value: string) => normalise(value).replace(/\s+/g, '');
const tokenize = (value: string) => normalise(value).split(/\s+/).filter(Boolean);
const getSetName = (row: SearchRow) => getPreferredSetDisplayName({
  id: row.set_id ?? row.raw_data?.set?.id ?? row.set?.id ?? null,
  sourceId: row.raw_data?.set?.tcgdex_id ?? row.raw_data?.set?.source_id ?? row.raw_data?.source_id ?? row.set_id ?? null,
  setCode: row.raw_data?.set?.set_code ?? row.raw_data?.set?.tcgdex_id ?? row.raw_data?.set_code ?? row.set_id ?? null,
  language: row.language ?? row.raw_data?.language ?? row.raw_data?.set?.language ?? null,
  region: row.region ?? row.raw_data?.region ?? row.raw_data?.set?.region ?? null,
  localName: row.raw_data?.set?.local_name ?? row.raw_data?.set?.name ?? null,
  englishDisplayName: row.raw_data?.set?.english_display_name ?? row.raw_data?.set?.englishDisplayName ?? null,
  canonicalName: row.raw_data?.set?.name ?? row.set?.name ?? row.set_name ?? null,
  fallbackName: row.set_name ?? row.set_id ?? null,
  raw: row.raw_data?.set ?? row.raw_data,
}) ?? '';
const getRarity = (row: SearchRow) => row.rarity ?? row.raw_data?.rarity ?? '';
const getSubtypes = (row: SearchRow): string[] => row.raw_data?.subtypes ?? row.subtypes ?? [];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const setSearchCache = new Map<string, Promise<string[]>>();

function isAllLanguageSearch(value: SearchOptions['language']) {
  return String(value ?? '').trim().toLowerCase() === 'all';
}

function containsJapaneseText(value: string) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

function getJapaneseNameSearchAliases(term: string) {
  return japaneseNameSearchAliases[normalise(term)] ?? [];
}

function mergeLanguageResults<T extends SearchRow>(primary: T[], secondary: T[], limit: number) {
  const merged: T[] = [];
  const seen = new Set<string>();
  const maxLength = Math.max(primary.length, secondary.length);

  for (let index = 0; index < maxLength && merged.length < limit; index += 1) {
    for (const row of [primary[index], secondary[index]]) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
      if (merged.length >= limit) break;
    }
  }

  return merged;
}

const stripLeadingZeroes = (value: string) => {
  const trimmed = String(value ?? '').trim();
  const stripped = trimmed.replace(/^0+(?=\d)/, '');
  return stripped || trimmed;
};

const parseCardNumberHints = (input: string) => {
  const normalized = String(input ?? '').normalize('NFKC');
  const slashMatch = normalized.match(/#?\s*0*(\d{1,4})\s*(?:\/|-|\sof\s|\s)\s*0*(\d{2,4})(?=\D|$)/i);
  if (slashMatch) {
    const rawNumber = slashMatch[1];
    const rawTotal = slashMatch[2];
    return {
      cardNumberHints: [...new Set([rawNumber, rawNumber.padStart(3, '0'), stripLeadingZeroes(rawNumber)])],
      setTotalHint: stripLeadingZeroes(rawTotal),
    };
  }

  const hashMatch = normalized.match(/#\s*0*(\d{1,4})(?=\D|$)/i);
  if (hashMatch) {
    const rawNumber = hashMatch[1];
    return {
      cardNumberHints: [...new Set([rawNumber, rawNumber.padStart(3, '0'), stripLeadingZeroes(rawNumber)])],
      setTotalHint: null,
    };
  }

  return { cardNumberHints: [] as string[], setTotalHint: null as string | null };
};

function boundedEditDistance(a: string, b: string, maxDistance: number) {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }

  return previous[b.length];
}

function getFuzzyLimit(term: string) {
  if (term.length >= 8) return 2;
  if (term.length >= 5) return 1;
  return 0;
}

function hasAdjacentTransposition(a: string, b: string) {
  if (a.length !== b.length || a === b) return false;
  const mismatches: number[] = [];

  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) mismatches.push(index);
    if (mismatches.length > 2) return false;
  }

  return mismatches.length === 2
    && mismatches[1] === mismatches[0] + 1
    && a[mismatches[0]] === b[mismatches[1]]
    && a[mismatches[1]] === b[mismatches[0]];
}

function bestTokenScore(term: string, tokens: string[]) {
  if (!term) return 0;
  let best = 0;

  for (const token of tokens) {
    if (!token) continue;
    if (token === term) best = Math.max(best, 24);
    else if (token.startsWith(term) && term.length >= 2) best = Math.max(best, term.length >= 4 ? 20 : 15);
    else if (term.startsWith(token) && token.length >= 4) best = Math.max(best, 14);
    else if (token.includes(term) && term.length >= 3) best = Math.max(best, 12);
    else if (term.includes(token) && token.length >= 4) best = Math.max(best, 9);

    const fuzzyLimit = getFuzzyLimit(term);
    if (fuzzyLimit > 0) {
      if (hasAdjacentTransposition(term, token)) best = Math.max(best, 17);
      const distance = boundedEditDistance(term, token, fuzzyLimit);
      if (distance <= fuzzyLimit) best = Math.max(best, distance === 1 ? 17 : 12);
    }
  }

  return best;
}

function phraseBoundaryIncludes(haystack: string, needle: string) {
  if (!needle) return false;
  return new RegExp(`(?:^| )${escapeRegex(needle)}(?: |$)`).test(haystack);
}

function scoreTermsAgainstField(terms: string[], field: string, fieldWeight = 1) {
  if (!terms.length) return 0;

  const normalizedField = normalise(field);
  const fieldTokens = normalizedField.split(/\s+/).filter(Boolean);
  const phrase = terms.join(' ');
  const compactField = normalizedField.replace(/\s+/g, '');
  const compactPhrase = terms.join('');
  let score = 0;

  if (normalizedField === phrase) score += 120;
  else if (normalizedField.startsWith(`${phrase} `)) score += 92;
  else if (phraseBoundaryIncludes(normalizedField, phrase)) score += 84;
  else if (normalizedField.includes(phrase)) score += 66;
  else if (compactField === compactPhrase) score += 92;
  else if (compactField.includes(compactPhrase) && compactPhrase.length >= 4) score += 58;

  const termScores = terms.map((term) => bestTokenScore(term, fieldTokens));
  const matchedCount = termScores.filter((value) => value > 0).length;
  const coverage = matchedCount / terms.length;
  const termScore = termScores.reduce((sum, value) => sum + value, 0);

  if (matchedCount === terms.length) score += 42 + termScore;
  else if (terms.length > 1 && coverage >= 0.66) score += 16 + termScore - (terms.length - matchedCount) * 10;
  else if (terms.length === 1 && termScores[0] > 0) score += termScores[0];

  return Math.round(score * fieldWeight);
}

function getMinimumScore(parsed: ParsedSearch) {
  if (!parsed.nameTerms.length) return parsed.rarityHints.length || parsed.styleHints.length || parsed.matchedSetIds.length ? 20 : 28;
  if (parsed.nameTerms.length === 1) {
    const length = parsed.nameTerms[0].length;
    if (length <= 2) return 54;
    if (length <= 3) return 24;
    return 16;
  }
  return 46;
}

function scoreCard(row: SearchRow, parsed: ParsedSearch) {
  const raw = row.raw_data ?? {};
  const language = normalizePokemonCardLanguage(row.language ?? raw.language);
  const providerCardId = row.source_id
    ?? row.provider_card_id
    ?? raw.source_id
    ?? raw.provider_card_id
    ?? raw.id
    ?? row.external_ids?.tcgdex
    ?? row.id
    ?? null;
  const collectorNumber = row.number ?? raw.localId ?? raw.number ?? null;
  const localName = getLocalCardName({
    id: row.id ?? null,
    sourceId: providerCardId,
    setId: row.set_id ?? raw.set?.id ?? null,
    collectorNumber,
    language,
    region: row.region ?? raw.region ?? null,
    localName: row.local_name ?? raw.local_name ?? (language !== 'en' ? row.name ?? raw.name ?? null : null),
    englishDisplayName: row.english_display_name ?? raw.english_display_name ?? null,
    canonicalName: row.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: row.name ?? raw.name ?? null,
    raw,
  });
  const englishDisplayName = getEnglishCardDisplayName({
    id: row.id ?? null,
    sourceId: providerCardId,
    setId: row.set_id ?? raw.set?.id ?? null,
    collectorNumber,
    language,
    region: row.region ?? raw.region ?? null,
    localName,
    englishDisplayName: row.english_display_name ?? raw.english_display_name ?? null,
    canonicalName: row.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: row.name ?? raw.name ?? null,
    raw,
  });
  const preferredName = getPreferredCardDisplayName({
    id: row.id ?? null,
    sourceId: providerCardId,
    setId: row.set_id ?? raw.set?.id ?? null,
    collectorNumber,
    language,
    region: row.region ?? raw.region ?? null,
    localName,
    englishDisplayName,
    canonicalName: row.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: row.name ?? raw.name ?? null,
    raw,
  });
  const name = normalise(preferredName ?? row.name ?? '');
  const setName = normalise(getSetName(row));
  const rarity = normalise(getRarity(row));
  const subtypes = normalise(getSubtypes(row).join(' '));
  const number = normalise(String(row.number ?? ''));
  const printedTotal = String(row.raw_data?.set?.printedTotal ?? row.raw_data?.set?.total ?? '').trim();
  const aliasText = normalise([
    localName,
    englishDisplayName,
    preferredName,
    row.local_name,
    row.english_display_name,
    row.canonical_name,
    row.raw_data?.local_name,
    row.raw_data?.english_display_name,
    row.raw_data?.canonical_name,
    ...(Array.isArray(row.raw_data?.aliases) ? row.raw_data.aliases : []),
  ].filter(Boolean).join(' '));
  const providerText = normalise([
    row.id,
    row.source_id,
    row.provider_card_id,
    row.raw_data?.source_id,
    row.raw_data?.provider_card_id,
    row.raw_data?.id,
    row.external_ids?.tcgdex,
  ].filter(Boolean).join(' '));
  let score = 0;

  score += scoreTermsAgainstField(parsed.nameTerms, name, 1);
  score += scoreTermsAgainstField(parsed.nameTerms, aliasText, 0.82);
  score += scoreTermsAgainstField(parsed.nameTerms, providerText, 0.8);
  score += scoreTermsAgainstField(parsed.nameTerms, setName, 0.34);

  if (parsed.nameTerms.length && compact(name) === parsed.nameTerms.join('')) score += 28;
  if (parsed.matchedSetIds.includes(row.set_id)) score += 52;
  if (parsed.rarityHints.some((hint) => rarity.includes(normalise(hint)))) score += 30;
  if (parsed.styleHints.some((hint) => {
    const normalizedHint = normalise(hint);
    return name.includes(normalizedHint) || subtypes.includes(normalizedHint) || rarity.includes(normalizedHint);
  })) score += 25;
  if (setName.includes(parsed.normalizedOriginal)) score += 12;
  if (providerText && providerText.includes(parsed.normalizedOriginal)) score += 80;
  if (number && parsed.nameTerms.includes(number)) score += 18;
  if (parsed.cardNumberHints.length && parsed.cardNumberHints.some((hint) => stripLeadingZeroes(number) === stripLeadingZeroes(hint))) {
    score += parsed.setTotalHint && printedTotal && stripLeadingZeroes(printedTotal) === parsed.setTotalHint ? 130 : 74;
  }

  return score;
}

function hasUsefulMatch(row: SearchRow, parsed: ParsedSearch) {
  return scoreCard(row, parsed) >= getMinimumScore(parsed);
}

async function findMatchingSetIds(term: string, language: PokemonCardLanguage) {
  const termKey = normalise(term);
  if (!termKey || termKey.length < 3) return [];
  const cacheKey = `${language}:${termKey}`;
  const cached = setSearchCache.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    const setSearch = normalise(term);
    const sets = await fetchAllSets({ language }).catch(async () => {
      const { data } = await supabase
        .from('pokemon_sets')
        .select('id, name')
        .eq('language', language)
        .or(`name.ilike.%${term}%,id.ilike.%${term}%`)
        .limit(20);
      return data ?? [];
    });

    return (sets ?? [])
      .filter((set: any) => {
        const name = normalise(set.name ?? '');
        const id = normalise(set.id ?? '');
        return name.includes(setSearch) || id.includes(setSearch);
      })
      .map((set: any) => set.id);
  })();

  setSearchCache.set(cacheKey, request);
  return request;
}

function getCardSetId(card: PokemonCard) {
  return card.set?.id ?? card.raw_data?.set?.id ?? card.id.split('-').slice(0, -1).join('-') ?? '';
}

function mapPokemonTcgApiSearchRow(card: PokemonCard): SearchRow {
  const setId = getCardSetId(card);
  const raw = {
    ...(card.raw_data ?? {}),
    id: card.raw_data?.id ?? card.id,
    name: card.raw_data?.name ?? card.name,
    number: card.raw_data?.number ?? card.number,
    rarity: card.raw_data?.rarity ?? card.rarity,
    images: card.raw_data?.images ?? card.images,
    set: card.raw_data?.set ?? card.set,
    tcgplayer: card.raw_data?.tcgplayer ?? card.tcgplayer,
    cardmarket: card.raw_data?.cardmarket ?? card.cardmarket,
    supertype: card.raw_data?.supertype ?? card.supertype,
    subtypes: card.raw_data?.subtypes ?? card.subtypes,
  };

  return {
    id: card.id,
    name: card.name,
    language: card.language ?? 'en',
    region: card.region ?? null,
    external_ids: card.externalIds ?? {},
    number: card.number ?? '',
    rarity: card.rarity ?? null,
    image_small: card.images?.small ?? null,
    image_large: card.images?.large ?? null,
    set_id: setId,
    raw_data: raw,
  };
}

function buildPokemonTcgApiQuery(parsed: ParsedSearch) {
  const nameTerms = parsed.nameTerms
    .filter((term) => term.length >= 3 && !fillerTerms.has(term))
    .slice(0, 3);
  const backedSetIds = parsed.matchedSetIds
    .filter((setId) => apiBackedSetIds.has(normalise(setId)))
    .slice(0, 1);

  if (!nameTerms.length && !backedSetIds.length) return null;

  const parts: string[] = [];
  if (backedSetIds.length === 1) parts.push(`set.id:${backedSetIds[0]}`);
  parts.push(...nameTerms.map((term) => `name:"*${term}*"`));
  return parts.join(' ');
}

async function fetchApiBackedSearchRows(parsed: ParsedSearch, language: PokemonCardLanguage, limit: number) {
  if (language !== 'en') return [];

  const query = buildPokemonTcgApiQuery(parsed);
  if (!query) return [];

  try {
    const cards = await fetchPokemonTcgApiCardsByQuery(query, {
      limit: Math.max(80, Math.min(250, limit * 2)),
    });
    return cards.map(mapPokemonTcgApiSearchRow);
  } catch (error) {
    console.log('Pokemon TCG API search fallback failed:', error);
    return [];
  }
}

async function parseCardSearch(
  input: string,
  language: PokemonCardLanguage,
  skipSetDetection = false,
  enableShortSetDetection = false,
  skipNameCorrection = false
): Promise<ParsedSearch> {
  const original = input.trim();
  const rawTokens = original.split(/\s+/).filter(Boolean);
  let cardTerm = original;
  let matchedSetIds: string[] = [];

  const shouldDetectSet = !skipSetDetection && rawTokens.length > 1 && (enableShortSetDetection || rawTokens.length >= 3);
  if (shouldDetectSet) {
    const suffixSplits = rawTokens.slice(1).map((_, index) => {
      const splitIndex = index + 1;
      return {
        cardTerm: rawTokens.slice(0, splitIndex).join(' '),
        setTerm: rawTokens.slice(splitIndex).join(' '),
      };
    });
    const prefixSplits = rawTokens.slice(0, -1).map((_, index) => {
      const splitIndex = index + 1;
      return {
        cardTerm: rawTokens.slice(splitIndex).join(' '),
        setTerm: rawTokens.slice(0, splitIndex).join(' '),
      };
    });

    const splitResults = await Promise.all(
      [...suffixSplits, ...prefixSplits].map(async (split) => ({
        ...split,
        setIds: await findMatchingSetIds(split.setTerm, language),
      }))
    );
    const match = splitResults.find((split) => split.cardTerm.trim() && split.setIds.length > 0);
    if (match) {
      cardTerm = match.cardTerm;
      matchedSetIds = match.setIds;
    }
  }

  const correctedCardTerm = skipNameCorrection
    ? { changed: false, correctedQuery: cardTerm }
    : await correctPokemonNameQuery(cardTerm, { allowIndex: false });
  const lowerTerm = normalise(correctedCardTerm.changed ? correctedCardTerm.correctedQuery : cardTerm);
  const rarityHints: string[] = [];
  const styleHints: string[] = [];
  const numberHints = parseCardNumberHints(original);
  let searchable = lowerTerm;

  Object.keys(rarityAliases)
    .sort((a, b) => b.length - a.length)
    .forEach((alias) => {
      const normalizedAlias = normalise(alias);
      const pattern = new RegExp(`(^| )${normalizedAlias}( |$)`);
      if (pattern.test(searchable)) {
        rarityHints.push(...rarityAliases[alias]);
        searchable = searchable.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
      }
    });

  Array.from(styleAliases)
    .sort((a, b) => b.length - a.length)
    .forEach((alias) => {
      const normalizedAlias = normalise(alias);
      const pattern = new RegExp(`(^| )${normalizedAlias}( |$)`);
      if (pattern.test(searchable)) {
        styleHints.push(alias);
        searchable = searchable.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
      }
    });

  const terms = searchable.split(/\s+/).filter(Boolean);
  const nameTerms = terms.length > 1 ? terms.filter((term) => !fillerTerms.has(term)) : terms;

  return {
    original,
    normalizedOriginal: normalise(original),
    nameTerms,
    matchedSetIds,
    rarityHints: Array.from(new Set(rarityHints)),
    styleHints: Array.from(new Set(styleHints)),
    cardNumberHints: numberHints.cardNumberHints,
    setTotalHint: numberHints.setTotalHint,
  };
}

function getDbSearchTerms(parsed: ParsedSearch, trimmed: string) {
  const rawTokens = tokenize(trimmed);
  const terms = [...parsed.nameTerms, ...rawTokens]
    .filter((term) => term.length >= 2 && !fillerTerms.has(term))
    .slice(0, 6);
  const variants = new Set<string>();

  for (const term of terms) {
    variants.add(term);
    for (const alias of getJapaneseNameSearchAliases(term)) variants.add(alias);
    if (term === 'pokemon') variants.add('pok_mon');
    if (/^[a-z]+s$/.test(term) && term.length > 3) {
      variants.add(`${term.slice(0, -1)}_s`);
      variants.add(`${term.slice(0, -1)}%s`);
    }
  }

  return Array.from(variants).slice(0, 10);
}

function getCatalogueDbSearchTerms(parsed: ParsedSearch, trimmed: string) {
  const variants = new Set<string>([
    ...getDbSearchTerms(parsed, trimmed),
    trimmed,
    trimmed.replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, ''),
    parsed.normalizedOriginal,
    compact(trimmed),
    ...parsed.cardNumberHints,
    ...parsed.matchedSetIds,
  ]);

  return Array.from(variants)
    .map((term) => String(term ?? '').trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' '))
    .filter((term) => term.length >= 2)
    .slice(0, 12);
}

function mapCatalogueCardSearchRow(row: SearchRow): SearchRow {
  const raw = row.raw_payload ?? row.raw_source ?? row.raw_data ?? {};
  const rawSet = raw.set && typeof raw.set === 'object' ? raw.set : {};
  const language = normalizePokemonCardLanguage(row.language ?? raw.language ?? 'ja');
  const providerCardId = String(row.source_id ?? row.provider_card_id ?? raw.source_id ?? raw.provider_card_id ?? raw.id ?? row.id ?? '')
    .replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, '');
  const collectorNumber = row.collector_number ?? raw.localId ?? raw.number ?? '';
  const imageSmall = row.image_small_url ?? raw.images?.small ?? null;
  const imageLarge = row.image_large_url ?? raw.images?.large ?? null;
  const localName = getLocalCardName({
    id: row.id,
    sourceId: providerCardId,
    language,
    region: row.region ?? raw.region ?? null,
    localName: row.local_name ?? raw.local_name ?? null,
    fallbackName: raw.name ?? providerCardId,
    raw,
  });
  const englishDisplayName = getEnglishCardDisplayName({
    id: row.id,
    sourceId: providerCardId,
    setId: row.set_id ?? rawSet.id ?? null,
    collectorNumber,
    language,
    region: row.region ?? raw.region ?? null,
    localName,
    englishDisplayName: row.english_display_name ?? raw.english_display_name ?? null,
    canonicalName: row.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: raw.name ?? providerCardId,
    raw,
  });
  const name = getPreferredCardDisplayName({
    id: row.id,
    sourceId: providerCardId,
    setId: row.set_id ?? rawSet.id ?? null,
    collectorNumber,
    language,
    region: row.region ?? raw.region ?? null,
    localName,
    englishDisplayName,
    canonicalName: row.canonical_name ?? raw.canonical_name ?? null,
    fallbackName: raw.name ?? providerCardId,
    raw,
  });

  return {
    id: row.id,
    name,
    language,
    region: row.region ?? raw.region ?? null,
    external_ids: {
      ...(raw.external_ids && typeof raw.external_ids === 'object' ? raw.external_ids : {}),
      tcgdex: providerCardId,
    },
    number: collectorNumber,
    rarity: row.rarity ?? raw.rarity ?? null,
    image_small: imageSmall,
    image_large: imageLarge,
    set_id: row.set_id ?? rawSet.id ?? '',
    raw_data: {
      ...raw,
      id: providerCardId,
      name,
      localId: raw.localId ?? collectorNumber,
      number: collectorNumber,
      rarity: row.rarity ?? raw.rarity ?? null,
      language,
      region: row.region ?? raw.region ?? null,
      local_name: localName,
      english_display_name: englishDisplayName ?? row.english_display_name ?? raw.english_display_name ?? null,
      canonical_name: row.canonical_name ?? raw.canonical_name ?? name,
      source_id: providerCardId,
      provider_card_id: row.provider_card_id ?? raw.provider_card_id ?? providerCardId,
      images: {
        ...(raw.images && typeof raw.images === 'object' ? raw.images : {}),
        small: imageSmall,
        large: imageLarge,
      },
      set: {
        ...rawSet,
        id: row.set_id ?? rawSet.id ?? '',
        name: rawSet.name ?? row.set_name ?? row.set_id ?? '',
      },
    },
  };
}

async function fetchCatalogueSearchRows(parsed: ParsedSearch, language: PokemonCardLanguage, limit: number, trimmed: string) {
  if (!['ja', 'zh-tw'].includes(language)) return [];

  const terms = getCatalogueDbSearchTerms(parsed, trimmed);
  let query = supabase
    .from('tcg_cards')
    .select('id,set_id,canonical_name,local_name,english_display_name,collector_number,rarity,image_small_url,image_large_url,language,region,source_id,provider_card_id,raw_payload')
    .eq('language', language)
    .limit(Math.max(limit, 160));

  if (terms.length) {
    const conditions = terms.flatMap((term) => [
      `canonical_name.ilike.%${term}%`,
      `local_name.ilike.%${term}%`,
      `english_display_name.ilike.%${term}%`,
      `collector_number.ilike.%${term}%`,
      `source_id.ilike.%${term}%`,
      `provider_card_id.ilike.%${term}%`,
      `set_id.ilike.%${term}%`,
    ]);
    query = query.or(conditions.join(','));
  }

  if (parsed.matchedSetIds.length > 0) query = query.in('set_id', parsed.matchedSetIds);

  try {
    const { data, error } = await query;
    if (error) {
      console.log('Canonical foreign card search unavailable:', error.message);
      return [];
    }
    return (data ?? []).map(mapCatalogueCardSearchRow);
  } catch (error) {
    console.log('Canonical foreign card search failed:', error);
    return [];
  }
}

function readDexIds(value: unknown): number[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
}

function getDexIdsFromRows(rows: SearchRow[], limit = 4) {
  const dexIds = new Set<number>();
  for (const row of rows) {
    for (const id of [
      ...readDexIds(row.dexId),
      ...readDexIds(row.nationalPokedexNumbers),
      ...readDexIds(row.raw_data?.dexId),
      ...readDexIds(row.raw_data?.nationalPokedexNumbers),
      ...readDexIds(row.raw_data?.nationalPokedexNumber),
    ]) {
      dexIds.add(id);
      if (dexIds.size >= limit) return [...dexIds];
    }
  }
  return [...dexIds];
}

async function fetchJapaneseCatalogueRowsByDexIds(dexIds: number[], limit: number) {
  const ids = [...new Set(dexIds)].slice(0, 4);
  if (!ids.length) return [];

  const rows: SearchRow[] = [];
  const seen = new Set<string>();
  await Promise.all(ids.map(async (dexId) => {
    try {
      const { data, error } = await supabase
        .from('tcg_cards')
        .select('id,set_id,canonical_name,local_name,english_display_name,collector_number,rarity,image_small_url,image_large_url,language,region,source_id,provider_card_id,raw_payload')
        .eq('language', 'ja')
        .contains('raw_payload', { dexId: [dexId] })
        .limit(Math.max(12, Math.ceil(limit / Math.max(ids.length, 1))));

      if (error) {
        console.log('Japanese dex alias search unavailable:', error.message);
        return;
      }

      for (const row of (data ?? []).map(mapCatalogueCardSearchRow)) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    } catch (error) {
      console.log('Japanese dex alias search failed:', error);
    }
  }));

  return rows.slice(0, limit);
}

async function getIndexCandidateIds(parsed: ParsedSearch, limit: number) {
  try {
    const index = await getLocalCardIndex();
    const cards = index?.cards ?? [];
    if (!cards.length) return [];

    return cards
      .map((card) => ({
        id: card.id,
        score: scoreCard(
          {
            id: card.id,
            name: card.name,
            number: card.number,
            rarity: card.rarity,
            set_id: card.set_id,
            set_name: card.set_name,
          },
          parsed
        ),
      }))
      .filter((item) => item.score >= getMinimumScore(parsed))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(limit * 4, 120))
      .map((item) => item.id);
  } catch (error) {
    console.log('Local card search index unavailable:', error);
    return [];
  }
}

export async function searchLocalPokemonCards<T extends SearchRow = SearchRow>(
  input: string,
  options: SearchOptions = {}
): Promise<T[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];
  const limit = options.limit ?? 80;
  const cards = await searchStackrCards(trimmed, {
    language: isAllLanguageSearch(options.language) ? null : options.language,
    limit,
  });
  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    language: card.language,
    region: card.region,
    number: card.number,
    rarity: card.rarity ?? null,
    image_small: card.images.small ?? null,
    image_large: card.images.large ?? null,
    set_id: card.set.id,
    set_name: card.set.name,
    external_ids: card.externalIds,
    raw_data: card.raw_data,
  })) as unknown as T[];
}
