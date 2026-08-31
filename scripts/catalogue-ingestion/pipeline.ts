import { createHash, randomUUID } from 'node:crypto';
import {
  cleanText,
  normaliseLanguageCode,
  normaliseName,
  normaliseVariantCode,
  type FetchScope,
  type NormalisedRecord,
  type ProviderRecord,
  type SourceAdapter,
  type SourceHealth,
  type SourceIdentity,
  type ValidationIssue,
  type ValidationResult,
} from './sourceAdapter';

type SupabaseClientLike = {
  schema: (schema: string) => {
    from: (table: string) => any;
    rpc?: (name: string, args: Record<string, unknown>) => any;
  };
};

type ImportCommand =
  | 'run_source'
  | 'run_language'
  | 'run_set'
  | 'resume_import'
  | 'rebuild_record';

type ImportOptions = FetchScope & {
  command?: ImportCommand;
  importType?: 'full' | 'delta' | 'backfill' | 'repair' | 'manual';
  requestId?: string;
  runKey?: string;
  dryRun?: boolean;
  allowImageAssets?: boolean;
  setsOnly?: boolean;
  assetsOnly?: boolean;
  approvedOnlyAssets?: boolean;
  writeConcurrency?: number;
  runMetadata?: Record<string, unknown>;
};

type ImportStats = {
  recordsRequested: number;
  recordsRetrieved: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsConflicted: number;
  decisions: number;
};

type SourceRow = {
  id: string;
  code: string;
};

type RunRow = {
  id: string;
};

function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

export function payloadChecksum(payload: unknown): string {
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

export function parseRetainedRawRecord(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const id = cleanText(record?.id);
  const changed = cleanText(record?.changed);
  if (
    !id
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || !changed
    || !['inserted', 'updated', 'reused'].includes(changed)
  ) {
    throw new Error('invalid_retain_raw_source_record_response');
  }
  return { id, changed: changed as 'inserted' | 'updated' | 'reused' };
}

export function classifyMappedOfficialImageTarget(input: {
  cardId: string;
  resolvedSetId?: string | null;
  providerCollectorNumber?: string | null;
  requestedVariantCode?: string | null;
  requestedFinishCode?: string | null;
  mappedVariant?: {
    id?: string | null;
    languageCode?: string | null;
    setId?: string | null;
    collectorNumber?: string | null;
    variantCode?: string | null;
    finishCode?: string | null;
    artworkKey?: string | null;
  } | null;
}) {
  const cardId = cleanText(input.cardId);
  const expectedArtworkKey = cardId ? `pokemon_card_jp_official:${cardId}` : null;
  const mapped = input.mappedVariant;
  if (!expectedArtworkKey || !mapped?.id || mapped.languageCode !== 'ja') {
    return { status: 'conflict' as const, expectedArtworkKey, reason: 'inactive_or_non_japanese_target' };
  }
  if (mapped.artworkKey === expectedArtworkKey) {
    return { status: 'exact' as const, expectedArtworkKey, reason: 'existing_exact_artwork_key' };
  }
  if (mapped.artworkKey != null) {
    return { status: 'conflict' as const, expectedArtworkKey, reason: 'different_existing_artwork_key' };
  }
  if (!input.resolvedSetId || mapped.setId !== input.resolvedSetId) {
    return { status: 'conflict' as const, expectedArtworkKey, reason: 'set_identity_mismatch' };
  }
  if (
    typeof input.providerCollectorNumber !== 'string'
    || input.providerCollectorNumber.length === 0
    || mapped.collectorNumber !== input.providerCollectorNumber
  ) {
    return { status: 'conflict' as const, expectedArtworkKey, reason: 'collector_identity_mismatch' };
  }
  if (input.requestedVariantCode !== 'normal' || input.requestedFinishCode !== 'normal') {
    return { status: 'conflict' as const, expectedArtworkKey, reason: 'provider_classification_not_normal' };
  }
  const classificationIsCompatible = (
    mapped.variantCode === 'normal'
    && (mapped.finishCode == null || mapped.finishCode === 'normal')
  ) || (
    mapped.variantCode === 'unclassified'
    && (mapped.finishCode == null || mapped.finishCode === 'unclassified')
  );
  if (!classificationIsCompatible) {
    return { status: 'conflict' as const, expectedArtworkKey, reason: 'target_classification_mismatch' };
  }
  return { status: 'repair' as const, expectedArtworkKey, reason: 'exact_mapped_null_artwork_key' };
}

export function calculateExponentialBackoff(
  attempts: number,
  baseSeconds = 60,
  maxSeconds = 86_400,
) {
  const safeAttempts = Math.max(0, Math.trunc(attempts));
  const seconds = Math.min(Math.max(1, baseSeconds) * (2 ** safeAttempts), Math.max(1, maxSeconds));
  return {
    seconds,
    runAfter: new Date(Date.now() + seconds * 1000).toISOString(),
  };
}

async function collectRecords(records: AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]> | ProviderRecord[]) {
  const resolved = await records;
  if (Array.isArray(resolved)) return resolved;
  const collected: ProviderRecord[] = [];
  for await (const record of resolved) collected.push(record);
  return collected;
}

function table(db: SupabaseClientLike, schema: string, name: string) {
  return db.schema(schema).from(name);
}

function nowIso() {
  return new Date().toISOString();
}

function declaredVariantCodes(raw: Record<string, unknown>) {
  const supported = new Set<string>();
  const variants = raw.variants;
  if (Array.isArray(variants)) {
    for (const variant of variants) supported.add(normaliseVariantCode(variant));
  } else if (variants && typeof variants === 'object') {
    for (const [code, available] of Object.entries(variants as Record<string, unknown>)) {
      if (available !== true) continue;
      supported.add(normaliseVariantCode(code === 'reverse' ? 'reverse_holo' : code));
    }
  }
  if (supported.size === 0) supported.add('normal');
  return [...supported];
}

export function isMissingVariantRepairPrecondition(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { code?: unknown }).code === 'P0002'
  );
}

const VARIANT_REPAIR_NOT_APPLICABLE_MESSAGES = new Set([
  'Variant identity safety check failed.',
  'Pinned finish evidence does not support this repair.',
  'The stale base provider identity is no longer current.',
  'The supported provider variant identity is not current.',
  'The stale variant has an unexpected current provider link.',
  'Ambiguous active assets prevent an automatic variant repair.',
  'A mirrored stale asset has no supported destination.',
]);

export function isVariantRepairNotApplicable(error: unknown) {
  if (isMissingVariantRepairPrecondition(error)) return true;
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { code?: unknown }).code === 'P0001'
    && typeof (error as { message?: unknown }).message === 'string'
    && VARIANT_REPAIR_NOT_APPLICABLE_MESSAGES.has((error as { message: string }).message)
  );
}

export function isSafeSupportedPrimaryAliasTarget(input: {
  currentPrintingId: string;
  currentArtworkKey?: string | null;
  identityVariant?: {
    id?: string | null;
    printingId?: string | null;
    variantCode?: string | null;
    artworkKey?: string | null;
  } | null;
  expectedVariantCode: string;
}) {
  const identityVariant = input.identityVariant;
  return Boolean(
    identityVariant?.id
    && identityVariant.printingId === input.currentPrintingId
    && identityVariant.variantCode === input.expectedVariantCode
    && (identityVariant.artworkKey ?? null) === (input.currentArtworkKey ?? null)
  );
}

export function releasedExactlyOnePrimaryAlias(rows: unknown) {
  return Array.isArray(rows) && rows.length === 1;
}

export function isResolvedDeprecatedVariantAlias(input: {
  deprecatedAt?: string | null;
  correctedByVariantId?: string | null;
  correctionTargetId?: string | null;
  deprecatedPrintingId?: string | null;
  correctionTargetPrintingId?: string | null;
  externalVariantId?: string | null;
}) {
  return Boolean(
    input.deprecatedAt
    && input.correctedByVariantId
    && input.correctionTargetId === input.correctedByVariantId
    && input.deprecatedPrintingId
    && input.correctionTargetPrintingId === input.deprecatedPrintingId
    && (!input.externalVariantId || input.externalVariantId === input.correctionTargetId)
  );
}

export function isSafeUnsupportedPrimaryVariantCorrection(input: {
  provider: string;
  sourceId: string;
  languageCode: string;
  providerRecordId: string;
  staleVariantId: string;
  staleVariantCode: string;
  staleArtworkKey?: string | null;
  expectedVariantCode: string;
  expectedArtworkKey?: string | null;
  supportedVariantCodes: string[];
  activeVariants: Array<{ id: string; variant_code: string }>;
  currentIdentifiers: Array<{
    source_id: string;
    source_entity_type: string;
    language_code: string | null;
    external_id: string;
  }>;
}) {
  if (input.provider !== 'tcgdex') return false;
  if (!input.supportedVariantCodes.includes(input.expectedVariantCode)) return false;
  if (input.supportedVariantCodes.includes(input.staleVariantCode)) return false;
  if (!input.staleArtworkKey || input.staleArtworkKey !== input.expectedArtworkKey) return false;

  const stale = input.activeVariants.filter((variant) => variant.id === input.staleVariantId);
  if (stale.length !== 1 || stale[0].variant_code !== input.staleVariantCode) return false;
  const activeCodes = input.activeVariants.map((variant) => variant.variant_code);
  if (new Set(activeCodes).size !== activeCodes.length) return false;
  const siblingVariants = input.activeVariants.filter((variant) => variant.id !== input.staleVariantId);
  if (siblingVariants.length < 1) return false;
  if (siblingVariants.some((variant) => variant.variant_code === input.expectedVariantCode)) return false;
  if (siblingVariants.some((variant) => !input.supportedVariantCodes.includes(variant.variant_code))) return false;

  const allowedExternalIds = new Set([
    input.providerRecordId,
    `${input.providerRecordId}:${input.staleVariantCode}`,
  ]);
  if (!input.currentIdentifiers.some((identifier) => identifier.external_id === input.providerRecordId)) return false;
  return input.currentIdentifiers.length >= 1
    && input.currentIdentifiers.length <= allowedExternalIds.size
    && input.currentIdentifiers.every((identifier) => (
      identifier.source_id === input.sourceId
      && identifier.source_entity_type === 'card'
      && identifier.language_code === input.languageCode
      && allowedExternalIds.has(identifier.external_id)
    ));
}

async function tryRepairProviderVariantIdentity(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    normalised: NormalisedRecord;
    externalVariantId: string;
    identityVariantId: string;
  },
) {
  if (input.normalised.provider !== 'tcgdex' || input.normalised.recordType !== 'card') return false;
  const ingest = db.schema('ingest');
  if (!ingest.rpc) return false;
  const supportedVariantCodes = declaredVariantCodes(input.normalised.raw);
  const expectedVariantCode = input.normalised.variantCode ?? 'normal';
  if (!supportedVariantCodes.includes(expectedVariantCode)) return false;

  const { data, error } = await ingest.rpc('repair_provider_variant_identity', {
    p_source_id: input.sourceId,
    p_language_code: input.normalised.languageCode,
    p_external_id: input.normalised.providerRecordId,
    p_expected_variant_id: input.identityVariantId,
    p_stale_variant_id: input.externalVariantId,
    p_supported_variant_codes: supportedVariantCodes,
    p_reason: 'tcgdex_pinned_snapshot_finish_correction',
  });
  if (error) {
    if (isVariantRepairNotApplicable(error)) return false;
    throw error;
  }
  return data?.status === 'repaired';
}

async function releaseSupportedPrimaryVariantAlias(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    normalised: NormalisedRecord;
    externalVariantId: string;
    identityVariantId?: string;
  },
) {
  if (input.normalised.provider !== 'tcgdex' || input.normalised.recordType !== 'card') return false;
  if (input.normalised.providerRecordId.includes(':')) return false;
  const expectedVariantCode = input.normalised.variantCode ?? 'normal';
  const supportedVariantCodes = declaredVariantCodes(input.normalised.raw);
  if (!supportedVariantCodes.includes(expectedVariantCode)) return false;

  const { data: currentVariant, error: variantError } = await table(db, 'catalog', 'card_variants')
    .select('id, printing_id, variant_code, canonical_key, artwork_key')
    .eq('id', input.externalVariantId)
    .is('deprecated_at', null)
    .maybeSingle();
  if (variantError) throw variantError;
  if (!currentVariant?.id || currentVariant.variant_code === expectedVariantCode) return false;
  if (!supportedVariantCodes.includes(currentVariant.variant_code)) return false;

  if (input.identityVariantId) {
    const { data: identityVariant, error: identityVariantError } = await table(db, 'catalog', 'card_variants')
      .select('id, printing_id, variant_code, artwork_key')
      .eq('id', input.identityVariantId)
      .is('deprecated_at', null)
      .maybeSingle();
    if (identityVariantError) throw identityVariantError;
    if (!isSafeSupportedPrimaryAliasTarget({
      currentPrintingId: currentVariant.printing_id,
      currentArtworkKey: currentVariant.artwork_key,
      identityVariant: identityVariant ? {
        id: identityVariant.id,
        printingId: identityVariant.printing_id,
        variantCode: identityVariant.variant_code,
        artworkKey: identityVariant.artwork_key,
      } : null,
      expectedVariantCode,
    })) return false;
  }

  const printingVariants = await table(db, 'catalog', 'card_variants')
    .select('id')
    .eq('printing_id', currentVariant.printing_id)
    .is('deprecated_at', null)
    .limit(2);
  if (printingVariants.error) throw printingVariants.error;
  if ((printingVariants.data ?? []).length < 2) return false;

  const retainedAlias = await table(db, 'ingest', 'external_identifiers')
    .select('id')
    .eq('source_id', input.sourceId)
    .eq('source_entity_type', 'card')
    .eq('external_id', `${input.normalised.providerRecordId}:${currentVariant.variant_code}`)
    .eq('language_code', input.normalised.languageCode)
    .eq('variant_id', input.externalVariantId)
    .eq('is_current', true)
    .is('deprecated_at', null)
    .limit(1)
    .maybeSingle();
  if (retainedAlias.error) throw retainedAlias.error;
  if (!retainedAlias.data?.id) return false;

  const { data: releasedAliases, error: releaseError } = await table(db, 'ingest', 'external_identifiers')
    .update({
      is_current: false,
      deprecated_at: nowIso(),
      deprecated_reason: 'provider_primary_variant_changed',
    })
    .eq('source_id', input.sourceId)
    .eq('source_entity_type', 'card')
    .eq('external_id', input.normalised.providerRecordId)
    .eq('language_code', input.normalised.languageCode)
    .eq('variant_id', input.externalVariantId)
    .eq('is_current', true)
    .is('deprecated_at', null)
    .select('id');
  if (releaseError) throw releaseError;
  return releasedExactlyOnePrimaryAlias(releasedAliases);
}

function importErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unserializable non-Error import failure.';
    }
  }
  return String(error);
}

function sourceToRow(source: SourceIdentity) {
  return {
    code: source.code,
    display_name: source.displayName,
    source_type: source.sourceType,
    base_url: source.baseUrl ?? null,
    terms_url: source.termsUrl ?? null,
    licence_status: source.licenceStatus,
    attribution_required: source.attributionRequired,
    robots_policy: source.robotsPolicy ?? null,
    rate_limit_config: source.rateLimitConfig ?? {},
    active: true,
    internal_notes: source.automatedRefreshAllowed
      ? null
      : 'Automated refresh disabled until provider terms review explicitly allows it.',
  };
}

function validationStatus(validation: ValidationResult) {
  if (validation.issues.some((issue) => issue.severity === 'error')) return 'invalid';
  return validation.ok ? 'valid' : 'pending';
}

function issuePayload(issues: ValidationIssue[]) {
  return issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    path: issue.path ?? null,
  }));
}

function canonicalRunKey(adapter: SourceAdapter, options: ImportOptions) {
  const source = adapter.identifySource();
  return [
    source.code,
    options.command ?? 'run_source',
    options.language ?? 'all',
    options.setId ?? 'all',
    options.providerRecordId ?? 'all',
    options.setsOnly ? 'sets-only' : options.assetsOnly ? 'assets-only' : options.allowImageAssets ? 'with-assets' : 'metadata',
    options.runKey ?? new Date().toISOString().slice(0, 10),
  ].join(':').toLowerCase();
}

function recordKindsForCommand(adapter: SourceAdapter, options: ImportOptions) {
  if (options.setsOnly) return [adapter.fetchSets(options)];
  if (options.assetsOnly) {
    return options.allowImageAssets ? [adapter.fetchAssets(options)] : [];
  }
  const command = options.command ?? 'run_source';
  const sourceCapabilities = adapter.identifySource().capabilities;
  const includeSetMetadata = command === 'run_source'
    || command === 'run_language'
    || (
      command === 'run_set'
      && sourceCapabilities.includes('sets')
    );
  const batches = includeSetMetadata
    ? [adapter.fetchSets(options), adapter.fetchCards(options), adapter.fetchVariants(options)]
    : [adapter.fetchCards(options), adapter.fetchVariants(options)];
  return options.allowImageAssets ? [...batches, adapter.fetchAssets(options)] : batches;
}

function validateImportOptions(options: ImportOptions): ImportOptions {
  const writeConcurrency = options.writeConcurrency ?? 1;
  if (!Number.isInteger(writeConcurrency) || writeConcurrency < 1 || writeConcurrency > 16) {
    throw new Error('Catalogue write concurrency must be an integer from 1 to 16.');
  }
  return {
    ...options,
    language: options.language == null ? undefined : normaliseLanguageCode(options.language),
    writeConcurrency,
  };
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
) {
  let nextIndex = 0;
  let firstError: unknown;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length && firstError === undefined) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          await worker(values[index]);
        } catch (error) {
          firstError ??= error;
        }
      }
    },
  );
  await Promise.all(workers);
  if (firstError !== undefined) throw firstError;
}

export async function runWithConcurrencyByKey<T>(
  values: T[],
  concurrency: number,
  keyFor: (value: T, index: number) => string,
  worker: (value: T) => Promise<void>,
) {
  const groups = new Map<string, T[]>();
  values.forEach((value, index) => {
    const key = keyFor(value, index);
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
  });
  await runWithConcurrency([...groups.values()], concurrency, async (group) => {
    for (const value of group) await worker(value);
  });
}

function reconciliationConcurrencyKey(
  prepared: { record: ProviderRecord; normalised?: NormalisedRecord },
  index: number,
) {
  const normalised = prepared.normalised;
  if (
    normalised
    && ['card', 'printing', 'variant', 'asset'].includes(prepared.record.recordType)
  ) {
    const providerCardId = cleanText(normalised.raw.cardID);
    if (prepared.record.recordType === 'asset' && providerCardId) {
      return `${normalised.provider}:${normalised.languageCode}:card:${providerCardId}`;
    }
    if (!normalised.collectorNumber) {
      return `${prepared.record.recordType}:${prepared.record.providerRecordId}:${index}`;
    }
    return [
      normalised.gameCode,
      normalised.languageCode,
      normalised.providerSetId ?? normalised.setCode ?? 'unknown-set',
      normalised.collectorNumber,
    ].join(':');
  }
  return `${prepared.record.recordType}:${prepared.record.providerRecordId}:${index}`;
}

export function reconciliationPhase(
  record: Pick<ProviderRecord, 'provider' | 'recordType'>,
  validation: Pick<ValidationResult, 'ok'>,
) {
  if (!validation.ok) return 0;
  if (record.recordType === 'set') return 1;
  if (record.provider === 'tcgdex' && record.recordType === 'variant') return 2;
  if (record.provider === 'tcgdex' && (record.recordType === 'card' || record.recordType === 'printing')) return 3;
  if (record.recordType === 'card' || record.recordType === 'printing') return 2;
  if (record.recordType === 'variant') return 3;
  if (record.recordType === 'asset') return 4;
  return 5;
}

function providerRecordLanguage(record: ProviderRecord, options: ImportOptions) {
  const payload = record.payload ?? {};
  return normaliseLanguageCode(
    record.languageCode
      ?? payload.languageCode
      ?? payload.language_code
      ?? payload.language
      ?? options.language,
  );
}

function dedupeProviderRecords(records: ProviderRecord[], options: ImportOptions) {
  const uniqueRecords = new Map<string, ProviderRecord>();
  for (const record of records) {
    const languageCode = providerRecordLanguage(record, options);
    uniqueRecords.set(`${record.recordType}:${languageCode}:${record.providerRecordId}`, {
      ...record,
      languageCode,
    });
  }
  return uniqueRecords;
}

function assertNormalisedLanguage(record: ProviderRecord, normalised: NormalisedRecord) {
  const recordLanguage = normaliseLanguageCode(record.languageCode);
  const normalisedLanguage = normaliseLanguageCode(normalised.languageCode);
  if (recordLanguage !== normalisedLanguage) {
    throw new Error(
      `Provider record ${record.providerRecordId} normalised from ${recordLanguage} to ${normalisedLanguage}; language changes are not allowed during import.`,
    );
  }
  return {
    ...normalised,
    languageCode: normalisedLanguage,
  };
}

function hasCompleteCardImageIdentity(normalised: NormalisedRecord) {
  return Boolean(
    cleanText(normalised.languageCode)
    && cleanText(normalised.setCode ?? normalised.providerSetId)
    && cleanText(normalised.collectorNumber)
    && cleanText(normalised.variantCode)
    && cleanText(normalised.finishCode),
  );
}

function isSetScopedAsset(normalised: NormalisedRecord) {
  return normalised.assetType === 'set_logo'
    || normalised.assetType === 'set_symbol'
    || normalised.assetType === 'sealed_product_image';
}

function hasCompleteSetScopedAssetIdentity(normalised: NormalisedRecord) {
  return Boolean(
    cleanText(normalised.languageCode)
    && cleanText(normalised.setCode ?? normalised.providerSetId)
    && cleanText(normalised.imageUrl)
    && isSetScopedAsset(normalised),
  );
}

function catalogVariantCanonicalKey(input: {
  gameCode: string;
  languageCode: string;
  setId: string;
  collectorNumber: string;
  variantCode: string;
}) {
  return [
    input.gameCode,
    normaliseLanguageCode(input.languageCode),
    input.setId,
    input.collectorNumber,
    input.variantCode,
  ].map((part) => {
    const cleaned = cleanText(part);
    if (!cleaned) {
      throw new Error('Catalogue variant identity requires game, language, set_id, collector_number, and variant.');
    }
    return cleaned;
  }).join(':').toLowerCase();
}

export async function ensureSource(db: SupabaseClientLike, identity: SourceIdentity): Promise<SourceRow> {
  const { data: existing, error: lookupError } = await table(db, 'ingest', 'sources')
    .select('id, code')
    .eq('code', identity.code)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await table(db, 'ingest', 'sources')
      .update(sourceToRow(identity))
      .eq('id', existing.id);
    if (error) throw error;
    return existing;
  }

  const { data, error } = await table(db, 'ingest', 'sources')
    .insert(sourceToRow(identity))
    .select('id, code')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recordHealth(db: SupabaseClientLike, sourceId: string, health: SourceHealth) {
  const { error } = await table(db, 'ingest', 'source_health_reports').insert({
    source_id: sourceId,
    status: health.status,
    response_status: health.responseStatus ?? null,
    response_time_ms: health.responseTimeMs ?? null,
    next_retry_at: health.nextRetryAt ?? null,
    message: health.message ?? null,
    http_metadata: health.httpMetadata ?? {},
    capabilities: health.capabilities ?? {},
  });
  if (error) throw error;
}

async function startImportRun(
  db: SupabaseClientLike,
  sourceId: string,
  adapter: SourceAdapter,
  options: ImportOptions,
): Promise<RunRow> {
  const runKey = canonicalRunKey(adapter, options);
  const base = {
    source_id: sourceId,
    run_key: runKey,
    import_type: options.importType ?? 'manual',
    status: 'running',
    request_id: options.requestId ?? randomUUID(),
    metadata: {
      command: options.command ?? 'run_source',
      language: options.language ?? null,
      setId: options.setId ?? null,
      providerRecordId: options.providerRecordId ?? null,
      dryRun: Boolean(options.dryRun),
      allowImageAssets: Boolean(options.allowImageAssets),
      setsOnly: Boolean(options.setsOnly),
      assetsOnly: Boolean(options.assetsOnly),
      approvedOnlyAssets: Boolean(options.approvedOnlyAssets),
      workstream: options.runMetadata ?? {},
    },
  };

  const { data: existing, error: lookupError } = await table(db, 'ingest', 'import_runs')
    .select('id')
    .eq('source_id', sourceId)
    .eq('run_key', runKey)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await table(db, 'ingest', 'import_runs')
      .update({
        ...base,
        started_at: nowIso(),
        finished_at: null,
        records_requested: 0,
        records_retrieved: 0,
        records_inserted: 0,
        records_updated: 0,
        records_skipped: 0,
        records_conflicted: 0,
        error_message: null,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return existing;
  }

  const { data, error } = await table(db, 'ingest', 'import_runs')
    .insert(base)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function finishImportRun(
  db: SupabaseClientLike,
  runId: string,
  status: 'completed' | 'failed',
  stats: ImportStats,
  errorMessage?: string,
) {
  const { error } = await table(db, 'ingest', 'import_runs')
    .update({
      status,
      finished_at: nowIso(),
      records_requested: stats.recordsRequested,
      records_retrieved: stats.recordsRetrieved,
      records_inserted: stats.recordsInserted,
      records_updated: stats.recordsUpdated,
      records_skipped: stats.recordsSkipped,
      records_conflicted: stats.recordsConflicted,
      error_message: errorMessage ?? null,
    })
    .eq('id', runId);
  if (error) throw error;
}

async function retainRawRecord(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  record: ProviderRecord,
  validation: ValidationResult,
) {
  const payloadHash = payloadChecksum(record.payload);
  const languageCode = record.languageCode ?? null;
  const ingest = db.schema('ingest');
  if (!ingest.rpc) throw new Error('retain_raw_source_record_rpc_unavailable');
  const { data, error } = await ingest.rpc('retain_raw_source_record', {
    p_source_id: sourceId,
    p_import_run_id: importRunId,
    p_record_type: record.recordType,
    p_external_id: record.providerRecordId,
    p_provider_record_id: record.providerRecordId,
    p_language_code: languageCode,
    p_source_url: record.sourceUrl ?? null,
    p_source_endpoint: record.sourceEndpoint ?? record.sourceUrl ?? null,
    p_retrieved_at: nowIso(),
    p_source_updated_at: record.providerUpdatedAt ?? null,
    p_licence_status: record.licenceStatus,
    p_attribution_text: record.attributionText ?? null,
    p_payload_hash: payloadHash,
    p_raw_payload: record.payload,
    p_http_metadata: record.httpMetadata ?? {},
    p_validation_status: validationStatus(validation),
    p_validation_errors: issuePayload(validation.issues),
  });
  if (error) throw error;
  return parseRetainedRawRecord(data);
}

async function auditDecision(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    importRunId: string;
    rawRecordId: string;
    requestId?: string;
    decisionType: string;
    entitySchema?: string | null;
    entityTable?: string | null;
    entityId?: string | null;
    canonicalKey?: string | null;
    confidence?: number;
    reason: string;
    proposed?: Record<string, unknown>;
    existing?: Record<string, unknown>;
  },
) {
  let existingDecision = table(db, 'audit', 'ingest_merge_decisions')
    .select('id')
    .eq('source_id', input.sourceId)
    .eq('import_run_id', input.importRunId)
    .eq('raw_record_id', input.rawRecordId)
    .eq('decision_type', input.decisionType)
    .eq('reason', input.reason);
  existingDecision = input.entitySchema
    ? existingDecision.eq('entity_schema', input.entitySchema)
    : existingDecision.is('entity_schema', null);
  existingDecision = input.entityTable
    ? existingDecision.eq('entity_table', input.entityTable)
    : existingDecision.is('entity_table', null);
  existingDecision = input.entityId
    ? existingDecision.eq('entity_id', input.entityId)
    : existingDecision.is('entity_id', null);
  existingDecision = input.canonicalKey
    ? existingDecision.eq('canonical_key', input.canonicalKey)
    : existingDecision.is('canonical_key', null);
  const { data: priorDecision, error: lookupError } = await existingDecision.limit(1);
  if (lookupError) throw lookupError;
  if ((priorDecision ?? []).length > 0) return;

  const { error } = await table(db, 'audit', 'ingest_merge_decisions').insert({
    source_id: input.sourceId,
    import_run_id: input.importRunId,
    raw_record_id: input.rawRecordId,
    request_id: input.requestId ?? null,
    decision_type: input.decisionType,
    entity_schema: input.entitySchema ?? null,
    entity_table: input.entityTable ?? null,
    entity_id: input.entityId ?? null,
    canonical_key: input.canonicalKey ?? null,
    confidence: input.confidence ?? 0,
    reason: input.reason,
    proposed_payload: input.proposed ?? {},
    existing_payload: input.existing ?? {},
  });
  if (error) throw error;
}

async function quarantine(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    importRunId: string;
    rawRecordId: string;
    conflictType: 'duplicate_external_id' | 'identity_collision' | 'name_conflict' | 'variant_conflict' | 'set_code_conflict' | 'licence_conflict' | 'schema_conflict' | 'other';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    canonicalKey?: string | null;
    proposed: Record<string, unknown>;
    existing?: Record<string, unknown>;
    notes?: string | null;
  },
) {
  let existingConflict = table(db, 'ingest', 'data_conflicts')
    .select('id')
    .eq('source_id', input.sourceId)
    .eq('import_run_id', input.importRunId)
    .eq('raw_record_id', input.rawRecordId)
    .eq('conflict_type', input.conflictType);
  existingConflict = input.canonicalKey
    ? existingConflict.eq('canonical_key', input.canonicalKey)
    : existingConflict.is('canonical_key', null);
  const { data: priorConflict, error: lookupError } = await existingConflict.limit(1);
  if (lookupError) throw lookupError;
  if ((priorConflict ?? []).length > 0) return;

  const { error } = await table(db, 'ingest', 'data_conflicts').insert({
    source_id: input.sourceId,
    import_run_id: input.importRunId,
    raw_record_id: input.rawRecordId,
    conflict_type: input.conflictType,
    severity: input.severity ?? 'medium',
    canonical_key: input.canonicalKey ?? null,
    proposed_payload: input.proposed,
    existing_payload: input.existing ?? {},
    internal_notes: input.notes ?? null,
  });
  if (error) throw error;
}

type ExternalIdentifierAssetState = {
  id?: string | null;
  publicly_servable?: boolean | null;
  rights_status?: string | null;
  permission_status?: string | null;
  storage_provider?: string | null;
  retention_status?: string | null;
  deprecated_at?: string | null;
  deleted_at?: string | null;
};

function isHealthyExternalIdentifierAsset(asset: ExternalIdentifierAssetState | null | undefined) {
  return Boolean(
    asset?.id
    && asset.publicly_servable === true
    && asset.rights_status === 'approved'
    && asset.permission_status === 'approved'
    && asset.storage_provider
    && asset.storage_provider !== 'unavailable'
    && asset.retention_status === 'active'
    && asset.deprecated_at == null
    && asset.deleted_at == null,
  );
}

export function canRelinkExternalIdentifierAsset(
  existingAsset: ExternalIdentifierAssetState | null | undefined,
  candidateAsset: ExternalIdentifierAssetState | null | undefined,
) {
  return Boolean(
    existingAsset?.id
    && candidateAsset?.id
    && existingAsset.id !== candidateAsset.id
    && !isHealthyExternalIdentifierAsset(existingAsset)
    && isHealthyExternalIdentifierAsset(candidateAsset),
  );
}

async function linkExternalId(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    rawRecordId: string;
    sourceEntityType: string;
    externalId: string;
    languageCode?: string | null;
    setId?: string | null;
    variantId?: string | null;
    assetId?: string | null;
    confidence: number;
    sourceUpdatedAt?: string | null;
  },
) {
  const lookup = table(db, 'ingest', 'external_identifiers')
    .select('id, set_id, variant_id, asset_id')
    .eq('source_id', input.sourceId)
    .eq('source_entity_type', input.sourceEntityType)
    .eq('external_id', input.externalId)
    .eq('is_current', true)
    .is('deprecated_at', null);
  const { data: existingRows, error: lookupError } = input.languageCode
    ? await lookup.eq('language_code', input.languageCode)
    : await lookup.is('language_code', null);
  if (lookupError) throw lookupError;

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing?.id) {
    const canonicalTargetMatches =
      (!input.setId || existing.set_id === input.setId) &&
      (!input.variantId || existing.variant_id === input.variantId);
    if (!canonicalTargetMatches) return { status: 'conflict' as const, existing };

    let relinkAsset = false;
    if (input.assetId && existing.asset_id !== input.assetId) {
      if (!existing.asset_id) return { status: 'conflict' as const, existing };
      const { data: assetRows, error: assetLookupError } = await table(db, 'catalog', 'assets')
        .select('id, publicly_servable, rights_status, permission_status, storage_provider, retention_status, deprecated_at, deleted_at')
        .in('id', [existing.asset_id, input.assetId]);
      if (assetLookupError) throw assetLookupError;
      const existingAsset = (assetRows ?? []).find((asset: ExternalIdentifierAssetState) => asset.id === existing.asset_id);
      const candidateAsset = (assetRows ?? []).find((asset: ExternalIdentifierAssetState) => asset.id === input.assetId);
      relinkAsset = canRelinkExternalIdentifierAsset(existingAsset, candidateAsset);
      if (!relinkAsset) return { status: 'conflict' as const, existing };
    }

    const identifierPatch: Record<string, unknown> = {
      raw_record_id: input.rawRecordId,
      confidence: input.confidence,
      source_updated_at: input.sourceUpdatedAt ?? null,
    };
    if (relinkAsset) identifierPatch.asset_id = input.assetId;

    let update = table(db, 'ingest', 'external_identifiers')
      .update({
        ...identifierPatch,
      })
      .eq('id', existing.id);
    if (relinkAsset) {
      update = update
        .eq('asset_id', existing.asset_id)
        .eq('is_current', true)
        .is('deprecated_at', null);
    }
    const { error } = await update;
    if (error) throw error;
    return { status: 'updated' as const, existing };
  }

  const { data, error } = await table(db, 'ingest', 'external_identifiers')
    .insert({
      source_id: input.sourceId,
      raw_record_id: input.rawRecordId,
      source_entity_type: input.sourceEntityType,
      external_id: input.externalId,
      language_code: input.languageCode ?? null,
      set_id: input.setId ?? null,
      variant_id: input.variantId ?? null,
      asset_id: input.assetId ?? null,
      confidence: input.confidence,
      source_updated_at: input.sourceUpdatedAt ?? null,
    })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { status: 'inserted' as const, existing: data };
}

async function findSetId(db: SupabaseClientLike, sourceId: string, normalised: NormalisedRecord) {
  if (normalised.providerSetId) {
    const { data, error } = await table(db, 'ingest', 'external_identifiers')
      .select('set_id')
      .eq('source_id', sourceId)
      .eq('source_entity_type', 'set')
      .eq('external_id', normalised.providerSetId)
      .eq('language_code', normalised.languageCode)
      .eq('is_current', true)
      .is('deprecated_at', null)
      .limit(2);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 1 && rows[0].set_id) return { status: 'matched' as const, setId: rows[0].set_id as string };
    if (rows.length > 1) return { status: 'conflict' as const, reason: 'multiple_external_set_matches' };
  }

  if (!normalised.setCode && !normalised.providerSetId) {
    return { status: 'missing' as const, reason: 'set_identifier_missing' };
  }

  const { data, error } = await table(db, 'catalog', 'sets')
    .select('id')
    .eq('game_code', normalised.gameCode)
    .eq('language_code', normalised.languageCode)
    .or(`set_code.eq.${normalised.setCode ?? ''},provider_set_code.eq.${normalised.providerSetId ?? ''}`)
    .is('deprecated_at', null)
    .limit(2);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 1) return { status: 'matched' as const, setId: rows[0].id as string };
  if (rows.length > 1) return { status: 'conflict' as const, reason: 'multiple_set_code_matches' };
  return { status: 'missing' as const, reason: 'set_not_found' };
}

// Supabase leaves omitted UPDATE columns unchanged. Keep partial provider fields
// out of the patch instead of translating their absence into destructive NULLs.
export function sparseSetMetadataPatch(
  normalised: Pick<
    NormalisedRecord,
    'englishDisplayName' | 'releaseDate' | 'printedTotal' | 'total' | 'sourceUpdatedAt'
  >,
) {
  const patch: Record<string, string | number> = {};
  const englishDisplayName = cleanText(normalised.englishDisplayName);
  const releaseDate = cleanText(normalised.releaseDate);
  const sourceUpdatedAt = cleanText(normalised.sourceUpdatedAt);
  if (englishDisplayName) patch.english_display_name = englishDisplayName;
  if (releaseDate) patch.release_date = releaseDate;
  if (normalised.printedTotal != null) patch.printed_total = normalised.printedTotal;
  if (normalised.total != null) patch.total = normalised.total;
  if (sourceUpdatedAt) patch.source_updated_at = sourceUpdatedAt;
  return patch;
}

export function sparsePrintingMetadataPatch(
  normalised: Pick<NormalisedRecord, 'nativeName' | 'englishDisplayName' | 'sourceUpdatedAt'>,
  rarityId: string | null,
) {
  const patch: Record<string, string> = {};
  const nativeName = cleanText(normalised.nativeName);
  const englishDisplayName = cleanText(normalised.englishDisplayName);
  const sourceUpdatedAt = cleanText(normalised.sourceUpdatedAt);
  if (nativeName) patch.native_name = nativeName;
  if (englishDisplayName) patch.english_display_name = englishDisplayName;
  if (rarityId) patch.rarity_id = rarityId;
  if (sourceUpdatedAt) patch.source_updated_at = sourceUpdatedAt;
  return patch;
}

export function sparseVariantMetadataPatch(
  normalised: Pick<
    NormalisedRecord,
    'finishCode' | 'artworkKey' | 'sourceConfidence' | 'sourceUpdatedAt'
  >,
) {
  const patch: Record<string, string | number> = {
    source_confidence: normalised.sourceConfidence,
  };
  const finishCode = cleanText(normalised.finishCode);
  const artworkKey = cleanText(normalised.artworkKey);
  const sourceUpdatedAt = cleanText(normalised.sourceUpdatedAt);
  if (finishCode) patch.finish_code = finishCode;
  if (artworkKey) patch.artwork_key = artworkKey;
  if (sourceUpdatedAt) patch.source_updated_at = sourceUpdatedAt;
  return patch;
}

async function upsertSet(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  requestId?: string,
) {
  const nativeName = cleanText(normalised.nativeName) ?? cleanText(normalised.englishDisplayName);
  if (!nativeName) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'schema_conflict',
      proposed: normalised.raw,
      notes: 'Set record missing native/display name.',
    });
    return { status: 'conflicted' as const };
  }

  const match = await findSetId(db, sourceId, normalised);
  if (match.status === 'conflict') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'set_code_conflict',
      proposed: normalised.raw,
      existing: { reason: match.reason },
      notes: 'Ambiguous set match; not guessing canonical set.',
    });
    return { status: 'conflicted' as const };
  }

  const requiredRow = {
    game_code: normalised.gameCode,
    language_code: normalised.languageCode,
    set_code: normalised.setCode ?? normalised.providerSetId ?? null,
    provider_set_code: normalised.providerSetId ?? normalised.setCode ?? null,
    native_name: nativeName,
  };
  const optionalRow = sparseSetMetadataPatch(normalised);
  const updateRow = { ...requiredRow, ...optionalRow };
  const insertRow = {
    ...requiredRow,
    english_display_name: cleanText(normalised.englishDisplayName),
    release_date: cleanText(normalised.releaseDate),
    printed_total: normalised.printedTotal ?? null,
    total: normalised.total ?? normalised.printedTotal ?? null,
    source_updated_at: cleanText(normalised.sourceUpdatedAt),
  };

  if (match.status === 'matched') {
    const link = await linkExternalId(db, {
      sourceId,
      rawRecordId,
      sourceEntityType: 'set',
      externalId: normalised.providerSetId ?? normalised.setCode ?? normalised.providerRecordId,
      languageCode: normalised.languageCode,
      setId: match.setId,
      confidence: normalised.sourceConfidence,
      sourceUpdatedAt: normalised.sourceUpdatedAt,
    });
    if (link.status === 'conflict') {
      await quarantine(db, {
        sourceId,
        importRunId,
        rawRecordId,
        conflictType: 'identity_collision',
        proposed: insertRow,
        existing: link.existing,
        notes: 'Provider set identifier already points to another canonical set.',
      });
      return { status: 'conflicted' as const };
    }
    const { error } = await table(db, 'catalog', 'sets').update(updateRow).eq('id', match.setId);
    if (error) throw error;
    await auditDecision(db, {
      sourceId,
      importRunId,
      rawRecordId,
      requestId,
      decisionType: 'updated',
      entitySchema: 'catalog',
      entityTable: 'sets',
      entityId: match.setId,
      confidence: normalised.sourceConfidence,
      reason: 'set_external_or_exact_code_match',
      proposed: updateRow,
    });
    return { status: 'updated' as const, setId: match.setId };
  }

  const { data, error } = await table(db, 'catalog', 'sets').insert(insertRow).select('id').maybeSingle();
  if (error) throw error;
  await linkExternalId(db, {
    sourceId,
    rawRecordId,
    sourceEntityType: 'set',
    externalId: normalised.providerSetId ?? normalised.setCode ?? normalised.providerRecordId,
    languageCode: normalised.languageCode,
    setId: data.id,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  await auditDecision(db, {
    sourceId,
    importRunId,
    rawRecordId,
    requestId,
    decisionType: 'created',
    entitySchema: 'catalog',
    entityTable: 'sets',
    entityId: data.id,
    confidence: normalised.sourceConfidence,
    reason: 'new_set_from_provider_record',
    proposed: insertRow,
  });
  return { status: 'inserted' as const, setId: data.id as string };
}

async function getRarityId(db: SupabaseClientLike, gameCode: string, rarityCode?: string | null) {
  if (!rarityCode) return null;
  const { data, error } = await table(db, 'catalog', 'rarities')
    .select('id')
    .eq('game_code', gameCode)
    .eq('code', rarityCode)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function ensureConcept(db: SupabaseClientLike, normalised: NormalisedRecord) {
  const name = normalised.englishDisplayName ?? normalised.nativeName ?? normalised.providerRecordId;
  const conceptKey = `${normalised.gameCode}:${normaliseName(name)}`;
  const { data, error } = await table(db, 'catalog', 'card_concepts')
    .upsert(
      { game_code: normalised.gameCode, concept_key: conceptKey },
      { onConflict: 'game_code,concept_key' },
    )
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data.id as string;
}

async function insertNameIfMissing(
  db: SupabaseClientLike,
  input: {
    printingId: string;
    variantId: string;
    languageCode: string;
    nameType: 'native' | 'english_display';
    name: string | null | undefined;
    confidence: number;
    sourceUpdatedAt?: string | null;
  },
) {
  if (!cleanText(input.name)) return;
  const normalized = normaliseName(input.name);
  const { data, error: lookupError } = await table(db, 'catalog', 'card_names')
    .select('id')
    .eq('variant_id', input.variantId)
    .eq('language_code', input.languageCode)
    .eq('name_type', input.nameType)
    .eq('normalized_name', normalized)
    .limit(1);
  if (lookupError) throw lookupError;
  if ((data ?? []).length > 0) return;

  const { error } = await table(db, 'catalog', 'card_names').insert({
    printing_id: input.printingId,
    variant_id: input.variantId,
    language_code: input.languageCode,
    name_type: input.nameType,
    name: input.name,
    normalized_name: normalized,
    source_confidence: input.confidence,
    source_updated_at: input.sourceUpdatedAt ?? null,
  });
  if (error) throw error;
}

async function upsertAssetForVariant(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  variantId: string,
) {
  if (!normalised.imageUrl) return null;
  const imageLanguage = normaliseLanguageCode(normalised.imageLanguageCode ?? normalised.languageCode);
  const variantLanguage = normaliseLanguageCode(normalised.languageCode);
  if (imageLanguage !== variantLanguage) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'schema_conflict',
      severity: 'critical',
      proposed: normalised.raw,
      existing: { imageLanguage, variantLanguage, imageUrl: normalised.imageUrl },
      notes: 'asset_language_mismatch: refusing to attach a card image whose language differs from the target printing language.',
    });
    return null;
  }

  const linkVariantAssetExternalId = async (assetId: string) => {
    const link = await linkExternalId(db, {
      sourceId,
      rawRecordId,
      sourceEntityType: 'asset',
      externalId: `${normalised.providerRecordId}:asset`,
      languageCode: normalised.languageCode,
      assetId,
      confidence: normalised.sourceConfidence,
      sourceUpdatedAt: normalised.sourceUpdatedAt,
    });
    if (link.status === 'conflict') return null;
    if (normalised.licenceStatus === 'approved') {
      const { error } = await table(db, 'catalog', 'card_variants')
        .update({ native_image_status: 'available', same_artwork_as_variant_id: null })
        .eq('id', variantId);
      if (error) throw error;
    }
    return assetId;
  };

  const linkSameArtworkAsset = async (assetId: string, sameArtworkAsVariantId: string) => {
    const link = await linkExternalId(db, {
      sourceId,
      rawRecordId,
      sourceEntityType: 'asset',
      externalId: `${normalised.providerRecordId}:asset`,
      languageCode: normalised.languageCode,
      assetId,
      confidence: normalised.sourceConfidence,
      sourceUpdatedAt: normalised.sourceUpdatedAt,
    });
    if (link.status === 'conflict') return null;
    if (normalised.licenceStatus === 'approved') {
      const { error } = await table(db, 'catalog', 'card_variants')
        .update({
          native_image_status: 'same_artwork_reference',
          same_artwork_as_variant_id: sameArtworkAsVariantId,
        })
        .eq('id', variantId);
      if (error) throw error;
    }
    return assetId;
  };

  const safelyReuseKnownDuplicate = async (duplicate: { id?: string | null; variant_id?: string | null } | null | undefined) => {
    if (!duplicate?.id || !duplicate.variant_id) return null;
    if (duplicate.variant_id === variantId) return linkVariantAssetExternalId(duplicate.id);
    const { data: scopes, error: scopeError } = await table(db, 'catalog', 'card_variants')
      .select('id,printing_id,language_code')
      .in('id', [variantId, duplicate.variant_id]);
    if (scopeError) throw scopeError;
    const target = (scopes ?? []).find((row: { id: string }) => row.id === variantId);
    const existingScope = (scopes ?? []).find((row: { id: string }) => row.id === duplicate.variant_id);
    if (!target?.printing_id
      || target.printing_id !== existingScope?.printing_id
      || target.language_code !== existingScope?.language_code) return null;
    return linkSameArtworkAsset(duplicate.id, duplicate.variant_id);
  };

  const { data: exactLanguageImages, error: healthyLookupError } = await table(db, 'catalog', 'assets')
    .select('id, storage_provider, storage_key, derivative_list')
    .eq('variant_id', variantId)
    .eq('asset_type', normalised.assetType ?? 'card_image')
    .eq('rights_status', 'approved')
    .eq('permission_status', 'approved')
    .eq('publicly_servable', true)
    .is('deprecated_at', null)
    .is('deleted_at', null);
  if (healthyLookupError) throw healthyLookupError;
  const healthyExactLanguageImage = (exactLanguageImages ?? []).find((asset: {
    id: string;
    storage_provider?: string | null;
    storage_key?: string | null;
    derivative_list?: Array<{ role?: string | null }> | null;
  }) => {
    const roles = new Set((asset.derivative_list ?? []).map((item) => item?.role).filter(Boolean));
    return ['supabase_storage', 's3_compatible', 'local_dev'].includes(asset.storage_provider ?? '')
      && Boolean(asset.storage_key)
      && ['card-grid', 'search-result', 'detail-page'].every((role) => roles.has(role));
  });
  if (healthyExactLanguageImage) {
    return linkVariantAssetExternalId(healthyExactLanguageImage.id);
  }

  const imageSha256 = cleanText(normalised.imageSha256)?.toLowerCase();
  if (imageSha256) {
    const { data: duplicateBySha, error: duplicateShaError } = await table(db, 'catalog', 'assets')
      .select('id,variant_id')
      .eq('asset_type', 'card_image')
      .eq('rights_status', 'approved')
      .eq('permission_status', 'approved')
      .eq('publicly_servable', true)
      .eq('content_sha256', imageSha256)
      .is('deprecated_at', null)
      .is('deleted_at', null)
      .limit(1);
    if (duplicateShaError) throw duplicateShaError;
    const duplicate = duplicateBySha?.[0];
    const reused = await safelyReuseKnownDuplicate(duplicate);
    if (reused) return reused;
  }

  const imagePerceptualHash = cleanText(normalised.imagePerceptualHash)?.toLowerCase();
  if (imagePerceptualHash) {
    const { data: duplicateByPhash, error: duplicatePhashError } = await table(db, 'catalog', 'assets')
      .select('id,variant_id')
      .eq('asset_type', 'card_image')
      .eq('rights_status', 'approved')
      .eq('permission_status', 'approved')
      .eq('publicly_servable', true)
      .eq('perceptual_hash', imagePerceptualHash)
      .is('deprecated_at', null)
      .is('deleted_at', null)
      .limit(1);
    if (duplicatePhashError) throw duplicatePhashError;
    const duplicate = duplicateByPhash?.[0];
    const reused = await safelyReuseKnownDuplicate(duplicate);
    if (reused) return reused;
  }

  const { data: existingByUrl, error: lookupError } = await table(db, 'catalog', 'assets')
    .select('id')
    .eq('variant_id', variantId)
    .eq('source_id', sourceId)
    .eq('url', normalised.imageUrl)
    .is('deprecated_at', null)
    .is('deleted_at', null)
    .limit(1);
  if (lookupError) throw lookupError;
  let existing = existingByUrl ?? [];
  if (existing.length === 0) {
    const { data: existingBySourceUrl, error: sourceLookupError } = await table(db, 'catalog', 'assets')
      .select('id')
      .eq('variant_id', variantId)
      .eq('source_id', sourceId)
      .eq('original_source_url', normalised.imageUrl)
      .is('deprecated_at', null)
      .is('deleted_at', null)
      .limit(1);
    if (sourceLookupError) throw sourceLookupError;
    existing = existingBySourceUrl ?? [];
  }
  if ((existing ?? []).length > 0) {
    const existingId = existing[0].id as string;
    const { error: updateError } = await table(db, 'catalog', 'assets')
      .update({
        rights_status: normalised.licenceStatus === 'approved' ? 'approved' : 'under_review',
        permission_status: normalised.licenceStatus === 'approved' ? 'approved' : 'under_review',
        publicly_servable: normalised.licenceStatus === 'approved',
        source_updated_at: normalised.sourceUpdatedAt ?? null,
        last_verified_at: nowIso(),
      })
      .eq('id', existingId);
    if (updateError) throw updateError;
    return linkVariantAssetExternalId(existingId);
  }

  const { data, error } = await table(db, 'catalog', 'assets')
    .insert({
      asset_type: normalised.assetType ?? 'card_image',
      game_code: normalised.gameCode,
      variant_id: variantId,
      source_id: sourceId,
      url: normalised.imageUrl,
      storage_provider: 'external_reference',
      rights_status: normalised.licenceStatus === 'approved' ? 'approved' : 'under_review',
      permission_status: normalised.licenceStatus === 'approved' ? 'approved' : 'under_review',
      publicly_servable: normalised.licenceStatus === 'approved',
      sha256: imageSha256,
      content_sha256: imageSha256,
      perceptual_hash: imagePerceptualHash,
      original_source_url: normalised.imageUrl,
      original_source_identifier: normalised.providerRecordId,
      source_attribution: normalised.provider,
      externally_referenced: true,
      acquisition_source: normalised.provider === 'pikaqian' || normalised.provider === 'tcgdex'
        ? 'provider_url'
        : 'approved_commercial_provider',
      source_updated_at: normalised.sourceUpdatedAt ?? null,
    })
    .select('id')
    .maybeSingle();
  if (error) throw error;

  return linkVariantAssetExternalId(data.id as string);
}

async function ensureNamedStampTaxonomy(db: SupabaseClientLike, normalised: NormalisedRecord) {
  const variantCode = normalised.variantCode ?? 'normal';
  if (!/(^|_)stamp(?:_|$)/.test(variantCode)) return;
  const englishLabel = variantCode
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  const { error } = await table(db, 'catalog', 'variant_taxonomy').upsert({
    code: variantCode,
    english_label: englishLabel,
    variant_group: 'stamp',
    finish_code: 'stamped',
    description: 'Named stamped card variant retained from an approved catalogue provider.',
    sort_order: 75,
    active: true,
    deprecated_at: null,
    deprecated_reason: null,
    updated_at: nowIso(),
  }, { onConflict: 'code' });
  if (error) throw error;
}

async function upsertAssetForSet(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  requestId?: string,
) {
  const setMatch = await findSetId(db, sourceId, normalised);
  if (setMatch.status !== 'matched') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: setMatch.status === 'conflict' ? 'set_code_conflict' : 'schema_conflict',
      severity: 'high',
      proposed: normalised.raw,
      existing: { reason: setMatch.reason },
      notes: 'Set artwork cannot be mapped to exactly one canonical language + provider set identity.',
    });
    return { status: 'conflicted' as const };
  }

  const imageLanguage = normaliseLanguageCode(normalised.imageLanguageCode ?? normalised.languageCode);
  if (imageLanguage !== normalised.languageCode) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'schema_conflict',
      severity: 'critical',
      proposed: normalised.raw,
      existing: { imageLanguage, setLanguage: normalised.languageCode, imageUrl: normalised.imageUrl },
      notes: 'asset_language_mismatch: refusing to attach set artwork from a different language catalogue.',
    });
    return { status: 'conflicted' as const };
  }

  const assetType = normalised.assetType as 'set_logo' | 'set_symbol' | 'sealed_product_image';
  const { data: exactRows, error: exactLookupError } = await table(db, 'catalog', 'assets')
    .select('id')
    .eq('set_id', setMatch.setId)
    .eq('asset_type', assetType)
    .eq('source_id', sourceId)
    .eq('url', normalised.imageUrl)
    .is('deprecated_at', null)
    .limit(2);
  if (exactLookupError) throw exactLookupError;
  if ((exactRows ?? []).length > 1) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'identity_collision',
      severity: 'high',
      proposed: normalised.raw,
      existing: { assetIds: exactRows.map((row: { id: string }) => row.id) },
      notes: 'Multiple active set-scoped assets share the same provider URL; automatic selection was refused.',
    });
    return { status: 'conflicted' as const };
  }

  let assetId = exactRows?.[0]?.id as string | undefined;
  let status: 'inserted' | 'updated' = 'updated';
  const assetPatch = {
    asset_type: assetType,
    game_code: normalised.gameCode,
    set_id: setMatch.setId,
    source_id: sourceId,
    url: normalised.imageUrl,
    storage_provider: 'external_reference',
    rights_status: 'approved',
    permission_status: 'approved',
    publicly_servable: true,
    original_source_url: normalised.imageUrl,
    original_source_identifier: normalised.providerRecordId,
    source_attribution: normalised.provider,
    externally_referenced: true,
    acquisition_source: 'provider_url',
    source_updated_at: normalised.sourceUpdatedAt ?? null,
    last_verified_at: nowIso(),
  };
  if (assetId) {
    const { error } = await table(db, 'catalog', 'assets').update(assetPatch).eq('id', assetId);
    if (error) throw error;
  } else {
    const { data, error } = await table(db, 'catalog', 'assets')
      .insert(assetPatch)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    assetId = data.id as string;
    status = 'inserted';
  }

  const link = await linkExternalId(db, {
    sourceId,
    rawRecordId,
    sourceEntityType: 'asset',
    externalId: normalised.providerRecordId,
    languageCode: normalised.languageCode,
    assetId,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  if (link.status === 'conflict') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'identity_collision',
      severity: 'high',
      proposed: normalised.raw,
      existing: link.existing,
      notes: 'Provider set-scoped asset identifier already points to another canonical asset.',
    });
    return { status: 'conflicted' as const };
  }

  await auditDecision(db, {
    sourceId,
    importRunId,
    rawRecordId,
    requestId,
    decisionType: status === 'inserted' ? 'created' : 'updated',
    entitySchema: 'catalog',
    entityTable: 'assets',
    entityId: assetId,
    confidence: normalised.sourceConfidence,
    reason: status === 'inserted' ? 'new_set_asset_from_exact_provider_identity' : 'set_asset_exact_provider_identity_match',
    proposed: assetPatch,
  });
  return { status, assetId };
}

async function upsertCardVariant(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  options: { requestId?: string; allowImageAssets?: boolean } = {},
) {
  const requestId = options.requestId;
  if (!normalised.collectorNumber || !normalised.nativeName) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'schema_conflict',
      proposed: normalised.raw,
      notes: 'Card record missing collector number or native name.',
    });
    return { status: 'conflicted' as const };
  }

  const setMatch = await findSetId(db, sourceId, normalised);
  if (setMatch.status !== 'matched') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: setMatch.status === 'conflict' ? 'set_code_conflict' : 'schema_conflict',
      proposed: normalised.raw,
      existing: { reason: setMatch.reason },
      notes: 'Card cannot be mapped to exactly one canonical set.',
    });
    return { status: 'conflicted' as const };
  }

  const canonicalKey = catalogVariantCanonicalKey({
    gameCode: normalised.gameCode,
    languageCode: normalised.languageCode,
    setId: setMatch.setId,
    collectorNumber: normalised.collectorNumber,
    variantCode: normalised.variantCode ?? 'normal',
  });

  const externalMatch = await table(db, 'ingest', 'external_identifiers')
    .select('variant_id')
    .eq('source_id', sourceId)
    .eq('source_entity_type', 'card')
    .eq('external_id', normalised.providerRecordId)
    .eq('language_code', normalised.languageCode)
    .eq('is_current', true)
    .is('deprecated_at', null)
    .limit(2);
  if (externalMatch.error) throw externalMatch.error;
  const externalRows = externalMatch.data ?? [];
  if (externalRows.length > 1) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'duplicate_external_id',
      canonicalKey,
      proposed: normalised.raw,
      existing: { rows: externalRows },
    });
    return { status: 'conflicted' as const };
  }

  const identityMatch = await table(db, 'catalog', 'card_variants')
    .select('id, printing_id, canonical_key, deprecated_at, corrected_by_variant_id')
    .eq('canonical_key', canonicalKey)
    .limit(2);
  if (identityMatch.error) throw identityMatch.error;
  const identityRows = identityMatch.data ?? [];
  if (identityRows.length > 1) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'identity_collision',
      canonicalKey,
      proposed: normalised.raw,
      existing: { rows: identityRows },
    });
    return { status: 'conflicted' as const };
  }

  let externalVariantId = externalRows[0]?.variant_id;
  if (externalVariantId) {
    const { data: externalVariant, error: externalVariantError } = await table(db, 'catalog', 'card_variants')
      .select('id, deprecated_at, corrected_by_variant_id')
      .eq('id', externalVariantId)
      .maybeSingle();
    if (externalVariantError) throw externalVariantError;
    if (!externalVariant?.id || externalVariant.deprecated_at) {
      await quarantine(db, {
        sourceId,
        importRunId,
        rawRecordId,
        conflictType: 'identity_collision',
        canonicalKey,
        proposed: normalised.raw,
        existing: {
          externalVariantId,
          deprecatedAt: externalVariant?.deprecated_at ?? null,
          correctedByVariantId: externalVariant?.corrected_by_variant_id ?? null,
        },
        notes: 'Current provider identity points to a missing or deprecated canonical variant.',
      });
      return { status: 'conflicted' as const };
    }
  }

  const identityRow = identityRows[0];
  if (identityRow?.deprecated_at) {
    const correctedByVariantId = identityRow.corrected_by_variant_id as string | null;
    const correctionTarget = correctedByVariantId
      ? await table(db, 'catalog', 'card_variants')
        .select('id, printing_id')
        .eq('id', correctedByVariantId)
        .is('deprecated_at', null)
        .maybeSingle()
      : { data: null, error: null };
    if (correctionTarget.error) throw correctionTarget.error;

    if (isResolvedDeprecatedVariantAlias({
      deprecatedAt: identityRow.deprecated_at,
      correctedByVariantId,
      correctionTargetId: correctionTarget.data?.id ?? null,
      deprecatedPrintingId: identityRow.printing_id,
      correctionTargetPrintingId: correctionTarget.data?.printing_id ?? null,
      externalVariantId,
    })) {
      await auditDecision(db, {
        sourceId,
        importRunId,
        rawRecordId,
        requestId,
        decisionType: 'skipped',
        entitySchema: 'catalog',
        entityTable: 'card_variants',
        entityId: identityRow.id,
        canonicalKey,
        confidence: normalised.sourceConfidence,
        reason: 'deprecated_provider_variant_alias_already_corrected',
        proposed: normalised.raw,
        existing: { correctedByVariantId },
      });
      return { status: 'skipped' as const };
    }

    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'identity_collision',
      canonicalKey,
      proposed: normalised.raw,
      existing: {
        deprecatedVariantId: identityRow.id,
        correctedByVariantId,
        correctionTargetId: correctionTarget.data?.id ?? null,
      },
      notes: 'Provider variant resolves only to a deprecated canonical identity without a verified active correction target.',
    });
    return { status: 'conflicted' as const };
  }

  const identityVariantId = identityRow?.id;
  if (externalVariantId && identityVariantId && externalVariantId !== identityVariantId) {
    const released = await releaseSupportedPrimaryVariantAlias(db, {
      sourceId,
      normalised,
      externalVariantId,
      identityVariantId,
    });
    if (released) {
      await auditDecision(db, {
        sourceId,
        importRunId,
        rawRecordId,
        requestId,
        decisionType: 'updated',
        entitySchema: 'catalog',
        entityTable: 'card_variants',
        entityId: externalVariantId,
        canonicalKey,
        confidence: normalised.sourceConfidence,
        reason: 'provider_primary_variant_changed',
        proposed: { supportedVariantCodes: declaredVariantCodes(normalised.raw) },
      });
      externalVariantId = undefined;
    } else {
      const repaired = await tryRepairProviderVariantIdentity(db, {
        sourceId,
        normalised,
        externalVariantId,
        identityVariantId,
      });
      if (repaired) externalVariantId = identityVariantId;
    }
  }
  if (externalVariantId && !identityVariantId) {
    const released = await releaseSupportedPrimaryVariantAlias(db, {
      sourceId,
      normalised,
      externalVariantId,
    });
    if (released) {
      await auditDecision(db, {
        sourceId,
        importRunId,
        rawRecordId,
        requestId,
        decisionType: 'updated',
        entitySchema: 'catalog',
        entityTable: 'card_variants',
        entityId: externalVariantId,
        canonicalKey,
        confidence: normalised.sourceConfidence,
        reason: 'provider_primary_variant_changed',
        proposed: { supportedVariantCodes: declaredVariantCodes(normalised.raw) },
      });
      externalVariantId = undefined;
    }
  }
  if (externalVariantId && identityVariantId && externalVariantId !== identityVariantId) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'identity_collision',
      canonicalKey,
      proposed: normalised.raw,
      existing: { externalVariantId, identityVariantId },
      notes: 'External ID and canonical identity resolve to different variants.',
    });
    return { status: 'conflicted' as const };
  }

  await ensureNamedStampTaxonomy(db, normalised);
  const conceptId = await ensureConcept(db, normalised);
  const rarityId = await getRarityId(db, normalised.gameCode, normalised.rarityCode);
  const existingVariant = identityRows[0] ?? (externalVariantId ? { id: externalVariantId, printing_id: null } : null);

  if (existingVariant?.id) {
    const { data: variant, error: variantError } = await table(db, 'catalog', 'card_variants')
      .select('id, printing_id, canonical_key, variant_code, artwork_key')
      .eq('id', existingVariant.id)
      .maybeSingle();
    if (variantError) throw variantError;

    let repairedProviderIdentity = false;
    if (externalVariantId && !identityVariantId && variant.canonical_key !== canonicalKey) {
      const printingVariants = await table(db, 'catalog', 'card_variants')
        .select('id, variant_code')
        .eq('printing_id', variant.printing_id)
        .is('deprecated_at', null);
      if (printingVariants.error) throw printingVariants.error;
      const activeVariants = (printingVariants.data ?? []) as Array<{ id: string; variant_code: string }>;
      const activeVariantIds = activeVariants.map((row) => row.id);
      const soleVariantRepair = activeVariantIds.length === 1 && activeVariantIds[0] === variant.id;
      let supportedSiblingRepair = false;
      if (!soleVariantRepair) {
        const currentIdentifiers = await table(db, 'ingest', 'external_identifiers')
          .select('source_id, source_entity_type, language_code, external_id')
          .eq('variant_id', variant.id)
          .eq('is_current', true)
          .is('deprecated_at', null)
          .limit(3);
        if (currentIdentifiers.error) throw currentIdentifiers.error;
        supportedSiblingRepair = isSafeUnsupportedPrimaryVariantCorrection({
          provider: normalised.provider,
          sourceId,
          languageCode: normalised.languageCode,
          providerRecordId: normalised.providerRecordId,
          staleVariantId: variant.id,
          staleVariantCode: variant.variant_code,
          staleArtworkKey: variant.artwork_key,
          expectedVariantCode: normalised.variantCode ?? 'normal',
          expectedArtworkKey: normalised.artworkKey,
          supportedVariantCodes: declaredVariantCodes(normalised.raw),
          activeVariants,
          currentIdentifiers: currentIdentifiers.data ?? [],
        });
      }
      if (!soleVariantRepair && !supportedSiblingRepair) {
        await quarantine(db, {
          sourceId,
          importRunId,
          rawRecordId,
          conflictType: 'identity_collision',
          canonicalKey,
          proposed: normalised.raw,
          existing: { externalVariantId, existingCanonicalKey: variant.canonical_key, activeVariantIds },
          notes: 'Provider variant identity changed but the printing has multiple active variants; automatic repair was refused.',
        });
        return { status: 'conflicted' as const };
      }
      const { error: staleIdentifierError } = await table(db, 'ingest', 'external_identifiers')
        .update({
          is_current: false,
          deprecated_at: nowIso(),
          deprecated_reason: 'provider_variant_identity_corrected',
        })
        .eq('source_id', sourceId)
        .eq('source_entity_type', 'card')
        .eq('variant_id', variant.id)
        .eq('is_current', true)
        .is('deprecated_at', null)
        .neq('external_id', normalised.providerRecordId);
      if (staleIdentifierError) throw staleIdentifierError;
      repairedProviderIdentity = true;
    }

    const printingPatch = {
      card_concept_id: conceptId,
      ...sparsePrintingMetadataPatch(normalised, rarityId),
    };
    const { error: printingError } = await table(db, 'catalog', 'card_printings')
      .update(printingPatch)
      .eq('id', variant.printing_id);
    if (printingError) throw printingError;

    const variantPatch: Record<string, unknown> = sparseVariantMetadataPatch(normalised);
    if (repairedProviderIdentity) {
      variantPatch.variant_code = normalised.variantCode ?? 'normal';
      variantPatch.canonical_key = canonicalKey;
      variantPatch.is_default = (normalised.variantCode ?? 'normal') === 'normal';
    }
    const { error: updateError } = await table(db, 'catalog', 'card_variants')
      .update(variantPatch)
      .eq('id', variant.id);
    if (updateError) throw updateError;
    await insertNameIfMissing(db, {
      printingId: variant.printing_id,
      variantId: variant.id,
      languageCode: normalised.languageCode,
      nameType: 'native',
      name: normalised.nativeName,
      confidence: normalised.sourceConfidence,
      sourceUpdatedAt: normalised.sourceUpdatedAt,
    });
    await insertNameIfMissing(db, {
      printingId: variant.printing_id,
      variantId: variant.id,
      languageCode: 'en',
      nameType: 'english_display',
      name: normalised.englishDisplayName,
      confidence: normalised.sourceConfidence,
      sourceUpdatedAt: normalised.sourceUpdatedAt,
    });
    if (options.allowImageAssets && hasCompleteCardImageIdentity(normalised)) {
      await upsertAssetForVariant(db, sourceId, importRunId, rawRecordId, normalised, variant.id);
    }
    await linkExternalId(db, {
      sourceId,
      rawRecordId,
      sourceEntityType: 'card',
      externalId: normalised.providerRecordId,
      languageCode: normalised.languageCode,
      variantId: variant.id,
      confidence: normalised.sourceConfidence,
      sourceUpdatedAt: normalised.sourceUpdatedAt,
    });
    await auditDecision(db, {
      sourceId,
      importRunId,
      rawRecordId,
      requestId,
      decisionType: 'updated',
      entitySchema: 'catalog',
      entityTable: 'card_variants',
      entityId: variant.id,
      canonicalKey,
      confidence: normalised.sourceConfidence,
      reason: repairedProviderIdentity
        ? 'provider_variant_identity_corrected'
        : externalVariantId
        ? 'external_id_match'
        : 'canonical_identity_match',
      proposed: { printingPatch, variantPatch },
    });
    return { status: 'updated' as const, variantId: variant.id as string };
  }

  const printingIdentity = await table(db, 'catalog', 'card_printings')
    .select('id')
    .eq('game_code', normalised.gameCode)
    .eq('set_id', setMatch.setId)
    .eq('language_code', normalised.languageCode)
    .eq('collector_number', normalised.collectorNumber)
    .is('deprecated_at', null)
    .limit(2);
  if (printingIdentity.error) throw printingIdentity.error;
  const printingRows = printingIdentity.data ?? [];
  if (printingRows.length > 1) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'identity_collision',
      canonicalKey,
      proposed: normalised.raw,
      existing: { rows: printingRows },
      notes: 'Card printing identity is ambiguous; variant was not attached by guesswork.',
    });
    return { status: 'conflicted' as const };
  }

  const printingPatch = {
    card_concept_id: conceptId,
    ...sparsePrintingMetadataPatch(normalised, rarityId),
  };
  const printingInsert = {
    card_concept_id: conceptId,
    native_name: cleanText(normalised.nativeName),
    english_display_name: cleanText(normalised.englishDisplayName),
    rarity_id: rarityId,
    source_updated_at: cleanText(normalised.sourceUpdatedAt),
  };
  let printingId = printingRows[0]?.id as string | undefined;
  if (printingId) {
    const { error } = await table(db, 'catalog', 'card_printings')
      .update(printingPatch)
      .eq('id', printingId);
    if (error) throw error;
  } else {
    const { data: printing, error: printingError } = await table(db, 'catalog', 'card_printings').insert({
      game_code: normalised.gameCode,
      set_id: setMatch.setId,
      language_code: normalised.languageCode,
      collector_number: normalised.collectorNumber,
      collector_number_prefix: normalised.collectorNumberPrefix,
      collector_number_sort: normalised.collectorNumberSort,
      collector_number_suffix: normalised.collectorNumberSuffix,
      collector_number_sort_key: normalised.collectorNumberSortKey,
      ...printingInsert,
    })
      .select('id')
      .maybeSingle();
    if (printingError) throw printingError;
    printingId = printing.id as string;
  }

  const { data: variant, error: variantError } = await table(db, 'catalog', 'card_variants')
    .insert({
      printing_id: printingId,
      game_code: normalised.gameCode,
      set_id: setMatch.setId,
      language_code: normalised.languageCode,
      collector_number: normalised.collectorNumber,
      variant_code: normalised.variantCode ?? 'normal',
      finish_code: normalised.finishCode ?? null,
      canonical_key: canonicalKey,
      artwork_key: normalised.artworkKey ?? null,
      is_default: (normalised.variantCode ?? 'normal') === 'normal',
      source_confidence: normalised.sourceConfidence,
      source_updated_at: normalised.sourceUpdatedAt ?? null,
    })
    .select('id')
    .maybeSingle();
  if (variantError) throw variantError;

  await insertNameIfMissing(db, {
    printingId,
    variantId: variant.id,
    languageCode: normalised.languageCode,
    nameType: 'native',
    name: normalised.nativeName,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  await insertNameIfMissing(db, {
    printingId,
    variantId: variant.id,
    languageCode: 'en',
    nameType: 'english_display',
    name: normalised.englishDisplayName,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  if (options.allowImageAssets && hasCompleteCardImageIdentity(normalised)) {
    await upsertAssetForVariant(db, sourceId, importRunId, rawRecordId, normalised, variant.id);
  }
  const link = await linkExternalId(db, {
    sourceId,
    rawRecordId,
    sourceEntityType: 'card',
    externalId: normalised.providerRecordId,
    languageCode: normalised.languageCode,
    variantId: variant.id,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  if (link.status === 'conflict') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'duplicate_external_id',
      canonicalKey,
      proposed: normalised.raw,
      existing: link.existing,
    });
    return { status: 'conflicted' as const };
  }

  await auditDecision(db, {
    sourceId,
    importRunId,
    rawRecordId,
    requestId,
    decisionType: 'created',
    entitySchema: 'catalog',
    entityTable: 'card_variants',
    entityId: variant.id,
    canonicalKey,
    confidence: normalised.sourceConfidence,
    reason: 'new_card_variant_from_safe_provider_record',
    proposed: normalised.raw,
  });
  return { status: 'inserted' as const, variantId: variant.id as string };
}

async function upsertCardImage(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  requestId?: string,
) {
  const providerCardExternalId = cleanText(normalised.raw.cardID);
  if (normalised.provider === 'pokemon_card_jp_official' && providerCardExternalId) {
    const { data: identifierRows, error: identifierError } = await table(db, 'ingest', 'external_identifiers')
      .select('variant_id')
      .eq('source_id', sourceId)
      .eq('source_entity_type', 'card')
      .eq('external_id', providerCardExternalId)
      .eq('language_code', normalised.languageCode)
      .eq('is_current', true)
      .is('deprecated_at', null)
      .not('variant_id', 'is', null)
      .limit(2);
    if (identifierError) throw identifierError;
    if ((identifierRows ?? []).length > 1) {
      await quarantine(db, {
        sourceId,
        importRunId,
        rawRecordId,
        conflictType: 'identity_collision',
        proposed: normalised.raw,
        existing: { providerCardExternalId, variantIds: identifierRows.map((row: { variant_id: string }) => row.variant_id) },
        notes: 'Official Japanese card ID maps to multiple current variants; image attachment was refused.',
      });
      return { status: 'conflicted' as const };
    }
    const mappedVariantId = identifierRows?.[0]?.variant_id as string | undefined;
    if (mappedVariantId) {
      const { data: mappedVariant, error: mappedVariantError } = await table(db, 'catalog', 'card_variants')
        .select('id,language_code,set_id,collector_number,variant_code,finish_code,artwork_key')
        .eq('id', mappedVariantId)
        .eq('language_code', 'ja')
        .is('deprecated_at', null)
        .maybeSingle();
      if (mappedVariantError) throw mappedVariantError;
      let classification = classifyMappedOfficialImageTarget({
        cardId: providerCardExternalId,
        requestedVariantCode: normalised.variantCode,
        requestedFinishCode: normalised.finishCode,
        mappedVariant: mappedVariant ? {
          id: mappedVariant.id,
          languageCode: mappedVariant.language_code,
          setId: mappedVariant.set_id,
          collectorNumber: mappedVariant.collector_number,
          variantCode: mappedVariant.variant_code,
          finishCode: mappedVariant.finish_code,
          artworkKey: mappedVariant.artwork_key,
        } : null,
      });
      let artworkBackfilled = false;
      let resolvedSet: Awaited<ReturnType<typeof findSetId>> | null = null;
      if (classification.status === 'conflict' && mappedVariant?.id && mappedVariant.artwork_key == null) {
        resolvedSet = await findSetId(db, sourceId, normalised);
        classification = classifyMappedOfficialImageTarget({
          cardId: providerCardExternalId,
          resolvedSetId: resolvedSet.status === 'matched' ? resolvedSet.setId : null,
          providerCollectorNumber: normalised.collectorNumber,
          requestedVariantCode: normalised.variantCode,
          requestedFinishCode: normalised.finishCode,
          mappedVariant: {
            id: mappedVariant.id,
            languageCode: mappedVariant.language_code,
            setId: mappedVariant.set_id,
            collectorNumber: mappedVariant.collector_number,
            variantCode: mappedVariant.variant_code,
            finishCode: mappedVariant.finish_code,
            artworkKey: mappedVariant.artwork_key,
          },
        });
      }
      if (classification.status === 'repair' && mappedVariant?.id && classification.expectedArtworkKey) {
        let update = table(db, 'catalog', 'card_variants')
          .update({ artwork_key: classification.expectedArtworkKey })
          .eq('id', mappedVariant.id)
          .eq('language_code', 'ja')
          .eq('set_id', mappedVariant.set_id)
          .eq('collector_number', mappedVariant.collector_number)
          .eq('variant_code', mappedVariant.variant_code)
          .is('artwork_key', null)
          .is('deprecated_at', null);
        update = mappedVariant.finish_code == null
          ? update.is('finish_code', null)
          : update.eq('finish_code', mappedVariant.finish_code);
        const { data: repairedRows, error: repairError } = await update.select('id,artwork_key');
        if (repairError) throw repairError;
        if ((repairedRows ?? []).length === 1) {
          artworkBackfilled = true;
          classification = {
            status: 'exact',
            expectedArtworkKey: classification.expectedArtworkKey,
            reason: 'exact_artwork_key_compare_and_set',
          };
        } else {
          const { data: concurrentVariant, error: concurrentVariantError } = await table(db, 'catalog', 'card_variants')
            .select('id,artwork_key')
            .eq('id', mappedVariant.id)
            .eq('language_code', 'ja')
            .is('deprecated_at', null)
            .maybeSingle();
          if (concurrentVariantError) throw concurrentVariantError;
          classification = concurrentVariant?.artwork_key === classification.expectedArtworkKey
            ? {
                status: 'exact',
                expectedArtworkKey: classification.expectedArtworkKey,
                reason: 'concurrent_exact_artwork_key_compare_and_set',
              }
            : {
                status: 'conflict',
                expectedArtworkKey: classification.expectedArtworkKey,
                reason: 'artwork_key_compare_and_set_lost',
              };
        }
      }
      if (classification.status !== 'exact') {
        await quarantine(db, {
          sourceId,
          importRunId,
          rawRecordId,
          conflictType: 'identity_collision',
          proposed: normalised.raw,
          existing: {
            providerCardExternalId,
            mappedVariantId,
            mappedVariant: mappedVariant ?? null,
            resolvedSet,
            classificationReason: classification.reason,
          },
          notes: 'Official Japanese card ID target is inactive, non-Japanese, or lacks matching official artwork evidence.',
        });
        return { status: 'conflicted' as const };
      }
      const assetId = await upsertAssetForVariant(
        db,
        sourceId,
        importRunId,
        rawRecordId,
        normalised,
        mappedVariantId,
      );
      if (!assetId) return { status: 'conflicted' as const };
      await auditDecision(db, {
        sourceId,
        importRunId,
        rawRecordId,
        requestId,
        decisionType: 'updated',
        entitySchema: 'catalog',
        entityTable: 'assets',
        entityId: assetId,
        confidence: normalised.sourceConfidence,
        reason: artworkBackfilled
          ? 'official_card_image_attached_after_exact_mapped_artwork_backfill'
          : 'official_card_image_attached_by_existing_provider_identity',
        proposed: normalised.raw,
      });
      return { status: 'updated' as const, assetId };
    }
  }

  const setMatch = await findSetId(db, sourceId, normalised);
  if (setMatch.status !== 'matched') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: setMatch.status === 'conflict' ? 'set_code_conflict' : 'schema_conflict',
      proposed: normalised.raw,
      existing: { reason: setMatch.reason },
      notes: 'Card image cannot be mapped to exactly one canonical set.',
    });
    return { status: 'conflicted' as const };
  }

  const canonicalKey = catalogVariantCanonicalKey({
    gameCode: normalised.gameCode,
    languageCode: normalised.languageCode,
    setId: setMatch.setId,
    collectorNumber: normalised.collectorNumber!,
    variantCode: normalised.variantCode ?? 'normal',
  });
  const { data: printingRows, error: printingError } = await table(db, 'catalog', 'card_printings')
    .select('id')
    .eq('game_code', normalised.gameCode)
    .eq('set_id', setMatch.setId)
    .eq('language_code', normalised.languageCode)
    .eq('collector_number', normalised.collectorNumber)
    .is('deprecated_at', null)
    .limit(2);
  if (printingError) throw printingError;
  if ((printingRows ?? []).length !== 1) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: (printingRows ?? []).length > 1 ? 'identity_collision' : 'schema_conflict',
      proposed: normalised.raw,
      existing: { canonicalKey, printingIds: (printingRows ?? []).map((printing: { id: string }) => printing.id) },
      notes: (printingRows ?? []).length > 1
        ? 'Card image printing identity resolves to multiple printings.'
        : 'Card image printing is missing; asset-only ingestion never fabricates metadata.',
    });
    return { status: 'conflicted' as const };
  }

  const { data: variantRows, error: variantError } = await table(db, 'catalog', 'card_variants')
    .select('id,canonical_key,is_default,variant_code,finish_code')
    .eq('printing_id', printingRows![0].id)
    .is('deprecated_at', null);
  if (variantError) throw variantError;
  const selection = chooseExistingVariantForCardImage(
    variantRows ?? [],
    canonicalKey,
    normalised.variantCode ?? 'normal',
  );
  if (selection.status !== 'matched') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: selection.reason === 'ambiguous_existing_variants' ? 'identity_collision' : 'schema_conflict',
      proposed: normalised.raw,
      existing: { canonicalKey, variantIds: (variantRows ?? []).map((variant: { id: string }) => variant.id) },
      notes: selection.reason === 'ambiguous_existing_variants'
        ? 'Card image has no exact variant and the existing printing has no single safe default.'
        : selection.reason === 'exact_variant_missing'
          ? 'Finish-specific card image has no exact existing variant; asset-only ingestion never downgrades it to normal.'
          : 'Card image printing has no active variant; asset-only ingestion never fabricates one.',
    });
    return { status: 'conflicted' as const };
  }

  const assetId = await upsertAssetForVariant(
    db,
    sourceId,
    importRunId,
    rawRecordId,
    normalised,
    selection.variantId,
  );
  if (!assetId) return { status: 'conflicted' as const };
  await auditDecision(db, {
    sourceId,
    importRunId,
    rawRecordId,
    requestId,
    decisionType: 'updated',
    entitySchema: 'catalog',
    entityTable: 'assets',
    entityId: assetId,
    canonicalKey,
    confidence: normalised.sourceConfidence,
    reason: selection.reason,
    proposed: normalised.raw,
  });
  return { status: 'updated' as const, assetId };
}

export function chooseExistingVariantForCardImage(
  variants: Array<{
    id: string;
    canonical_key?: string | null;
    is_default?: boolean | null;
    variant_code?: string | null;
    finish_code?: string | null;
  }>,
  canonicalKey: string,
  requestedVariantCode = 'normal',
) {
  const exact = variants.filter((variant) => variant.canonical_key === canonicalKey);
  if (exact.length === 1) {
    return {
      status: 'matched' as const,
      variantId: exact[0].id,
      reason: 'card_image_attached_to_exact_canonical_variant',
    };
  }
  if (exact.length > 1) return { status: 'conflicted' as const, reason: 'ambiguous_existing_variants' as const };
  if (requestedVariantCode !== 'normal') {
    return {
      status: 'conflicted' as const,
      reason: variants.length === 0 ? 'existing_variant_missing' as const : 'exact_variant_missing' as const,
    };
  }
  const safeNormalVariants = variants.filter((variant) => (
    variant.variant_code === 'normal'
    && (variant.finish_code == null || variant.finish_code === 'normal')
  ));
  const defaults = safeNormalVariants.filter((variant) => variant.is_default === true);
  if (defaults.length === 1) {
    return {
      status: 'matched' as const,
      variantId: defaults[0].id,
      reason: 'card_image_attached_to_existing_default_variant',
    };
  }
  if (safeNormalVariants.length === 1) {
    return {
      status: 'matched' as const,
      variantId: safeNormalVariants[0].id,
      reason: 'card_image_attached_to_existing_sole_normal_variant',
    };
  }
  return {
    status: 'conflicted' as const,
    reason: variants.length === 0 ? 'existing_variant_missing' as const : 'ambiguous_existing_variants' as const,
  };
}

async function reconcileRecord(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  options: { requestId?: string; allowImageAssets?: boolean; approvedOnlyAssets?: boolean } = {},
) {
  const requestId = options.requestId;
  if (normalised.recordType === 'asset' && options.approvedOnlyAssets && normalised.licenceStatus !== 'approved') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'licence_conflict',
      severity: normalised.licenceStatus === 'denied' || normalised.licenceStatus === 'restricted' ? 'high' : 'medium',
      proposed: normalised.raw,
      notes: `approved_only_asset_rights_blocked: licence status is ${normalised.licenceStatus}.`,
    });
    await auditDecision(db, {
      sourceId,
      importRunId,
      rawRecordId,
      requestId,
      decisionType: 'licence_blocked',
      reason: 'approved_only_asset_rights_not_approved',
      confidence: normalised.sourceConfidence,
      proposed: normalised.raw,
    });
    return { status: 'conflicted' as const };
  }

  if (normalised.licenceStatus !== 'approved') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'licence_conflict',
      severity: normalised.licenceStatus === 'denied' || normalised.licenceStatus === 'restricted' ? 'high' : 'medium',
      proposed: normalised.raw,
      notes: `Licence status is ${normalised.licenceStatus}; safe upsert blocked.`,
    });
    await auditDecision(db, {
      sourceId,
      importRunId,
      rawRecordId,
      requestId,
      decisionType: 'licence_blocked',
      reason: 'licence_status_not_approved',
      confidence: normalised.sourceConfidence,
      proposed: normalised.raw,
    });
    return { status: 'conflicted' as const };
  }

  if (normalised.recordType === 'set') {
    return upsertSet(db, sourceId, importRunId, rawRecordId, normalised, requestId);
  }
  if (normalised.recordType === 'asset' && !options.allowImageAssets) {
    await auditDecision(db, {
      sourceId,
      importRunId,
      rawRecordId,
      requestId,
      decisionType: 'skipped',
      reason: 'card_image_collection_disabled_until_canonical_identity_complete',
      proposed: normalised.raw,
    });
    return { status: 'skipped' as const };
  }
  if (normalised.recordType === 'asset' && isSetScopedAsset(normalised)) {
    if (!hasCompleteSetScopedAssetIdentity(normalised)) {
      await quarantine(db, {
        sourceId,
        importRunId,
        rawRecordId,
        conflictType: 'schema_conflict',
        severity: 'high',
        proposed: normalised.raw,
        notes: 'Set asset lacks complete language + provider set identity + image URL + supported set asset type.',
      });
      return { status: 'conflicted' as const };
    }
    return upsertAssetForSet(db, sourceId, importRunId, rawRecordId, normalised, requestId);
  }
  if (normalised.recordType === 'asset' && normalised.assetType !== 'card_image') {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'schema_conflict',
      severity: 'high',
      proposed: normalised.raw,
      notes: `Unsupported provider asset type ${normalised.assetType ?? '<missing>'}; only exact card images, set logos, set symbols, and sealed-product set covers are accepted.`,
    });
    return { status: 'conflicted' as const };
  }
  const hasExistingOfficialIdentity = normalised.provider === 'pokemon_card_jp_official'
    && Boolean(cleanText(normalised.raw.cardID));
  if (normalised.recordType === 'asset' && !hasExistingOfficialIdentity && !hasCompleteCardImageIdentity(normalised)) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: 'schema_conflict',
      severity: 'high',
      proposed: normalised.raw,
      notes: 'Image asset lacks complete language + set_code + collector_number + variant + finish identity.',
    });
    return { status: 'conflicted' as const };
  }
  if (normalised.recordType === 'asset') {
    return upsertCardImage(db, sourceId, importRunId, rawRecordId, normalised, requestId);
  }
  if (['card', 'printing', 'variant'].includes(normalised.recordType)) {
    return upsertCardVariant(db, sourceId, importRunId, rawRecordId, normalised, {
      requestId,
      allowImageAssets: options.allowImageAssets,
    });
  }
  await auditDecision(db, {
    sourceId,
    importRunId,
    rawRecordId,
    requestId,
    decisionType: 'skipped',
    reason: `record_type_${normalised.recordType}_not_upserted_in_stage_3`,
    proposed: normalised.raw,
  });
  return { status: 'skipped' as const };
}

export class CatalogueIngestionRunner {
  readonly db: SupabaseClientLike;
  readonly adapter: SourceAdapter;

  constructor(db: SupabaseClientLike, adapter: SourceAdapter) {
    this.db = db;
    this.adapter = adapter;
  }

  async run(options: ImportOptions = {}) {
    const safeOptions = validateImportOptions(options);
    const sourceIdentity = this.adapter.identifySource();
    const stats: ImportStats = {
      recordsRequested: 0,
      recordsRetrieved: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsConflicted: 0,
      decisions: 0,
    };

    const health = await this.adapter.healthCheck(safeOptions);
    if (['forbidden', 'unavailable', 'failed'].includes(health.status)) {
      return {
        ok: false,
        source: sourceIdentity.code,
        health,
        error: 'Provider is unavailable; import was not attempted.',
      };
    }

    const batches = recordKindsForCommand(this.adapter, safeOptions);
    const records = (await Promise.all(batches.map((batch) => collectRecords(batch)))).flat();
    const uniqueRecords = dedupeProviderRecords(records, safeOptions);
    stats.recordsRequested = uniqueRecords.size;
    stats.recordsRetrieved = uniqueRecords.size;

    const preparedRecords: Array<{
      record: ProviderRecord;
      validation: ValidationResult;
      normalised?: NormalisedRecord;
    }> = [];
    for (const record of uniqueRecords.values()) {
      const validation = await this.adapter.validateRecord(record);
      if (!validation.ok) {
        preparedRecords.push({ record, validation });
        stats.recordsConflicted += 1;
        continue;
      }
      const normalised = assertNormalisedLanguage(record, await this.adapter.normaliseRecord(record));
      preparedRecords.push({ record, validation, normalised });
    }

    if (safeOptions.dryRun) {
      stats.recordsSkipped = preparedRecords.filter((entry) => entry.validation.ok).length;
      return {
        ok: true,
        source: sourceIdentity.code,
        importRunId: null,
        dryRun: true,
        health,
        stats,
      };
    }

    const source = await ensureSource(this.db, sourceIdentity);
    await recordHealth(this.db, source.id, health);
    const run = await startImportRun(this.db, source.id, this.adapter, safeOptions);

    try {
      const processRecord = async ({ record, validation, normalised }: typeof preparedRecords[number]) => {
        const raw = await retainRawRecord(this.db, source.id, run.id, record, validation);
        if (!validation.ok) {
          await quarantine(this.db, {
            sourceId: source.id,
            importRunId: run.id,
            rawRecordId: raw.id,
            conflictType: validation.issues.some((issue) => issue.code === 'legal_use_not_approved')
              ? 'licence_conflict'
              : 'schema_conflict',
            proposed: record.payload,
            existing: { validationIssues: issuePayload(validation.issues) },
          });
          await auditDecision(this.db, {
            sourceId: source.id,
            importRunId: run.id,
            rawRecordId: raw.id,
            requestId: safeOptions.requestId,
            decisionType: 'quarantined',
            reason: 'raw_record_validation_failed',
            proposed: record.payload,
            existing: { validationIssues: issuePayload(validation.issues) },
          });
          return;
        }

        await auditDecision(this.db, {
          sourceId: source.id,
          importRunId: run.id,
          rawRecordId: raw.id,
          requestId: safeOptions.requestId,
          decisionType: 'validated',
          reason: 'raw_record_validation_passed',
          proposed: record.payload,
        });

        const result = await reconcileRecord(this.db, source.id, run.id, raw.id, normalised!, {
          requestId: safeOptions.requestId,
          allowImageAssets: safeOptions.allowImageAssets,
          approvedOnlyAssets: safeOptions.approvedOnlyAssets,
        });
        if (result.status === 'inserted') stats.recordsInserted += 1;
        else if (result.status === 'updated') stats.recordsUpdated += 1;
        else if (result.status === 'conflicted') stats.recordsConflicted += 1;
        else stats.recordsSkipped += 1;
      };

      for (let phase = 0; phase <= 5; phase += 1) {
        const phaseRecords = preparedRecords.filter(
          ({ record, validation }) => reconciliationPhase(record, validation) === phase,
        );
        await runWithConcurrencyByKey(
          phaseRecords,
          safeOptions.writeConcurrency ?? 1,
          reconciliationConcurrencyKey,
          processRecord,
        );
      }

      await finishImportRun(this.db, run.id, 'completed', stats);
      return { ok: true, source: sourceIdentity.code, importRunId: run.id, health, stats };
    } catch (error) {
      await finishImportRun(
        this.db,
        run.id,
        'failed',
        stats,
        importErrorMessage(error),
      );
      throw error;
    }
  }
}

export async function enqueueWorkItem(
  db: SupabaseClientLike,
  input: {
    queueName:
      | 'catalogue_ingestion'
      | 'asset_processing'
      | 'embedding_generation'
      | 'price_refresh'
      | 'conflict_review'
      | 'scan_acquisition';
    command: string;
    sourceId?: string | null;
    importRunId?: string | null;
    idempotencyKey: string;
    payload?: Record<string, unknown>;
    priority?: number;
    runAfter?: string;
    requestId?: string | null;
  },
) {
  const row = {
    queue_name: input.queueName,
    command: input.command,
    source_id: input.sourceId ?? null,
    import_run_id: input.importRunId ?? null,
    idempotency_key: input.idempotencyKey,
    priority: input.priority ?? 50,
    run_after: input.runAfter ?? nowIso(),
    payload: input.payload ?? {},
    request_id: input.requestId ?? null,
    status: 'pending',
  };
  const { data: existing, error: lookupError } = await table(db, 'ingest', 'work_queue')
    .select('id')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) {
    const { error } = await table(db, 'ingest', 'work_queue').update(row).eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id as string, status: 'updated' as const };
  }
  const { data, error } = await table(db, 'ingest', 'work_queue')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { id: data.id as string, status: 'inserted' as const };
}

export async function readQuarantinedConflicts(
  db: SupabaseClientLike,
  options: { limit?: number; sourceId?: string; conflictType?: string } = {},
) {
  let query = table(db, 'ingest', 'data_conflicts')
    .select('id, source_id, import_run_id, raw_record_id, conflict_type, severity, canonical_key, proposed_payload, existing_payload, created_at')
    .in('status', ['open', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);
  if (options.sourceId) query = query.eq('source_id', options.sourceId);
  if (options.conflictType) query = query.eq('conflict_type', options.conflictType);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
