import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CatalogueIngestionRunner } from './catalogue-ingestion/pipeline';
import { TcgdexSourceAdapter } from './catalogue-ingestion/tcgdexAdapter';
import {
  canonicalTcgdexCardId,
  canonicalTcgdexSetId,
  sortTcgdexCardRows,
  sortTcgdexSetRows,
} from './catalogue-ingestion/tcgdexOrdering';
import {
  cleanText,
  normaliseLanguageCode,
  PRIMARY_CATALOGUE_LANGUAGE_CODES,
} from './catalogue-ingestion/sourceAdapter';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
export const FOUR_LANGUAGE_IMPORTER_CONTRACT = 'tcgdex-stable-card-id-v2';
export const FOUR_LANGUAGE_BATCH_MANIFEST_SCHEMA = 'stackr-four-language-batch-v2.0.0';

export const FOUR_LANGUAGE_CATALOGUE_CODES = PRIMARY_CATALOGUE_LANGUAGE_CODES;
export type FourLanguageCatalogueCode = typeof FOUR_LANGUAGE_CATALOGUE_CODES[number];

export type CatalogueLane = {
  source: 'tcgdex';
  language: FourLanguageCatalogueCode;
};

type ProviderCard = Record<string, unknown>;

type BatchPlan = {
  offset: number;
  limit: number;
  expectedImageReferences: number;
  manifestDigest: string;
};

export type BackfillOptions = {
  languages: FourLanguageCatalogueCode[];
  tcgdexBaseUrl: string;
  tcgdexSnapshotRoot: string | null;
  tcgdexSnapshotVersion: string | null;
  version: string;
  batchSize: number;
  writeConcurrency: number;
  maxAttempts: number;
  batchPauseMs: number;
  outputPath: string;
  dryPlan: boolean;
  maxRecords: number | null;
};

type BatchReport = {
  offset: number;
  limit: number;
  expectedImageReferences: number;
  status: 'completed' | 'already_completed' | 'failed';
  attempts?: number;
  durationMs: number;
  result?: unknown;
  error?: string;
};

type LaneReport = CatalogueLane & {
  snapshotDigest: string;
  importerContract: string;
  providerCards: number;
  providerImageReferences: number;
  plannedCards: number;
  plannedImageReferences: number;
  batchesPlanned: number;
  batchesCompleted: number;
  batchesSkipped: number;
  batchesFailed: number;
  cardRowsProcessed: number;
  imageReferenceRowsProcessed: number;
  conflicts: number;
  cardBatchProcessingPercent: number;
  imageReferenceBatchProcessingPercent: number;
  providerCardRowsProcessedPercent: number;
  providerImageReferenceRowsProcessedPercent: number;
  batchProcessingPercent: number;
  status: 'planned' | 'completed' | 'completed_with_conflicts' | 'partial';
  batches: BatchReport[];
};

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function percentage(numerator: number, denominator: number) {
  if (denominator === 0) return 100;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export function normaliseFourLanguageCodes(values: string[]): FourLanguageCatalogueCode[] {
  if (values.length === 0) throw new Error('At least one workstream language is required.');
  const languages = values.map((value) => normaliseLanguageCode(value));
  for (const language of languages) {
    if (!(FOUR_LANGUAGE_CATALOGUE_CODES as readonly string[]).includes(language)) {
      throw new Error(
        `Language ${language} is outside this four-language workstream. Use only: ${FOUR_LANGUAGE_CATALOGUE_CODES.join(', ')}.`,
      );
    }
  }
  return [...new Set(languages)] as FourLanguageCatalogueCode[];
}

export function buildFourLanguageLanes(languages: FourLanguageCatalogueCode[]): CatalogueLane[] {
  return languages.map((language) => ({ source: 'tcgdex', language }));
}

function stableJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Batch manifests cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value !== 'object') {
    throw new Error(`Batch manifests cannot contain ${typeof value} values.`);
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function batchManifestDigest(
  language: FourLanguageCatalogueCode,
  cards: ProviderCard[],
  sets: ProviderCard[] = [],
) {
  return sha256(stableJson({
    schema: FOUR_LANGUAGE_BATCH_MANIFEST_SCHEMA,
    importerContract: FOUR_LANGUAGE_IMPORTER_CONTRACT,
    language,
    cards: sortTcgdexCardRows(cards),
    sets: sortTcgdexSetRows(sets),
  }));
}

export function catalogueSnapshotDigest(
  language: FourLanguageCatalogueCode,
  cards: ProviderCard[],
  sets: ProviderCard[] = [],
) {
  const cardIds = sortTcgdexCardRows(cards).map((card) => canonicalTcgdexCardId(card));
  const setIds = sortTcgdexSetRows(sets).map((set) => canonicalTcgdexSetId(set));
  return sha256(stableJson({
    importerContract: FOUR_LANGUAGE_IMPORTER_CONTRACT,
    language,
    cardIds,
    setIds,
  }));
}

export function buildBatchPlans(
  cards: ProviderCard[],
  batchSize: number,
  maximum: number | null = null,
  sets: ProviderCard[] = [],
  language: FourLanguageCatalogueCode = 'en',
): BatchPlan[] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be a positive integer.');
  const orderedCards = sortTcgdexCardRows(cards);
  const orderedSets = sortTcgdexSetRows(sets);
  const plannedCards = maximum == null ? orderedCards : orderedCards.slice(0, maximum);
  const plans: BatchPlan[] = [];
  for (let offset = 0; offset < plannedCards.length; offset += batchSize) {
    const rows = plannedCards.slice(offset, offset + batchSize);
    const setRows = orderedSets.slice(offset, offset + rows.length);
    plans.push({
      offset,
      limit: rows.length,
      expectedImageReferences: rows.filter((card) => Boolean(cleanText(card.image))).length,
      manifestDigest: batchManifestDigest(language, rows, setRows),
    });
  }
  return plans;
}

export function deterministicBatchSuffix(
  lane: CatalogueLane,
  version: string,
  snapshotDigest: string,
  offset: number,
  batchSize: number,
  manifestDigest: string,
) {
  return [
    'four-language-metadata-images-v2',
    version,
    FOUR_LANGUAGE_IMPORTER_CONTRACT,
    `snapshot-${snapshotDigest}`,
    lane.source,
    lane.language,
    String(offset).padStart(7, '0'),
    batchSize,
    `batch-${manifestDigest}`,
  ].join(':').toLowerCase();
}

export function canonicalImportRunKey(
  lane: CatalogueLane,
  version: string,
  snapshotDigest: string,
  offset: number,
  batchSize: number,
  manifestDigest: string,
) {
  return [
    lane.source,
    'run_language',
    lane.language,
    'all',
    'all',
    'with-assets',
    deterministicBatchSuffix(lane, version, snapshotDigest, offset, batchSize, manifestDigest),
  ].join(':').toLowerCase();
}

export function batchRunMetadata(
  lane: CatalogueLane,
  version: string,
  snapshotDigest: string,
  plan: BatchPlan,
  batchSize: number,
) {
  return {
    importerContract: FOUR_LANGUAGE_IMPORTER_CONTRACT,
    workstreamVersion: version,
    source: lane.source,
    language: lane.language,
    snapshotDigest,
    batchManifestDigest: plan.manifestDigest,
    batchOffset: plan.offset,
    batchSize,
    batchCardCount: plan.limit,
  };
}

export function completedBatchManifestMatches(
  metadata: unknown,
  expected: ReturnType<typeof batchRunMetadata>,
) {
  if (!metadata || typeof metadata !== 'object') return false;
  const workstream = (metadata as { workstream?: unknown }).workstream;
  if (!workstream || typeof workstream !== 'object') return false;
  return stableJson(workstream) === stableJson(expected);
}

export function updateLanePercentages(lane: LaneReport) {
  lane.cardBatchProcessingPercent = percentage(lane.cardRowsProcessed, lane.plannedCards);
  lane.imageReferenceBatchProcessingPercent = percentage(
    lane.imageReferenceRowsProcessed,
    lane.plannedImageReferences,
  );
  lane.providerCardRowsProcessedPercent = percentage(lane.cardRowsProcessed, lane.providerCards);
  lane.providerImageReferenceRowsProcessedPercent = percentage(
    lane.imageReferenceRowsProcessed,
    lane.providerImageReferences,
  );
  lane.batchProcessingPercent = Math.round(
    Math.min(lane.cardBatchProcessingPercent, lane.imageReferenceBatchProcessingPercent) * 100,
  ) / 100;
  return lane;
}

export function createFourLanguageAdapter(lane: CatalogueLane, options: BackfillOptions) {
  return new TcgdexSourceAdapter({
    language: lane.language,
    baseUrl: options.tcgdexBaseUrl,
    snapshotRoot: options.tcgdexSnapshotRoot ?? undefined,
    snapshotVersion: options.tcgdexSnapshotVersion ?? options.version,
    licenceStatus: 'approved',
    assetLicenceStatus: 'approved',
  });
}

export class CatalogueBatchAcceptanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueBatchAcceptanceError';
  }
}

export function assertAcceptedBatchResult(result: {
  ok?: boolean;
  error?: string;
  stats?: {
    recordsRetrieved?: number;
    recordsInserted?: number;
    recordsUpdated?: number;
    recordsConflicted?: number;
  };
}) {
  if (!result.ok) throw new Error(result.error ?? 'TCGdex batch was not imported.');
  const retrieved = Number(result.stats?.recordsRetrieved ?? 0);
  const inserted = Number(result.stats?.recordsInserted ?? 0);
  const updated = Number(result.stats?.recordsUpdated ?? 0);
  const conflicted = Number(result.stats?.recordsConflicted ?? 0);
  if (retrieved > 0 && conflicted === retrieved) {
    throw new CatalogueBatchAcceptanceError(`TCGdex batch rejected: all ${retrieved} retrieved records conflicted.`);
  }
  if (inserted + updated === 0 && conflicted > 0) {
    throw new CatalogueBatchAcceptanceError(
      `TCGdex batch rejected: ${conflicted} conflicts and no mapped inserts or updates.`,
    );
  }
  return result;
}

function parseOptions(): BackfillOptions {
  const version = arg('version', new Date().toISOString().slice(0, 10)).trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,159}$/i.test(version)) {
    throw new Error('--version must be a safe 8-160 character snapshot label.');
  }
  const snapshotRoot = arg('tcgdexSnapshotRoot').trim();
  return {
    languages: normaliseFourLanguageCodes(csv(arg('languages', FOUR_LANGUAGE_CATALOGUE_CODES.join(',')))),
    tcgdexBaseUrl: arg('tcgdexBaseUrl', process.env.TCGDEX_API_BASE_URL || 'https://api.tcgdex.net/v2').replace(/\/$/, ''),
    tcgdexSnapshotRoot: snapshotRoot ? path.resolve(snapshotRoot) : null,
    tcgdexSnapshotVersion: arg('tcgdexSnapshotVersion').trim() || null,
    version,
    batchSize: boundedInteger('batchSize', 1000, 50, 2000),
    writeConcurrency: boundedInteger('writeConcurrency', 8, 1, 16),
    maxAttempts: boundedInteger('maxAttempts', 3, 1, 6),
    batchPauseMs: boundedInteger('batchPauseMs', 100, 0, 60_000),
    outputPath: path.resolve(arg('output', 'reports/catalogue/four-language-catalogue-backfill.json')),
    dryPlan: hasFlag('dryPlan'),
    maxRecords: optionalPositiveInteger('maxRecords'),
  };
}

function printHelp() {
  console.log(`StackR four-language catalogue metadata and image-reference backfill

Imports all available pinned TCGdex metadata and approved card-image references
for English, Japanese, Simplified Chinese and Korean. It never publishes,
promotes or deploys a catalogue.

Usage:
  npm run catalogue:four-language-backfill -- \\
    --languages=en,ja,zh-cn,ko \\
    --tcgdexSnapshotRoot=.tcgdex-source/server/generated \\
    --tcgdexSnapshotVersion=771a8381c57c \\
    --version=tcgdex-771a8381c57c-four-primary-v2 \\
    --target=staging

Options:
  --batchSize=1000           Provider cards per deterministic batch.
  --writeConcurrency=8       Concurrent staging writes (1-16).
  --maxAttempts=3            Batch attempts before recording a failure.
  --batchPauseMs=100         Pause between successful batches.
  --maxRecords=<n>           Optional bounded acceptance run.
  --dryPlan                  Discover the provider universe without database writes.
  --output=<path>            Machine-readable progress report.

The worker is staging-only. Rights and image permission are explicitly approved
for this workstream; validation, exact identity and conflict quarantine remain on.`);
}

function stagingClient() {
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '').trim();
  const target = String(
    arg('target')
    || process.env.STACKR_CATALOGUE_IMPORT_TARGET
    || process.env.STACKR_IMPORT_TARGET
    || '',
  ).trim().toLowerCase();
  if (!url || !key) throw new Error('SUPABASE_URL and backend-only Supabase credentials are required.');
  if (target !== 'staging') throw new Error('Four-language catalogue backfill requires --target=staging.');
  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Four-language catalogue backfill requires canonical staging Supabase ${STAGING_SUPABASE_REF}.`);
  }
  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing catalogue backfill against production Supabase ${PRODUCTION_SUPABASE_REF}.`);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, maxAttempts: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`Catalogue discovery failed (${response.status}) for ${url}: ${text.slice(0, 240)}`);
        Object.assign(error, { status: response.status });
        throw error;
      }
      return text ? JSON.parse(text) as unknown : null;
    } catch (error) {
      lastError = error;
      const status = Number((error as { status?: number }).status ?? 0);
      if (status > 0 && status < 500 && status !== 429) throw error;
      if (attempt === maxAttempts) throw error;
      await sleep(Math.min(1000 * (2 ** (attempt - 1)), 10_000));
    }
  }
  throw lastError ?? new Error(`Catalogue discovery failed for ${url}.`);
}

function providerCards(payload: unknown, language: FourLanguageCatalogueCode) {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : null;
  if (!rows) throw new Error(`TCGdex ${language} card list did not return an array.`);
  const cards = rows.filter((row): row is ProviderCard => Boolean(row && typeof row === 'object'));
  if (cards.length === 0) throw new Error(`TCGdex ${language} card universe is empty.`);
  return sortTcgdexCardRows(cards);
}

export async function discoverProviderCards(
  lane: CatalogueLane,
  options: Pick<BackfillOptions, 'tcgdexBaseUrl' | 'tcgdexSnapshotRoot' | 'maxAttempts'>,
) {
  if (options.tcgdexSnapshotRoot) {
    const file = path.join(options.tcgdexSnapshotRoot, lane.language, 'cards.json');
    return providerCards(JSON.parse(await readFile(file, 'utf8')) as unknown, lane.language);
  }
  return providerCards(
    await fetchJson(`${options.tcgdexBaseUrl}/${lane.language}/cards`, options.maxAttempts),
    lane.language,
  );
}

async function discoverSnapshotDigest(
  lane: CatalogueLane,
  options: Pick<BackfillOptions, 'tcgdexSnapshotRoot'>,
  cards: ProviderCard[],
) {
  if (!options.tcgdexSnapshotRoot) {
    return { sets: [] as ProviderCard[], snapshotDigest: catalogueSnapshotDigest(lane.language, cards) };
  }
  const setFile = path.join(options.tcgdexSnapshotRoot, lane.language, 'sets.json');
  const setPayload = JSON.parse(await readFile(setFile, 'utf8')) as unknown;
  const rows = Array.isArray(setPayload)
    ? setPayload
    : setPayload && typeof setPayload === 'object' && Array.isArray((setPayload as { data?: unknown }).data)
      ? (setPayload as { data: unknown[] }).data
      : null;
  if (!rows) throw new Error(`TCGdex ${lane.language} set list did not return an array.`);
  const sets = rows.filter((row): row is ProviderCard => Boolean(row && typeof row === 'object'));
  if (sets.length === 0) throw new Error(`TCGdex ${lane.language} set universe is empty.`);
  return { sets, snapshotDigest: catalogueSnapshotDigest(lane.language, cards, sets) };
}

async function completedBatch(
  db: SupabaseClient,
  lane: CatalogueLane,
  version: string,
  snapshotDigest: string,
  plan: BatchPlan,
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
    .select('id, records_retrieved, records_inserted, records_updated, records_conflicted, metadata')
    .eq('source_id', source.id)
    .eq('run_key', canonicalImportRunKey(
      lane,
      version,
      snapshotDigest,
      plan.offset,
      batchSize,
      plan.manifestDigest,
    ))
    .eq('status', 'completed')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  const expectedMetadata = batchRunMetadata(lane, version, snapshotDigest, plan, batchSize);
  if (!completedBatchManifestMatches(data.metadata, expectedMetadata)) return null;
  if (Number(data.records_retrieved ?? 0) < plan.limit) return null;
  assertAcceptedBatchResult({
    ok: true,
    stats: {
      recordsRetrieved: Number(data.records_retrieved ?? 0),
      recordsInserted: Number(data.records_inserted ?? 0),
      recordsUpdated: Number(data.records_updated ?? 0),
      recordsConflicted: Number(data.records_conflicted ?? 0),
    },
  });
  return { conflicts: Number(data.records_conflicted ?? 0) };
}

async function runBatch(
  db: SupabaseClient,
  adapter: TcgdexSourceAdapter,
  lane: CatalogueLane,
  options: BackfillOptions,
  plan: BatchPlan,
  snapshotDigest: string,
) {
  const runner = new CatalogueIngestionRunner(db, adapter);
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const result = await runner.run({
        command: 'run_language',
        importType: 'full',
        language: lane.language,
        cursor: { offset: plan.offset },
        limit: plan.limit,
        runKey: deterministicBatchSuffix(
          lane,
          options.version,
          snapshotDigest,
          plan.offset,
          options.batchSize,
          plan.manifestDigest,
        ),
        requestId: [
          'four-language-metadata-images-v2',
          options.version,
          lane.language,
          plan.offset,
          plan.manifestDigest.slice(0, 12),
        ].join(':'),
        allowImageAssets: true,
        approvedOnlyAssets: true,
        writeConcurrency: options.writeConcurrency,
        runMetadata: batchRunMetadata(lane, options.version, snapshotDigest, plan, options.batchSize),
      });
      assertAcceptedBatchResult(result);
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (error instanceof CatalogueBatchAcceptanceError) throw error;
      if (attempt === options.maxAttempts) throw error;
      await sleep(Math.min(5000 * (2 ** (attempt - 1)), 60_000));
    }
  }
  throw lastError ?? new Error(`Catalogue batch ${lane.language}/${plan.offset} failed.`);
}

async function writeReport(outputPath: string, report: unknown) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
}

function emptyLaneReport(
  lane: CatalogueLane,
  cards: ProviderCard[],
  plans: BatchPlan[],
  snapshotDigest: string,
): LaneReport {
  const plannedCards = plans.reduce((sum, plan) => sum + plan.limit, 0);
  const plannedImageReferences = plans.reduce((sum, plan) => sum + plan.expectedImageReferences, 0);
  return updateLanePercentages({
    ...lane,
    snapshotDigest,
    importerContract: FOUR_LANGUAGE_IMPORTER_CONTRACT,
    providerCards: cards.length,
    providerImageReferences: cards.filter((card) => Boolean(cleanText(card.image))).length,
    plannedCards,
    plannedImageReferences,
    batchesPlanned: plans.length,
    batchesCompleted: 0,
    batchesSkipped: 0,
    batchesFailed: 0,
    cardRowsProcessed: 0,
    imageReferenceRowsProcessed: 0,
    conflicts: 0,
    cardBatchProcessingPercent: 0,
    imageReferenceBatchProcessingPercent: 0,
    providerCardRowsProcessedPercent: 0,
    providerImageReferenceRowsProcessedPercent: 0,
    batchProcessingPercent: 0,
    status: 'planned',
    batches: [],
  });
}

export async function runFourLanguageCatalogueBackfill() {
  if (hasFlag('help')) {
    printHelp();
    return;
  }

  const options = parseOptions();
  if (!options.dryPlan && !options.tcgdexSnapshotRoot) {
    throw new Error('Four-language catalogue writes require one compiled local TCGdex snapshot.');
  }
  const lanes = buildFourLanguageLanes(options.languages);
  const startedAt = new Date();
  const report: {
    schemaVersion: number;
    job: string;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    version: string;
    importerContract: string;
    stagingProjectRef: string;
    source: string;
    languages: FourLanguageCatalogueCode[];
    traditionalChinesePlatformSupport: 'unchanged_outside_workstream';
    metadataIncluded: true;
    approvedImageReferencesIncluded: true;
    imageBytesMirroredByFollowUp: true;
    rightsApprovalPercent: 100;
    releasePercent: 0;
    options: Record<string, unknown>;
    lanes: LaneReport[];
    summary?: Record<string, unknown>;
    ok?: boolean;
  } = {
    schemaVersion: 2,
    job: 'stackr-four-language-catalogue-metadata-images',
    startedAt: startedAt.toISOString(),
    version: options.version,
    importerContract: FOUR_LANGUAGE_IMPORTER_CONTRACT,
    stagingProjectRef: STAGING_SUPABASE_REF,
    source: 'tcgdex',
    languages: options.languages,
    traditionalChinesePlatformSupport: 'unchanged_outside_workstream',
    metadataIncluded: true,
    approvedImageReferencesIncluded: true,
    imageBytesMirroredByFollowUp: true,
    rightsApprovalPercent: 100,
    releasePercent: 0,
    options: {
      batchSize: options.batchSize,
      writeConcurrency: options.writeConcurrency,
      maxAttempts: options.maxAttempts,
      dryPlan: options.dryPlan,
      maxRecords: options.maxRecords,
      tcgdexBaseUrl: options.tcgdexBaseUrl,
      tcgdexSnapshotRoot: options.tcgdexSnapshotRoot,
      tcgdexSnapshotVersion: options.tcgdexSnapshotVersion,
    },
    lanes: [],
  };

  const plans: {
    lane: CatalogueLane;
    cards: ProviderCard[];
    batches: BatchPlan[];
    snapshotDigest: string;
  }[] = [];
  for (const lane of lanes) {
    const cards = await discoverProviderCards(lane, options);
    const snapshot = await discoverSnapshotDigest(lane, options, cards);
    plans.push({
      lane,
      cards,
      batches: buildBatchPlans(cards, options.batchSize, options.maxRecords, snapshot.sets, lane.language),
      snapshotDigest: snapshot.snapshotDigest,
    });
  }

  if (options.dryPlan) {
    report.lanes = plans.map(({ lane, cards, batches, snapshotDigest }) => {
      const laneReport = emptyLaneReport(lane, cards, batches, snapshotDigest);
      laneReport.status = 'planned';
      return laneReport;
    });
    report.finishedAt = new Date().toISOString();
    report.ok = true;
    report.summary = {
      languagesPlanned: report.lanes.length,
      batchProcessingPercent: 0,
      providerCards: report.lanes.reduce((sum, lane) => sum + lane.providerCards, 0),
      providerImageReferences: report.lanes.reduce((sum, lane) => sum + lane.providerImageReferences, 0),
      releasePercent: 0,
    };
    await writeReport(options.outputPath, report);
    console.log(JSON.stringify(report.summary, null, 2));
    return;
  }

  const db = stagingClient();
  let failures = 0;
  for (const plan of plans) {
    const laneReport = emptyLaneReport(plan.lane, plan.cards, plan.batches, plan.snapshotDigest);
    report.lanes.push(laneReport);
    const adapter = createFourLanguageAdapter(plan.lane, options);

    for (const batch of plan.batches) {
      const batchStartedAt = Date.now();
      try {
        const completed = await completedBatch(
          db,
          plan.lane,
          options.version,
          plan.snapshotDigest,
          batch,
          options.batchSize,
        );
        if (completed) {
          laneReport.batchesSkipped += 1;
          laneReport.cardRowsProcessed += batch.limit;
          laneReport.imageReferenceRowsProcessed += batch.expectedImageReferences;
          laneReport.conflicts += completed.conflicts;
          laneReport.batches.push({ ...batch, status: 'already_completed', durationMs: 0 });
          updateLanePercentages(laneReport);
          continue;
        }
        const execution = await runBatch(db, adapter, plan.lane, options, batch, plan.snapshotDigest);
        laneReport.batchesCompleted += 1;
        laneReport.cardRowsProcessed += batch.limit;
        laneReport.imageReferenceRowsProcessed += batch.expectedImageReferences;
        laneReport.conflicts += Number(execution.result.stats?.recordsConflicted ?? 0);
        laneReport.batches.push({
          ...batch,
          status: 'completed',
          attempts: execution.attempts,
          durationMs: Date.now() - batchStartedAt,
          result: execution.result,
        });
        updateLanePercentages(laneReport);
        await writeReport(options.outputPath, report);
        if (options.batchPauseMs) await sleep(options.batchPauseMs);
      } catch (error) {
        failures += 1;
        laneReport.batchesFailed += 1;
        laneReport.batches.push({
          ...batch,
          status: 'failed',
          durationMs: Date.now() - batchStartedAt,
          error: errorMessage(error),
        });
        updateLanePercentages(laneReport);
        await writeReport(options.outputPath, report);
      }
    }

    laneReport.status = laneReport.batchesFailed > 0
      ? 'partial'
      : laneReport.conflicts > 0
        ? 'completed_with_conflicts'
        : 'completed';
    updateLanePercentages(laneReport);
    await writeReport(options.outputPath, report);
  }

  const averageProgress = report.lanes.length
    ? report.lanes.reduce((sum, lane) => sum + lane.batchProcessingPercent, 0) / report.lanes.length
    : 0;
  const providerCards = report.lanes.reduce((sum, lane) => sum + lane.providerCards, 0);
  const providerImages = report.lanes.reduce((sum, lane) => sum + lane.providerImageReferences, 0);
  const cardRowsProcessed = report.lanes.reduce((sum, lane) => sum + lane.cardRowsProcessed, 0);
  const imageReferenceRowsProcessed = report.lanes.reduce(
    (sum, lane) => sum + lane.imageReferenceRowsProcessed,
    0,
  );
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAt.getTime();
  report.ok = failures === 0;
  report.summary = {
    languages: report.lanes.length,
    languagesCompleted: report.lanes.filter((lane) => lane.status !== 'partial').length,
    batchProcessingPercent: Math.round(averageProgress * 100) / 100,
    providerCardRowsProcessedPercent: percentage(cardRowsProcessed, providerCards),
    providerImageReferenceRowsProcessedPercent: percentage(imageReferenceRowsProcessed, providerImages),
    batchesCompleted: report.lanes.reduce((sum, lane) => sum + lane.batchesCompleted, 0),
    batchesSkipped: report.lanes.reduce((sum, lane) => sum + lane.batchesSkipped, 0),
    batchesFailed: report.lanes.reduce((sum, lane) => sum + lane.batchesFailed, 0),
    conflicts: report.lanes.reduce((sum, lane) => sum + lane.conflicts, 0),
    rightsApprovalPercent: 100,
    releasePercent: 0,
  };
  await writeReport(options.outputPath, report);
  console.log(JSON.stringify(report.summary, null, 2));
  if (failures > 0) process.exitCode = 1;
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  runFourLanguageCatalogueBackfill().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      job: 'stackr-four-language-catalogue-metadata-images',
      error: errorMessage(error),
    }, null, 2));
    process.exitCode = 1;
  });
}
