import type { SupabaseClient } from '@supabase/supabase-js';

const MIRROR_SOURCES = new Set(['tcgdex', 'pokemon-tcg-api']);
const COMMAND_SLUGS = new Map([
  ['run_source', 'run-source'],
  ['run_language', 'run-language'],
  ['run_set', 'run-set'],
  ['resume_import', 'resume-import'],
  ['rebuild_record', 'rebuild-record'],
]);
const LICENCE_STATUSES = new Set(['approved', 'under_review', 'restricted', 'denied', 'unknown']);
const LANGUAGE_CODES = new Set(['en', 'ja', 'zh-tw', 'zh-cn', 'ko']);

export type CatalogueQueuePayload = {
  source?: unknown;
  language?: unknown;
  setId?: unknown;
  providerRecordId?: unknown;
  runKey?: unknown;
  dryRun?: unknown;
  allowImageAssets?: unknown;
  approvedOnlyAssets?: unknown;
  offset?: unknown;
  limit?: unknown;
  writeConcurrency?: unknown;
  licenceStatus?: unknown;
  assetLicenceStatus?: unknown;
};

export type CatalogueQueueItem = {
  id: string;
  command: string;
  payload: CatalogueQueuePayload | null;
  request_id?: string | null;
  attempts: number;
  max_attempts: number;
};

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function booleanValue(value: unknown): boolean {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

function integerValue(
  value: unknown,
  fallback: number | null,
  minimum: number,
  maximum: number,
  fieldName: string,
): number | null {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${fieldName} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function sourceValue(value: unknown): string {
  const raw = clean(value)?.toLowerCase().replace(/_/g, '-');
  const source = raw === 'pokemontcg' || raw === 'pokemon-tcg' ? 'pokemon-tcg-api' : raw;
  if (!source || !MIRROR_SOURCES.has(source)) {
    throw new Error('Catalogue mirror queue supports tcgdex and pokemon-tcg-api only.');
  }
  return source;
}

function languageValue(value: unknown, source: string): string {
  const language = (clean(value) ?? 'en').toLowerCase().replace(/_/g, '-');
  if (!LANGUAGE_CODES.has(language)) {
    throw new Error(`Unsupported catalogue language: ${language}.`);
  }
  if (source === 'pokemon-tcg-api' && language !== 'en') {
    throw new Error('Pokemon TCG API may only reconcile the English catalogue.');
  }
  return language;
}

function optionalLicence(value: unknown, fieldName: string): string | null {
  const status = clean(value);
  if (!status) return null;
  if (!LICENCE_STATUSES.has(status)) throw new Error(`${fieldName} is invalid.`);
  return status;
}

export function buildCatalogueMirrorCliArgs(item: CatalogueQueueItem): string[] {
  const command = COMMAND_SLUGS.get(clean(item.command) ?? '');
  if (!command) throw new Error(`Unsupported catalogue queue command: ${item.command}.`);
  const payload = item.payload ?? {};
  const source = sourceValue(payload.source);
  const language = languageValue(payload.language, source);
  const setId = clean(payload.setId);
  const providerRecordId = clean(payload.providerRecordId);
  const runKey = clean(payload.runKey);
  const requestId = clean(item.request_id) ?? `catalogue-queue:${item.id}`;
  const offset = integerValue(payload.offset, 0, 0, 10_000_000, 'offset');
  const limit = integerValue(payload.limit, null, 1, 100_000, 'limit');
  const writeConcurrency = integerValue(payload.writeConcurrency, 1, 1, 16, 'writeConcurrency');
  const licenceStatus = optionalLicence(payload.licenceStatus, 'licenceStatus');
  const assetLicenceStatus = optionalLicence(payload.assetLicenceStatus, 'assetLicenceStatus');

  if (command === 'run-set' && !setId) throw new Error('run_set queue work requires setId.');
  if (command === 'resume-import' && !runKey) throw new Error('resume_import queue work requires runKey.');
  if (command === 'rebuild-record' && !providerRecordId) {
    throw new Error('rebuild_record queue work requires providerRecordId.');
  }

  const args = [
    'scripts/catalogue-ingest.ts',
    command,
    `--source=${source}`,
    `--language=${language}`,
    '--target=staging',
    `--requestId=${requestId}`,
    `--offset=${offset}`,
    `--writeConcurrency=${writeConcurrency}`,
  ];
  if (setId) args.push(`--setId=${setId}`);
  if (providerRecordId) args.push(`--providerRecordId=${providerRecordId}`);
  if (runKey) args.push(`--runKey=${runKey}`);
  if (limit != null) args.push(`--limit=${limit}`);
  if (licenceStatus) args.push(`--licenceStatus=${licenceStatus}`);
  if (assetLicenceStatus) args.push(`--assetLicenceStatus=${assetLicenceStatus}`);
  if (booleanValue(payload.dryRun)) args.push('--dryRun');
  if (booleanValue(payload.allowImageAssets)) args.push('--allowImageAssets');
  if (booleanValue(payload.approvedOnlyAssets)) args.push('--approvedOnlyAssets');
  return args;
}

export function queueRetryDelaySeconds(attempts: number): number {
  const safeAttempts = Math.max(1, Math.min(Number(attempts) || 1, 10));
  return Math.min(60 * (2 ** (safeAttempts - 1)), 3600);
}

export function boundedQueueError(value: unknown, maximum = 3000): string {
  const text = value instanceof Error ? value.message : String(value ?? 'catalogue_queue_worker_failed');
  return text.length <= maximum ? text : `${text.slice(0, maximum)}…`;
}

export async function recoverStaleCatalogueClaims(
  supabase: SupabaseClient,
  now = new Date(),
  staleAfterMinutes = 120,
): Promise<number> {
  const cutoff = new Date(now.getTime() - Math.max(15, staleAfterMinutes) * 60_000).toISOString();
  const { data, error } = await supabase
    .schema('ingest')
    .from('work_queue')
    .select('id, attempts, max_attempts')
    .eq('queue_name', 'catalogue_ingestion')
    .eq('status', 'claimed')
    .lt('claimed_at', cutoff)
    .limit(100);
  if (error) throw error;

  let recovered = 0;
  for (const row of data ?? []) {
    const exhausted = Number(row.attempts ?? 0) >= Number(row.max_attempts ?? 5);
    const update = exhausted
      ? {
          status: 'failed',
          failed_at: now.toISOString(),
          last_error: 'catalogue_queue_claim_timed_out',
          claimed_at: null,
          claimed_by: null,
        }
      : {
          status: 'pending',
          run_after: new Date(now.getTime() + queueRetryDelaySeconds(Number(row.attempts ?? 1)) * 1000).toISOString(),
          last_error: 'catalogue_queue_claim_timed_out',
          claimed_at: null,
          claimed_by: null,
        };
    const { data: changed, error: updateError } = await supabase
      .schema('ingest')
      .from('work_queue')
      .update(update)
      .eq('id', row.id)
      .eq('status', 'claimed')
      .lt('claimed_at', cutoff)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (changed?.id) recovered += 1;
  }
  return recovered;
}

export async function claimNextCatalogueQueueItem(
  supabase: SupabaseClient,
  workerId: string,
  now = new Date(),
): Promise<CatalogueQueueItem | null> {
  const timestamp = now.toISOString();
  const { data: candidates, error } = await supabase
    .schema('ingest')
    .from('work_queue')
    .select('id, command, payload, request_id, attempts, max_attempts')
    .eq('queue_name', 'catalogue_ingestion')
    .eq('status', 'pending')
    .lte('run_after', timestamp)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) throw error;

  for (const candidate of candidates ?? []) {
    const nextAttempts = Number(candidate.attempts ?? 0) + 1;
    const { data: claimed, error: claimError } = await supabase
      .schema('ingest')
      .from('work_queue')
      .update({
        status: 'claimed',
        attempts: nextAttempts,
        claimed_at: timestamp,
        claimed_by: workerId,
        last_error: null,
      })
      .eq('id', candidate.id)
      .eq('status', 'pending')
      .lte('run_after', timestamp)
      .select('id, command, payload, request_id, attempts, max_attempts')
      .maybeSingle();
    if (claimError) throw claimError;
    if (claimed?.id) return claimed as CatalogueQueueItem;
  }
  return null;
}

export async function completeCatalogueQueueItem(
  supabase: SupabaseClient,
  item: CatalogueQueueItem,
  workerId: string,
  now = new Date(),
): Promise<void> {
  const { data, error } = await supabase
    .schema('ingest')
    .from('work_queue')
    .update({
      status: 'completed',
      completed_at: now.toISOString(),
      claimed_at: null,
      claimed_by: null,
      last_error: null,
    })
    .eq('id', item.id)
    .eq('status', 'claimed')
    .eq('claimed_by', workerId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Catalogue queue item ${item.id} claim was lost before completion.`);
}

export async function failCatalogueQueueItem(
  supabase: SupabaseClient,
  item: CatalogueQueueItem,
  workerId: string,
  failure: unknown,
  now = new Date(),
): Promise<'pending' | 'failed'> {
  const exhausted = Number(item.attempts) >= Number(item.max_attempts);
  const status = exhausted ? 'failed' : 'pending';
  const update = exhausted
    ? {
        status,
        failed_at: now.toISOString(),
        claimed_at: null,
        claimed_by: null,
        last_error: boundedQueueError(failure),
      }
    : {
        status,
        run_after: new Date(now.getTime() + queueRetryDelaySeconds(item.attempts) * 1000).toISOString(),
        claimed_at: null,
        claimed_by: null,
        last_error: boundedQueueError(failure),
      };
  const { data, error } = await supabase
    .schema('ingest')
    .from('work_queue')
    .update(update)
    .eq('id', item.id)
    .eq('status', 'claimed')
    .eq('claimed_by', workerId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Catalogue queue item ${item.id} claim was lost before failure handling.`);
  return status;
}

export const catalogueQueueWorkerInternals = {
  COMMAND_SLUGS,
  LANGUAGE_CODES,
  MIRROR_SOURCES,
  booleanValue,
  integerValue,
  languageValue,
  sourceValue,
};
