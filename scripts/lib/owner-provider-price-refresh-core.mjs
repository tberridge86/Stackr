const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NORMAL_CODES = new Set(['', 'standard', 'default', 'normal']);
const NORMAL_FINISH_CODES = new Set(['', 'standard', 'default', 'normal', 'non_holo']);

export const OWNER_PRICE_REFRESH_MAX_LIMIT = 30;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}

function normalise(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function parseOwnerPriceRefreshArguments(args = []) {
  let limit = 10;
  let dryRun = true;
  for (const argument of args) {
    if (argument === '--apply') dryRun = false;
    if (argument === '--dry-run') dryRun = true;
    if (argument.startsWith('--limit=')) {
      const value = Number(argument.slice('--limit='.length));
      if (!Number.isInteger(value) || value < 1 || value > OWNER_PRICE_REFRESH_MAX_LIMIT) {
        throw new Error(`--limit must be an integer from 1 to ${OWNER_PRICE_REFRESH_MAX_LIMIT}`);
      }
      limit = value;
    }
  }
  return { limit, dryRun };
}

export function ownedRowEligibility(row) {
  if (Number(row?.quantity ?? 0) < 1) return 'quantity_not_positive';
  if (!['near mint', 'near_mint', 'nm'].includes(normalise(row?.condition))) return 'not_raw_near_mint';
  if (normalise(row?.grade_company) || normalise(row?.grade)) return 'graded_card';
  if (!NORMAL_CODES.has(normalise(row?.variant))) return 'non_normal_saved_variant';
  if (!String(row?.card_id ?? '').trim() || !String(row?.set_id ?? '').trim()) return 'missing_saved_identity';
  return null;
}

function publishedSetIds(identifierRows, savedSetId) {
  const setId = String(savedSetId ?? '').trim().toLowerCase();
  if (isUuid(setId)) return new Set([setId]);
  return new Set((identifierRows ?? [])
    .filter((row) => String(row?.external_id ?? '').trim().toLowerCase() === setId)
    .map((row) => String(row?.set_id ?? '').trim().toLowerCase())
    .filter(isUuid));
}

/**
 * Resolves a legacy owned-card row without guessing. A legacy card id and set
 * id must each map through the published identifier view to one exact default
 * variant. Caller-supplied catalogue rows make the final normal/default check
 * explicit before a provider request is possible.
 */
export function resolveOwnedProviderVariant(row, identifierRows, catalogueRows) {
  const eligibility = ownedRowEligibility(row);
  if (eligibility) return { ok: false, reason: eligibility };

  const savedCardId = String(row.card_id).trim().toLowerCase();
  const allowedSetIds = publishedSetIds(identifierRows, row.set_id);
  if (!allowedSetIds.size) return { ok: false, reason: 'unresolved_saved_set' };

  const candidateIds = isUuid(savedCardId)
    ? [savedCardId]
    : [...new Set((identifierRows ?? [])
      .filter((item) => String(item?.external_id ?? '').trim().toLowerCase() === savedCardId)
      .filter((item) => normalise(item?.source_entity_type) === 'card')
      .map((item) => String(item?.variant_id ?? '').trim().toLowerCase())
      .filter(isUuid))];
  if (!candidateIds.length) return { ok: false, reason: 'unresolved_saved_card' };

  const candidates = (catalogueRows ?? []).filter((card) => candidateIds.includes(String(card?.variant_id ?? '').toLowerCase()))
    .filter((card) => allowedSetIds.has(String(card?.set_id ?? '').toLowerCase()))
    .filter((card) => Boolean(String(card?.language_code ?? '').trim()))
    .filter((card) => NORMAL_CODES.has(normalise(card?.variant_code)))
    .filter((card) => NORMAL_FINISH_CODES.has(normalise(card?.finish_code)));
  const unique = [...new Map(candidates.map((card) => [String(card.variant_id).toLowerCase(), card])).values()];
  if (unique.length !== 1) return { ok: false, reason: unique.length ? 'ambiguous_saved_identity' : 'unsupported_or_unpublished_variant' };
  return { ok: true, variantId: String(unique[0].variant_id).toLowerCase() };
}

export function summariseOwnerPriceRefresh(results) {
  const summary = { scanned: results.length, eligible: 0, skipped: 0, skipReasons: {} };
  for (const result of results) {
    if (result.ok) summary.eligible += 1;
    else {
      summary.skipped += 1;
      summary.skipReasons[result.reason] = (summary.skipReasons[result.reason] ?? 0) + 1;
    }
  }
  return summary;
}
