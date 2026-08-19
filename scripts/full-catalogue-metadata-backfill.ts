import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CatalogueIngestionRunner } from './catalogue-ingestion/pipeline';
import { PokemonTcgApiSourceAdapter } from './catalogue-ingestion/pokemonTcgApiAdapter';
import { TcgdexSourceAdapter } from './catalogue-ingestion/tcgdexAdapter';
import { fetchCatalogueQualityReport } from './catalogue-ingestion/qualityReport';
import {
  normaliseLanguageCode,
  type SourceAdapter,
  type SupportedCatalogueLanguageCode,
} from './catalogue-ingestion/sourceAdapter';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const DEFAULT_LANGUAGES: SupportedCatalogueLanguageCode[] = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];
const SUPPORTED_SOURCES = new Set(['tcgdex', 'pokemon-tcg-api']);

type BackfillSource = 'tcgdex' | 'pokemon-tcg-api';

type BackfillLane = {
  source: BackfillSource;
  language: SupportedCatalogueLanguageCode;
};

type BackfillOptions = {
  sources: BackfillSource[];
  languages: SupportedCatalogueLanguageCode[];
  tcgdexBaseUrl: string;
  pokemonBaseUrl: string;
  version: string;
  batchSize: number;
  writeConcurrency: number;
  maxAttempts: number;
  batchPauseMs: number;
  outputPath: string;
  force: boolean;
  dryPlan: boolean;
  maxRecords: number | null;
};

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function csv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(arg(name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function optionalPositiveInteger(name: string) {
  const raw = arg(name);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer.`);
  return value;
}

export function normaliseBackfillSources(values: string[]): BackfillSource[] {
  const sources = values.map((value) => value.toLowerCase().replace(/_/g, '-')).map((value) => {
    if (value === 'pokemontcg' || value === 'pokemon-tcg') return 'pokemon-tcg-api';
    return value;
  });
  for (const source of sources) {
    if (!SUPPORTED_SOURCES.has(source)) {
      throw new Error(`Unsupported metadata source ${source}. Use tcgdex or pokemon-tcg-api.`);
    }
  }
  return [...new Set(sources)] as BackfillSource[];
}

export function normaliseBackfillLanguages(values: string[]): SupportedCatalogueLanguageCode[] {
  return [...new Set(values.map((value) => normaliseLanguageCode(value)))] as SupportedCatalogueLanguageCode[];
}

export function buildBackfillLanes(
  sources: BackfillSource[],
  languages: SupportedCatalogueLanguageCode[],
): BackfillLane[] {
  const lanes: BackfillLane[] = [];
  for (const source of sources) {
    if (source === 'pokemon-tcg-api') {
      if (languages.includes('en')) lanes.push({ source, language: 'en' });
      continue;
    }
    for (const language of languages) lanes.push({ source, language });
  }
  return lanes;
}

export function buildBatchOffsets(total: number, batchSize: number, maximum: number | null = null) {
  const boundedTotal = maximum == null ? total : Math.min(total, maximum);
  if (!Number.isInteger(boundedTotal) || boundedTotal < 0) throw new Error('total must be a non-negative integer.');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be a positive integer.');
  const offsets: number[] = [];
  for (let offset = 0; offset < boundedTotal; offset += batchSize) offsets.push(offset);
  return offsets;
}

function parseOptions(): BackfillOptions {
  const sources = normaliseBackfillSources(csv(arg('sources', 'tcgdex,pokemon-tcg-api')));
  const languages = normaliseBackfillLanguages(csv(arg('languages', DEFAULT_LANGUAGES.join(','))));
  return {
    sources,
    languages,
    tcgdexBaseUrl: arg('tcgdexBaseUrl', process.env.TCGDEX_API_BASE_URL || 'https://api.tcgdex.net/v2').replace(/\/$/, ''),
    pokemonBaseUrl: arg('pokemonBaseUrl', process.env.POKEMON_TCG_API_BASE_URL || 'https://api.pokemontcg.io/v2').replace(/\/$/, ''),
    version: arg('version', new Date().toISOString().slice(0, 10)),
    batchSize: boundedInteger('batchSize', 1000, 50, 5000),
    writeConcurrency: boundedInteger('writeConcurrency', 8, 1, 16),
    maxAttempts: boundedInteger('maxAttempts', 3, 1, 6),
    batchPauseMs: boundedInteger('batchPauseMs', 250, 0, 60_000),
    outputPath: path.resolve(arg('output', 'reports/catalogue/full-metadata-backfill.json')),
    force: hasFlag('force'),
    dryPlan: hasFlag('dryPlan'),
    maxRecords: optionalPositiveInteger('maxRecords'),
  };
}

function printHelp() {
  console.log(`StackR full catalogue metadata backfill

Pulls complete provider metadata for English, Japanese, Traditional Chinese,
Simplified Chinese and Korean. Card images are not downloaded by this worker.

Usage:
  npx tsx scripts/full-catalogue-metadata-backfill.ts \\
    --sources=tcgdex,pokemon-tcg-api \\
    --languages=en,ja,zh-tw,zh-cn,ko \\
    --batchSize=1000 \\
    --writeConcurrency=8 \\
    --version=tcgdex-v2.47.0-pokemon-live

Options:
  --tcgdexBaseUrl=<url>    Live TCGdex or a locally built pinned TCGdex server.
  --pokemonBaseUrl=<url>   Pokémon TCG Developers API v2 base URL.
  --maxAttempts=3          Batch retries before recording a failure.
  --batchPauseMs=250       Pause between successful batches.
  --maxRecords=<n>         Optional bounded acceptance test.
  --force                  Re-run completed deterministic batches.
  --dryPlan                Discover provider counts without database writes.
  --output=<path>          Machine-readable progress report.

The worker is staging-only. Provider metadata is retained in raw ingestion and
approved records are reconciled into the canonical StackR catalogue.`);
}

function stagingClient() {
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '').trim();
  const target = String(process.env.STACKR_CATALOGUE_IMPORT_TARGET ?? process.env.STACKR_IMPORT_TARGET ?? '').trim().toLowerCase();
  if (!url || !key) throw new Error('SUPABASE_URL and backend-only Supabase credentials are required.');
  if (target !== 'staging') throw new Error('Full catalogue metadata backfill requires STACKR_CATALOGUE_IMPORT_TARGET=staging.');
  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Full metadata backfill requires canonical staging Supabase ${STAGING_SUPABASE_REF}.`);
  }
  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing metadata backfill against production Supabase ${PRODUCTION_SUPABASE_REF}.`);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, headers: Record<string, string> = {}, maxAttempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`Metadata discovery failed (${response.status}) for ${url}: ${text.slice(0, 240)}`);
        Object.assign(error, { status: response.status });
        throw error;
      }
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
      const status = Number((error as { status?: number }).status ?? 0);
      if (status > 0 && status < 500 && status !== 429) throw error;
      if (attempt === maxAttempts) throw error;
      await sleep(Math.min(1000 * (2 ** (attempt - 1)), 10_000));
    }
  }
  throw lastError ?? new Error(`Metadata discovery failed for ${url}.`);
}

export async function discoverProviderUniverse(
  lane: BackfillLane,
  options: Pick<BackfillOptions, 'tcgdexBaseUrl' | 'pokemonBaseUrl' | 'maxAttempts'>,
) {
  if (lane.source === 'tcgdex') {
    const payload = await fetchJson(`${options.tcgdexBaseUrl}/${lane.language}/cards`, {}, options.maxAttempts);
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : null;
    if (!rows) throw new Error(`TCGdex ${lane.language} card list did not return an array.`);
    return rows.length;
  }

  const headers: Record<string, string> = {};
  const apiKey = clean(process.env.POKEMON_TCG_API_KEY);
  if (apiKey) headers['X-Api-Key'] = apiKey;
  const payload = await fetchJson(
    `${options.pokemonBaseUrl}/cards?page=1&pageSize=1&select=id`,
    headers,
    options.maxAttempts,
  );
  const total = Number(payload?.totalCount);
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('Pokémon TCG API metadata response did not include a valid totalCount.');
  }
  return total;
}

function adapterFor(lane: BackfillLane, options: BackfillOptions): SourceAdapter {
  if (lane.source === 'tcgdex') {
    return new TcgdexSourceAdapter({
      language: lane.language,
      baseUrl: options.tcgdexBaseUrl,
      licenceStatus: 'approved',
      assetLicenceStatus: 'under_review',
    });
  }
  return new PokemonTcgApiSourceAdapter({
    language: 'en',
    baseUrl: options.pokemonBaseUrl,
    apiKey: clean(process.env.POKEMON_TCG_API_KEY) ?? undefined,
    licenceStatus: 'approved',
    assetLicenceStatus: 'under_review',
  });
}

export function deterministicBatchSuffix(
  lane: BackfillLane,
  version: string,
  offset: number,
  batchSize: number,
) {
  return `full-metadata:${version}:${lane.source}:${lane.language}:${String(offset).padStart(7, '0')}:${batchSize}`.toLowerCase();
}

export function canonicalImportRunKey(
  lane: BackfillLane,
  version: string,
  offset: number,
  batchSize: number,
) {
  return [
    lane.source,
    'run_language',
    lane.language,
    'all',
    'all',
    'metadata',
    deterministicBatchSuffix(lane, version, offset, batchSize),
  ].join(':').toLowerCase();
}

async function completedBatch(
  db: SupabaseClient,
  lane: BackfillLane,
  version: string,
  offset: number,
  batchSize: number,
) {
  const { data: source, error: sourceError } = await db
    .schema('ingest')
    .from('sources')
    .select('id')
    .eq('code', lane.source)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source?.id) return false;
  const { data, error } = await db
    .schema('ingest')
    .from('import_runs')
    .select('id')
    .eq('source_id', source.id)
    .eq('run_key', canonicalImportRunKey(lane, version, offset, batchSize))
    .eq('status', 'completed')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function runBatch(
  db: SupabaseClient,
  adapter: SourceAdapter,
  lane: BackfillLane,
  options: BackfillOptions,
  offset: number,
  limit: number,
) {
  const runner = new CatalogueIngestionRunner(db, adapter);
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const result = await runner.run({
        command: 'run_language',
        importType: 'full',
        language: lane.language,
        cursor: { offset },
        limit,
        runKey: deterministicBatchSuffix(lane, options.version, offset, options.batchSize),
        requestId: `full-metadata:${options.version}:${lane.source}:${lane.language}:${offset}`,
        allowImageAssets: false,
        approvedOnlyAssets: true,
        writeConcurrency: options.writeConcurrency,
      });
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts) throw error;
      await sleep(Math.min(5000 * (2 ** (attempt - 1)), 60_000));
    }
  }
  throw lastError ?? new Error(`Metadata batch ${lane.source}/${lane.language}/${offset} failed.`);
}

async function writeReport(outputPath: string, report: Record<string, unknown>) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function runFullCatalogueMetadataBackfill() {
  if (hasFlag('help')) {
    printHelp();
    return;
  }

  const options = parseOptions();
  const lanes = buildBackfillLanes(options.sources, options.languages);
  const startedAt = new Date();
  const report: Record<string, any> = {
    schemaVersion: 1,
    job: 'stackr-full-catalogue-metadata-backfill',
    startedAt: startedAt.toISOString(),
    version: options.version,
    stagingProjectRef: STAGING_SUPABASE_REF,
    sources: options.sources,
    languages: options.languages,
    metadataOnly: true,
    pokemonApiKeyConfigured: Boolean(clean(process.env.POKEMON_TCG_API_KEY)),
    options: {
      batchSize: options.batchSize,
      writeConcurrency: options.writeConcurrency,
      maxAttempts: options.maxAttempts,
      force: options.force,
      dryPlan: options.dryPlan,
      maxRecords: options.maxRecords,
      tcgdexBaseUrl: options.tcgdexBaseUrl,
      pokemonBaseUrl: options.pokemonBaseUrl,
    },
    lanes: [],
  };

  const plans = [];
  for (const lane of lanes) {
    const providerTotal = await discoverProviderUniverse(lane, options);
    const offsets = buildBatchOffsets(providerTotal, options.batchSize, options.maxRecords);
    plans.push({ lane, providerTotal, offsets });
  }

  if (options.dryPlan) {
    report.lanes = plans.map(({ lane, providerTotal, offsets }) => ({
      ...lane,
      providerTotal,
      plannedRecords: options.maxRecords == null ? providerTotal : Math.min(providerTotal, options.maxRecords),
      batches: offsets.length,
      status: 'planned',
    }));
    report.finishedAt = new Date().toISOString();
    report.ok = true;
    await writeReport(options.outputPath, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const db = stagingClient();
  let failures = 0;
  for (const plan of plans) {
    const laneReport: Record<string, any> = {
      ...plan.lane,
      providerTotal: plan.providerTotal,
      plannedRecords: options.maxRecords == null ? plan.providerTotal : Math.min(plan.providerTotal, options.maxRecords),
      batchesPlanned: plan.offsets.length,
      batchesCompleted: 0,
      batchesSkipped: 0,
      batchesFailed: 0,
      recordsCovered: 0,
      batches: [],
    };
    report.lanes.push(laneReport);
    const adapter = adapterFor(plan.lane, options);

    for (const offset of plan.offsets) {
      const limit = Math.min(
        options.batchSize,
        laneReport.plannedRecords - offset,
      );
      const batchStartedAt = Date.now();
      try {
        if (!options.force && await completedBatch(db, plan.lane, options.version, offset, options.batchSize)) {
          laneReport.batchesSkipped += 1;
          laneReport.recordsCovered += limit;
          laneReport.batches.push({ offset, limit, status: 'already_completed', durationMs: 0 });
          continue;
        }
        const execution = await runBatch(db, adapter, plan.lane, options, offset, limit);
        laneReport.batchesCompleted += 1;
        laneReport.recordsCovered += limit;
        laneReport.batches.push({
          offset,
          limit,
          status: 'completed',
          attempts: execution.attempts,
          durationMs: Date.now() - batchStartedAt,
          result: execution.result,
        });
        await writeReport(options.outputPath, report);
        if (options.batchPauseMs) await sleep(options.batchPauseMs);
      } catch (error) {
        failures += 1;
        laneReport.batchesFailed += 1;
        laneReport.batches.push({
          offset,
          limit,
          status: 'failed',
          durationMs: Date.now() - batchStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        await writeReport(options.outputPath, report);
      }
    }

    try {
      laneReport.quality = await fetchCatalogueQualityReport(db, {
        language: plan.lane.language,
        limit: 1000,
      });
    } catch (error) {
      laneReport.qualityError = error instanceof Error ? error.message : String(error);
    }
    laneReport.status = laneReport.batchesFailed > 0 ? 'partial' : 'completed';
    await writeReport(options.outputPath, report);
  }

  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAt.getTime();
  report.ok = failures === 0;
  report.summary = {
    lanes: report.lanes.length,
    failures,
    batchesCompleted: report.lanes.reduce((sum: number, lane: any) => sum + lane.batchesCompleted, 0),
    batchesSkipped: report.lanes.reduce((sum: number, lane: any) => sum + lane.batchesSkipped, 0),
    batchesFailed: report.lanes.reduce((sum: number, lane: any) => sum + lane.batchesFailed, 0),
    recordsCovered: report.lanes.reduce((sum: number, lane: any) => sum + lane.recordsCovered, 0),
  };
  await writeReport(options.outputPath, report);
  console.log(JSON.stringify(report.summary, null, 2));
  if (failures > 0) process.exitCode = 1;
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  runFullCatalogueMetadataBackfill().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      job: 'stackr-full-catalogue-metadata-backfill',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  });
}
