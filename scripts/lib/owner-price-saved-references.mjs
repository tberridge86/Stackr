import { ownedRowEligibility, resolveOwnedProviderVariant } from './owner-provider-price-refresh-core.mjs';

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

/** Enumerate only literal and explicitly language-qualified saved references. */
export function ownerIdentityLookupRows(row) {
  const value = scope(row);
  if (!value.valid) return [];
  const bare = { ...row, card_id: value.card.bare, set_id: value.set.bare };
  return value.card.raw === value.card.bare && value.set.raw === value.set.bare ? [row] : [row, bare];
}

/**
 * A saved ja:S12a-146 reference may use the published S12a-146 alias only
 * inside the Japanese catalogue. This does not invent an alias, strip an
 * unknown provider namespace, change collector-number spelling, or infer a
 * language for an unprefixed SV reference. Published literal aliases take
 * precedence; even a conflicting literal alias must not be bypassed.
 */
export function resolveScopedOwnedProviderVariant(row, identifierRows, catalogueRows) {
  const eligibility = ownedRowEligibility(row);
  if (eligibility) return { ok: false, reason: eligibility };
  const value = scope(row);
  if (!value.valid) return { ok: false, reason: 'ambiguous_saved_identity' };
  if (!value.language) return resolveOwnedProviderVariant(row, identifierRows, catalogueRows);

  const preferredReference = (ref, entity) => (identifierRows ?? []).some((item) => (
    normalise(item.source_entity_type) === entity && normalise(item.external_id) === normalise(ref.raw)
  )) ? ref.raw : ref.bare;
  const scopedRow = {
    ...row,
    card_id: preferredReference(value.card, 'card'),
    set_id: preferredReference(value.set, 'set'),
  };
  const identifiers = (identifierRows ?? []).filter((item) => normalise(item.language_code) === value.language);
  const catalogue = (catalogueRows ?? []).filter((item) => normalise(item.language_code) === value.language);
  return resolveOwnedProviderVariant(scopedRow, identifiers, catalogue);
}
