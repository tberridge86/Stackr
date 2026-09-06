import type { PokemonCardLanguage } from './pokemonTcg';
import {
  getPokemonSetLanguageFromPrefixedId,
  normalizePokemonSetReferenceForLookup,
} from './pokemonSetIdentity';

/**
 * The minimum set data needed to recover an older binder that predates the
 * persisted language column.  The resolver deliberately accepts provider
 * field names as well as the app's display fields, so callers can pass either
 * canonical API rows or legacy catalogue rows without rewriting them first.
 */
export type BinderSetIdentityCandidate = {
  id: string;
  language?: PokemonCardLanguage | string | null;
  providerSetId?: string | null;
  setCode?: string | null;
  name?: string | null;
  localName?: string | null;
  nativeName?: string | null;
  englishDisplayName?: string | null;
  canonicalName?: string | null;
  externalIds?: Record<string, unknown> | null;
};

export type ResolveBinderSetIdentityInput = {
  /** The persisted binder language.  A populated value is authoritative. */
  language?: PokemonCardLanguage | string | null;
  sourceSetId?: string | null;
  /** Native set name persisted with the binder, when present. */
  storedNativeSetName?: string | null;
  /** English supplementary name persisted with the binder, when present. */
  storedEnglishSetName?: string | null;
  candidates?: readonly BinderSetIdentityCandidate[];
};

export type BinderSetIdentityResolutionSource =
  | 'explicit-language'
  | 'prefixed-set-id'
  | 'canonical-set-id'
  | 'candidate-native-name'
  | 'candidate-english-name'
  | 'candidate-unique-reference'
  | 'unresolved'
  | 'ambiguous';

export type BinderSetIdentityResolution = {
  status: 'resolved' | 'unresolved' | 'ambiguous';
  source: BinderSetIdentityResolutionSource;
  /** Canonical candidate ID when a unique candidate was established. */
  setId: string | null;
  language: PokemonCardLanguage | null;
  candidateSetIds: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeLanguage(value?: string | null): PokemonCardLanguage | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  const aliases: Record<string, PokemonCardLanguage> = {
    en: 'en', english: 'en', 'en-us': 'en', 'en-gb': 'en',
    ja: 'ja', jp: 'ja', jpn: 'ja', japanese: 'ja', japan: 'ja',
    'zh-cn': 'zh-cn', zhcn: 'zh-cn', 'zh-hans': 'zh-cn', simplified: 'zh-cn', 'simplified-chinese': 'zh-cn',
    'zh-tw': 'zh-tw', zhtw: 'zh-tw', 'zh-hant': 'zh-tw', traditional: 'zh-tw', 'traditional-chinese': 'zh-tw', chinese: 'zh-tw',
    fr: 'fr', french: 'fr', de: 'de', german: 'de', es: 'es', spanish: 'es', it: 'it', italian: 'it',
    'pt-br': 'pt-br', portuguese: 'pt-br', ko: 'ko', kr: 'ko', korean: 'ko', id: 'id', indonesian: 'id', th: 'th', thai: 'th',
  };
  return aliases[normalized] ?? null;
}

function normalizeText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\-_:/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nonEmpty(values: (string | null | undefined)[]) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function candidateReferences(candidate: BinderSetIdentityCandidate) {
  const external = candidate.externalIds ?? {};
  return nonEmpty([
    candidate.id,
    candidate.providerSetId,
    candidate.setCode,
    typeof external.setCode === 'string' ? external.setCode : null,
    typeof external.tcgdex === 'string' ? external.tcgdex : null,
    typeof external.legacy === 'string' ? external.legacy : null,
    candidate.name,
    candidate.localName,
    candidate.nativeName,
    candidate.englishDisplayName,
    candidate.canonicalName,
  ]).map(normalizeText);
}

function candidateNativeNames(candidate: BinderSetIdentityCandidate) {
  return nonEmpty([candidate.localName, candidate.nativeName, candidate.name]).map(normalizeText);
}

function candidateEnglishNames(candidate: BinderSetIdentityCandidate) {
  return nonEmpty([candidate.englishDisplayName, candidate.canonicalName, candidate.name]).map(normalizeText);
}

function isCanonicalUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function uniqueCandidates(candidates: readonly BinderSetIdentityCandidate[]) {
  const byId = new Map<string, BinderSetIdentityCandidate>();
  for (const candidate of candidates) {
    const id = String(candidate.id ?? '').trim();
    if (id) byId.set(`${normalizeLanguage(candidate.language) ?? 'unknown'}:${id.toLowerCase()}`, candidate);
  }
  return [...byId.values()];
}

function resolved(
  candidate: BinderSetIdentityCandidate | null,
  language: PokemonCardLanguage,
  source: Exclude<BinderSetIdentityResolutionSource, 'unresolved' | 'ambiguous'>,
  candidateSetIds: string[],
  fallbackSetId: string,
): BinderSetIdentityResolution {
  return {
    status: 'resolved',
    source,
    setId: String(candidate?.id ?? fallbackSetId).trim() || null,
    language,
    candidateSetIds,
  };
}

/**
 * Resolves a binder's displayed set identity without changing persisted data.
 * For an ambiguous code shared by multiple languages, this intentionally
 * returns `ambiguous` rather than guessing an English or first-listed edition.
 */
export function resolveBinderSetIdentity(input: ResolveBinderSetIdentityInput): BinderSetIdentityResolution {
  const rawSourceSetId = String(input.sourceSetId ?? '').trim();
  const unprefixedSourceSetId = normalizePokemonSetReferenceForLookup(rawSourceSetId);
  const sourceReference = normalizeText(unprefixedSourceSetId);
  const candidates = uniqueCandidates(input.candidates ?? []);
  const matchingReference = sourceReference
    ? candidates.filter((candidate) => candidateReferences(candidate).includes(sourceReference))
    : [];
  const prefixedLanguage = getPokemonSetLanguageFromPrefixedId(rawSourceSetId);
  const explicitLanguage = normalizeLanguage(input.language);

  // Persisted language is the historical user choice and wins even if a stale
  // prefix exists.  A matching candidate only improves the returned set ID.
  if (explicitLanguage) {
    const matchingLanguage = matchingReference.filter((candidate) => normalizeLanguage(candidate.language) === explicitLanguage);
    if (matchingLanguage.length > 1 || (isCanonicalUuid(unprefixedSourceSetId) && matchingReference.length > 0 && !matchingLanguage.length)) {
      return { status: 'ambiguous', source: 'ambiguous', setId: null, language: explicitLanguage, candidateSetIds: matchingReference.map((candidate) => candidate.id) };
    }
    return resolved(
      matchingLanguage.length === 1 ? matchingLanguage[0] : null,
      explicitLanguage,
      'explicit-language',
      matchingReference.map((candidate) => candidate.id),
      rawSourceSetId,
    );
  }

  if (prefixedLanguage) {
    const matchingLanguage = matchingReference.filter((candidate) => normalizeLanguage(candidate.language) === prefixedLanguage);
    if (matchingLanguage.length > 1 || (isCanonicalUuid(unprefixedSourceSetId) && matchingReference.length > 0 && !matchingLanguage.length)) {
      return { status: 'ambiguous', source: 'ambiguous', setId: null, language: prefixedLanguage, candidateSetIds: matchingReference.map((candidate) => candidate.id) };
    }
    return resolved(
      matchingLanguage.length === 1 ? matchingLanguage[0] : null,
      prefixedLanguage,
      'prefixed-set-id',
      matchingReference.map((candidate) => candidate.id),
      rawSourceSetId,
    );
  }

  if (isCanonicalUuid(unprefixedSourceSetId)) {
    // Keep UUID matching separate from display/reference matching.  This is
    // both case-insensitive and immune to punctuation normalization used for
    // human-readable set codes and names.
    const canonicalId = unprefixedSourceSetId.toLowerCase();
    const canonicalMatches = candidates.filter((candidate) => (
      String(candidate.id ?? '').trim().toLowerCase() === canonicalId
      || String(candidate.providerSetId ?? '').trim().toLowerCase() === canonicalId
    ) && normalizeLanguage(candidate.language));
    if (canonicalMatches.length === 1) {
      const candidate = canonicalMatches[0];
      return resolved(candidate, normalizeLanguage(candidate.language)!, 'canonical-set-id', [candidate.id], rawSourceSetId);
    }
  }

  if (matchingReference.length === 1) {
    const candidate = matchingReference[0];
    const language = normalizeLanguage(candidate.language);
    if (language) return resolved(candidate, language, 'candidate-unique-reference', [candidate.id], rawSourceSetId);
  }

  if (matchingReference.length > 1) {
    const storedNative = normalizeText(input.storedNativeSetName);
    if (storedNative) {
      const nativeMatches = matchingReference.filter((candidate) => candidateNativeNames(candidate).includes(storedNative));
      if (nativeMatches.length === 1) {
        const candidate = nativeMatches[0];
        const language = normalizeLanguage(candidate.language);
        if (language) return resolved(candidate, language, 'candidate-native-name', [candidate.id], rawSourceSetId);
      }
    }

    const storedEnglish = normalizeText(input.storedEnglishSetName);
    if (storedEnglish) {
      const englishMatches = matchingReference.filter((candidate) => candidateEnglishNames(candidate).includes(storedEnglish));
      if (englishMatches.length === 1) {
        const candidate = englishMatches[0];
        const language = normalizeLanguage(candidate.language);
        if (language) return resolved(candidate, language, 'candidate-english-name', [candidate.id], rawSourceSetId);
      }
    }

    return {
      status: 'ambiguous',
      source: 'ambiguous',
      setId: null,
      language: null,
      candidateSetIds: matchingReference.map((candidate) => candidate.id),
    };
  }

  return {
    status: 'unresolved',
    source: 'unresolved',
    setId: null,
    language: null,
    candidateSetIds: [],
  };
}

export const binderSetIdentityInternals = {
  normalizeLanguage,
  normalizeText,
};
