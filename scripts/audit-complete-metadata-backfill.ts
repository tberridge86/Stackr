import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSourceAdapter } from './catalogue-ingestion/adapters';
import { fetchCatalogueQualityReport } from './catalogue-ingestion/qualityReport';
import { cleanText, type ProviderRecord } from './catalogue-ingestion/sourceAdapter';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const RUN_VERSION = 'full-metadata-v1';
const PROVIDER_SCOPES = [
  { source: 'tcgdex', language: 'en', role: 'primary' },
  { source: 'tcgdex', language: 'ja', role: 'primary' },
  { source: 'tcgdex', language: 'zh-cn', role: 'primary' },
  { source: 'tcgdex', language: 'zh-tw', role: 'primary' },
  { source: 'tcgdex', language: 'ko', role: 'primary' },
  { source: 'pokemon-tcg-api', language: 'en', role: 'secondary_reconciliation' },
] as const;

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function stagingClient() {
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? process.env.SUPABASE_SECRET_KEY
      ?? '',
  ).trim();
  const target = String(
    process.env.STACKR_CATALOGUE_IMPORT_TARGET
      ?? process.env.STACKR_IMPORT_TARGET
      ?? '',
  ).trim().toLowerCase();

  if (!url || !key) throw new Error('SUPABASE_URL and backend-only service credentials are required.');
  if (target !== 'staging') throw new Error('Metadata audit is staging-only.');
  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Metadata audit requires StackR staging project ${STAGING_SUPABASE_REF}.`);
  }
  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing metadata audit against production project ${PRODUCTION_SUPABASE_REF}.`);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function collectRecords(
  records: AsyncIterable<ProviderRecord> | Promise<ProviderRecord[]> | ProviderRecord[],
): Promise<ProviderRecord[]> {
  const resolved = await records;
  if (Array.isArray(resolved)) return resolved;
  const output: ProviderRecord[] = [];
  for await (const record of resolved) output.push(record);
  return output;
}

function expectedRunKey(source: string, language: string, setId: string) {
  return [source, 'run_source', language, setId, 'all', 'metadata', RUN_VERSION]
    .join(':')
    .toLowerCase();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metadataGapEntries(summary: Record<string, unknown>) {
  return Object.entries(summary)
    .filter(([key, value]) => {
      const lower = key.toLowerCase();
      return lower.includes('missing')
        && !/(image|logo|symbol|artwork|price|market)/.test(lower)
        && numberValue(value) > 0;
    })
    .map(([key, value]) => ({ key, count: numberValue(value) }));
}

async function sourceRow(db: SupabaseClient, sourceCode: string) {
  const { data, error } = await db
    .schema('ingest')
    .from('sources')
    .select('id, code, licence_status, active')
    .eq('code', sourceCode)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function importRuns(
  db: SupabaseClient,
  sourceId: string,
  source: string,
  language: string,
) {
  const { data, error } = await db
    .schema('ingest')
    .from('import_runs')
    .select('id, run_key, status, records_requested, records_retrieved, records_inserted, records_updated, records_skipped, records_conflicted, error_message, started_at, finished_at')
    .eq('source_id', sourceId)
    .like('run_key', `${source}:run_source:${language}:%:all:metadata:${RUN_VERSION}`)
    .limit(10_000);
  if (error) throw error;
  return data ?? [];
}

async function countRawRecords(
  db: SupabaseClient,
  sourceId: string,
  language: string,
  recordType: string,
) {
  const { count, error } = await db
    .schema('ingest')
    .from('raw_source_records')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)
    .eq('language_code', language)
    .eq('record_type', recordType);
  if (error) throw error;
  return count ?? 0;
}

async function countOpenConflicts(
  db: SupabaseClient,
  sourceId: string,
) {
  const { count, error } = await db
    .schema('ingest')
    .from('data_conflicts')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)
    .in('status', ['open', 'in_review']);
  if (error) throw error;
  return count ?? 0;
}

export async function auditCompleteMetadataBackfill() {
  const db = stagingClient();
  const outputPath = path.resolve(arg(
    'output',
    'reports/catalogue/metadata-backfill/complete-metadata-audit.json',
  ));
  const scopes = [];

  for (const scope of PROVIDER_SCOPES) {
    const adapter = createSourceAdapter({
      source: scope.source,
      language: scope.language,
      licenceStatus: 'approved',
      assetLicenceStatus: 'under_review',
    });
    const health = await adapter.healthCheck({ language: scope.language, limit: 1 });
    const setRecords = await collectRecords(adapter.fetchSets({ language: scope.language }));
    const providerSetIds = [...new Set(setRecords
      .map((record) => cleanText(record.providerRecordId))
      .filter((value): value is string => Boolean(value)))]
      .sort((a, b) => a.localeCompare(b, 'en'));
    const source = await sourceRow(db, scope.source);
    const runs = source?.id
      ? await importRuns(db, source.id, scope.source, scope.language)
      : [];
    const runByKey = new Map(runs.map((run) => [String(run.run_key).toLowerCase(), run]));
    const missingSetRuns = providerSetIds.filter((setId) => {
      const run = runByKey.get(expectedRunKey(scope.source, scope.language, setId));
      return !run || run.status !== 'completed';
    });
    const failedRuns = runs.filter((run) => run.status === 'failed');
    const incompleteRuns = runs.filter((run) => !['completed', 'failed'].includes(run.status));
    const totals = runs.reduce((acc, run) => ({
      requested: acc.requested + numberValue(run.records_requested),
      retrieved: acc.retrieved + numberValue(run.records_retrieved),
      inserted: acc.inserted + numberValue(run.records_inserted),
      updated: acc.updated + numberValue(run.records_updated),
      skipped: acc.skipped + numberValue(run.records_skipped),
      conflicted: acc.conflicted + numberValue(run.records_conflicted),
    }), { requested: 0, retrieved: 0, inserted: 0, updated: 0, skipped: 0, conflicted: 0 });

    scopes.push({
      source: scope.source,
      language: scope.language,
      role: scope.role,
      providerHealth: health,
      providerSetCount: providerSetIds.length,
      completedSetRuns: providerSetIds.length - missingSetRuns.length,
      missingSetRunCount: missingSetRuns.length,
      missingSetRuns,
      failedRunCount: failedRuns.length,
      failedRuns: failedRuns.map((run) => ({
        runKey: run.run_key,
        error: run.error_message,
      })),
      incompleteRunCount: incompleteRuns.length,
      importTotals: totals,
      rawRecords: source?.id ? {
        sets: await countRawRecords(db, source.id, scope.language, 'set'),
        cards: await countRawRecords(db, source.id, scope.language, 'card'),
        variants: await countRawRecords(db, source.id, scope.language, 'variant'),
      } : { sets: 0, cards: 0, variants: 0 },
      openConflicts: source?.id ? await countOpenConflicts(db, source.id) : 0,
      sourceRegistration: source,
      complete: health.status === 'ok'
        && missingSetRuns.length === 0
        && failedRuns.length === 0
        && incompleteRuns.length === 0,
    });
  }

  const languageReports = [];
  for (const language of ['en', 'ja', 'zh-cn', 'zh-tw', 'ko']) {
    const report = await fetchCatalogueQualityReport(db, { language, limit: 1000 });
    languageReports.push({
      language,
      summary: report.summary,
      metadataGaps: metadataGapEntries(report.summary as Record<string, unknown>),
      sets: report.rows,
    });
  }

  const primaryScopes = scopes.filter((scope) => scope.role === 'primary');
  const primaryComplete = primaryScopes.every((scope) => scope.complete);
  const metadataGapCount = languageReports.reduce(
    (total, report) => total + report.metadataGaps.reduce((sum, gap) => sum + gap.count, 0),
    0,
  );
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: 'staging',
    metadataOnly: true,
    complete: primaryComplete && metadataGapCount === 0,
    primaryProviderComplete: primaryComplete,
    metadataGapCount,
    providerScopes: scopes,
    languageReports,
    environment: {
      commitSha: process.env.GITHUB_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
      workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    complete: result.complete,
    primaryProviderComplete: result.primaryProviderComplete,
    metadataGapCount,
    outputPath,
    providerScopes: scopes.map((scope) => ({
      source: scope.source,
      language: scope.language,
      providerSetCount: scope.providerSetCount,
      completedSetRuns: scope.completedSetRuns,
      missingSetRunCount: scope.missingSetRunCount,
      failedRunCount: scope.failedRunCount,
      openConflicts: scope.openConflicts,
    })),
  }, null, 2));

  if (hasFlag('strict') && !result.complete) process.exitCode = 1;
  return result;
}

auditCompleteMetadataBackfill().catch((error) => {
  console.error(JSON.stringify({
    complete: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
