import { supabase } from './supabase';

type SearchRow = Record<string, any>;

type SearchOptions = {
  limit?: number;
  select?: string;
  skipSetDetection?: boolean;
};

type ParsedSearch = {
  original: string;
  nameTerms: string[];
  matchedSetIds: string[];
  rarityHints: string[];
  styleHints: string[];
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
]);

const normalise = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`’]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

const getSetName = (row: SearchRow) => row.raw_data?.set?.name ?? row.set?.name ?? row.set_name ?? row.set_id ?? '';
const getRarity = (row: SearchRow) => row.rarity ?? row.raw_data?.rarity ?? '';
const getSubtypes = (row: SearchRow): string[] => row.raw_data?.subtypes ?? row.subtypes ?? [];

const termMatchesName = (name: string, term: string) => {
  if (name.includes(term)) return true;
  if (!term.includes("'") && /[a-z]s$/.test(term)) {
    return name.includes(`${term.slice(0, -1)} s`);
  }
  return false;
};

async function parseCardSearch(input: string, skipSetDetection = false): Promise<ParsedSearch> {
  const original = input.trim();
  const rawTokens = original.split(/\s+/).filter(Boolean);
  let cardTerm = original;
  let matchedSetIds: string[] = [];

  if (!skipSetDetection && rawTokens.length > 1) {
    for (let i = 1; i < rawTokens.length; i++) {
      const possibleCardTerm = rawTokens.slice(0, i).join(' ');
      const possibleSetTerm = rawTokens.slice(i).join(' ');
      const { data } = await supabase
        .from('pokemon_sets')
        .select('id, name')
        .or(`name.ilike.%${possibleSetTerm}%,id.ilike.%${possibleSetTerm}%`)
        .limit(20);

      const setSearch = normalise(possibleSetTerm);
      const filtered = (data ?? []).filter((set: any) => {
        const name = normalise(set.name ?? '');
        const id = normalise(set.id ?? '');
        return name.includes(setSearch) || id.includes(setSearch);
      });

      if (filtered.length > 0) {
        cardTerm = possibleCardTerm;
        matchedSetIds = filtered.map((set: any) => set.id);
        break;
      }
    }
  }

  const lowerTerm = normalise(cardTerm);
  const rarityHints: string[] = [];
  const styleHints: string[] = [];
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

  return {
    original,
    nameTerms: searchable.split(/\s+/).filter(Boolean),
    matchedSetIds,
    rarityHints: Array.from(new Set(rarityHints)),
    styleHints: Array.from(new Set(styleHints)),
  };
}

function scoreCard(row: SearchRow, parsed: ParsedSearch) {
  const name = normalise(row.name ?? '');
  const setName = normalise(getSetName(row));
  const rarity = normalise(getRarity(row));
  const subtypes = normalise(getSubtypes(row).join(' '));
  let score = 0;

  if (parsed.nameTerms.every((term) => termMatchesName(name, term))) score += 80;
  if (parsed.nameTerms.length && name.startsWith(parsed.nameTerms.join(' '))) score += 20;
  if (parsed.matchedSetIds.includes(row.set_id)) score += 40;
  if (parsed.rarityHints.some((hint) => rarity.includes(normalise(hint)))) score += 30;
  if (parsed.styleHints.some((hint) => name.includes(normalise(hint)) || subtypes.includes(normalise(hint)) || rarity.includes(normalise(hint)))) score += 25;
  if (setName.includes(normalise(parsed.original))) score += 5;

  return score;
}

export async function searchLocalPokemonCards<T extends SearchRow = SearchRow>(
  input: string,
  options: SearchOptions = {}
): Promise<T[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];

  const parsed = await parseCardSearch(trimmed, options.skipSetDetection);
  const primaryNameTerm = parsed.nameTerms[0] ?? trimmed.split(/\s+/)[0] ?? trimmed;
  const normalizedPrimary = primaryNameTerm.replace(/\bpokemon\b/gi, 'Pokémon');

  let query = supabase
    .from('pokemon_cards')
    .select(options.select ?? 'id, name, number, rarity, image_small, image_large, set_id, raw_data')
    .limit(Math.max(options.limit ?? 80, 120));

  if (normalizedPrimary) {
    if (!normalizedPrimary.includes("'") && /[a-z]s$/i.test(normalizedPrimary)) {
      const wildcardForm = `${normalizedPrimary.slice(0, -1)}_s`;
      query = query.or(`name.ilike.%${normalizedPrimary}%,name.ilike.%${wildcardForm}%`);
    } else {
      query = query.ilike('name', `%${normalizedPrimary}%`);
    }
  }

  if (parsed.matchedSetIds.length > 0) query = query.in('set_id', parsed.matchedSetIds);

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown as T[])
    .filter((row) => {
      const name = normalise(row.name ?? '');
      const rarity = normalise(getRarity(row));
      const subtypes = normalise(getSubtypes(row).join(' '));
      const nameMatches = parsed.nameTerms.every((term) => termMatchesName(name, term));
      const rarityMatches = parsed.rarityHints.length === 0 || parsed.rarityHints.some((hint) => rarity.includes(normalise(hint)));
      const styleMatches = parsed.styleHints.length === 0 || parsed.styleHints.some((hint) => {
        const normalizedHint = normalise(hint);
        return name.includes(normalizedHint) || subtypes.includes(normalizedHint) || rarity.includes(normalizedHint);
      });
      return nameMatches && rarityMatches && styleMatches;
    })
    .sort((a, b) => scoreCard(b, parsed) - scoreCard(a, parsed));

  return rows.slice(0, options.limit ?? 80);
}
