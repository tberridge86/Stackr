import type { ImageSourcePropType } from 'react-native';

export type EnglishSetLogoLookupInput = {
  id?: string | null;
  setId?: string | null;
  sourceId?: string | number | null;
  setCode?: string | number | null;
  name?: string | null;
  localName?: string | null;
  englishDisplayName?: string | null;
  language?: string | null;
  externalIds?: Record<string, any> | null;
};

export type EnglishSetLogoMatch = {
  canonicalAssetId: string;
  title: string;
  assetType: 'official_logo' | 'official_shared_logo';
  source: ImageSourcePropType;
};

type EnglishSetLogoDefinition = EnglishSetLogoMatch & {
  codes: readonly string[];
  names: readonly string[];
};

const ENGLISH_LANGUAGE_ALIASES = new Set([
  'en', 'en-gb', 'en-us', 'eng', 'english',
]);

const REMOVED_DUPLICATE_CODES = new Set(['pbl']);

const OFFICIAL_ENGLISH_SET_LOGOS: readonly EnglishSetLogoDefinition[] = [
  {
    canonicalAssetId: 'me5',
    title: 'Pitch Black',
    assetType: 'official_logo',
    codes: ['me5', 'me05'],
    names: ['Pitch Black'],
    source: require('../assets/rev2/12-english-set-logo/logos/me05.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'B2a',
    title: 'Paldean Wonders',
    assetType: 'official_logo',
    codes: ['B2a'],
    names: ['Paldean Wonders'],
    source: require('../assets/rev2/12-english-set-logo/logos/B2a.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'B1a',
    title: 'Crimson Blaze',
    assetType: 'official_logo',
    codes: ['B1a'],
    names: ['Crimson Blaze'],
    source: require('../assets/rev2/12-english-set-logo/logos/B1a.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'A3b',
    title: 'Eevee Grove',
    assetType: 'official_logo',
    codes: ['A3b'],
    names: ['Eevee Grove'],
    source: require('../assets/rev2/12-english-set-logo/logos/A3b.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'A3a',
    title: 'Extradimensional Crisis',
    assetType: 'official_logo',
    codes: ['A3a'],
    names: ['Extradimensional Crisis'],
    source: require('../assets/rev2/12-english-set-logo/logos/A3a.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: '2024sv',
    title: "McDonald's Collection 2024",
    assetType: 'official_logo',
    codes: ['2024sv', 'mcd24'],
    names: ["McDonald's Collection 2024", 'Dragon Discovery'],
    source: require('../assets/rev2/12-english-set-logo/logos/2024sv.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'sv05',
    title: 'Temporal Forces',
    assetType: 'official_logo',
    codes: ['sv05', 'sv5'],
    names: ['Temporal Forces'],
    source: require('../assets/rev2/12-english-set-logo/logos/sv05.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'mfb',
    title: 'My First Battle',
    assetType: 'official_logo',
    codes: ['mfb'],
    names: ['My First Battle'],
    source: require('../assets/rev2/12-english-set-logo/logos/mfb.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: '2023sv',
    title: "McDonald's Collection 2023",
    assetType: 'official_logo',
    codes: ['2023sv', 'mcd23'],
    names: ["McDonald's Collection 2023", 'Match Battle 2023'],
    source: require('../assets/rev2/12-english-set-logo/logos/2023sv.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: '2022swsh',
    title: "McDonald's Collection 2022",
    assetType: 'official_logo',
    codes: ['2022swsh', 'mcd22'],
    names: ["McDonald's Collection 2022", 'Match Battle 2022'],
    source: require('../assets/rev2/12-english-set-logo/logos/2022swsh.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'mcdonalds-pokemon-generic',
    title: "McDonald's / Pokémon shared mark",
    assetType: 'official_shared_logo',
    codes: [
      '2021swsh', 'mcd21', '2019sm', 'mcd19', '2018sm', 'mcd18',
      '2017sm', 'mcd17', '2016xy', 'mcd16', '2015xy', 'mcd15',
      '2014xy', 'mcd14', '2012bw', 'mcd12', '2011bw', 'mcd11',
    ],
    names: [
      "McDonald's Collection 2021", "McDonald's Collection 2019",
      "McDonald's Collection 2018", "McDonald's Collection 2017",
      "McDonald's Collection 2016", "McDonald's Collection 2015",
      "McDonald's Collection 2014", "McDonald's Collection 2012",
      "McDonald's Collection 2011",
    ],
    source: require('../assets/rev2/12-english-set-logo/logos/mcdonalds-pokemon-generic.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'sm7.5',
    title: 'Dragon Majesty',
    assetType: 'official_logo',
    codes: ['sm7.5', 'sm75'],
    names: ['Dragon Majesty'],
    source: require('../assets/rev2/12-english-set-logo/logos/sm7.5.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'sm3.5',
    title: 'Shining Legends',
    assetType: 'official_logo',
    codes: ['sm3.5', 'sm35'],
    names: ['Shining Legends'],
    source: require('../assets/rev2/12-english-set-logo/logos/sm3.5.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'pop-series-shared',
    title: 'POP Series shared logo',
    assetType: 'official_shared_logo',
    codes: ['pop9', 'pop7', 'pop6', 'pop5', 'pop4', 'pop3', 'pop2', 'pop1'],
    names: [
      'POP Series 9', 'POP Series 7', 'POP Series 6', 'POP Series 5',
      'POP Series 4', 'POP Series 3', 'POP Series 2', 'POP Series 1',
    ],
    source: require('../assets/rev2/12-english-set-logo/logos/pop-series-shared.png') as ImageSourcePropType,
  },
  {
    canonicalAssetId: 'ex5.5',
    title: 'Poké Card Creator Pack',
    assetType: 'official_logo',
    codes: ['ex5.5', 'wb1'],
    names: ['Poké Card Creator Pack', 'Poke Card Creator Pack'],
    source: require('../assets/rev2/12-english-set-logo/logos/ex5.5.png') as ImageSourcePropType,
  },
] as const;

function clean(value?: string | number | null) {
  return String(value ?? '').trim();
}

export function normalizeEnglishSetLogoKey(value?: string | number | null) {
  const text = clean(value);
  if (!text) return '';
  return text
    .replace(/^en(?:-gb|-us)?:/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/pokémon/g, 'pokemon')
    .replace(/[^a-z0-9]+/g, '');
}

function buildUniqueIndex(values: (definition: EnglishSetLogoDefinition) => readonly string[]) {
  const index: Record<string, EnglishSetLogoDefinition> = {};
  for (const definition of OFFICIAL_ENGLISH_SET_LOGOS) {
    for (const value of values(definition)) {
      const key = normalizeEnglishSetLogoKey(value);
      if (!key) continue;
      const existing = index[key];
      if (existing && existing.canonicalAssetId !== definition.canonicalAssetId) {
        throw new Error(`Ambiguous official English set-logo key: ${value}`);
      }
      index[key] = definition;
    }
  }
  return index;
}

const ENGLISH_SET_LOGOS_BY_CODE = buildUniqueIndex((definition) => definition.codes);
const ENGLISH_SET_LOGOS_BY_NAME = buildUniqueIndex((definition) => definition.names);

function normalizedLanguage(value?: string | null) {
  return clean(value).toLowerCase().replace(/_/g, '-');
}

function isEligibleEnglishLookup(input?: EnglishSetLogoLookupInput | null, fallbackLanguage?: string | null) {
  const language = normalizedLanguage(input?.language ?? fallbackLanguage);
  if (!language) return true;
  return ENGLISH_LANGUAGE_ALIASES.has(language);
}

function uniqueKeys(values: Array<string | number | null | undefined>) {
  return [...new Set(values.map(normalizeEnglishSetLogoKey).filter(Boolean))];
}

function getLookupCodes(input?: EnglishSetLogoLookupInput | null) {
  const externalIds = input?.externalIds ?? {};
  return uniqueKeys([
    input?.id,
    input?.setId,
    input?.sourceId,
    input?.setCode,
    externalIds.setCode,
    externalIds.pokemonTcg,
    externalIds.tcgdex,
  ]);
}

function getLookupNames(input?: EnglishSetLogoLookupInput | null) {
  return uniqueKeys([
    input?.englishDisplayName,
    input?.name,
    input?.localName,
  ]);
}

function publicMatch(definition?: EnglishSetLogoDefinition | null): EnglishSetLogoMatch | null {
  if (!definition) return null;
  return {
    canonicalAssetId: definition.canonicalAssetId,
    title: definition.title,
    assetType: definition.assetType,
    source: definition.source,
  };
}

export function getEnglishSetLogoMatch(
  setId?: string | number | null,
  language?: string | null,
): EnglishSetLogoMatch | null {
  if (language && !ENGLISH_LANGUAGE_ALIASES.has(normalizedLanguage(language))) return null;
  const key = normalizeEnglishSetLogoKey(setId);
  if (!key || REMOVED_DUPLICATE_CODES.has(key)) return null;
  return publicMatch(ENGLISH_SET_LOGOS_BY_CODE[key]);
}

export function getEnglishSetLogoMatchForSet(
  input?: EnglishSetLogoLookupInput | null,
  fallbackLanguage?: string | null,
): EnglishSetLogoMatch | null {
  if (!input || !isEligibleEnglishLookup(input, fallbackLanguage)) return null;
  for (const key of getLookupCodes(input)) {
    if (REMOVED_DUPLICATE_CODES.has(key)) return null;
    const match = ENGLISH_SET_LOGOS_BY_CODE[key];
    if (match) return publicMatch(match);
  }
  for (const key of getLookupNames(input)) {
    const match = ENGLISH_SET_LOGOS_BY_NAME[key];
    if (match) return publicMatch(match);
  }
  return null;
}

export function getEnglishSetLogoSource(
  setId?: string | number | null,
  language?: string | null,
): ImageSourcePropType | null {
  return getEnglishSetLogoMatch(setId, language)?.source ?? null;
}

export function getEnglishSetLogoSourceForSet(
  input?: EnglishSetLogoLookupInput | null,
  fallbackLanguage?: string | null,
): ImageSourcePropType | null {
  return getEnglishSetLogoMatchForSet(input, fallbackLanguage)?.source ?? null;
}
