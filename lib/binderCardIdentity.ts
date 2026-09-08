import type { PokemonCardLanguage } from './pokemonTcg';
import {
  getPokemonSetLanguageFromPrefixedId,
  normalizePokemonSetReferenceForLookup,
} from './pokemonSetIdentity';

export type SavedBinderCardIdentityRow = {
  card_id?: string | null;
  card_number?: string | number | null;
  language?: string | null;
  set_id?: string | null;
  card?: {
    number?: string | number | null;
    raw_data?: { number?: string | number | null; localId?: string | number | null } | null;
  } | null;
};

export type FindSavedBinderCardMatchInput<T extends SavedBinderCardIdentityRow> = {
  savedRows: readonly T[];
  cardId?: string | null;
  collectorNumber?: string | number | null;
  language: PokemonCardLanguage | string | null | undefined;
  /** Only aliases established by the resolved catalogue identity belong here. */
  setReferences: readonly string[];
  allowCollectorMatch?: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function knownLanguage(value: unknown): PokemonCardLanguage | null {
  const language = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  const aliases: Record<string, PokemonCardLanguage> = {
    en: 'en', english: 'en',
    fr: 'fr', french: 'fr',
    es: 'es', spanish: 'es',
    it: 'it', italian: 'it',
    'pt-br': 'pt-br', ptbr: 'pt-br', portuguese: 'pt-br',
    de: 'de', german: 'de',
    ja: 'ja', jp: 'ja', jpn: 'ja', japanese: 'ja',
    'zh-cn': 'zh-cn', zhcn: 'zh-cn', 'zh-hans': 'zh-cn',
    'zh-tw': 'zh-tw', zhtw: 'zh-tw', 'zh-hant': 'zh-tw', zh: 'zh-tw',
    ko: 'ko', kr: 'ko', korean: 'ko', id: 'id', indonesian: 'id', th: 'th', thai: 'th',
  };
  return aliases[language] ?? null;
}

function rowLanguage(row: SavedBinderCardIdentityRow, selectedLanguage: PokemonCardLanguage | null) {
  return knownLanguage(row.language)
    ?? getPokemonSetLanguageFromPrefixedId(row.set_id)
    ?? selectedLanguage;
}

function normalizedSetReference(value: unknown) {
  return normalizePokemonSetReferenceForLookup(String(value ?? '')).trim().toLowerCase();
}

/** UUIDs are case-insensitive; opaque provider card identifiers are not. */
function normalizedExactCardId(value: unknown) {
  const cardId = String(value ?? '').trim();
  return UUID_PATTERN.test(cardId) ? cardId.toLowerCase() : cardId;
}

/** `001/165` and full-width digits normalize to `1`; TG/GG remain distinct. */
export function normalizeBinderCollectorNumber(value: unknown) {
  const firstPart = String(value ?? '').normalize('NFKC').trim().split('/')[0].trim();
  if (!firstPart) return null;
  if (/^\d+$/.test(firstPart)) return firstPart.replace(/^0+(?=\d)/, '');
  return firstPart.toLowerCase();
}

function rowCollectorNumber(row: SavedBinderCardIdentityRow) {
  return row.card_number
    ?? row.card?.number
    ?? row.card?.raw_data?.number
    ?? row.card?.raw_data?.localId
    ?? null;
}

function uniqueRow<T>(rows: readonly T[]) {
  return rows.length === 1 ? rows[0] : null;
}

/**
 * Returns an original saved row only when its language and resolved set alias
 * match, then prefers a unique exact card ID over a unique collector number.
 * It deliberately never selects the first duplicate collector/card row.
 */
export function findSavedBinderCardMatch<T extends SavedBinderCardIdentityRow>(
  input: FindSavedBinderCardMatchInput<T>,
): T | null {
  const selectedLanguage = knownLanguage(input.language);
  if (!selectedLanguage) return null;
  const setReferences = new Set(input.setReferences.map(normalizedSetReference).filter(Boolean));
  if (!setReferences.size) return null;

  const eligibleRows = input.savedRows.filter((row) => (
    setReferences.has(normalizedSetReference(row.set_id))
    && rowLanguage(row, selectedLanguage) === selectedLanguage
  ));
  const cardId = normalizedExactCardId(input.cardId);
  if (cardId) {
    const exact = uniqueRow(eligibleRows.filter((row) => normalizedExactCardId(row.card_id) === cardId));
    if (exact) return exact;
    if (eligibleRows.filter((row) => normalizedExactCardId(row.card_id) === cardId).length > 1) return null;
  }

  if (!input.allowCollectorMatch) return null;
  const collector = normalizeBinderCollectorNumber(input.collectorNumber);
  if (!collector) return null;
  return uniqueRow(eligibleRows.filter((row) => normalizeBinderCollectorNumber(rowCollectorNumber(row)) === collector));
}

export const binderCardIdentityInternals = {
  normalizeBinderCollectorNumber,
  normalizedCollectorNumber: normalizeBinderCollectorNumber,
  normalizedExactCardId,
  normalizedSetReference,
  rowLanguage,
};
