import type { ImageSourcePropType } from 'react-native';

import { getMagazineSetCoverAssetSource } from './magazineSetCoverAssets';

export type MagazineSetCoverLookupInput = {
  id?: string | null;
  setId?: string | null;
  sourceId?: string | number | null;
  setCode?: string | number | null;
  name?: string | null;
  localName?: string | null;
  englishDisplayName?: string | null;
  language?: string | null;
  externalIds?: Record<string, unknown> | null;
};

type MagazineLanguage = 'en' | 'ja';

export type MagazineSetCover = {
  key: string;
  name: string;
  language: MagazineLanguage;
  source: ImageSourcePropType;
};

export type MagazineSetCoverMetadata = {
  key: string;
  name: string;
  nativePublicationName: string;
  englishPublicationName: string;
  language: MagazineLanguage;
  issueLabel: string;
  stableIds: readonly string[];
  exactNames: readonly string[];
};

export type MagazineSetCoverSourceResolver = (key: string) => ImageSourcePropType | null;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function issueMonthName(yearMonth: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yearMonth);
  if (!match) throw new Error(`Invalid magazine issue month: ${yearMonth}`);
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

function corocoroComicIssues(): MagazineSetCoverMetadata[] {
  const issues: MagazineSetCoverMetadata[] = [];
  for (let year = 1996; year <= 2001; year += 1) {
    const firstMonth = year === 1996 ? 4 : 1;
    for (let month = firstMonth; month <= 12; month += 1) {
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      const issue = issueMonthName(yearMonth);
      const key = `corocoro-comic-${yearMonth}`;
      const stableIds = [
        `ja:magazine:corocoro-comic:${yearMonth}`,
        `magazine:corocoro-comic:${yearMonth}`,
        `corocoro-comic:${yearMonth}`,
        key,
        `corocoro-${yearMonth}`,
      ];
      const exactNames = [
        `CoroCoro Comic (${issue})`,
        `CoroCoro Comic — ${issue}`,
        `月刊コロコロコミック ${year}年${month}月号`,
      ];
      // These two aliases refer only to existing, curated promo-set identities.
      // They do not infer membership for any other issue or card.
      if (yearMonth === '1997-02') {
        stableIds.push(
          'ja:corocoro-comic-february-1997-promo',
          'corocoro-comic-february-1997-promo',
          'corocoro-1997-02',
        );
        exactNames.push('CoroCoro Comic Promo (February 1997)');
      }
      if (yearMonth === '2001-05') {
        stableIds.push(
          'ja:corocoro-comic-may-2001-promo',
          'corocoro-comic-may-2001-promo',
          'corocoro-2001-05',
        );
        exactNames.push('CoroCoro Comic Promo (May 2001)');
      }
      issues.push({
        key,
        name: `CoroCoro Comic — ${issue}`,
        nativePublicationName: '月刊コロコロコミック',
        englishPublicationName: 'CoroCoro Comic',
        language: 'ja',
        issueLabel: issue,
        stableIds,
        exactNames,
      });
    }
  }
  return issues;
}

export const MAGAZINE_SET_COVER_METADATA: readonly MagazineSetCoverMetadata[] = Object.freeze([
  ...corocoroComicIssues(),
  {
    key: 'corocoro-ichiban-2021-06',
    name: 'CoroCoro Ichiban! — June 2021',
    nativePublicationName: 'コロコロイチバン！',
    englishPublicationName: 'CoroCoro Ichiban!',
    language: 'ja',
    issueLabel: 'June 2021',
    stableIds: ['ja:magazine:corocoro-ichiban:2021-06', 'magazine:corocoro-ichiban:2021-06', 'corocoro-ichiban:2021-06', 'corocoro-ichiban-2021-06'],
    exactNames: ['CoroCoro Ichiban! (June 2021)', 'CoroCoro Ichiban! — June 2021', 'コロコロイチバン！ 2021年6月号'],
  },
  {
    key: 'pokemon-fan-japan-2021-issue-73',
    name: 'Pokémon Fan Japan — Issue 73 (2021)',
    nativePublicationName: 'ポケモンファン',
    englishPublicationName: 'Pokémon Fan Japan',
    language: 'ja',
    issueLabel: 'Issue 73 (2021)',
    stableIds: ['ja:magazine:pokemon-fan-japan:2021-issue-73', 'magazine:pokemon-fan-japan:2021-issue-73', 'pokemon-fan-japan:2021-issue-73', 'pokemon-fan-japan-2021-issue-73'],
    exactNames: ['Pokémon Fan Japan (Issue 73, 2021)', 'Pokémon Fan Japan — Issue 73 (2021)', 'ポケモンファン 73号'],
  },
  ...Array.from({ length: 10 }, (_, index): MagazineSetCoverMetadata => {
    const issue = String(index + 1).padStart(2, '0');
    const key = `pokemon-fan-us-issue-${issue}`;
    return {
      key,
      name: `Pokémon Fan US — Issue ${issue}`,
      nativePublicationName: 'Pokémon Fan',
      englishPublicationName: 'Pokémon Fan US',
      language: 'en',
      issueLabel: `Issue ${issue}`,
      stableIds: [`en:magazine:pokemon-fan-us:issue-${issue}`, `magazine:pokemon-fan-us:issue-${issue}`, `pokemon-fan-us:issue-${issue}`, key],
      exactNames: [`Pokémon Fan US (Issue ${issue})`, `Pokémon Fan US — Issue ${issue}`],
    };
  }),
]);

function clean(value: unknown) {
  const normalized = String(value ?? '').normalize('NFKC').trim();
  return normalized || null;
}

function normalizedExact(value: unknown) {
  return clean(value)?.toLocaleLowerCase('en-US').replace(/\s+/g, ' ') ?? null;
}

function normalizedLanguage(value: unknown): MagazineLanguage | null {
  const language = clean(value)?.toLowerCase().replace(/_/g, '-');
  if (!language) return null;
  if (language === 'ja' || language === 'jp' || language === 'japanese') return 'ja';
  if (language === 'en' || language === 'english') return 'en';
  return null;
}

function explicitUnsupportedLanguage(value: unknown) {
  return Boolean(clean(value)) && normalizedLanguage(value) === null;
}

function identityPrefixLanguage(value: unknown): MagazineLanguage | 'unsupported' | null {
  const prefix = /^([A-Za-z]{2}(?:[-_][A-Za-z]+)?):/.exec(clean(value) ?? '')?.[1];
  if (!prefix) return null;
  const language = normalizedLanguage(prefix);
  if (language) return language;
  return explicitUnsupportedLanguage(prefix) ? 'unsupported' : null;
}

function uniqueValues(values: unknown[]) {
  return [...new Set(values.map(clean).filter((value): value is string => Boolean(value)))];
}

function inputIds(input: MagazineSetCoverLookupInput) {
  const externalIds = input.externalIds ?? {};
  return uniqueValues([
    input.id, input.setId, input.sourceId, input.setCode,
    externalIds.setCode, externalIds.stackrManual, externalIds.magazineIssue,
  ]).map(normalizedExact).filter((value): value is string => Boolean(value));
}

function inputNames(input: MagazineSetCoverLookupInput) {
  return uniqueValues([input.name, input.localName, input.englishDisplayName])
    .map(normalizedExact).filter((value): value is string => Boolean(value));
}

function explicitIdentityLanguages(input: MagazineSetCoverLookupInput) {
  return [input.id, input.setId, input.sourceId].map(identityPrefixLanguage);
}

function matches(input: MagazineSetCoverLookupInput, cover: MagazineSetCoverMetadata) {
  const ids = new Set(inputIds(input));
  const names = new Set(inputNames(input));
  const knownIds = cover.stableIds.map(normalizedExact);
  const knownNames = cover.exactNames.map(normalizedExact);
  return knownIds.some((id) => id && ids.has(id)) || knownNames.some((name) => name && names.has(name));
}

function sourceDisabled() {
  return process.env.EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS === 'true'
    || process.env.STACKR_DISABLE_MAGAZINE_SET_COVERS === 'true';
}

function sourceDenied(key: string) {
  const raw = String(
    process.env.EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST
      ?? process.env.STACKR_MAGAZINE_SET_COVER_DENYLIST
      ?? '',
  ).trim();
  if (!raw) return false;
  if (raw.length > 16_384) return true;
  return raw.split(',').some((entry) => entry.trim().toLowerCase() === key.toLowerCase());
}

/**
 * Resolves only an exact, explicitly identified magazine issue. This never
 * creates cards, quantities, canonical sets, or a date/card-number inference.
 */
export function getMagazineSetCoverForSet(
  input?: MagazineSetCoverLookupInput | null,
  fallbackLanguage?: string | null,
  sourceResolver: MagazineSetCoverSourceResolver = getMagazineSetCoverAssetSource,
): MagazineSetCover | null {
  if (!input || sourceDisabled()) return null;
  if (explicitUnsupportedLanguage(input.language) || explicitUnsupportedLanguage(fallbackLanguage)) return null;
  const identityLanguages = explicitIdentityLanguages(input);
  if (identityLanguages.includes('unsupported')) return null;
  const declaredLanguages = [
    normalizedLanguage(input.language),
    normalizedLanguage(fallbackLanguage),
    ...identityLanguages,
  ].filter((language): language is MagazineLanguage => language === 'en' || language === 'ja');
  if (new Set(declaredLanguages).size > 1) return null;
  const explicitLanguage = declaredLanguages[0] ?? null;
  const candidates = MAGAZINE_SET_COVER_METADATA.filter((cover) => matches(input, cover));
  if (candidates.length !== 1) return null;
  const cover = candidates[0];
  if (explicitLanguage && explicitLanguage !== cover.language) return null;
  if (sourceDenied(cover.key)) return null;
  const source = sourceResolver(cover.key);
  return source ? { key: cover.key, name: cover.name, language: cover.language, source } : null;
}

export function getMagazineSetCoverSourceForSet(
  input?: MagazineSetCoverLookupInput | null,
  fallbackLanguage?: string | null,
  sourceResolver: MagazineSetCoverSourceResolver = getMagazineSetCoverAssetSource,
): ImageSourcePropType | null {
  return getMagazineSetCoverForSet(input, fallbackLanguage, sourceResolver)?.source ?? null;
}
