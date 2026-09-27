import { legacyEnglishOwnerPair, ownedRowEligibility, resolveOwnedProviderVariant } from './owner-provider-price-refresh-core.mjs';

const LANGUAGES = new Set(['en', 'ja', 'ko', 'zh-cn', 'zh-tw']);
const clean = (value) => String(value ?? '').trim();
const normalise = (value) => clean(value).toLowerCase();

function reference(value) {
  const raw = clean(value);
  const separator = raw.indexOf(':');
  const language = separator < 0 ? null : normalise(raw.slice(0, separator));
  // Provider namespaces such as pokedata: are opaque, not languages.
  if (!LANGUAGES.has(language)) return { raw, bare: raw, language: null, valid: true };
  const bare = raw.slice(separator + 1).trim();
  const nestedPrefix = normalise(bare.split(':')[0]);
  return { raw, bare, language, valid: Boolean(bare) && !(bare.includes(':') && LANGUAGES.has(nestedPrefix)) };
}

function scope(row) {
  const card = reference(row?.card_id);
  const set = reference(row?.set_id);
  const valid = card.valid && set.valid && !(card.language && set.language && card.language !== set.language);
  return { card, set, valid, language: card.language ?? set.language };
}

/** Custom folders are language-neutral. Only a saved language/prefix or one
 * published card identity can supply a missing per-card language. */
export function withPublishedOwnedLanguage(row, identifierRows = [], catalogueRows = []) {
  if (clean(row?.language)) return row;
  const value = scope(row);
  if (!value.valid) return row;
  if (value.language) return { ...row, language: value.language };
  const literal = identifierRows.filter(item => normalise(item.source_entity_type) === 'card'
    && normalise(item.external_id) === normalise(value.card.raw));
  const direct = catalogueRows.filter(item => [item.variant_id, item.printing_id].some(id => normalise(id) === normalise(value.card.raw)));
  const candidates = literal.length ? literal : direct;
  // Missing or contradictory language evidence cannot be repaired by a folder
  // default, name, image URL or collector-number resemblance.
  const languages = [...new Set(candidates.map(item => normalise(item.language_code)))];
  return languages.length === 1 && LANGUAGES.has(languages[0]) ? { ...row, language: languages[0] } : row;
}

export function withSavedCardLanguage(row, cards = []) {
  if (clean(row?.language) || scope(row).language || !scope(row).valid) return row;
  const matches = cards.filter(card => clean(card.id) === clean(row.card_id)
    && clean(card.set_id) === clean(row.set_id));
  const languages = [...new Set(matches.map(card => normalise(card.language)))];
  return languages.length === 1 && LANGUAGES.has(languages[0])
    ? { ...row, language: languages[0], languageSource: 'saved_card_metadata' } : row;
}

/** Read the exact legacy card records already referenced by these holdings.
 * This supplies language only; canonical printing/finish resolution stays in
 * the existing resolver and no saved record or alias is rewritten. */
export async function readSavedCardLanguages(supabase, rows) {
  const ids = [...new Set(rows.filter(row => !clean(row.language) && !scope(row).language && scope(row).valid)
    .map(row => clean(row.card_id)).filter(Boolean))];
  const cards = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from('pokemon_cards').select('id,set_id,language')
      .in('id', ids.slice(offset, offset + 100));
    if (error) throw error;
    cards.push(...data ?? []);
  }
  return rows.map(row => withSavedCardLanguage(row, cards));
}

/** Apply conflict-free explicit language evidence before the saved-row gates. */
export function scopedOwnedRowEligibility(row) {
  const value = scope(row);
  if (!value.valid) return 'ambiguous_saved_identity';
  const scopedInput = value.language && !clean(row?.language) ? { ...row, language: value.language } : row;
  return ownedRowEligibility(scopedInput);
}

/** Fetch the published references already accepted by the resolver. */
export function ownerIdentityLookupRows(row) {
  const value = scope(row);
  if (!value.valid) return [];
  const bare = {
    ...row,
    card_id: value.card.bare,
    set_id: value.set.bare,
    // An explicit en: reference is the same verified language evidence as an
    // explicitly stored English row. Preserve an already stored language so a
    // conflicting value cannot be silently overridden.
    ...(value.language === 'en' && !clean(row?.language) ? { language: 'en' } : {}),
  };
  const rows = value.card.raw === value.card.bare && value.set.raw === value.set.bare ? [row] : [row, bare];
  // The resolver accepts only verified English legacy set spellings, but cannot
  // resolve them unless the database lookup actually fetched them. Keep card
  // references exact; SV/SWSH aliases require an explicit English row language.
  const englishPair = !value.language || value.language === 'en' ? legacyEnglishOwnerPair(bare) : null;
  for (const set_id of englishPair?.setAliases ?? []) {
    if (!rows.some((item) => item.set_id === set_id && item.card_id === bare.card_id)) rows.push({ ...bare, set_id });
  }
  return rows;
}

/**
 * A saved ja:S12a-146 reference may use the published S12a-146 alias only
 * inside the Japanese catalogue. This does not invent an alias, strip an
 * unknown provider namespace, change collector-number spelling, or infer a
 * language for an unprefixed SV reference. Published literal aliases take
 * precedence; even a conflicting literal alias must not be bypassed.
 */
export function resolveScopedOwnedProviderVariant(row, identifierRows, catalogueRows) {
  const value = scope(row);
  if (!value.valid) return { ok: false, reason: 'ambiguous_saved_identity' };
  const savedLanguage = normalise(row?.language);
  if (value.language && savedLanguage && value.language !== savedLanguage) return { ok: false, reason: 'ambiguous_saved_identity' };
  const language = value.language ?? (LANGUAGES.has(savedLanguage) ? savedLanguage : null);
  const scopedInput = value.language && !clean(row?.language) ? { ...row, language: value.language } : row;
  const eligibility = scopedOwnedRowEligibility(row);
  if (eligibility) return { ok: false, reason: eligibility };
  if (!language) return resolveOwnedProviderVariant(scopedInput, identifierRows, catalogueRows);

  const preferredReference = (ref, entity) => (identifierRows ?? []).some((item) => (
    normalise(item.source_entity_type) === entity && normalise(item.external_id) === normalise(ref.raw)
  )) ? ref.raw : ref.bare;
  const scopedRow = {
    ...scopedInput,
    card_id: preferredReference(value.card, 'card'),
    set_id: preferredReference(value.set, 'set'),
    language: scopedInput.language ?? language,
  };
  const identifiers = (identifierRows ?? []).filter((item) => normalise(item.language_code) === language);
  const catalogue = (catalogueRows ?? []).filter((item) => normalise(item.language_code) === language);
  return resolveOwnedProviderVariant(scopedRow, identifiers, catalogue);
}
