import {
  getPokemonSetLanguageFromPrefixedId,
  stripPokemonSetLanguagePrefix,
} from './pokemonSetIdentity';

export type TcgdexControlledReferenceLanguage = 'ja' | 'zh-tw' | 'zh-cn';

export type TcgdexControlledReferenceLookupIdentity = {
  providerCardId: string | null;
  providerSetId: string;
  localId: string;
  collectorKey: string;
};

export type TcgdexControlledSetLookupIdentity = {
  providerSetId: string;
};

type SetLookupInput = {
  id?: unknown;
  sourceId?: unknown;
  providerSetId?: unknown;
  setCode?: unknown;
  externalIds?: Record<string, unknown> | null;
  raw_data?: Record<string, any> | null;
};

type CardLookupInput = {
  number?: unknown;
  externalIds?: Record<string, unknown> | null;
  set?: { id?: unknown } | null;
  raw_data?: Record<string, any> | null;
};

type LiveProviderCard = {
  providerCardId: string;
  language: string;
  localId?: string | null;
  number?: string | null;
};

const PROVIDER_TOKEN_PATTERN = /^[A-Za-z0-9._~-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanCollectorText(value: unknown) {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (!text || text.length > 64 || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function normalizeNumericCollectorPart(value: string) {
  return value.replace(/^0+(?=\d)/, '') || '0';
}

/**
 * Normalises identity-only collector values without constructing a provider ID.
 * A printed numeric fraction such as 157/165 is matched by its numerator, while
 * non-numeric provider identifiers remain exact after NFKC/case normalisation.
 */
export function normalizeTcgdexCollectorIdentity(value: unknown) {
  const text = cleanCollectorText(value)?.replace(/\s+/g, '').toUpperCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) return normalizeNumericCollectorPart(text);
  const printedFraction = text.match(/^(\d+)\/(\d+)$/);
  if (printedFraction) return normalizeNumericCollectorPart(printedFraction[1]);
  return text;
}

function cleanProviderToken(value: unknown) {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (!text || text.length > 160 || UUID_PATTERN.test(text) || !PROVIDER_TOKEN_PATTERN.test(text)) return null;
  return text;
}

function cleanProviderSetHint(value: unknown, language: TcgdexControlledReferenceLanguage) {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw || UUID_PATTERN.test(raw)) return null;
  const prefixedLanguage = getPokemonSetLanguageFromPrefixedId(raw);
  if (prefixedLanguage && prefixedLanguage !== language) return null;
  return cleanProviderToken(stripPokemonSetLanguagePrefix(raw));
}

function uniqueByKey<T>(values: T[], key: (value: T) => string) {
  const unique = new Map<string, T>();
  for (const value of values) {
    const identity = key(value);
    if (!unique.has(identity)) unique.set(identity, value);
  }
  return [...unique.values()];
}

function selectCollectorIdentity(card: CardLookupInput) {
  const raw = card.raw_data ?? {};
  const values = [
    raw.providerLocalId,
    raw.provider_local_id,
    raw.localId,
    raw.local_id,
    raw.collectorNumber,
    raw.collector_number,
    raw.number,
    card.number,
  ].map(cleanCollectorText).filter((value): value is string => Boolean(value));
  const unique = uniqueByKey(values, (value) => normalizeTcgdexCollectorIdentity(value) ?? value);
  if (unique.length !== 1) return null;
  const collectorKey = normalizeTcgdexCollectorIdentity(unique[0]);
  return collectorKey ? { localId: unique[0], collectorKey } : null;
}

function selectProviderSetHint(card: CardLookupInput, language: TcgdexControlledReferenceLanguage) {
  const raw = card.raw_data ?? {};
  const rawSet = raw.set && typeof raw.set === 'object' ? raw.set : {};
  const rawExternalIds = raw.external_ids && typeof raw.external_ids === 'object' ? raw.external_ids : {};
  const direct = [
    card.externalIds?.tcgdexSet,
    card.externalIds?.tcgdex_set,
    card.externalIds?.setCode,
    raw.providerSetId,
    raw.provider_set_id,
    raw.tcgdexProviderSetId,
    rawExternalIds.tcgdexSet,
    rawExternalIds.tcgdex_set,
    rawSet.providerSetId,
    rawSet.provider_set_id,
    rawSet.source_id,
    rawSet.set_code,
  ].map((value) => cleanProviderSetHint(value, language)).filter((value): value is string => Boolean(value));
  const directUnique = uniqueByKey(direct, (value) => value.toLowerCase());
  if (directUnique.length > 1) return { value: null, ambiguous: true } as const;
  if (directUnique.length === 1) return { value: directUnique[0], ambiguous: false } as const;

  const fallback = [card.set?.id, rawSet.id, raw.set_id]
    .map((value) => cleanProviderSetHint(value, language))
    .filter((value): value is string => Boolean(value));
  const fallbackUnique = uniqueByKey(fallback, (value) => value.toLowerCase());
  if (fallbackUnique.length > 1) return { value: null, ambiguous: true } as const;
  return { value: fallbackUnique[0] ?? null, ambiguous: false } as const;
}

/**
 * Extract an exact provider set identifier without consulting image fields.
 * Conflicting direct identifiers fail closed; a language-prefixed local ID is
 * accepted only when no stronger provider identifier is present.
 */
export function getTcgdexControlledSetLookupIdentity(
  set: SetLookupInput,
  language: TcgdexControlledReferenceLanguage,
): TcgdexControlledSetLookupIdentity | null {
  const raw = set.raw_data ?? {};
  const rawExternalIds = raw.external_ids && typeof raw.external_ids === 'object' ? raw.external_ids : {};
  const direct = [
    set.providerSetId,
    set.sourceId,
    set.setCode,
    set.externalIds?.tcgdex,
    set.externalIds?.tcgdexSet,
    set.externalIds?.tcgdex_set,
    set.externalIds?.setCode,
    raw.providerSetId,
    raw.provider_set_id,
    raw.source_id,
    raw.set_code,
    rawExternalIds.tcgdex,
    rawExternalIds.tcgdexSet,
    rawExternalIds.tcgdex_set,
    rawExternalIds.setCode,
  ].map((value) => cleanProviderSetHint(value, language)).filter((value): value is string => Boolean(value));
  const directUnique = uniqueByKey(direct, (value) => value.toLowerCase());
  if (directUnique.length > 1) return null;
  if (directUnique.length === 1) return { providerSetId: directUnique[0] };

  const fallback = [set.id, raw.id]
    .map((value) => cleanProviderSetHint(value, language))
    .filter((value): value is string => Boolean(value));
  const fallbackUnique = uniqueByKey(fallback, (value) => value.toLowerCase());
  return fallbackUnique.length === 1 ? { providerSetId: fallbackUnique[0] } : null;
}

function selectProviderCardHint(card: CardLookupInput) {
  const raw = card.raw_data ?? {};
  const rawExternalIds = raw.external_ids && typeof raw.external_ids === 'object' ? raw.external_ids : {};
  const values = [
    card.externalIds?.tcgdex,
    card.externalIds?.legacy,
    raw.providerCardId,
    raw.provider_card_id,
    raw.source_id,
    rawExternalIds.tcgdex,
  ].map(cleanProviderToken).filter((value): value is string => Boolean(value));
  const unique = uniqueByKey(values, (value) => value.toLowerCase());
  if (unique.length > 1) return { value: null, ambiguous: true } as const;
  return { value: unique[0] ?? null, ambiguous: false } as const;
}

function parseProviderCardHint(
  providerCardId: string,
  providerSetHint: string | null,
  collectorKey: string,
) {
  let providerSetId = providerSetHint;
  let providerLocalId: string | null = null;
  if (providerSetHint
    && providerCardId.toLowerCase().startsWith(`${providerSetHint.toLowerCase()}-`)) {
    providerSetId = providerCardId.slice(0, providerSetHint.length);
    providerLocalId = providerCardId.slice(providerSetHint.length + 1);
  } else {
    const separator = providerCardId.lastIndexOf('-');
    if (separator <= 0 || separator >= providerCardId.length - 1) return null;
    providerSetId = providerCardId.slice(0, separator);
    providerLocalId = providerCardId.slice(separator + 1);
  }

  const safeSetId = cleanProviderToken(providerSetId);
  const safeLocalId = cleanProviderToken(providerLocalId);
  if (!safeSetId || !safeLocalId) return null;
  if (providerSetHint && safeSetId.toLowerCase() !== providerSetHint.toLowerCase()) return null;
  if (normalizeTcgdexCollectorIdentity(safeLocalId) !== collectorKey) return null;
  return { providerSetId: safeSetId, providerLocalId: safeLocalId };
}

/**
 * Extracts identifiers only. Stored URLs and image fields are deliberately not
 * candidates: the caller must re-fetch the live provider record before display.
 */
export function getTcgdexControlledReferenceLookupIdentity(
  card: CardLookupInput,
  language: TcgdexControlledReferenceLanguage,
): TcgdexControlledReferenceLookupIdentity | null {
  const collector = selectCollectorIdentity(card);
  if (!collector) return null;
  const providerSetSelection = selectProviderSetHint(card, language);
  const providerCardSelection = selectProviderCardHint(card);
  if (providerSetSelection.ambiguous || providerCardSelection.ambiguous) return null;
  const providerSetHint = providerSetSelection.value;
  const providerCardId = providerCardSelection.value;

  if (providerCardId) {
    const parsed = parseProviderCardHint(providerCardId, providerSetHint, collector.collectorKey);
    if (!parsed) return null;
    return {
      providerCardId,
      providerSetId: parsed.providerSetId,
      localId: parsed.providerLocalId,
      collectorKey: collector.collectorKey,
    };
  }
  if (!providerSetHint) return null;
  return {
    providerCardId: null,
    providerSetId: providerSetHint,
    localId: collector.localId,
    collectorKey: collector.collectorKey,
  };
}

/**
 * Matches only a unique card returned by the exact live provider set request.
 * No provider card ID or image URL is synthesised from the stored lookup hint.
 */
export function matchTcgdexProviderCardFromLiveSet<T extends LiveProviderCard>(
  identity: TcgdexControlledReferenceLookupIdentity,
  cards: readonly T[],
  language: TcgdexControlledReferenceLanguage,
): T | null {
  const matches = cards.filter((card) => {
    if (card.language !== language) return false;
    const providerCardId = cleanProviderToken(card.providerCardId);
    const providerLocalId = cleanProviderToken(card.localId ?? card.number);
    if (!providerCardId || !providerLocalId) return false;
    if (identity.providerCardId && providerCardId !== identity.providerCardId) return false;
    if (normalizeTcgdexCollectorIdentity(providerLocalId) !== identity.collectorKey) return false;
    return providerCardId === `${identity.providerSetId}-${providerLocalId}`;
  });
  return matches.length === 1 ? matches[0] : null;
}
