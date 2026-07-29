import type { PokemonCard, PokemonCardLanguage, PokemonSet } from './pokemonTcg';

type CuratedCardInput = {
  id: string;
  name: string;
  localName: string;
  englishDisplayName: string;
  setId: string;
  number: string;
  releaseDate: string;
  releaseLabel: string;
  variantLabel: string;
  aliases: string[];
  sourceUrls: string[];
  sortOrder: number;
};

export type CuratedPokemonCardDbRow = {
  id: string;
  name: string;
  language: PokemonCardLanguage;
  region: string;
  external_ids: Record<string, unknown>;
  number: string;
  rarity: string;
  image_small: null;
  image_large: null;
  set_id: string;
  raw_data: Record<string, any>;
};

const language: PokemonCardLanguage = 'ja';
const region = 'JP';
const sourceProvider = 'stackr_manual';
const seriesId = 'ja:unnumbered-promos';
const seriesName = 'Japanese Unnumbered Promos';

const curatedSets: PokemonSet[] = [
  {
    id: 'ja:corocoro-comic-february-1997-promo',
    name: 'CoroCoro Comic Promo (February 1997)',
    series: seriesName,
    printedTotal: 1,
    total: 1,
    releaseDate: '1997-01-15',
    language,
    region,
    localName: 'CoroCoro Comic Promo',
    englishDisplayName: 'CoroCoro Comic Promo (February 1997)',
    externalIds: {
      stackrManual: 'corocoro-comic-february-1997-promo',
      setCode: 'corocoro-1997-02',
    },
    images: {},
  },
  {
    id: 'ja:corocoro-comic-may-2001-promo',
    name: 'CoroCoro Comic Promo (May 2001)',
    series: seriesName,
    printedTotal: 1,
    total: 1,
    releaseDate: '2001-04-15',
    language,
    region,
    localName: 'CoroCoro Comic Promo',
    englishDisplayName: 'CoroCoro Comic Promo (May 2001)',
    externalIds: {
      stackrManual: 'corocoro-comic-may-2001-promo',
      setCode: 'corocoro-2001-05',
    },
    images: {},
  },
];

const setById = new Map(curatedSets.map((set) => [set.id, set]));

const curatedCardInputs: CuratedCardInput[] = [
  {
    id: 'ja:corocoro-mew-1997',
    name: 'Mew',
    localName: 'ミュウ',
    englishDisplayName: 'Mew',
    setId: 'ja:corocoro-comic-february-1997-promo',
    number: 'Unnumbered',
    releaseDate: '1997-01-15',
    releaseLabel: 'February 1997 CoroCoro Comic insert',
    variantLabel: 'Glossy CoroCoro Comic promo',
    aliases: [
      'CoroCoro Mew',
      'Coro Coro Mew',
      'CoroCoro Comic Mew',
      'Mew CoroCoro Promo',
      '1997 CoroCoro Mew',
      'Lilypad Mew',
      'Lily Pad Mew',
      'Glossy Mew',
      'No.151 Mew',
      '#151 Mew',
    ],
    sourceUrls: [
      'https://bulbapedia.bulbagarden.net/wiki/Mew_(Wizards_Promo_47)',
      'https://pokumon.com/card/mew-corocoro-1997-unnumbered/',
    ],
    sortOrder: 10,
  },
  {
    id: 'ja:corocoro-shining-mew-2001',
    name: 'Shining Mew',
    localName: 'ひかるミュウ',
    englishDisplayName: 'Shining Mew',
    setId: 'ja:corocoro-comic-may-2001-promo',
    number: 'Unnumbered',
    releaseDate: '2001-04-15',
    releaseLabel: 'May 2001 CoroCoro Comic insert',
    variantLabel: 'CoroCoro Comic holo promo',
    aliases: [
      'CoroCoro Shining Mew',
      'Coro Coro Shining Mew',
      'Shining Mew CoroCoro',
      'Shining Mew CoroCoro Comic Promo',
      '2001 CoroCoro Mew',
      '2001 CoroCoro Shining Mew',
      'No.151 Shining Mew',
      '#151 Shining Mew',
    ],
    sourceUrls: [
      'https://bulbapedia.bulbagarden.net/wiki/Shining_Mew_(CoroCoro_promo)',
      'https://bulbapedia.bulbagarden.net/wiki/Unnumbered_Promotional_cards_(TCG)/1996-2005',
    ],
    sortOrder: 20,
  },
];

function normaliseCuratedSearch(value: string) {
  return String(value ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pok\u00e9mon/g, 'pokemon')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactCuratedSearch(value: string) {
  return normaliseCuratedSearch(value).replace(/\s+/g, '');
}

function createCuratedCardRow(input: CuratedCardInput): CuratedPokemonCardDbRow {
  const set = setById.get(input.setId)!;
  const providerCardId = input.id.replace(/^ja:/, '');
  const rawSet = {
    id: set.id,
    name: set.name,
    local_name: set.localName,
    english_display_name: set.englishDisplayName,
    series: set.series,
    language,
    region,
    releaseDate: set.releaseDate,
    printedTotal: set.printedTotal,
    total: set.total,
    set_code: set.externalIds?.setCode,
    source_provider: sourceProvider,
    source_id: set.externalIds?.stackrManual,
  };

  return {
    id: input.id,
    name: input.name,
    language,
    region,
    external_ids: {
      stackrManual: providerCardId,
    },
    number: input.number,
    rarity: 'Promo',
    image_small: null,
    image_large: null,
    set_id: input.setId,
    raw_data: {
      id: providerCardId,
      source_id: providerCardId,
      provider_card_id: providerCardId,
      source_provider: sourceProvider,
      name: input.name,
      local_name: input.localName,
      english_display_name: input.englishDisplayName,
      canonical_name: input.name,
      language,
      region,
      number: input.number,
      localId: input.number,
      printed_number: input.number,
      pokedexNumber: 151,
      dexId: [151],
      rarity: 'Promo',
      supertype: 'Pokemon',
      types: ['Psychic'],
      variant_label: input.variantLabel,
      release_date: input.releaseDate,
      release_label: input.releaseLabel,
      aliases: input.aliases,
      source_urls: input.sourceUrls,
      source_order: input.sortOrder,
      provenance: {
        source_provider: sourceProvider,
        curation_status: 'metadata_only',
        image_policy: 'no_unlicensed_card_image',
      },
      images: {
        small: null,
        large: null,
      },
      set: rawSet,
    },
  };
}

const curatedCardRows = curatedCardInputs.map(createCuratedCardRow);
const cardRowsById = new Map(curatedCardRows.map((card) => [card.id, card]));

function rowToPokemonCard(row: CuratedPokemonCardDbRow): PokemonCard {
  const raw = row.raw_data;
  return {
    id: row.id,
    name: row.name,
    localName: raw.local_name,
    number: row.number,
    language: row.language,
    region: row.region,
    externalIds: row.external_ids,
    rarity: row.rarity,
    images: {},
    set: {
      id: row.set_id,
      name: raw.set?.name ?? row.set_id,
      series: raw.set?.series,
    },
    supertype: raw.supertype,
    types: raw.types,
    raw_data: raw,
  };
}

function matchesLanguage(rowLanguage: string | null | undefined, requested?: string | null) {
  const value = String(requested ?? 'all').trim().toLowerCase().replace(/_/g, '-');
  return value === 'all' || value === rowLanguage || (value === 'jp' && rowLanguage === 'ja');
}

function curatedSearchHaystack(row: CuratedPokemonCardDbRow) {
  const raw = row.raw_data;
  return normaliseCuratedSearch([
    row.id,
    row.name,
    row.number,
    row.rarity,
    row.set_id,
    raw.local_name,
    raw.english_display_name,
    raw.canonical_name,
    raw.variant_label,
    raw.release_label,
    raw.set?.name,
    raw.set?.english_display_name,
    raw.set?.local_name,
    ...(Array.isArray(raw.aliases) ? raw.aliases : []),
  ].filter(Boolean).join(' '));
}

export function getCuratedPokemonSets(requestedLanguage?: string | null): PokemonSet[] {
  return curatedSets.filter((set) => matchesLanguage(set.language, requestedLanguage));
}

export function getCuratedPokemonCardsForSet(
  setId: string,
  requestedLanguage?: string | null,
): PokemonCard[] {
  const candidates = new Set([
    String(setId ?? '').trim(),
    String(setId ?? '').trim().replace(/^(en|ja|jp|zh-tw|zh_tw|zhtw|zh):/i, ''),
  ]);
  return curatedCardRows
    .filter((row) => matchesLanguage(row.language, requestedLanguage))
    .filter((row) => candidates.has(row.set_id) || candidates.has(row.set_id.replace(/^ja:/, '')))
    .map(rowToPokemonCard);
}

export function getCuratedPokemonCardById(cardId: string, requestedLanguage?: string | null): PokemonCard | null {
  const row = cardRowsById.get(String(cardId ?? '').trim());
  if (!row || !matchesLanguage(row.language, requestedLanguage)) return null;
  return rowToPokemonCard(row);
}

export function getCuratedPokemonCardDbRow(cardId: string): CuratedPokemonCardDbRow | null {
  return cardRowsById.get(String(cardId ?? '').trim()) ?? null;
}

export function getCuratedPokemonSearchRows(requestedLanguage?: string | null): CuratedPokemonCardDbRow[] {
  return curatedCardRows.filter((row) => matchesLanguage(row.language, requestedLanguage));
}

export function findCuratedPokemonSearchRows(
  input: string,
  requestedLanguage?: string | null,
): CuratedPokemonCardDbRow[] {
  const normalizedInput = normaliseCuratedSearch(input);
  if (normalizedInput.length < 2) return [];
  const compactInput = compactCuratedSearch(input);
  const terms = normalizedInput.split(/\s+/).filter(Boolean);

  return getCuratedPokemonSearchRows(requestedLanguage)
    .map((row) => {
      const haystack = curatedSearchHaystack(row);
      const compactHaystack = compactCuratedSearch(haystack);
      const phraseMatch = haystack.includes(normalizedInput) || compactHaystack.includes(compactInput);
      const termMatches = terms.filter((term) => haystack.includes(term) || compactHaystack.includes(term)).length;
      return {
        row,
        phraseMatch,
        termMatches,
        score: (phraseMatch ? 100 : 0) + termMatches * 12,
      };
    })
    .filter((item) => item.score > 0 && (
      item.phraseMatch
      || terms.length === 1
      || item.termMatches === terms.length
    ))
    .sort((left, right) => right.score - left.score || Number(left.row.raw_data?.source_order ?? 0) - Number(right.row.raw_data?.source_order ?? 0))
    .map((item) => item.row);
}
