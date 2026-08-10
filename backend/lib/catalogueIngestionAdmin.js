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

function clean(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
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
  const source = clean(input.source);
  const language = normaliseCatalogueLanguage(input.language);
  const sourceId = await sourceIdForCode(supabase, source);
  const normalizedInput = { ...input, language };
  const idempotencyKey = clean(input.idempotencyKey) ?? queueKey(command, normalizedInput);
  const requestId = clean(input.requestId) ?? randomUUID();
  const row = {
    queue_name: 'catalogue_ingestion',
    source_id: sourceId,
    command,
    idempotency_key: idempotencyKey,
    priority: Number(input.priority ?? 60),
    run_after: clean(input.runAfter) ?? new Date().toISOString(),
    payload: {
      source,
      language,
      setId: clean(input.setId),
      providerRecordId: clean(input.providerRecordId),
      runKey: clean(input.runKey),
      dryRun: input.dryRun === true,
      allowImageAssets: input.allowImageAssets === true,
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
    return { id: existing.id, status: 'updated', idempotencyKey, requestId, command };
  }

  const { data, error } = await supabase
    .schema('ingest')
    .from('work_queue')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { id: data.id, status: 'inserted', idempotencyKey, requestId, command };
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
