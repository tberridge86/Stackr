import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSourceAdapter } from './catalogue-ingestion/adapters';
import {
  CatalogueIngestionRunner,
  ensureSource,
} from './catalogue-ingestion/pipeline';
import { fetchCatalogueQualityReport } from './catalogue-ingestion/qualityReport';
import {
  cleanText,
  normaliseLanguageCode,
  type ProviderRecord,
} from './catalogue-ingestion/sourceAdapter';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const APPROVAL_BASIS = 'user_attested_full_access_2026-08-18';
const RUN_VERSION = 'full-metadata-v1';
const SUPPORTED_SOURCES = new Set(['tcgdex', 'pokemon-tcg-api']);
const RETRYABLE_MESSAGE = /(timeout|timed out|rate limit|429|408|425|500|502|503|504|ECONNRESET|ENETUNREACH|fetch failed)/i;

type SetResult = {
  providerSetId: string;
  status: 'completed' | 'skipped_completed' | 'failed';
  attempts: number;
  durationMs: number;
  result?: unknown;
  error?: string;
};

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function integerArg(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(arg(name, String(fallback)));
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function normaliseSource(value: unknown) {
  const source = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  const canonical = source === 'pokemon-tcg' || source === 'pokemontcg'
    ? 'pokemon-tcg-api'
    : source;
  if (!SUPPORTED_SOURCES.has(canonical)) {
    throw new Error('Metadata backfill supports --source=tcgdex or --source=pokemon-tcg-api.');
  }
  return canonical;
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

  if (!url || !key) {
    throw new Error('SUPABASE_URL and backend-only service credentials are required.');
  }
  if (target !== 'staging') {
    throw new Error('Full metadata backfill is staging-only. Set STACKR_CATALOGUE_IMPORT_TARGET=staging.');
  }
  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Full metadata backfill requires StackR staging project ${STAGING_SUPABASE_REF}.`);
  }
  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing metadata backfill against production project ${PRODUCTION_SUPABASE_REF}.`);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function canonicalRunKey(source: string, language: string, setId: string) {
  return [
    source,
    'run_source',
    language,
    setId,
    'all',
    'metadata',
    RUN_VERSION,
  ].join(':').toLowerCase();
}

async function completedRunKeys(
  db: SupabaseClient,
  sourceId: string,
  source: string,
  language: string,
) {
  const prefix = `${source}:run_source:${language}:`;
  const suffix = `:all:metadata:${RUN_VERSION}`;
  const { data, error } = await db
    .schema('ingest')
    .from('import_runs')
    .select('run_key')
    .eq('source_id', sourceId)
    .eq('status', 'completed')
    .like('run_key', `${prefix}%${suffix}`)
    .limit(10_000);
  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.run_key ?? '').toLowerCase()).filter(Boolean));
}

async function runSetWithRetry(
  runner: CatalogueIngestionRunner,
  input: {
    source: string;
    language: string;
    setId: string;
    writeConcurrency: number;
    maxAttempts: number;
    requestPrefix: string;
  },
): Promise<SetResult> {
  const startedAt = Date.now();
  let lastError = '';

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    try {
      const result = await runner.run({
        command: 'run_source',
        importType: 'full',
        language: input.language,
        setId: input.setId,
        runKey: RUN_VERSION,
        requestId: `${input.requestPrefix}:${input.setId}:attempt-${attempt}`,
        allowImageAssets: false,
        approvedOnlyAssets: true,
        writeConcurrency: input.writeConcurrency,
      });
      return {
        providerSetId: input.setId,
        status: 'completed',
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        result,
      };
    } catch (error) {
      lastError = errorMessage(error);
      const retryable = RETRYABLE_MESSAGE.test(lastError);
      if (!retryable || attempt >= input.maxAttempts) break;
      await sleep(Math.min(2_000 * (2 ** (attempt - 1)), 20_000));
    }
  }

  return {
    providerSetId: input.setId,
    status: 'failed',
    attempts: input.maxAttempts,
    durationMs: Date.now() - startedAt,
    error: lastError || 'metadata_set_import_failed',
  };
}

function printHelp() {
  console.log(`StackR metadata-only provider backfill

Usage:
  npx --no-install tsx scripts/sync-provider-metadata-shard.ts \\
    --source=tcgdex --language=ja --shardIndex=0 --shardCount=4

Options:
  --source=tcgdex|pokemon-tcg-api
  --language=en|ja|zh-cn|zh-tw|ko
  --shardIndex=0
  --shardCount=1
  --maxSets=<optional canary limit>
  --writeConcurrency=4
  --maxAttempts=3
  --output=reports/catalogue/metadata-backfill/report.json
  --force                 Re-run already completed deterministic set runs.
  --allowPartial          Do not fail the process when individual sets fail.

This worker imports metadata only. Card images, set logos and symbols are not requested.`);
}

export async function runProviderMetadataShard() {
  if (hasFlag('help')) {
    printHelp();
    return;
  }

  const source = normaliseSource(arg('source'));
  const language = normaliseLanguageCode(arg('language', 'en'));
  if (source === 'pokemon-tcg-api' && language !== 'en') {
    throw new Error('Pokémon TCG Developers API is English-only in StackR. Use TCGdex for Japanese, Chinese and Korean.');
  }

  const shardCount = integerArg('shardCount', 1, 1, 32);
  const shardIndex = integerArg('shardIndex', 0, 0, shardCount - 1);
  const writeConcurrency = integerArg('writeConcurrency', 4, 1, 16);
  const maxAttempts = integerArg('maxAttempts', 3, 1, 5);
  const maxSetsRaw = arg('maxSets');
  const maxSets = maxSetsRaw ? integerArg('maxSets', 1, 1, 10_000) : null;
  const outputPath = path.resolve(arg(
    'output',
    `reports/catalogue/metadata-backfill/${source}-${language}-shard-${shardIndex}-of-${shardCount}.json`,
  ));
  const force = hasFlag('force');
  const requestPrefix = [
    'metadata-backfill',
    process.env.GITHUB_RUN_ID ?? process.env.RAILWAY_DEPLOYMENT_ID ?? Date.now(),
    process.env.GITHUB_RUN_ATTEMPT ?? '1',
    source,
    language,
    shardIndex,
  ].join(':');

  const db = stagingClient();
  const adapter = createSourceAdapter({
    source,
    language,
    licenceStatus: 'approved',
    assetLicenceStatus: 'under_review',
  });
  const identity = adapter.identifySource();
  const sourceRow = await ensureSource(db, identity);
  const health = await adapter.healthCheck({ language, limit: 1 });
  if (health.status !== 'ok' && health.status !== 'degraded') {
    throw new Error(`${source} health check failed: ${health.message ?? health.status}`);
  }

  const before = await fetchCatalogueQualityReport(db, { language, limit: 1000 });
  const allSetRecords = await collectRecords(adapter.fetchSets({ language }));
  const allSetIds = [...new Set(allSetRecords
    .map((record) => cleanText(record.providerRecordId))
    .filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, 'en'));
  const shardedSetIds = allSetIds.filter((_setId, index) => index % shardCount === shardIndex);
  const selectedSetIds = maxSets == null ? shardedSetIds : shardedSetIds.slice(0, maxSets);
  const completedKeys = force
    ? new Set<string>()
    : await completedRunKeys(db, sourceRow.id, source, language);
  const runner = new CatalogueIngestionRunner(db, adapter);
  const results: SetResult[] = [];

  for (const setId of selectedSetIds) {
    const runKey = canonicalRunKey(source, language, setId);
    if (completedKeys.has(runKey)) {
      results.push({
        providerSetId: setId,
        status: 'skipped_completed',
        attempts: 0,
        durationMs: 0,
      });
      continue;
    }
    const result = await runSetWithRetry(runner, {
      source,
      language,
      setId,
      writeConcurrency,
      maxAttempts,
      requestPrefix,
    });
    results.push(result);
  }

  const after = await fetchCatalogueQualityReport(db, { language, limit: 1000 });
  const completed = results.filter((result) => result.status === 'completed').length;
  const skippedCompleted = results.filter((result) => result.status === 'skipped_completed').length;
  const failures = results.filter((result) => result.status === 'failed');
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source,
    language,
    metadataOnly: true,
    approvalBasis: APPROVAL_BASIS,
    apiKeyConfigured: source === 'pokemon-tcg-api'
      ? Boolean(process.env.POKEMON_TCG_API_KEY)
      : null,
    shard: { index: shardIndex, count: shardCount },
    setCounts: {
      providerTotal: allSetIds.length,
      assignedToShard: shardedSetIds.length,
      selected: selectedSetIds.length,
      completed,
      skippedCompleted,
      failed: failures.length,
    },
    providerHealth: health,
    qualityBefore: before.summary,
    qualityAfter: after.summary,
    failures: failures.map((failure) => ({
      providerSetId: failure.providerSetId,
      attempts: failure.attempts,
      error: failure.error,
    })),
    results,
    environment: {
      commitSha: process.env.GITHUB_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
      workflowRunId: process.env.GITHUB_RUN_ID ?? null,
      workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: failures.length === 0,
    source,
    language,
    shard: report.shard,
    setCounts: report.setCounts,
    outputPath,
  }, null, 2));

  if (failures.length > 0 && !hasFlag('allowPartial')) process.exitCode = 1;
}

runProviderMetadataShard().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: errorMessage(error),
  }, null, 2));
  process.exitCode = 1;
});
