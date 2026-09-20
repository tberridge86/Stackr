import { ownerIdentityLookupRows } from './owner-price-saved-references.mjs';
import { verifiedLegacyEnglishMePair } from './owner-provider-price-refresh-core.mjs';
import { generalPriceBaseCandidates, selectGeneralPriceBase } from '../../backend/lib/marketPricing/generalEstimate.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANGUAGE = new Set(['en', 'ja', 'ko', 'zh-cn', 'zh-tw']);
const clean = (value) => String(value ?? '').trim();
const token = (value) => clean(value).toLowerCase();
const uuid = (value) => UUID.test(clean(value));

function reference(value) {
  const raw = clean(value); const separator = raw.indexOf(':');
  const language = separator < 0 ? null : token(raw.slice(0, separator));
  if (!LANGUAGE.has(language)) return { raw, bare: raw, language: null, valid: true };
  const bare = raw.slice(separator + 1).trim();
  const nested = token(bare.split(':')[0]);
  return { raw, bare, language, valid: Boolean(bare) && !(bare.includes(':') && LANGUAGE.has(nested)) };
}

function scopedReferences(unit) {
  const card = reference(unit?.card_id); const set = reference(unit?.set_id);
  const savedLanguage = token(unit?.language);
  const explicit = [...new Set([card.language, set.language].filter(Boolean))];
  if (!card.valid || !set.valid || explicit.length > 1 || (savedLanguage && explicit[0] && savedLanguage !== explicit[0])) return null;
  const language = explicit[0] ?? savedLanguage;
  return language ? { card, set, language } : null;
}

function preferredAliases(rows, ref, type, language) {
  const literal = rows.filter((row) => token(row?.source_entity_type) === type
    && token(row?.external_id) === token(ref.raw));
  const source = literal.length ? literal : rows.filter((row) => token(row?.source_entity_type) === type
    && token(row?.external_id) === token(ref.bare));
  return source.filter((row) => token(row?.language_code) === language);
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function sameCollectorNumber(left, right) {
  return token(left).replace(/^0+/, '') === token(right).replace(/^0+/, '')
    && Boolean(token(left)) && Boolean(token(right));
}

function verifiedMePair(scope, unit) {
  return verifiedLegacyEnglishMePair({
    ...unit,
    set_id: scope.set.bare,
    card_id: scope.card.bare,
    language: scope.language,
  });
}

// The worker can read a direct canonical row first and its full printing
// group later. Keep the richer copy of the same variant for evidence checks,
// but never merge two copies that disagree about its physical identity.
function consolidateCatalogueRows(rows) {
  const merged = new Map();
  const identity = ['printing_id', 'set_id', 'language_code', 'variant_code', 'finish_code'];
  for (const row of rows ?? []) {
    const id = token(row?.variant_id);
    if (!id) continue;
    const prior = merged.get(id);
    if (!prior) { merged.set(id, { ...row }); continue; }
    const conflict = identity.some((field) => clean(prior[field]) && clean(row?.[field])
      && token(prior[field]) !== token(row?.[field]));
    const next = { ...row, ...prior, _generalIdentityConflict: Boolean(prior._generalIdentityConflict || conflict) };
    for (const [field, value] of Object.entries(row)) if (!clean(next[field]) && clean(value)) next[field] = value;
    merged.set(id, next);
  }
  return [...merged.values()];
}

/**
 * Resolve only a proven same-printing general estimate. It deliberately does
 * not derive a printing from collector numbers, a sibling set, or a language.
 */
export function resolveGeneralPriceIdentity(unit, identifiers, catalogue) {
  const scope = scopedReferences(unit);
  if (!scope) return { ok: false, reason: 'general_identity_unproven' };
  const cardAliases = preferredAliases(identifiers ?? [], scope.card, 'card', scope.language);
  const setAliases = preferredAliases(identifiers ?? [], scope.set, 'set', scope.language);
  const setIds = new Set([
    ...setAliases.map((row) => token(row?.set_id)).filter(uuid),
    ...(uuid(scope.set.bare) ? [token(scope.set.bare)] : []),
  ]);
  if (setIds.size > 1) return { ok: false, reason: 'general_identity_ambiguous' };
  const allCards = consolidateCatalogueRows(catalogue);

  const directRows = uuid(scope.card.bare)
    ? allCards.filter((row) => token(row?.variant_id) === token(scope.card.bare))
    : [];
  const canonicalAliases = cardAliases.filter((row) => clean(row?.variant_id));
  const printingAliases = cardAliases.filter((row) => !clean(row?.variant_id) && uuid(row?.printing_id));
  // A literal canonical mapping is stronger evidence than a printing alias.
  // An invalid or conflicting canonical mapping therefore cannot be bypassed.
  if (canonicalAliases.length) {
    const ids = unique(canonicalAliases.map((row) => token(row?.variant_id)));
    if (ids.length !== 1) return { ok: false, reason: 'general_identity_ambiguous' };
    directRows.push(...allCards.filter((row) => token(row?.variant_id) === ids[0]));
  }

  const constrained = (rows) => rows.filter((row) => token(row?.language_code) === scope.language)
    .filter((row) => !setIds.size || setIds.has(token(row?.set_id)));
  const direct = constrained(directRows);
  if (direct.some((row) => row._generalIdentityConflict)) return { ok: false, reason: 'general_identity_ambiguous' };
  const directPrintings = unique(direct.map((row) => token(row?.printing_id)));
  if (canonicalAliases.length && directPrintings.length !== 1) return { ok: false, reason: 'general_identity_unproven' };

  let printingId = directPrintings[0] ?? null;
  let resolution = 'same_printing_base';
  if (!printingId && printingAliases.length) {
    const aliases = unique(printingAliases.map((row) => token(row?.printing_id)));
    if (aliases.length !== 1) return { ok: false, reason: 'general_identity_ambiguous' };
    printingId = aliases[0];
  }
  if (!printingId) return { ok: false, reason: 'general_identity_unproven' };

  const printingRows = constrained(allCards.filter((row) => token(row?.printing_id) === printingId));
  if (printingRows.some((row) => row._generalIdentityConflict)) return { ok: false, reason: 'general_identity_ambiguous' };
  if (setIds.size) {
    if (!printingRows.length) return { ok: false, reason: 'general_identity_unproven' };
  } else {
    // The sole exception to a set alias is the approved English printing-only
    // evidence shape. It must itself prove one English set and one printing.
    const pair = verifiedMePair(scope, unit);
    const approved = scope.language === 'en' && !canonicalAliases.length
      && cardAliases.length === 1 && printingAliases.length === 1
      && Number(printingAliases[0]?.confidence) === 1
      && pair
      && printingRows.every((row) => pair.setAliases.includes(token(row?.set_code))
        && sameCollectorNumber(row?.collector_number, pair.collectorNumber));
    const sets = unique(printingRows.map((row) => token(row?.set_id)));
    if (!approved || sets.length !== 1 || !printingRows.length || uuid(scope.set.bare)) return { ok: false, reason: 'general_set_unproven' };
    resolution = 'approved_printing_alias_general';
  }
  const selection = selectGeneralPriceBase(printingRows);
  if (!selection) return { ok: false, reason: 'general_base_unavailable' };
  return { ok: true, priceVariantId: selection.baseVariantId, baseCandidates: generalPriceBaseCandidates(printingRows),
    priceScope: 'printing_general', resolution, selection };
}

/** References needed for bounded by-printing discovery, without new aliases. */
export function generalPrintingDiscoveryIds(units, identifiers, knownCatalogue = []) {
  const ids = new Set();
  for (const unit of units ?? []) {
    const scope = scopedReferences(unit); if (!scope) continue;
    const cardAliases = preferredAliases(identifiers ?? [], scope.card, 'card', scope.language);
    for (const row of cardAliases) {
      if (!clean(row?.variant_id) && uuid(row?.printing_id)) ids.add(token(row.printing_id));
    }
    // A direct canonical card can prove its requested printing, but the
    // ordinary direct reader contains only that variant. Fetch its bounded
    // sibling group too so a normal/holo base can be selected safely.
    const setAliases = preferredAliases(identifiers ?? [], scope.set, 'set', scope.language);
    const setIds = new Set([
      ...setAliases.map((row) => token(row?.set_id)).filter(uuid),
      ...(uuid(scope.set.bare) ? [token(scope.set.bare)] : []),
    ]);
    if (setIds.size > 1) continue;
    const directIds = new Set([
      ...(uuid(scope.card.bare) ? [token(scope.card.bare)] : []),
      ...cardAliases.map((row) => token(row?.variant_id)).filter(uuid),
    ]);
    for (const row of knownCatalogue ?? []) {
      if (!directIds.has(token(row?.variant_id)) || token(row?.language_code) !== scope.language) continue;
      if (setIds.size && !setIds.has(token(row?.set_id))) continue;
      if (uuid(row?.printing_id)) ids.add(token(row.printing_id));
    }
  }
  return [...ids];
}

const PRINTING_DISCOVERY_BATCH = 50;
const PRINTING_DISCOVERY_MAX = 200;

/**
 * Read only printing groups established by a published printing alias or an
 * already-read direct canonical variant. Resolving a requested identity still
 * happens separately and remains strict; this only supplies its siblings.
 */
export async function readGeneralPrintingCatalogue(supabase, units, identifiers, knownCatalogue = []) {
  // A known row does not prove that its siblings were read. Query every
  // relevant printing group so direct reverse/normal variants can discover a
  // distinct safe base instead of silently seeing a partial group.
  const ids = generalPrintingDiscoveryIds(units, identifiers, knownCatalogue);
  if (ids.length > PRINTING_DISCOVERY_MAX) throw new Error('General printing discovery reached its safe result bound.');
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += PRINTING_DISCOVERY_BATCH) {
    const printingIds = ids.slice(offset, offset + PRINTING_DISCOVERY_BATCH);
    for (let page = 0; ; page += 500) {
      const { data, error } = await supabase.schema('api').from('catalogue_cards')
        .select('variant_id,printing_id,set_id,set_code,collector_number,language_code,variant_code,finish_code,catalogue_version_id')
        .in('printing_id', printingIds).order('variant_id').range(page, page + 499);
      if (error) throw error;
      const values = data ?? []; rows.push(...values);
      if (values.length < 500) break;
      if (page >= 4_500) throw new Error('General printing catalogue page limit exceeded.');
    }
  }
  return rows;
}
