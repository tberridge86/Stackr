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
  if (error) throw error;
  return data?.status === 'repaired';
}

async function releaseSupportedPrimaryVariantAlias(
  db: SupabaseClientLike,
  input: {
    sourceId: string;
    normalised: NormalisedRecord;
    externalVariantId: string;
  },
) {
  if (input.normalised.provider !== 'tcgdex' || input.normalised.recordType !== 'card') return false;
  if (input.normalised.providerRecordId.includes(':')) return false;
  const expectedVariantCode = input.normalised.variantCode ?? 'normal';
  const supportedVariantCodes = declaredVariantCodes(input.normalised.raw);
  if (!supportedVariantCodes.includes(expectedVariantCode)) return false;

  const { data: currentVariant, error: variantError } = await table(db, 'catalog', 'card_variants')
    .select('id, printing_id, variant_code, canonical_key')
    .eq('id', input.externalVariantId)
    .is('deprecated_at', null)
    .maybeSingle();
  if (variantError) throw variantError;
  if (!currentVariant?.id || currentVariant.variant_code === expectedVariantCode) return false;
  if (!supportedVariantCodes.includes(currentVariant.variant_code)) return false;

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

  const { error: releaseError } = await table(db, 'ingest', 'external_identifiers')
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
    .is('deprecated_at', null);
  if (releaseError) throw releaseError;
  return true;
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
  const includeSetMetadata = command === 'run_source'
    || command === 'run_language'
    || (command === 'run_set' && adapter.identifySource().code === 'tcgdex');
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
    && ['card', 'printing', 'variant'].includes(prepared.record.recordType)
    && normalised.collectorNumber
  ) {
    return [
      normalised.gameCode,
      normalised.languageCode,
      normalised.providerSetId ?? normalised.setCode ?? 'unknown-set',
      normalised.collectorNumber,
    ].join(':');
  }
  return `${prepared.record.recordType}:${prepared.record.providerRecordId}:${index}`;
}

function reconciliationPhase(record: ProviderRecord, validation: ValidationResult) {
  if (!validation.ok) return 0;
  if (record.recordType === 'set') return 1;
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
  const base = {
    source_id: sourceId,
    import_run_id: importRunId,
    record_type: record.recordType,
    external_id: record.providerRecordId,
    provider_record_id: record.providerRecordId,
    language_code: languageCode,
    source_url: record.sourceUrl ?? null,
    source_endpoint: record.sourceEndpoint ?? record.sourceUrl ?? null,
    retrieved_at: nowIso(),
    source_updated_at: record.providerUpdatedAt ?? null,
    licence_status: record.licenceStatus,
    attribution_text: record.attributionText ?? null,
    payload_hash: payloadHash,
    raw_payload: record.payload,
    http_metadata: record.httpMetadata ?? {},
    validation_status: validationStatus(validation),
    validation_errors: issuePayload(validation.issues),
  };

  const query = table(db, 'ingest', 'raw_source_records')
    .select('id')
    .eq('source_id', sourceId)
    .eq('import_run_id', importRunId)
    .eq('record_type', record.recordType)
    .eq('external_id', record.providerRecordId);
  const { data: existing, error: lookupError } = languageCode
    ? await query.eq('language_code', languageCode).maybeSingle()
    : await query.is('language_code', null).maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { data, error } = await table(db, 'ingest', 'raw_source_records')
      .update(base)
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return { id: data.id, changed: 'updated' as const };
  }

  const { data, error } = await table(db, 'ingest', 'raw_source_records')
    .insert(base)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { id: data.id, changed: 'inserted' as const };
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
    const matches =
      (!input.setId || existing.set_id === input.setId) &&
      (!input.variantId || existing.variant_id === input.variantId) &&
      (!input.assetId || existing.asset_id === input.assetId);
    if (!matches) return { status: 'conflict' as const, existing };

    const { error } = await table(db, 'ingest', 'external_identifiers')
      .update({
        raw_record_id: input.rawRecordId,
        confidence: input.confidence,
        source_updated_at: input.sourceUpdatedAt ?? null,
      })
      .eq('id', existing.id);
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

async function upsertSet(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  requestId?: string,
) {
  const nativeName = normalised.nativeName ?? normalised.englishDisplayName;
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

  const row = {
    game_code: normalised.gameCode,
    language_code: normalised.languageCode,
    set_code: normalised.setCode ?? normalised.providerSetId ?? null,
    provider_set_code: normalised.providerSetId ?? normalised.setCode ?? null,
    native_name: nativeName,
    english_display_name: normalised.englishDisplayName,
    printed_total: normalised.printedTotal ?? null,
    total: normalised.total ?? normalised.printedTotal ?? null,
    source_updated_at: normalised.sourceUpdatedAt ?? null,
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
        proposed: row,
        existing: link.existing,
        notes: 'Provider set identifier already points to another canonical set.',
      });
      return { status: 'conflicted' as const };
    }
    const { error } = await table(db, 'catalog', 'sets').update(row).eq('id', match.setId);
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
      proposed: row,
    });
    return { status: 'updated' as const, setId: match.setId };
  }

  const { data, error } = await table(db, 'catalog', 'sets').insert(row).select('id').maybeSingle();
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
    proposed: row,
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

  const { data: healthyExactLanguageImage, error: healthyLookupError } = await table(db, 'catalog', 'assets')
    .select('id')
    .eq('variant_id', variantId)
    .eq('asset_type', normalised.assetType ?? 'card_image')
    .eq('rights_status', 'approved')
    .eq('publicly_servable', true)
    .is('deprecated_at', null)
    .limit(1);
  if (healthyLookupError) throw healthyLookupError;
  if ((healthyExactLanguageImage ?? []).length > 0) {
    return linkVariantAssetExternalId(healthyExactLanguageImage[0].id as string);
  }

  const imageSha256 = cleanText(normalised.imageSha256)?.toLowerCase();
  if (imageSha256) {
    const { data: duplicateBySha, error: duplicateShaError } = await table(db, 'catalog', 'assets')
      .select('id,variant_id')
      .eq('asset_type', 'card_image')
      .eq('rights_status', 'approved')
      .eq('publicly_servable', true)
      .eq('content_sha256', imageSha256)
      .is('deprecated_at', null)
      .is('deleted_at', null)
      .limit(1);
    if (duplicateShaError) throw duplicateShaError;
    const duplicate = duplicateBySha?.[0];
    if (duplicate?.id && duplicate.variant_id) {
      return duplicate.variant_id === variantId
        ? linkVariantAssetExternalId(duplicate.id as string)
        : linkSameArtworkAsset(duplicate.id as string, duplicate.variant_id as string);
    }
  }

  const imagePerceptualHash = cleanText(normalised.imagePerceptualHash)?.toLowerCase();
  if (imagePerceptualHash) {
    const { data: duplicateByPhash, error: duplicatePhashError } = await table(db, 'catalog', 'assets')
      .select('id,variant_id')
      .eq('asset_type', 'card_image')
      .eq('rights_status', 'approved')
      .eq('publicly_servable', true)
      .eq('perceptual_hash', imagePerceptualHash)
      .is('deprecated_at', null)
      .is('deleted_at', null)
      .limit(1);
    if (duplicatePhashError) throw duplicatePhashError;
    const duplicate = duplicateByPhash?.[0];
    if (duplicate?.id && duplicate.variant_id) {
      return duplicate.variant_id === variantId
        ? linkVariantAssetExternalId(duplicate.id as string)
        : linkSameArtworkAsset(duplicate.id as string, duplicate.variant_id as string);
    }
  }

  const { data: existing, error: lookupError } = await table(db, 'catalog', 'assets')
    .select('id')
    .eq('variant_id', variantId)
    .eq('source_id', sourceId)
    .eq('url', normalised.imageUrl)
    .limit(1);
  if (lookupError) throw lookupError;
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
    .select('id, printing_id, canonical_key')
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
  const identityVariantId = identityRows[0]?.id;
  if (externalVariantId && identityVariantId && externalVariantId !== identityVariantId) {
    const repaired = await tryRepairProviderVariantIdentity(db, {
      sourceId,
      normalised,
      externalVariantId,
      identityVariantId,
    });
    if (repaired) externalVariantId = identityVariantId;
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
      .select('id, printing_id, canonical_key, variant_code')
      .eq('id', existingVariant.id)
      .maybeSingle();
    if (variantError) throw variantError;

    let repairedProviderIdentity = false;
    if (externalVariantId && !identityVariantId && variant.canonical_key !== canonicalKey) {
      const printingVariants = await table(db, 'catalog', 'card_variants')
        .select('id')
        .eq('printing_id', variant.printing_id)
        .is('deprecated_at', null)
        .limit(2);
      if (printingVariants.error) throw printingVariants.error;
      const activeVariantIds = (printingVariants.data ?? []).map((row: { id: string }) => row.id);
      if (activeVariantIds.length !== 1 || activeVariantIds[0] !== variant.id) {
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
      native_name: normalised.nativeName,
      english_display_name: normalised.englishDisplayName,
      rarity_id: rarityId,
      source_updated_at: normalised.sourceUpdatedAt ?? null,
    };
    const { error: printingError } = await table(db, 'catalog', 'card_printings')
      .update(printingPatch)
      .eq('id', variant.printing_id);
    if (printingError) throw printingError;

    const variantPatch: Record<string, unknown> = {
      finish_code: normalised.finishCode ?? null,
      artwork_key: normalised.artworkKey ?? null,
      source_confidence: normalised.sourceConfidence,
      source_updated_at: normalised.sourceUpdatedAt ?? null,
    };
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
    native_name: normalised.nativeName,
    english_display_name: normalised.englishDisplayName,
    rarity_id: rarityId,
    source_updated_at: normalised.sourceUpdatedAt ?? null,
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
      ...printingPatch,
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
  const { data, error } = await table(db, 'catalog', 'card_variants')
    .select('id')
    .eq('canonical_key', canonicalKey)
    .is('deprecated_at', null)
    .limit(2);
  if (error) throw error;
  const variants = data ?? [];
  if (variants.length !== 1) {
    await quarantine(db, {
      sourceId,
      importRunId,
      rawRecordId,
      conflictType: variants.length > 1 ? 'identity_collision' : 'schema_conflict',
      proposed: normalised.raw,
      existing: { canonicalKey, variantIds: variants.map((variant: { id: string }) => variant.id) },
      notes: variants.length > 1
        ? 'Card image canonical identity resolves to multiple variants.'
        : 'Card image canonical variant is missing after metadata reconciliation.',
    });
    return { status: 'conflicted' as const };
  }

  const assetId = await upsertAssetForVariant(
    db,
    sourceId,
    importRunId,
    rawRecordId,
    normalised,
    variants[0].id,
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
    reason: 'card_image_attached_to_exact_canonical_variant',
    proposed: normalised.raw,
  });
  return { status: 'updated' as const, assetId };
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
  if (normalised.recordType === 'asset' && !hasCompleteCardImageIdentity(normalised)) {
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
