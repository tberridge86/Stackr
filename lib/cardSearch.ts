import { supabase } from './supabase';
import { getLocalCardIndex } from './localCardIndex';
import { correctPokemonNameQuery } from './pokemonNameAutocorrect';
import { normalizePokemonCardLanguage, type PokemonCardLanguage } from './pokemonTcg';

type SearchRow = Record<string, any>;

type SearchOptions = {
  limit?: number;
  select?: string;
  language?: PokemonCardLanguage | string | null;
  skipSetDetection?: boolean;
  enableShortSetDetection?: boolean;
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
  sir: ['special illustration rare', 'rare special illustration'],
  'special illustration rare': ['special illustration rare', 'rare special illustration'],
  'special illustration': ['special illustration rare', 'rare special illustration'],
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
const getSetName = (row: SearchRow) => row.raw_data?.set?.name ?? row.set?.name ?? row.set_name ?? row.set_id ?? '';
const getRarity = (row: SearchRow) => row.rarity ?? row.raw_data?.rarity ?? '';
const getSubtypes = (row: SearchRow): string[] => row.raw_data?.subtypes ?? row.subtypes ?? [];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const setSearchCache = new Map<string, Promise<string[]>>();

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
  const name = normalise(row.name ?? '');
  const setName = normalise(getSetName(row));
  const rarity = normalise(getRarity(row));
  const subtypes = normalise(getSubtypes(row).join(' '));
  const number = normalise(String(row.number ?? ''));
  const printedTotal = String(row.raw_data?.set?.printedTotal ?? row.raw_data?.set?.total ?? '').trim();
  let score = 0;

  score += scoreTermsAgainstField(parsed.nameTerms, name, 1);
  score += scoreTermsAgainstField(parsed.nameTerms, setName, 0.34);

  if (parsed.nameTerms.length && compact(name) === parsed.nameTerms.join('')) score += 28;
  if (parsed.matchedSetIds.includes(row.set_id)) score += 52;
  if (parsed.rarityHints.some((hint) => rarity.includes(normalise(hint)))) score += 30;
  if (parsed.styleHints.some((hint) => {
    const normalizedHint = normalise(hint);
    return name.includes(normalizedHint) || subtypes.includes(normalizedHint) || rarity.includes(normalizedHint);
  })) score += 25;
  if (setName.includes(parsed.normalizedOriginal)) score += 12;
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
    const { data } = await supabase
      .from('pokemon_sets')
      .select('id, name')
      .eq('language', language)
      .or(`name.ilike.%${term}%,id.ilike.%${term}%`)
      .limit(20);

    const setSearch = normalise(term);
    return (data ?? [])
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

async function parseCardSearch(
  input: string,
  language: PokemonCardLanguage,
  skipSetDetection = false,
  enableShortSetDetection = false
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

  const correctedCardTerm = await correctPokemonNameQuery(cardTerm, { allowIndex: false });
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
    if (term === 'pokemon') variants.add('pok_mon');
    if (/^[a-z]+s$/.test(term) && term.length > 3) {
      variants.add(`${term.slice(0, -1)}_s`);
      variants.add(`${term.slice(0, -1)}%s`);
    }
  }

  return Array.from(variants).slice(0, 10);
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

  const language = normalizePokemonCardLanguage(options.language);
  const parsed = await parseCardSearch(trimmed, language, options.skipSetDetection, options.enableShortSetDetection);
  const limit = options.limit ?? 80;
  const dbSearchTerms = getDbSearchTerms(parsed, trimmed);
  const select = options.select ?? 'id, name, language, number, rarity, image_small, image_large, set_id, raw_data';

  let query = supabase
    .from('pokemon_cards')
    .select(select)
    .eq('language', language)
    .limit(Math.max(limit, 160));

  if (dbSearchTerms.length) {
    query = query.or(dbSearchTerms.map((term) => `name.ilike.%${term}%`).join(','));
  }

  if (parsed.matchedSetIds.length > 0) query = query.in('set_id', parsed.matchedSetIds);

  const { data, error } = await query;
  if (error) throw error;

  const candidateMap = new Map<string, T>();
  for (const row of (data ?? []) as unknown as T[]) {
    if (row?.id) candidateMap.set(row.id, row);
  }

  if (parsed.cardNumberHints.length) {
    const numberConditions = parsed.cardNumberHints
      .flatMap((hint) => [hint, stripLeadingZeroes(hint), hint.padStart(3, '0')])
      .filter(Boolean)
      .map((hint) => `number.eq.${hint}`);
    const { data: numberRows, error: numberError } = await supabase
      .from('pokemon_cards')
      .select(select)
      .eq('language', language)
      .or([...new Set(numberConditions)].join(','))
      .limit(Math.max(limit * 3, 120));

    if (numberError) throw numberError;
    for (const row of (numberRows ?? []) as unknown as T[]) {
      if (row?.id) candidateMap.set(row.id, row);
    }
  }

  const strongDbRows = Array.from(candidateMap.values()).filter((row) => hasUsefulMatch(row, parsed));

  if (strongDbRows.length === 0) {
    const candidateIds = await getIndexCandidateIds(parsed, limit);
    const missingIds = candidateIds.filter((id) => !candidateMap.has(id)).slice(0, Math.max(limit * 3, 120));

    if (missingIds.length) {
      const { data: indexedRows, error: indexedError } = await supabase
        .from('pokemon_cards')
        .select(select)
        .eq('language', language)
        .in('id', missingIds);

      if (indexedError) throw indexedError;
      for (const row of (indexedRows ?? []) as unknown as T[]) {
        if (row?.id) candidateMap.set(row.id, row);
      }
    }
  }

  return Array.from(candidateMap.values())
    .map((row) => ({ row, score: scoreCard(row, parsed) }))
    .filter((item) => item.score >= getMinimumScore(parsed))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.row);
}
