import type { PokemonCatalogueLanguageCode } from '../components/PokemonLanguageBadge';

export type UpcomingPokemonSet = {
  id: string;
  language: PokemonCatalogueLanguageCode;
  name: string;
  releaseDate: string;
  searchAliases: readonly string[];
  sourceUrl: string;
};

// Official announcements only: these are informational entries, not published
// checklists. Do not add card counts, artwork or provider codes without evidence.
export const UPCOMING_POKEMON_SETS: readonly UpcomingPokemonSet[] = [
  {
    id: 'a1bde625-6996-5451-bcda-fb80fe5b428b',
    language: 'en',
    name: 'Mega Evolution—Delta Reign',
    releaseDate: '2026-11-06',
    searchAliases: ['DLR'],
    sourceUrl: 'https://www.pokemon.com/us/features/sneak-a-peek-at-cards-from-the-mega-evolution-delta-reign-expansion',
  },
  {
    id: '59db1153-e406-560f-a99e-e45a10ca5f55',
    language: 'zh-cn',
    name: '宝可梦集换式卡牌游戏 朱&紫 Pokémon宝石包 VOL.7',
    releaseDate: '2026-11-06',
    searchAliases: ['Gem Pack Vol 7', '宝石包第七弹', '宝石包7'],
    sourceUrl: 'https://www.pokemon.cn/tcg/24281.html',
  },
];

export function normalizeDiscoverSetSearch(value?: string | null) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function identity(set: { id: string; language?: string | null }) {
  return `${String(set.language ?? 'en').trim().toLowerCase()}:${set.id.trim().toLowerCase()}`;
}

export function selectUpcomingPokemonSets({
  publishedSets,
  language = 'all',
  query = '',
  announcements = UPCOMING_POKEMON_SETS,
}: {
  publishedSets: readonly { id: string; language?: string | null }[];
  language?: PokemonCatalogueLanguageCode | 'all';
  query?: string;
  announcements?: readonly UpcomingPokemonSet[];
}) {
  const published = new Set(publishedSets.map(identity));
  const seen = new Set<string>();
  const tokens = normalizeDiscoverSetSearch(query).split(' ').filter(Boolean);
  return announcements.filter((set) => {
    const key = identity(set);
    if (published.has(key) || seen.has(key)) return false;
    seen.add(key);
    if (language !== 'all' && set.language !== language) return false;
    const searchable = normalizeDiscoverSetSearch([set.name, ...set.searchAliases].join(' '));
    return tokens.every((token) => searchable.includes(token));
  });
}

// Compare calendar dates in UTC, without parsing a date-only value into the
// device's timezone. Invalid/missing dates never manufacture an upcoming state.
export function isFuturePokemonSetRelease(releaseDate?: string | null, now = new Date()) {
  const normalized = String(releaseDate ?? '').replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(now.getTime())) return false;
  const timestamp = Date.parse(`${normalized}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== normalized) return false;
  return normalized > now.toISOString().slice(0, 10);
}

export function upcomingPokemonSetStatus(releaseDate?: string | null, now = new Date()) {
  return isFuturePokemonSetRelease(releaseDate, now) ? 'Coming soon' : 'Checklist pending';
}
