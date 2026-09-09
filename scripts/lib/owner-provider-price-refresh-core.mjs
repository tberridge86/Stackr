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

function sameCollectorNumber(left, right) {
  const normalize = (value) => String(value ?? '').trim().replace(/^0+(?=\d)/, '');
  return Boolean(normalize(left) && normalize(right)) && normalize(left) === normalize(right);
}

function englishSetCodeAliases(value) {
  const code = normalise(value);
  const match = /^(sv|me)(\d{1,2})(pt5|\.5)?([a-z]*)$/.exec(code);
  if (!match) return [];
  const [, prefix, numeric, half = '', suffix = ''] = match;
  const number = Number(numeric);
  if (!Number.isInteger(number) || number < 1 || number > 99) return [];
  return [...new Set([
    code,
    `${prefix}${number}${half ? 'pt5' : ''}${suffix}`,
    `${prefix}${String(number).padStart(2, '0')}${half ? '.5' : ''}${suffix}`,
  ])];
}

/**
 * Legacy English app rows used `<ME code>` and `<ME code>-<collector>` together.
 * This mirrors the verified ME alias rule in lib/englishSetIdentity. It does
 * not reinterpret SV or arbitrary unprefixed/foreign ids as English: Japanese
 * ME identities use their distinct `m` prefix. The resulting set must still
 * resolve through a published English set and one exact normal variant.
 */
export function legacyEnglishOwnerPair(row) {
  const setMatch = /^(me\d{1,2}(?:pt5|\.5)?[a-z]*)$/.exec(normalise(row?.set_id));
  const cardMatch = /^(me\d{1,2}(?:pt5|\.5)?[a-z]*)-(\d+)$/.exec(normalise(row?.card_id));
  if (!setMatch || !cardMatch) return null;
  const setAliases = englishSetCodeAliases(setMatch[1]);
  const cardSetAliases = englishSetCodeAliases(cardMatch[1]);
  if (!setAliases.length || !cardSetAliases.some((value) => setAliases.includes(value))) return null;
  return { setAliases, collectorNumber: cardMatch[2] };
}

export function parseOwnerPriceRefreshArguments(args = []) {
  let limit = 10;
  let dryRun = true;
  let includeQueue = false;
  let queueOnly = false;
  for (const argument of args) {
    if (argument === '--apply') dryRun = false;
    if (argument === '--dry-run') dryRun = true;
    if (argument === '--include-queue') includeQueue = true;
    if (argument === '--queue-only') queueOnly = true;
    if (argument.startsWith('--limit=')) {
      const value = Number(argument.slice('--limit='.length));
      if (!Number.isInteger(value) || value < 1 || value > OWNER_PRICE_REFRESH_MAX_LIMIT) {
        throw new Error(`--limit must be an integer from 1 to ${OWNER_PRICE_REFRESH_MAX_LIMIT}`);
      }
      limit = value;
    }
  }
  if (queueOnly && !includeQueue) throw new Error('--queue-only requires --include-queue.');
  return { limit, dryRun, includeQueue, queueOnly };
}

function queueMetadata(row) {
  return row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
}

/**
 * The old Pricing V2 runner must not be revived. This accepts only the exact
 * Home request shape and verifies every physical identity field against the
 * published catalogue row before an exact provider request can be made.
 */
export function resolveOwnerExactQueueItem(row, catalogueRows, expectedOwnerId = null) {
  const metadata = queueMetadata(row);
  const variantId = String(metadata.canonicalVariantId ?? '').trim().toLowerCase();
  if (String(row?.reason ?? '') !== 'manual_snapshot_refresh'
    || String(metadata.refreshPipeline ?? '') !== 'pricing_v2_exact'
    || (expectedOwnerId && normalise(row?.requested_by) !== normalise(expectedOwnerId))
    || !isUuid(variantId)) return { ok: false, reason: 'unsupported_queue_identity' };
  if (String(metadata.productType ?? '') !== 'raw_card'
    || !['raw_near_mint', 'near_mint', 'nm'].includes(normalise(metadata.rawCondition ?? metadata.condition))
    || normalise(metadata.currency) !== 'gbp'
    || (metadata.language && normalise(metadata.language) !== normalise(row?.language))) return { ok: false, reason: 'unsupported_queue_scope' };
  const matches = (catalogueRows ?? []).filter((card) => String(card?.variant_id ?? '').toLowerCase() === variantId)
    .filter((card) => String(card?.printing_id ?? '') === String(row?.card_id ?? ''))
    .filter((card) => String(card?.printing_id ?? '') === String(metadata.canonicalPrintingId ?? ''))
    .filter((card) => normalise(card?.language_code) === normalise(row?.language))
    .filter((card) => String(card?.set_id ?? '') === String(row?.set_id ?? ''))
    .filter((card) => NORMAL_CODES.has(normalise(card?.variant_code)))
    .filter((card) => NORMAL_FINISH_CODES.has(normalise(card?.finish_code)))
    .filter((card) => !metadata.variantCode || normalise(card?.variant_code) === normalise(metadata.variantCode))
    .filter((card) => !metadata.finishCode || normalise(card?.finish_code) === normalise(metadata.finishCode));
  if (matches.length !== 1) return { ok: false, reason: 'unsupported_queue_identity' };
  return { ok: true, variantId };
}

export function ownedRowEligibility(row) {
  if (Number(row?.quantity ?? 0) < 1) return 'quantity_not_positive';
  if (!['near mint', 'near_mint', 'nm'].includes(normalise(row?.condition))) return 'not_raw_near_mint';
  if (normalise(row?.grade_company) || normalise(row?.grade)) return 'graded_card';
  if (!NORMAL_CODES.has(normalise(row?.variant))) return 'non_normal_saved_variant';
  if (!String(row?.card_id ?? '').trim() || !String(row?.set_id ?? '').trim()) return 'missing_saved_identity';
  return null;
}

function publishedSetIds(identifierRows, savedSetId, aliases = []) {
  const setId = String(savedSetId ?? '').trim().toLowerCase();
  if (isUuid(setId)) return new Set([setId]);
  const references = new Set([setId, ...aliases.map(normalise)]);
  return new Set((identifierRows ?? [])
    .filter((row) => references.has(String(row?.external_id ?? '').trim().toLowerCase()))
    .filter((row) => normalise(row?.source_entity_type) === 'set')
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
  const englishPair = legacyEnglishOwnerPair(row);
  const allowedSetIds = publishedSetIds(identifierRows, row.set_id, englishPair?.setAliases);
  if (!allowedSetIds.size) return { ok: false, reason: 'unresolved_saved_set' };

  const candidateIds = isUuid(savedCardId)
    ? [savedCardId]
    : [...new Set((identifierRows ?? [])
      .filter((item) => String(item?.external_id ?? '').trim().toLowerCase() === savedCardId)
      .filter((item) => normalise(item?.source_entity_type) === 'card')
      .map((item) => String(item?.variant_id ?? '').trim().toLowerCase())
      .filter(isUuid))];
  const directCandidates = (catalogueRows ?? []).filter((card) => candidateIds.includes(String(card?.variant_id ?? '').toLowerCase()));
  const legacyCandidates = englishPair
    ? (catalogueRows ?? []).filter((card) => allowedSetIds.has(String(card?.set_id ?? '').toLowerCase()))
      .filter((card) => normalise(card?.language_code) === 'en')
      .filter((card) => sameCollectorNumber(card?.collector_number, englishPair.collectorNumber))
    : [];
  if (!candidateIds.length && !legacyCandidates.length) return { ok: false, reason: 'unresolved_saved_card' };

  const candidates = [...directCandidates, ...legacyCandidates]
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
