import { createHash, randomUUID } from 'node:crypto';
import {
  cleanText,
  normaliseName,
  proposedCanonicalKey,
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
  schema: (schema: string) => { from: (table: string) => any };
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
    options.runKey ?? new Date().toISOString().slice(0, 10),
  ].join(':').toLowerCase();
}

function recordKindsForCommand(adapter: SourceAdapter, options: ImportOptions) {
  const command = options.command ?? 'run_source';
  if (command === 'rebuild_record') return [adapter.fetchCards(options), adapter.fetchVariants(options), adapter.fetchAssets(options)];
  if (command === 'run_set') return [adapter.fetchCards(options), adapter.fetchVariants(options), adapter.fetchAssets(options)];
  return [adapter.fetchSets(options), adapter.fetchCards(options), adapter.fetchVariants(options), adapter.fetchAssets(options)];
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
      .update({ ...base, started_at: nowIso(), finished_at: null, error_message: null })
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
    source_updated_at: normalised.sourceUpdatedAt ?? null,
  };

  if (match.status === 'matched') {
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
  const { data: existing, error: lookupError } = await table(db, 'catalog', 'card_concepts')
    .select('id')
    .eq('game_code', normalised.gameCode)
    .eq('concept_key', conceptKey)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return existing.id as string;

  const { data, error } = await table(db, 'catalog', 'card_concepts')
    .insert({ game_code: normalised.gameCode, concept_key: conceptKey })
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
  rawRecordId: string,
  normalised: NormalisedRecord,
  variantId: string,
) {
  if (!normalised.imageUrl) return null;
  const { data: existing, error: lookupError } = await table(db, 'catalog', 'assets')
    .select('id')
    .eq('variant_id', variantId)
    .eq('source_id', sourceId)
    .eq('url', normalised.imageUrl)
    .limit(1);
  if (lookupError) throw lookupError;
  if ((existing ?? []).length > 0) return existing[0].id as string;

  const { data, error } = await table(db, 'catalog', 'assets')
    .insert({
      asset_type: normalised.assetType ?? 'card_image',
      game_code: normalised.gameCode,
      variant_id: variantId,
      source_id: sourceId,
      url: normalised.imageUrl,
      rights_status: normalised.licenceStatus === 'approved' ? 'approved' : 'under_review',
      publicly_servable: normalised.licenceStatus === 'approved',
      payload_hash: payloadChecksum({ url: normalised.imageUrl, providerRecordId: normalised.providerRecordId }),
      source_updated_at: normalised.sourceUpdatedAt ?? null,
    })
    .select('id')
    .maybeSingle();
  if (error) throw error;

  const link = await linkExternalId(db, {
    sourceId,
    rawRecordId,
    sourceEntityType: 'asset',
    externalId: `${normalised.providerRecordId}:asset`,
    languageCode: normalised.languageCode,
    assetId: data.id,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  if (link.status === 'conflict') return null;
  return data.id as string;
}

async function upsertCardVariant(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  requestId?: string,
) {
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

  const canonicalKey = proposedCanonicalKey({
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

  const externalVariantId = externalRows[0]?.variant_id;
  const identityVariantId = identityRows[0]?.id;
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

  const conceptId = await ensureConcept(db, normalised);
  const rarityId = await getRarityId(db, normalised.gameCode, normalised.rarityCode);
  const existingVariant = identityRows[0] ?? (externalVariantId ? { id: externalVariantId, printing_id: null } : null);

  if (existingVariant?.id) {
    const { data: variant, error: variantError } = await table(db, 'catalog', 'card_variants')
      .select('id, printing_id')
      .eq('id', existingVariant.id)
      .maybeSingle();
    if (variantError) throw variantError;

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

    const variantPatch = {
      finish_code: normalised.finishCode ?? null,
      artwork_key: normalised.artworkKey ?? null,
      source_confidence: normalised.sourceConfidence,
      source_updated_at: normalised.sourceUpdatedAt ?? null,
    };
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
    await upsertAssetForVariant(db, sourceId, rawRecordId, normalised, variant.id);
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
      reason: externalVariantId ? 'external_id_match' : 'canonical_identity_match',
      proposed: { printingPatch, variantPatch },
    });
    return { status: 'updated' as const, variantId: variant.id as string };
  }

  const { data: printing, error: printingError } = await table(db, 'catalog', 'card_printings')
    .insert({
      game_code: normalised.gameCode,
      set_id: setMatch.setId,
      language_code: normalised.languageCode,
      card_concept_id: conceptId,
      collector_number: normalised.collectorNumber,
      collector_number_prefix: normalised.collectorNumberPrefix,
      collector_number_sort: normalised.collectorNumberSort,
      collector_number_suffix: normalised.collectorNumberSuffix,
      collector_number_sort_key: normalised.collectorNumberSortKey,
      native_name: normalised.nativeName,
      english_display_name: normalised.englishDisplayName,
      rarity_id: rarityId,
      source_updated_at: normalised.sourceUpdatedAt ?? null,
    })
    .select('id')
    .maybeSingle();
  if (printingError) throw printingError;

  const { data: variant, error: variantError } = await table(db, 'catalog', 'card_variants')
    .insert({
      printing_id: printing.id,
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
    printingId: printing.id,
    variantId: variant.id,
    languageCode: normalised.languageCode,
    nameType: 'native',
    name: normalised.nativeName,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  await insertNameIfMissing(db, {
    printingId: printing.id,
    variantId: variant.id,
    languageCode: 'en',
    nameType: 'english_display',
    name: normalised.englishDisplayName,
    confidence: normalised.sourceConfidence,
    sourceUpdatedAt: normalised.sourceUpdatedAt,
  });
  await upsertAssetForVariant(db, sourceId, rawRecordId, normalised, variant.id);
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

async function reconcileRecord(
  db: SupabaseClientLike,
  sourceId: string,
  importRunId: string,
  rawRecordId: string,
  normalised: NormalisedRecord,
  requestId?: string,
) {
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
  if (['card', 'printing', 'variant', 'asset'].includes(normalised.recordType)) {
    return upsertCardVariant(db, sourceId, importRunId, rawRecordId, normalised, requestId);
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
    const sourceIdentity = this.adapter.identifySource();
    const source = await ensureSource(this.db, sourceIdentity);
    const health = await this.adapter.healthCheck(options);
    await recordHealth(this.db, source.id, health);
    if (['forbidden', 'unavailable', 'failed'].includes(health.status)) {
      return {
        ok: false,
        source: sourceIdentity.code,
        health,
        error: 'Provider is unavailable; import was not attempted.',
      };
    }

    const run = await startImportRun(this.db, source.id, this.adapter, options);
    const stats: ImportStats = {
      recordsRequested: 0,
      recordsRetrieved: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsConflicted: 0,
      decisions: 0,
    };

    try {
      const batches = recordKindsForCommand(this.adapter, options);
      const records = (await Promise.all(batches.map((batch) => collectRecords(batch)))).flat();
      const uniqueRecords = new Map<string, ProviderRecord>();
      for (const record of records) {
        uniqueRecords.set(`${record.recordType}:${record.languageCode ?? ''}:${record.providerRecordId}`, record);
      }

      stats.recordsRequested = uniqueRecords.size;
      for (const record of uniqueRecords.values()) {
        stats.recordsRetrieved += 1;
        const validation = await this.adapter.validateRecord(record);
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
            requestId: options.requestId,
            decisionType: 'quarantined',
            reason: 'raw_record_validation_failed',
            proposed: record.payload,
            existing: { validationIssues: issuePayload(validation.issues) },
          });
          stats.recordsConflicted += 1;
          continue;
        }

        await auditDecision(this.db, {
          sourceId: source.id,
          importRunId: run.id,
          rawRecordId: raw.id,
          requestId: options.requestId,
          decisionType: 'validated',
          reason: 'raw_record_validation_passed',
          proposed: record.payload,
        });

        const normalised = await this.adapter.normaliseRecord(record);
        const result = options.dryRun
          ? { status: 'skipped' as const }
          : await reconcileRecord(this.db, source.id, run.id, raw.id, normalised, options.requestId);
        if (result.status === 'inserted') stats.recordsInserted += 1;
        else if (result.status === 'updated') stats.recordsUpdated += 1;
        else if (result.status === 'conflicted') stats.recordsConflicted += 1;
        else stats.recordsSkipped += 1;
      }

      await finishImportRun(this.db, run.id, 'completed', stats);
      return { ok: true, source: sourceIdentity.code, importRunId: run.id, health, stats };
    } catch (error) {
      await finishImportRun(
        this.db,
        run.id,
        'failed',
        stats,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}

export async function enqueueWorkItem(
  db: SupabaseClientLike,
  input: {
    queueName: 'catalogue_ingestion' | 'asset_processing' | 'embedding_generation' | 'price_refresh' | 'conflict_review';
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
