const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NORMAL_CODES = new Set(['', 'standard', 'default', 'normal']);
const NORMAL_FINISH_CODES = new Set(['', 'standard', 'default', 'normal', 'non_holo']);

export const OWNER_PRICE_REFRESH_MAX_LIMIT = 30;
export const OWNER_PRICE_REFRESH_COMPLETE_MAX_VARIANTS = 500;

export function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? '').trim());
}

function normalise(value) {
  return String(value ?? '').trim().toLowerCase();
}

function savedVariantToken(value) {
  return String(value ?? '').trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

/** The only physical finishes the exact TCGdex refresh can prove today. */
export function savedProviderVariantCode(value) {
  const token = savedVariantToken(typeof value === 'object' ? value?.variant : value);
  if (NORMAL_CODES.has(token) || token === 'non_holo') return 'normal';
  if (['holo', 'holofoil'].includes(token)) return 'holo';
  if (['reverse_holo', 'reverse_holofoil', 'reverseholofoil'].includes(token)) return 'reverse_holo';
  return null;
}

function sameCollectorNumber(left, right) {
  const normalize = (value) => {
    const raw = String(value ?? '').trim().toLowerCase();
    return /^\d+$/.test(raw) ? raw.replace(/^0+(?=\d)/, '') : raw;
  };
  return Boolean(normalize(left) && normalize(right)) && normalize(left) === normalize(right);
}

function isEnglishLanguage(value) {
  return ['en', 'english', 'en-us', 'en-gb'].includes(normalise(value).replace(/_/g, '-'));
}

function englishSetCodeAliases(value) {
  const code = normalise(value);
  const explicit = [
    ['sv8pt5', 'sv08.5'],
    ['swsh12pt5', 'swsh12.5'],
    ['swsh35', 'swsh3.5'],
    ['swsh45', 'swsh4.5'],
    ['swsh45sv', 'swsh4.5sv'],
    ['swsh12pt5gg', 'swsh12.5gg'],
    ['sm35', 'sm3.5'],
    ['sm75', 'sm7.5'],
  ];
  const explicitPair = explicit.find(([legacy, canonical]) => code === legacy || code === canonical);
  if (explicitPair) return [...new Set([code, ...explicitPair])];
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
 * Legacy English app rows used a verified English set code and
 * `<set code>-<collector>` together. ME pairs retain their established
 * behavior. SV/SWSH legacy aliases require an explicit English saved language;
 * this does not infer a language for bare or foreign references. The resulting
 * set must still resolve through a published English set and one exact normal
 * variant.
 */
export function legacyEnglishOwnerPair(row) {
  const setCode = normalise(row?.set_id);
  const cardMatch = /^([a-z0-9.]+)-([a-z0-9]+)$/.exec(normalise(row?.card_id));
  if (!cardMatch) return null;
  const setAliases = englishSetCodeAliases(setCode);
  const cardSetAliases = englishSetCodeAliases(cardMatch[1]);
  if (!setAliases.length || !cardSetAliases.some((value) => setAliases.includes(value))) return null;
  const establishedMePair = /^me\d{1,2}(?:pt5|\.5)?[a-z]*$/.test(setCode);
  if (!establishedMePair && !isEnglishLanguage(row?.language)) return null;
  return { setAliases, collectorNumber: cardMatch[2] };
}

/** The long-standing unscoped English rule applies only to ME set/card pairs. */
export function verifiedLegacyEnglishMePair(row) {
  if (!/^me\d{1,2}(?:pt5|\.5)?[a-z]*$/.test(normalise(row?.set_id))) return null;
  return legacyEnglishOwnerPair(row);
}

export function parseOwnerPriceRefreshArguments(args = []) {
  let limit = 10;
  let dryRun = true;
  let includeQueue = false;
  let queueOnly = false;
  let completeOwned = false;
  for (const argument of args) {
    if (argument === '--apply') dryRun = false;
    if (argument === '--dry-run') dryRun = true;
    if (argument === '--include-queue') includeQueue = true;
    if (argument === '--queue-only') queueOnly = true;
    if (argument === '--complete-owned') completeOwned = true;
    if (argument.startsWith('--limit=')) {
      const value = Number(argument.slice('--limit='.length));
      if (!Number.isInteger(value) || value < 1 || value > OWNER_PRICE_REFRESH_MAX_LIMIT) {
        throw new Error(`--limit must be an integer from 1 to ${OWNER_PRICE_REFRESH_MAX_LIMIT}`);
      }
      limit = value;
    }
  }
  if (queueOnly && !includeQueue) throw new Error('--queue-only requires --include-queue.');
  if (completeOwned && (includeQueue || queueOnly)) {
    throw new Error('--complete-owned cannot be combined with queue refresh options.');
  }
  return { limit, dryRun, includeQueue, queueOnly, completeOwned };
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
    .filter((card) => NORMAL_CODES.has(normalise(card?.variant_code)) && NORMAL_FINISH_CODES.has(normalise(card?.finish_code))
      || normalise(card?.language_code) === 'en' && ['holo','reverse_holo'].includes(normalise(card?.variant_code)) && normalise(card?.finish_code) === normalise(card?.variant_code))
    .filter((card) => !metadata.variantCode || normalise(card?.variant_code) === normalise(metadata.variantCode))
    .filter((card) => !metadata.finishCode || normalise(card?.finish_code) === normalise(metadata.finishCode));
  if (matches.length !== 1) return { ok: false, reason: 'unsupported_queue_identity' };
  return { ok: true, variantId };
}

export function ownedRowEligibility(row) {
  if (Number(row?.quantity ?? 0) < 1) return 'quantity_not_positive';
  if (!['near mint', 'near_mint', 'nm'].includes(normalise(row?.condition))) return 'not_raw_near_mint';
  if (normalise(row?.grade_company) || normalise(row?.grade)) return 'graded_card';
  const variant = savedProviderVariantCode(row);
  if (!variant || (variant !== 'normal' && !isEnglishLanguage(row?.language))) return 'non_normal_saved_variant';
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
 * id must each map through the published identifier view to one exact physical
 * variant. Caller-supplied catalogue rows make the final finish check explicit
 * before a provider request is possible.
 */
export function resolveOwnedProviderVariant(row, identifierRows, catalogueRows) {
  const eligibility = ownedRowEligibility(row);
  if (eligibility) return { ok: false, reason: eligibility };
  const expectedVariant = savedProviderVariantCode(row);

  const savedCardId = String(row.card_id).trim().toLowerCase();
  const englishPair = legacyEnglishOwnerPair(row);
  const verifiedMePair = verifiedLegacyEnglishMePair(row);
  const allowedSetIds = publishedSetIds(identifierRows, row.set_id, englishPair?.setAliases);
  if (!allowedSetIds.size) return { ok: false, reason: 'unresolved_saved_set' };

  const cardIdentifiers = (identifierRows ?? [])
    .filter((item) => normalise(item?.external_id) === savedCardId)
    .filter((item) => normalise(item?.source_entity_type) === 'card');
  const candidateIds = isUuid(savedCardId)
    ? [savedCardId]
    : [...new Set(cardIdentifiers.map((item) => normalise(item?.variant_id)).filter(isUuid))];
  const aliasScopeMatches = (alias, card) => (
    (!normalise(alias.set_id) || normalise(alias.set_id) === normalise(card.set_id))
    && (!normalise(alias.printing_id) || normalise(alias.printing_id) === normalise(card.printing_id))
    && (!normalise(alias.language_code) || normalise(alias.language_code) === normalise(card.language_code))
  );
  const directCandidates = (catalogueRows ?? [])
    .filter((card) => candidateIds.includes(normalise(card?.variant_id)))
    .filter((card) => isUuid(savedCardId) || cardIdentifiers.some((alias) => (
      normalise(alias.variant_id) === normalise(card.variant_id) && aliasScopeMatches(alias, card)
    )));
  // Published aliases can identify a printing without naming a physical
  // variant. Reuse that mapping only for its single attested normal finish.
  // Holo/reverse rows need a direct canonical-variant mapping; an alias with
  // an explicit (even invalid) variant must never broaden to a sibling finish.
  const printingAliases = cardIdentifiers
    .filter((alias) => !normalise(alias.variant_id) && isUuid(alias.printing_id));
  // The measured ME cohort has one authoritative English printing-level card
  // alias. It can constrain the established ME collector pair only when it
  // is coherent with the published English set and names one printing. Any
  // canonical, foreign, invalid, or conflicting literal alias must use the
  // direct path and therefore cannot be bypassed by a collector match.
  const coherentMePrintingAliases = cardIdentifiers.filter((alias) => !normalise(alias.variant_id)
    && isUuid(alias.printing_id)
    && normalise(alias.language_code) === 'en'
    && (!normalise(alias.set_id) || allowedSetIds.has(normalise(alias.set_id))));
  const coherentMePrintingIds = [...new Set(coherentMePrintingAliases.map((alias) => normalise(alias.printing_id)))];
  const exactMePrintingId = cardIdentifiers.length
    && coherentMePrintingAliases.length === cardIdentifiers.length
    && coherentMePrintingIds.length === 1
    ? coherentMePrintingIds[0]
    : null;
  const savedPrintingId = expectedVariant === 'normal' && isUuid(savedCardId) && !directCandidates.length ? savedCardId : null;
  const printingCandidates = (catalogueRows ?? [])
    .filter(() => expectedVariant === 'normal')
    .filter((card) => (savedPrintingId && normalise(card.printing_id) === savedPrintingId)
      || printingAliases.some((alias) => normalise(alias.printing_id) === normalise(card.printing_id)
        && aliasScopeMatches(alias, card)))
    .filter((card) => ['standard', 'default', 'normal'].includes(normalise(card.variant_code)))
    .filter((card) => ['standard', 'default', 'normal', 'non_holo'].includes(normalise(card.finish_code)));
  // New physical finishes use a direct canonical alias, except for the
  // measured ME printing-level identity above. That exception still requires
  // set, collector, English, printing, finish and uniqueness agreement.
  const legacyPair = expectedVariant === 'normal' ? englishPair
    : isEnglishLanguage(row?.language) && exactMePrintingId ? verifiedMePair : null;
  const legacyCandidates = legacyPair
    ? (catalogueRows ?? []).filter((card) => allowedSetIds.has(String(card?.set_id ?? '').toLowerCase()))
      .filter((card) => normalise(card?.language_code) === 'en')
      .filter((card) => expectedVariant === 'normal' || normalise(card?.printing_id) === exactMePrintingId)
      .filter((card) => sameCollectorNumber(card?.collector_number, legacyPair.collectorNumber))
    : [];
  if (!candidateIds.length && !printingAliases.length && !legacyCandidates.length) return { ok: false, reason: 'unresolved_saved_card' };

  const candidates = [...directCandidates, ...printingCandidates, ...legacyCandidates]
    .filter((card) => isUuid(card?.variant_id))
    .filter((card) => allowedSetIds.has(String(card?.set_id ?? '').toLowerCase()))
    .filter((card) => Boolean(String(card?.language_code ?? '').trim()))
    .filter((card) => expectedVariant === 'normal'
      ? NORMAL_CODES.has(normalise(card?.variant_code)) && NORMAL_FINISH_CODES.has(normalise(card?.finish_code))
      : normalise(card?.language_code) === 'en'
        && normalise(card?.variant_code) === expectedVariant
        && normalise(card?.finish_code) === expectedVariant);
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
