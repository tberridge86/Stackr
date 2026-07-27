import type { LocalScanCard } from './localCardIndex';

export type PokemonNameCorrection = {
  originalQuery: string;
  correctedQuery: string;
  changed: boolean;
  replacements: { from: string; to: string }[];
};

type Candidate = {
  key: string;
  display: string;
  tokens: string[];
  popularity: number;
};

const COMMON_POKEMON_NAMES = [
  'Bulbasaur', 'Ivysaur', 'Venusaur', 'Charmander', 'Charmeleon', 'Charizard',
  'Squirtle', 'Wartortle', 'Blastoise', 'Pikachu', 'Raichu', 'Nidoran',
  'Vulpix', 'Ninetales', 'Jigglypuff', 'Zubat', 'Oddish', 'Psyduck',
  'Growlithe', 'Arcanine', 'Abra', 'Machop', 'Geodude', 'Ponyta', 'Slowpoke',
  'Magnemite', 'Farfetchd', 'Doduo', 'Seel', 'Grimer', 'Shellder', 'Gastly',
  'Haunter', 'Gengar', 'Onix', 'Drowzee', 'Krabby', 'Voltorb', 'Exeggcute',
  'Cubone', 'Koffing', 'Rhyhorn', 'Chansey', 'Tangela', 'Kangaskhan',
  'Horsea', 'Staryu', 'Scyther', 'Jynx', 'Electabuzz', 'Magmar', 'Pinsir',
  'Magikarp', 'Gyarados', 'Lapras', 'Ditto', 'Eevee', 'Vaporeon', 'Jolteon',
  'Flareon', 'Porygon', 'Snorlax', 'Articuno', 'Zapdos', 'Moltres',
  'Dratini', 'Dragonair', 'Dragonite', 'Mewtwo', 'Mew', 'Chikorita',
  'Cyndaquil', 'Totodile', 'Togepi', 'Mareep', 'Ampharos', 'Espeon',
  'Umbreon', 'Murkrow', 'Wobbuffet', 'Steelix', 'Scizor', 'Heracross',
  'Sneasel', 'Teddiursa', 'Houndour', 'Houndoom', 'Kingdra', 'Raikou',
  'Entei', 'Suicune', 'Larvitar', 'Pupitar', 'Tyranitar', 'Lugia', 'Ho Oh',
  'Celebi', 'Treecko', 'Torchic', 'Mudkip', 'Ralts', 'Gardevoir', 'Sableye',
  'Mawile', 'Aggron', 'Plusle', 'Minun', 'Roselia', 'Wailmer', 'Torkoal',
  'Trapinch', 'Flygon', 'Swablu', 'Altaria', 'Zangoose', 'Seviper',
  'Milotic', 'Absol', 'Bagon', 'Metang', 'Metagross', 'Regirock', 'Regice',
  'Registeel', 'Latias', 'Latios', 'Kyogre', 'Groudon', 'Rayquaza',
  'Jirachi', 'Deoxys', 'Turtwig', 'Chimchar', 'Piplup', 'Shinx', 'Lucario',
  'Garchomp', 'Riolu', 'Leafeon', 'Glaceon', 'Rotom', 'Dialga', 'Palkia',
  'Giratina', 'Darkrai', 'Shaymin', 'Arceus', 'Snivy', 'Tepig', 'Oshawott',
  'Zorua', 'Zoroark', 'Emolga', 'Litwick', 'Chandelure', 'Axew', 'Hydreigon',
  'Cobalion', 'Terrakion', 'Virizion', 'Reshiram', 'Zekrom', 'Kyurem',
  'Keldeo', 'Meloetta', 'Genesect', 'Chespin', 'Fennekin', 'Froakie',
  'Greninja', 'Talonflame', 'Sylveon', 'Hawlucha', 'Dedenne', 'Goomy',
  'Goodra', 'Noibat', 'Noivern', 'Xerneas', 'Yveltal', 'Zygarde', 'Diancie',
  'Hoopa', 'Volcanion', 'Rowlet', 'Litten', 'Popplio', 'Lycanroc',
  'Mimikyu', 'Tapu Koko', 'Tapu Lele', 'Tapu Bulu', 'Tapu Fini', 'Solgaleo',
  'Lunala', 'Necrozma', 'Magearna', 'Marshadow', 'Meltan', 'Melmetal',
  'Grookey', 'Scorbunny', 'Sobble', 'Corviknight', 'Toxtricity', 'Eiscue',
  'Morpeko', 'Zacian', 'Zamazenta', 'Eternatus', 'Kubfu', 'Urshifu',
  'Regieleki', 'Regidrago', 'Glastrier', 'Spectrier', 'Calyrex', 'Sprigatito',
  'Fuecoco', 'Quaxly', 'Pawmi', 'Fidough', 'Smoliv', 'Charcadet', 'Armarouge',
  'Ceruledge', 'Wiglett', 'Finizen', 'Palafin', 'Tinkatink', 'Tinkaton',
  'Cyclizar', 'Frigibax', 'Baxcalibur', 'Gimmighoul', 'Gholdengo', 'Wo Chien',
  'Chien Pao', 'Ting Lu', 'Chi Yu', 'Koraidon', 'Miraidon', 'Terapagos',
  'Ogerpon', 'Pecharunt',
];

const IGNORE_TERMS = new Set([
  'a', 'an', 'and', 'art', 'base', 'binder', 'box', 'card', 'cards', 'case',
  'collection', 'dark', 'elite', 'energy', 'etb', 'ex', 'full', 'gallery',
  'gold', 'graded', 'gx', 'holo', 'illustration', 'light', 'market', 'mega',
  'mint', 'pack', 'pokemon', 'promo', 'rare', 'reverse', 'sealed', 'secret',
  'set', 'shiny', 'silver', 'slab', 'special', 'star', 'tag', 'tcg', 'team',
  'trainer', 'ultra', 'v', 'vmax', 'vstar',
]);

const CARD_DECORATOR_TERMS = new Set([
  ...IGNORE_TERMS,
  'break', 'lv', 'prime', 'radiant', 'rocket', 'spec', 'union',
]);

const KEYBOARD_AUTOCORRECT_ALIASES: Record<string, string> = {
  darker: 'Darkrai',
};

let candidatePromise: Promise<Candidate[]> | null = null;

const normalise = (value: string | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019`]/g, "'")
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/\u2640/g, ' female ')
    .replace(/\u2642/g, ' male ')
    .replace(/([a-z])'s\b/g, '$1s')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compact = (value: string) => normalise(value).replace(/\s+/g, '');

function toDisplayName(key: string) {
  const special: Record<string, string> = {
    farfetchd: "Farfetch'd",
    'ho oh': 'Ho-Oh',
    'mr mime': 'Mr. Mime',
    'mime jr': 'Mime Jr.',
    'type null': 'Type: Null',
  };
  if (special[key]) return special[key];
  return key.split(' ').map((token) => token ? token[0].toUpperCase() + token.slice(1) : token).join(' ');
}

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
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }

  return previous[b.length];
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

function maxDistanceFor(value: string) {
  if (value.length >= 9) return 3;
  if (value.length >= 5) return 2;
  if (value.length >= 4) return 1;
  return 0;
}

function addCandidate(target: Map<string, Candidate>, value: string, popularity = 1) {
  const key = normalise(value);
  if (!key || key.length < 3 || /^\d+$/.test(key)) return;
  const tokens = key.split(' ').filter(Boolean);
  if (!tokens.length || tokens.every((token) => CARD_DECORATOR_TERMS.has(token))) return;

  const existing = target.get(key);
  if (existing) {
    existing.popularity += popularity;
    return;
  }

  target.set(key, {
    key,
    display: toDisplayName(key),
    tokens,
    popularity,
  });
}

function addCardNameCandidates(target: Map<string, Candidate>, card: LocalScanCard) {
  const base = normalise(card.name)
    .replace(/\b(ex|gx|vmax|vstar|v union|v|break|lv x|prime)\b/g, ' ')
    .replace(/\b(full art|special illustration rare|illustration rare|rare|holo|reverse)\b/g, ' ')
    .replace(/\b(radiant|dark|light|shining|mega|m)\b/g, ' ')
    .replace(/^[a-z0-9]+s\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) return;
  const tokens = base.split(' ').filter((token) => token.length >= 3 && !CARD_DECORATOR_TERMS.has(token));
  if (!tokens.length) return;

  if (tokens.length <= 3) addCandidate(target, tokens.join(' '), 2);
  for (const token of tokens) addCandidate(target, token, 1);
}

function buildSeedCandidates() {
  const candidates = new Map<string, Candidate>();
  for (const name of COMMON_POKEMON_NAMES) addCandidate(candidates, name, 20);
  return candidates;
}

async function getCandidates(allowIndex: boolean) {
  if (!allowIndex) return Array.from(buildSeedCandidates().values());
  if (!candidatePromise) {
    candidatePromise = (async () => {
      const candidates = buildSeedCandidates();
      try {
        const { getLocalCardIndex } = await import('./localCardIndex');
        const index = await getLocalCardIndex();
        for (const card of index?.cards ?? []) addCardNameCandidates(candidates, card);
      } catch (error) {
        console.log('Pokemon name autocorrect index unavailable:', error);
      }
      return Array.from(candidates.values()).sort((a, b) => b.popularity - a.popularity);
    })();
  }
  return candidatePromise;
}

function findBestCandidate(value: string, candidates: Candidate[], options: { phrasesOnly?: boolean } = {}) {
  const search = normalise(value);
  const searchCompact = compact(search);
  if (!search || IGNORE_TERMS.has(search) || search.length < 3) return null;

  const aliasedPokemonName = KEYBOARD_AUTOCORRECT_ALIASES[search];
  if (aliasedPokemonName) {
    const aliasedKey = normalise(aliasedPokemonName);
    const aliasedCandidate = candidates.find((candidate) => candidate.key === aliasedKey);
    if (aliasedCandidate) return aliasedCandidate;
  }

  let best: { candidate: Candidate; score: number; distance: number } | null = null;

  for (const candidate of candidates) {
    const candidateCompact = compact(candidate.key);
    if (options.phrasesOnly && candidate.tokens.length < 2 && candidateCompact !== searchCompact) continue;
    const maxDistance = maxDistanceFor(searchCompact);
    let score = 0;
    let distance = maxDistance + 1;

    if (candidate.key === search || candidateCompact === searchCompact) {
      score = 1000 + candidate.popularity;
      distance = 0;
    } else if (hasAdjacentTransposition(searchCompact, candidateCompact)) {
      score = 760 + candidate.popularity;
      distance = 1;
    } else {
      distance = boundedEditDistance(searchCompact, candidateCompact, maxDistance);
      if (distance <= maxDistance) {
        const similarity = 1 - distance / Math.max(searchCompact.length, candidateCompact.length);
        score = Math.round(similarity * 700) + Math.min(candidate.popularity, 80);
      }
    }

    if (score > 0 && (!best || score > best.score)) best = { candidate, score, distance };
  }

  if (!best) return null;
  if (best.distance === 0) return best.candidate;
  const similarity = 1 - best.distance / Math.max(searchCompact.length, compact(best.candidate.key).length);
  return similarity >= 0.72 ? best.candidate : null;
}

export async function correctPokemonNameQuery(
  query: string,
  options: { allowIndex?: boolean } = {}
): Promise<PokemonNameCorrection> {
  const originalQuery = query;
  const tokens = normalise(query).split(' ').filter(Boolean);
  if (!tokens.length) {
    return { originalQuery, correctedQuery: query, changed: false, replacements: [] };
  }

  const candidates = await getCandidates(options.allowIndex !== false);
  const replacements: PokemonNameCorrection['replacements'] = [];
  const corrected = [...tokens];

  for (let windowSize = Math.min(3, tokens.length); windowSize >= 2; windowSize--) {
    for (let index = 0; index <= corrected.length - windowSize; index++) {
      const window = corrected.slice(index, index + windowSize).join(' ');
      if (!window.trim()) continue;
      const best = findBestCandidate(window, candidates, { phrasesOnly: true });
      if (!best || best.key === window) continue;
      corrected.splice(index, windowSize, best.display);
      replacements.push({ from: window, to: best.display });
    }
  }

  for (let index = 0; index < corrected.length; index++) {
    const token = corrected[index];
    const normalisedToken = normalise(token);
    if (IGNORE_TERMS.has(normalisedToken)) continue;
    const best = findBestCandidate(normalisedToken, candidates);
    if (!best || best.key === normalisedToken) continue;
    corrected[index] = best.display;
    replacements.push({ from: token, to: best.display });
  }

  const correctedQuery = corrected.join(' ');
  return {
    originalQuery,
    correctedQuery,
    changed: replacements.length > 0 && normalise(correctedQuery) !== normalise(originalQuery),
    replacements,
  };
}
