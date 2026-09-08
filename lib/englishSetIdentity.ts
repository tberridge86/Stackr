import { getPokemonSetLanguageFromPrefixedId, stripPokemonSetLanguagePrefix } from './pokemonSetIdentity';

export type EnglishSetReferenceCandidate = {
  id?: string | null;
  language?: string | null;
  externalIds?: Record<string, unknown> | null;
  setCode?: string | null;
  providerSetId?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPLICIT_ENGLISH_CODE_PAIRS: readonly (readonly [string, string])[] = [
  ['sv8pt5', 'sv08.5'],
  ['swsh12pt5', 'swsh12.5'],
  ['swsh35', 'swsh3.5'],
  ['swsh45', 'swsh4.5'],
  ['swsh45sv', 'swsh4.5sv'],
  ['swsh12pt5gg', 'swsh12.5gg'],
  ['sm35', 'sm3.5'],
  ['sm75', 'sm7.5'],
];

function clean(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function isEnglishLanguage(value?: string | null) {
  const language = clean(value).replace(/_/g, '-');
  return language === 'en' || language === 'english' || language === 'en-us' || language === 'en-gb';
}

function isEnglishReference(value: string, language?: string | null) {
  const prefixed = getPokemonSetLanguageFromPrefixedId(value);
  return prefixed ? prefixed === 'en' : isEnglishLanguage(language ?? 'en');
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Enumerates only verified English legacy/canonical code spellings. This is
 * intentionally not a general punctuation normalizer: UUIDs, unknown codes,
 * and non-English references remain exact.
 */
export function getEnglishSetReferenceAliases(reference?: string | null, language?: string | null) {
  const raw = clean(reference);
  const prefixedLanguage = getPokemonSetLanguageFromPrefixedId(raw);
  if (!raw || !isEnglishReference(raw, language)) return raw ? [raw] : [];
  const stripped = clean(stripPokemonSetLanguagePrefix(raw));
  // A prefixed English UUID is the same canonical identity as the bare UUID.
  // Do not extend this exception to a contradictory language prefix.
  if (UUID_PATTERN.test(stripped)) return unique(prefixedLanguage === 'en' ? [raw, stripped] : [raw]);
  const aliases = [raw, stripped];

  for (const [legacy, canonical] of EXPLICIT_ENGLISH_CODE_PAIRS) {
    if (stripped === legacy || stripped === canonical) aliases.push(legacy, canonical);
  }

  // Verified SV/ME convention: app/legacy IDs omit a leading zero and write a
  // half set as pt5, while canonical set codes use the padded decimal form.
  const svOrMe = stripped.match(/^(sv|me)(\d{1,2})(pt5|\.5)?([a-z]*)$/i);
  if (svOrMe) {
    const [, prefix, numeric, half = '', suffix = ''] = svOrMe;
    const number = Number(numeric);
    if (Number.isInteger(number) && number >= 1 && number <= 99) {
      const padded = String(number).padStart(2, '0');
      const unpadded = String(number);
      // Keep only the verified legacy/canonical pair. Do not invent mixed
      // spellings such as sv08pt5 or sv8.5.
      aliases.push(
        `${prefix}${unpadded}${half ? 'pt5' : ''}${suffix}`,
        `${prefix}${padded}${half ? '.5' : ''}${suffix}`,
      );
    }
  }

  return unique(aliases);
}

function candidateReferences(candidate: EnglishSetReferenceCandidate) {
  const external = candidate.externalIds ?? {};
  return unique([
    clean(candidate.id),
    clean(candidate.providerSetId),
    clean(candidate.setCode),
    typeof external.setCode === 'string' ? clean(external.setCode) : '',
    typeof external.legacy === 'string' ? clean(external.legacy) : '',
    typeof external.tcgdex === 'string' ? clean(external.tcgdex) : '',
    typeof external.pokemonTcg === 'string' ? clean(external.pokemonTcg) : '',
  ].filter((value) => isEnglishReference(value, 'en')));
}

/** Matches only English set codes, preserving exact identity for every other language. */
export function matchesEnglishSetReference(candidate: EnglishSetReferenceCandidate, reference?: string | null) {
  if (!isEnglishLanguage(candidate.language)) return false;
  const rawReference = clean(reference);
  if (!rawReference || !isEnglishReference(rawReference, 'en')) return false;
  const expected = new Set(getEnglishSetReferenceAliases(reference, 'en'));
  if (!expected.size) return false;
  return candidateReferences(candidate).some((value) => getEnglishSetReferenceAliases(value, 'en').some((alias) => expected.has(alias)));
}
