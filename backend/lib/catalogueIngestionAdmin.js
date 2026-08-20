import { randomUUID } from 'node:crypto';

const COMMANDS = new Map([
  ['run-source', 'run_source'],
  ['run-language', 'run_language'],
  ['run-set', 'run_set'],
  ['resume-import', 'resume_import'],
  ['rebuild-record', 'rebuild_record'],
]);
const SUPPORTED_CATALOGUE_LANGUAGE_CODES = new Set(['en', 'ja', 'zh-tw', 'zh-cn', 'ko']);
const PRODUCTION_SUPABASE_REFS = new Set(['oakdbbzdqwurpjnoqhmu']);
const SOURCE_ALIASES = new Map([
  ['pokemon-tcg', 'pokemon-tcg-api'],
  ['pokemontcg', 'pokemon-tcg-api'],
  ['pokemon_tcg_api', 'pokemon-tcg-api'],
  ['tcg-dex', 'tcgdex'],
]);
const SUPPORTED_SOURCE_CODES = new Set([
  'manual-csv',
  'manual-json',
  'tcgdex',
  'pokemon-tcg-api',
  'pikaqian',
  'ximilar-residual-scans',
]);

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

function booleanValue(value) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

function boundedInteger(value, fallback, minimum, maximum, fieldName) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    const error = new Error(`${fieldName} must be an integer from ${minimum} to ${maximum}.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

export function normaliseCatalogueSource(value) {
  const raw = clean(value);
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/_/g, '-');
  const source = SOURCE_ALIASES.get(compact) ?? compact;
  if (SUPPORTED_SOURCE_CODES.has(source)) return source;
  const error = new Error(`Unsupported catalogue source: ${raw}. Use one of: ${[...SUPPORTED_SOURCE_CODES].join(', ')}.`);
  error.status = 400;
  error.code = 'unsupported_catalogue_source';
  error.fatal = true;
  throw error;
}

function normaliseCatalogueLanguage(value) {
  const raw = clean(value);
  if (!raw) return null;
  const language = raw.toLowerCase().replace(/_/g, '-');
  if (SUPPORTED_CATALOGUE_LANGUAGE_CODES.has(language)) return language;
  const error = new Error(`Unsupported catalogue language: ${raw}. Use one of: ${[...SUPPORTED_CATALOGUE_LANGUAGE_CODES].join(', ')}.`);
  error.status = 400;
  error.code = 'unsupported_catalogue_language';
  error.fatal = true;
  throw error;
}

function requireStagingTarget() {
  const target = clean(process.env.STACKR_CATALOGUE_IMPORT_TARGET || process.env.STACKR_IMPORT_TARGET)?.toLowerCase();
  if (target !== 'staging') {
    const error = new Error('Catalogue ingestion queue writes must target staging.');
    error.status = 409;
    throw error;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  for (const ref of PRODUCTION_SUPABASE_REFS) {
    if (supabaseUrl.includes(ref)) {
      const error = new Error(`Refusing catalogue ingestion queue write against production Supabase project ${ref}.`);
      error.status = 409;
      throw error;
    }
  }
}

function queueKey(command, input = {}) {
  return [
    'catalogue_ingestion',
    command,
    clean(input.source) ?? 'unknown-source',
    clean(input.language) ?? 'all-languages',
    clean(input.setId) ?? 'all-sets',
    clean(input.providerRecordId) ?? 'all-records',
    clean(input.runKey) ?? new Date().toISOString().slice(0, 10),
  ].join(':').toLowerCase();
}

async function sourceIdForCode(supabase, sourceCode) {
  if (!sourceCode) return null;
  const { data, error } = await supabase
    .schema('ingest')
    .from('sources')
    .select('id')
    .eq('code', sourceCode)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function enqueueCatalogueIngestionCommand(supabase, commandSlug, input = {}) {
  const command = COMMANDS.get(commandSlug);
  if (!command) {
    const error = new Error(`Unsupported catalogue ingestion command: ${commandSlug}`);
    error.status = 400;
    throw error;
  }

  requireStagingTarget();
  const source = normaliseCatalogueSource(input.source);
  let language = normaliseCatalogueLanguage(input.language);
  if (source === 'pokemon-tcg-api') {
    language = language ?? 'en';
    if (language !== 'en') {
      const error = new Error('Pokemon TCG API may only reconcile the English catalogue. Use TCGdex for multilingual imports.');
      error.status = 400;
      error.code = 'pokemon_tcg_api_english_only';
      throw error;
    }
  }

  const sourceId = await sourceIdForCode(supabase, source);
  const offset = boundedInteger(input.offset, 0, 0, 10_000_000, 'offset');
  const limit = boundedInteger(input.limit, null, 1, 100_000, 'limit');
  const writeConcurrency = boundedInteger(input.writeConcurrency, 1, 1, 16, 'writeConcurrency');
  const normalizedInput = { ...input, source, language };
  const idempotencyKey = clean(input.idempotencyKey) ?? queueKey(command, normalizedInput);
  const requestId = clean(input.requestId) ?? randomUUID();
  const row = {
    queue_name: 'catalogue_ingestion',
    source_id: sourceId,
    command,
    idempotency_key: idempotencyKey,
    priority: boundedInteger(input.priority, 60, 1, 100, 'priority'),
    run_after: clean(input.runAfter) ?? new Date().toISOString(),
    payload: {
      source,
      language,
      setId: clean(input.setId),
      providerRecordId: clean(input.providerRecordId),
      runKey: clean(input.runKey),
      dryRun: booleanValue(input.dryRun),
      allowImageAssets: booleanValue(input.allowImageAssets),
      approvedOnlyAssets: booleanValue(input.approvedOnlyAssets),
      offset,
      limit,
      writeConcurrency,
      licenceStatus: clean(input.licenceStatus),
      assetLicenceStatus: clean(input.assetLicenceStatus),
    },
    request_id: requestId,
    status: 'pending',
  };

  const { data: existing, error: lookupError } = await supabase
    .schema('ingest')
    .from('work_queue')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await supabase
      .schema('ingest')
      .from('work_queue')
      .update(row)
      .eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, status: 'updated', idempotencyKey, requestId, command, source, language };
  }

  const { data, error } = await supabase
    .schema('ingest')
    .from('work_queue')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { id: data.id, status: 'inserted', idempotencyKey, requestId, command, source, language };
}

export async function listQuarantinedConflicts(supabase, input = {}) {
  let query = supabase
    .schema('ingest')
    .from('data_conflicts')
    .select('id, source_id, import_run_id, raw_record_id, conflict_type, severity, canonical_key, proposed_payload, existing_payload, created_at')
    .in('status', ['open', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(input.limit ?? 50), 250)));

  if (clean(input.sourceId)) query = query.eq('source_id', clean(input.sourceId));
  if (clean(input.conflictType)) query = query.eq('conflict_type', clean(input.conflictType));

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCatalogueQualityReport(supabase, input = {}) {
  let query = supabase
    .schema('ingest')
    .from('catalogue_quality_report')
    .select('*')
    .order('language_code', { ascending: true })
    .order('native_name', { ascending: true })
    .limit(Math.max(1, Math.min(Number(input.limit ?? 500), 1000)));

  if (clean(input.language)) query = query.eq('language_code', clean(input.language));

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
