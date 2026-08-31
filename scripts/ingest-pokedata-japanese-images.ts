import 'dotenv/config';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  PokeDataJapaneseImageSourceAdapter,
  type PokeDataJapaneseSetDescriptor,
} from './catalogue-ingestion/pokedataJapaneseImageAdapter';
import { CatalogueIngestionRunner } from './catalogue-ingestion/pipeline';
import { cleanText, type SourceAdapter } from './catalogue-ingestion/sourceAdapter';
import {
  resolvePokeDataJapaneseSetCode,
  type PokeDataJapaneseSetCodePolicy,
} from '../lib/pokedataJapaneseSetIdentity';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
export const POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT = 'pokedata-japanese-images-v2';

type DatabaseLike = {
  schema(schema: string): {
    from(table: string): any;
  };
};

export type ActiveJapaneseCatalogueSet = Readonly<{
  id: string;
  setCode: string | null;
  nativeName: string | null;
  englishDisplayName: string | null;
}>;

type CrosswalkProviderSet = Readonly<{
  providerSetId: string;
  setCode: string | null;
  effectiveSetCode: string | null;
  identityPolicy: PokeDataJapaneseSetCodePolicy;
  setName: string;
}>;

export type ExactPokeDataSetMatch = Readonly<{
  catalogueSetId: string;
  catalogueSetCode: string;
  catalogueSetName: string | null;
  providerSetId: string;
  providerSetCode: string;
  providerReportedSetCode: string | null;
  providerSetName: string;
  identityPolicy: Exclude<PokeDataJapaneseSetCodePolicy, 'code_missing'>;
}>;

type UnmatchedCatalogueSet = ActiveJapaneseCatalogueSet & Readonly<{
  reason: 'code_missing' | 'no_exact_pokedata_code_match';
}>;

type UnmatchedProviderSet = CrosswalkProviderSet & Readonly<{
  reason: 'code_missing' | 'no_exact_catalogue_code_match';
}>;

export type ExactPokeDataSetCrosswalk = Readonly<{
  matched: readonly ExactPokeDataSetMatch[];
  unmatched: Readonly<{
    catalogue: readonly UnmatchedCatalogueSet[];
    pokedata: readonly UnmatchedProviderSet[];
  }>;
  ambiguous: readonly Readonly<{
    caseInsensitiveSetCode: string;
    catalogue: readonly ActiveJapaneseCatalogueSet[];
    pokedata: readonly CrosswalkProviderSet[];
  }>[];
  overridesApplied: readonly ExactPokeDataSetMatch[];
}>;

type RunnerStats = {
  recordsRequested?: number;
  recordsRetrieved?: number;
  recordsInserted?: number;
  recordsUpdated?: number;
  recordsSkipped?: number;
  recordsConflicted?: number;
  decisions?: number;
};

type RunnerResult = {
  ok: boolean;
  importRunId?: string | null;
  error?: string;
  stats?: RunnerStats;
};

type RunnerLike = {
  run(options: Record<string, unknown>): Promise<RunnerResult>;
};

type CompletedImportRun = {
  run_key: string;
  records_requested?: number | null;
  records_retrieved?: number | null;
  records_inserted?: number | null;
  records_updated?: number | null;
  records_skipped?: number | null;
  records_conflicted?: number | null;
  metadata?: unknown;
};

export type PokeDataJapaneseImageIngestionOptions = Readonly<{
  offset: number;
  limit: number;
  writeConcurrency: number;
  maxAttempts: number;
  requestTimeoutMs: number;
  setPauseMs: number;
  retryBaseMs: number;
  runKeyPrefix: string | null;
  requestIdPrefix: string | null;
}>;

type DriverDependencies = {
  fetchCatalogueSets?: (db: DatabaseLike) => Promise<readonly ActiveJapaneseCatalogueSet[]>;
  readCompletedRuns?: (
    db: DatabaseLike,
    runKeys: readonly string[],
  ) => Promise<ReadonlyMap<string, CompletedImportRun>>;
  createRunner?: (db: DatabaseLike, adapter: SourceAdapter) => RunnerLike;
  sleep?: (milliseconds: number) => Promise<void>;
};

function codeKey(value: unknown) {
  return cleanText(value)?.toLocaleLowerCase('en-US') ?? null;
}

function compareCatalogueSets(left: ActiveJapaneseCatalogueSet, right: ActiveJapaneseCatalogueSet) {
  return (left.setCode ?? '').localeCompare(right.setCode ?? '', 'en', { sensitivity: 'base' })
    || left.id.localeCompare(right.id);
}

function compareProviderSets(left: CrosswalkProviderSet, right: CrosswalkProviderSet) {
  return (left.effectiveSetCode ?? '').localeCompare(right.effectiveSetCode ?? '', 'en', { sensitivity: 'base' })
    || left.providerSetId.localeCompare(right.providerSetId, 'en', { numeric: true })
    || left.setName.localeCompare(right.setName);
}

function freezeCatalogueSet(row: Record<string, unknown>): ActiveJapaneseCatalogueSet {
  const id = cleanText(row.id);
  if (!id) throw new Error('Active Japanese catalogue set is missing its immutable id.');
  return Object.freeze({
    id,
    setCode: cleanText(row.set_code),
    nativeName: cleanText(row.native_name),
    englishDisplayName: cleanText(row.english_display_name),
  });
}

/** Read the complete, active Japanese Pokemon set universe before any ingestion write. */
export async function fetchActiveJapaneseCatalogueSets(
  db: DatabaseLike,
): Promise<readonly ActiveJapaneseCatalogueSet[]> {
  const pageSize = 1_000;
  const rows: ActiveJapaneseCatalogueSet[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await db.schema('catalog').from('sets')
      .select('id,set_code,native_name,english_display_name')
      .eq('game_code', 'pokemon')
      .eq('language_code', 'ja')
      .is('deprecated_at', null)
      .order('id', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page.map((row) => freezeCatalogueSet(row as Record<string, unknown>)));
    if (page.length < pageSize) break;
  }
  return Object.freeze(rows.sort(compareCatalogueSets));
}

function groupByCode<T>(values: readonly T[], keyFor: (value: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
  }
  return groups;
}

/**
 * Join only exact set codes after case folding. A code is usable only when it
 * identifies exactly one active catalogue set and exactly one PokeData set.
 */
export function buildExactPokeDataSetCrosswalk(
  catalogueInput: readonly ActiveJapaneseCatalogueSet[],
  providerInput: readonly Readonly<{
    providerSetId: string;
    setCode: string | null;
    setName: string;
  }>[],
): ExactPokeDataSetCrosswalk {
  const catalogue = [...catalogueInput].sort(compareCatalogueSets);
  const pokedata: CrosswalkProviderSet[] = providerInput.map((set) => {
    const providerSetId = cleanText(set.providerSetId) ?? '';
    const setCode = cleanText(set.setCode);
    const resolution = resolvePokeDataJapaneseSetCode(providerSetId, setCode);
    return Object.freeze({
      providerSetId,
      setCode,
      effectiveSetCode: resolution.effectiveCode,
      identityPolicy: resolution.identityPolicy,
      setName: cleanText(set.setName) ?? '',
    });
  }).sort(compareProviderSets);
  for (const set of pokedata) {
    if (!/^[1-9][0-9]*$/u.test(set.providerSetId) || !set.setName) {
      throw new Error('PokeData exact set index contains an invalid immutable set descriptor.');
    }
  }

  const catalogueByCode = groupByCode(catalogue, (set) => codeKey(set.setCode));
  const pokedataByCode = groupByCode(pokedata, (set) => codeKey(set.effectiveSetCode));
  const allKeys = [...new Set([...catalogueByCode.keys(), ...pokedataByCode.keys()])]
    .sort((left, right) => left.localeCompare(right, 'en'));
  const matched: ExactPokeDataSetMatch[] = [];
  const unmatchedCatalogue: UnmatchedCatalogueSet[] = catalogue
    .filter((set) => !codeKey(set.setCode))
    .map((set) => Object.freeze({ ...set, reason: 'code_missing' as const }));
  const unmatchedPokeData: UnmatchedProviderSet[] = pokedata
    .filter((set) => !codeKey(set.effectiveSetCode))
    .map((set) => Object.freeze({ ...set, reason: 'code_missing' as const }));
  const ambiguous: Array<ExactPokeDataSetCrosswalk['ambiguous'][number]> = [];

  for (const key of allKeys) {
    const catalogueGroup = catalogueByCode.get(key) ?? [];
    const pokedataGroup = pokedataByCode.get(key) ?? [];
    if (catalogueGroup.length > 1 || pokedataGroup.length > 1) {
      ambiguous.push(Object.freeze({
        caseInsensitiveSetCode: key,
        catalogue: Object.freeze([...catalogueGroup]),
        pokedata: Object.freeze([...pokedataGroup]),
      }));
      continue;
    }
    if (catalogueGroup.length === 1 && pokedataGroup.length === 1) {
      const catalogueSet = catalogueGroup[0];
      const providerSet = pokedataGroup[0];
      matched.push(Object.freeze({
        catalogueSetId: catalogueSet.id,
        catalogueSetCode: catalogueSet.setCode!,
        catalogueSetName: catalogueSet.nativeName ?? catalogueSet.englishDisplayName,
        providerSetId: providerSet.providerSetId,
        providerSetCode: providerSet.effectiveSetCode!,
        providerReportedSetCode: providerSet.setCode,
        providerSetName: providerSet.setName,
        identityPolicy: providerSet.identityPolicy as Exclude<PokeDataJapaneseSetCodePolicy, 'code_missing'>,
      }));
      continue;
    }
    if (catalogueGroup.length === 1) {
      unmatchedCatalogue.push(Object.freeze({
        ...catalogueGroup[0],
        reason: 'no_exact_pokedata_code_match' as const,
      }));
    }
    if (pokedataGroup.length === 1) {
      unmatchedPokeData.push(Object.freeze({
        ...pokedataGroup[0],
        reason: 'no_exact_catalogue_code_match' as const,
      }));
    }
  }

  const frozenMatches = Object.freeze(matched);
  return Object.freeze({
    matched: frozenMatches,
    unmatched: Object.freeze({
      catalogue: Object.freeze(unmatchedCatalogue.sort(compareCatalogueSets)),
      pokedata: Object.freeze(unmatchedPokeData.sort(compareProviderSets)),
    }),
    ambiguous: Object.freeze(ambiguous),
    overridesApplied: Object.freeze(
      frozenMatches.filter((match) => match.identityPolicy === 'frozen_provider_id_override'),
    ),
  });
}

export function exactCrosswalkDigest(matches: readonly ExactPokeDataSetMatch[]) {
  const frozenIdentities = [...matches]
    .sort((left, right) => left.providerSetId.localeCompare(right.providerSetId, 'en', { numeric: true }))
    .map((match) => ({
      catalogueSetId: match.catalogueSetId,
      catalogueSetCode: match.catalogueSetCode,
      providerSetId: match.providerSetId,
      providerSetCode: match.providerSetCode,
      providerReportedSetCode: match.providerReportedSetCode,
      identityPolicy: match.identityPolicy,
    }));
  return createHash('sha256').update(JSON.stringify(frozenIdentities)).digest('hex');
}

export function setRunKey(runKeyPrefix: string, providerSetId: string) {
  return `${runKeyPrefix}:set-${providerSetId}`;
}

export function canonicalSetImportRunKey(runKeyPrefix: string, providerSetId: string) {
  return [
    'pokedata_japanese',
    'run_set',
    'ja',
    providerSetId,
    'all',
    'assets-only',
    setRunKey(runKeyPrefix, providerSetId),
  ].join(':').toLowerCase();
}

function runMetadata(match: ExactPokeDataSetMatch, crosswalkDigest: string) {
  return {
    contract: POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT,
    crosswalkDigest,
    catalogueSetId: match.catalogueSetId,
    catalogueSetCode: match.catalogueSetCode,
    catalogueSetName: match.catalogueSetName,
    providerSetId: match.providerSetId,
    providerSetCode: match.providerSetCode,
    providerReportedSetCode: match.providerReportedSetCode,
    providerSetName: match.providerSetName,
    identityPolicy: match.identityPolicy,
    metadataCreated: false,
    productionModified: false,
  };
}

export function completedRunMatches(
  run: CompletedImportRun | undefined,
  expected: ReturnType<typeof runMetadata>,
) {
  const metadata = run?.metadata && typeof run.metadata === 'object'
    ? run.metadata as Record<string, unknown>
    : null;
  const workstream = metadata?.workstream && typeof metadata.workstream === 'object'
    ? metadata.workstream as Record<string, unknown>
    : null;
  return Boolean(
    workstream
    && nonnegativeStat(run?.records_conflicted) === 0
    && workstream.contract === expected.contract
    && workstream.crosswalkDigest === expected.crosswalkDigest
    && workstream.catalogueSetId === expected.catalogueSetId
    && workstream.catalogueSetCode === expected.catalogueSetCode
    && workstream.catalogueSetName === expected.catalogueSetName
    && workstream.providerSetId === expected.providerSetId
    && workstream.providerSetCode === expected.providerSetCode
    && workstream.providerReportedSetCode === expected.providerReportedSetCode
    && workstream.providerSetName === expected.providerSetName
    && workstream.identityPolicy === expected.identityPolicy
    && workstream.metadataCreated === false
    && workstream.productionModified === false
  );
}

export async function readCompletedPokeDataSetRuns(
  db: DatabaseLike,
  runKeys: readonly string[],
): Promise<ReadonlyMap<string, CompletedImportRun>> {
  if (runKeys.length === 0) return new Map();
  const { data: source, error: sourceError } = await db.schema('ingest').from('sources')
    .select('id')
    .eq('code', 'pokedata_japanese')
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source?.id) return new Map();

  const rows: CompletedImportRun[] = [];
  for (let index = 0; index < runKeys.length; index += 50) {
    const keyBatch = runKeys.slice(index, index + 50);
    const { data, error } = await db.schema('ingest').from('import_runs')
      .select('run_key,records_requested,records_retrieved,records_inserted,records_updated,records_skipped,records_conflicted,metadata')
      .eq('source_id', source.id)
      .eq('status', 'completed')
      .in('run_key', keyBatch);
    if (error) throw error;
    rows.push(...((data ?? []) as CompletedImportRun[]));
  }
  return new Map(rows.map((row) => [String(row.run_key).toLowerCase(), row]));
}

/** Force every runner fetch to one crosswalk-approved immutable provider set. */
export function createCrosswalkBoundPokeDataAdapter(
  adapter: PokeDataJapaneseImageSourceAdapter,
  matches: readonly ExactPokeDataSetMatch[],
): SourceAdapter {
  const matchByProviderId = new Map(matches.map((match) => [match.providerSetId, match]));
  return {
    identifySource: () => adapter.identifySource(),
    healthCheck: () => adapter.healthCheck(),
    fetchSets: () => adapter.fetchSets(),
    fetchCards: () => adapter.fetchCards(),
    fetchVariants: () => adapter.fetchVariants(),
    fetchAssets: (scope = {}) => {
      const providerSetId = cleanText(scope.setId);
      if (!providerSetId || !matchByProviderId.has(providerSetId)) {
        throw new Error('Refusing PokeData assets outside the frozen exact set crosswalk.');
      }
      return adapter.fetchAssets({
        ...scope,
        language: 'ja',
        setId: providerSetId,
        cursor: { offset: 0 },
        limit: 1,
      });
    },
    normaliseRecord: (record) => {
      const normalised = adapter.normaliseRecord(record);
      const match = normalised.providerSetId
        ? matchByProviderId.get(normalised.providerSetId)
        : null;
      if (!match) throw new Error('PokeData asset escaped the frozen exact set crosswalk.');
      return {
        ...normalised,
        // PostgREST equality is case-sensitive. Preserve the exact canonical
        // casing after the case-insensitive, uniqueness-checked crosswalk.
        setCode: match.catalogueSetCode,
      };
    },
    validateRecord: (record) => adapter.validateRecord(record),
  };
}

function nonnegativeStat(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function statsFromResult(result: RunnerResult): Required<RunnerStats> {
  return {
    recordsRequested: nonnegativeStat(result.stats?.recordsRequested),
    recordsRetrieved: nonnegativeStat(result.stats?.recordsRetrieved),
    recordsInserted: nonnegativeStat(result.stats?.recordsInserted),
    recordsUpdated: nonnegativeStat(result.stats?.recordsUpdated),
    recordsSkipped: nonnegativeStat(result.stats?.recordsSkipped),
    recordsConflicted: nonnegativeStat(result.stats?.recordsConflicted),
    decisions: nonnegativeStat(result.stats?.decisions),
  };
}

function statsFromCompletedRun(run: CompletedImportRun): Required<RunnerStats> {
  return {
    recordsRequested: nonnegativeStat(run.records_requested),
    recordsRetrieved: nonnegativeStat(run.records_retrieved),
    recordsInserted: nonnegativeStat(run.records_inserted),
    recordsUpdated: nonnegativeStat(run.records_updated),
    recordsSkipped: nonnegativeStat(run.records_skipped),
    recordsConflicted: nonnegativeStat(run.records_conflicted),
    decisions: 0,
  };
}

function addStats(target: Required<RunnerStats>, addition: Required<RunnerStats>) {
  for (const key of Object.keys(target) as Array<keyof RunnerStats>) {
    target[key] += addition[key];
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function failedRunnerResult(result: RunnerResult) {
  return new Error(result.error || 'PokeData Japanese set ingestion returned ok=false.');
}

export async function ingestPokeDataJapaneseImages(
  db: DatabaseLike,
  adapter: PokeDataJapaneseImageSourceAdapter,
  options: PokeDataJapaneseImageIngestionOptions,
  dependencies: DriverDependencies = {},
) {
  const fetchCatalogueSets = dependencies.fetchCatalogueSets ?? fetchActiveJapaneseCatalogueSets;
  const readCompletedRuns = dependencies.readCompletedRuns ?? readCompletedPokeDataSetRuns;
  const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>(
    (resolve) => setTimeout(resolve, milliseconds),
  ));

  // Take the active canonical snapshot first. No provider record is allowed to
  // create or rename any catalogue identity in this worker.
  const catalogueSets = await fetchCatalogueSets(db);
  const providerSets = await adapter.fetchExactSetIndex();
  const crosswalk = buildExactPokeDataSetCrosswalk(
    catalogueSets,
    providerSets as readonly PokeDataJapaneseSetDescriptor[],
  );
  const crosswalkDigest = exactCrosswalkDigest(crosswalk.matched);
  const runKeyPrefix = options.runKeyPrefix
    ?? `${POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT}:crosswalk-${crosswalkDigest}`;
  const requestIdPrefix = options.requestIdPrefix ?? runKeyPrefix;
  const selectedMatches = crosswalk.matched.slice(options.offset, options.offset + options.limit);
  const boundAdapter = createCrosswalkBoundPokeDataAdapter(adapter, crosswalk.matched);
  const runner = (dependencies.createRunner ?? (
    (client: DatabaseLike, sourceAdapter: SourceAdapter) => new CatalogueIngestionRunner(client, sourceAdapter)
  ))(db, boundAdapter);
  const canonicalRunKeys = selectedMatches.map(
    (match) => canonicalSetImportRunKey(runKeyPrefix, match.providerSetId),
  );
  const completedRuns = await readCompletedRuns(db, canonicalRunKeys);
  const totals: Required<RunnerStats> = {
    recordsRequested: 0,
    recordsRetrieved: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    recordsConflicted: 0,
    decisions: 0,
  };
  const runs: Array<Record<string, unknown>> = [];
  let providerRunsStarted = 0;
  let failures = 0;
  let resumed = 0;

  for (const match of selectedMatches) {
    const metadata = runMetadata(match, crosswalkDigest);
    const canonicalRunKey = canonicalSetImportRunKey(runKeyPrefix, match.providerSetId);
    const completed = completedRuns.get(canonicalRunKey);
    if (completedRunMatches(completed, metadata)) {
      const stats = statsFromCompletedRun(completed!);
      addStats(totals, stats);
      resumed += 1;
      runs.push({
        status: 'already_completed',
        attempts: 0,
        catalogueSetId: match.catalogueSetId,
        catalogueSetCode: match.catalogueSetCode,
        providerSetId: match.providerSetId,
        providerSetCode: match.providerSetCode,
        providerReportedSetCode: match.providerReportedSetCode,
        identityPolicy: match.identityPolicy,
        runKey: setRunKey(runKeyPrefix, match.providerSetId),
        stats,
      });
      continue;
    }

    if (providerRunsStarted > 0 && options.setPauseMs > 0) await sleep(options.setPauseMs);
    providerRunsStarted += 1;
    let lastError: unknown = null;
    let accepted: RunnerResult | null = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
      attempts = attempt;
      try {
        const result = await runner.run({
          command: 'run_set',
          importType: 'repair',
          language: 'ja',
          setId: match.providerSetId,
          cursor: { offset: 0 },
          limit: 1,
          runKey: setRunKey(runKeyPrefix, match.providerSetId),
          requestId: `${requestIdPrefix}:set-${match.providerSetId}`,
          assetsOnly: true,
          allowImageAssets: true,
          approvedOnlyAssets: true,
          writeConcurrency: options.writeConcurrency,
          runMetadata: metadata,
        });
        if (!result.ok) throw failedRunnerResult(result);
        accepted = result;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < options.maxAttempts && options.retryBaseMs > 0) {
          await sleep(Math.min(options.retryBaseMs * (2 ** (attempt - 1)), 30_000));
        }
      }
    }

    if (!accepted) {
      failures += 1;
      runs.push({
        status: 'failed',
        attempts,
        catalogueSetId: match.catalogueSetId,
        catalogueSetCode: match.catalogueSetCode,
        providerSetId: match.providerSetId,
        providerSetCode: match.providerSetCode,
        providerReportedSetCode: match.providerReportedSetCode,
        identityPolicy: match.identityPolicy,
        runKey: setRunKey(runKeyPrefix, match.providerSetId),
        error: errorMessage(lastError),
      });
      continue;
    }

    const stats = statsFromResult(accepted);
    addStats(totals, stats);
    runs.push({
      status: 'completed',
      attempts,
      catalogueSetId: match.catalogueSetId,
      catalogueSetCode: match.catalogueSetCode,
      providerSetId: match.providerSetId,
      providerSetCode: match.providerSetCode,
      providerReportedSetCode: match.providerReportedSetCode,
      identityPolicy: match.identityPolicy,
      runKey: setRunKey(runKeyPrefix, match.providerSetId),
      importRunId: accepted.importRunId ?? null,
      stats,
    });
  }

  const ambiguousSetCount = crosswalk.ambiguous.reduce(
    (sum, group) => sum + group.catalogue.length + group.pokedata.length,
    0,
  );
  const unmatchedSetCount = crosswalk.unmatched.catalogue.length + crosswalk.unmatched.pokedata.length;
  return {
    ok: failures === 0,
    job: POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT,
    language: 'ja',
    mode: 'image-only',
    metadataCreated: false,
    productionModified: false,
    crosswalkDigest,
    batch: {
      offset: options.offset,
      limit: options.limit,
      runKeyPrefix,
      selectedSets: selectedMatches.length,
      resumedSets: resumed,
      attemptedSets: providerRunsStarted,
      failedSets: failures,
    },
    setTotals: {
      activeCatalogueSets: catalogueSets.length,
      pokedataJapanesePokemonSets: providerSets.length,
      matched: crosswalk.matched.length,
      unmatched: unmatchedSetCount,
      ambiguous: ambiguousSetCount,
      overridesApplied: crosswalk.overridesApplied.length,
    },
    matched: crosswalk.matched,
    unmatched: crosswalk.unmatched,
    ambiguous: crosswalk.ambiguous,
    overridesApplied: crosswalk.overridesApplied,
    runs,
    totals: {
      requested: totals.recordsRequested,
      retrieved: totals.recordsRetrieved,
      inserted: totals.recordsInserted,
      updated: totals.recordsUpdated,
      skipped: totals.recordsSkipped,
      conflicted: totals.recordsConflicted,
      decisions: totals.decisions,
    },
  };
}

function cliArg(argv: readonly string[], name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function boundedInteger(
  argv: readonly string[],
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(cliArg(argv, name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function safePrefix(value: string, name: string) {
  const prefix = cleanText(value);
  if (!prefix) return null;
  if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/iu.test(prefix)) {
    throw new Error(`--${name} must contain only letters, digits, dot, underscore, colon, or hyphen (maximum 160 characters).`);
  }
  return prefix;
}

export function parsePokeDataJapaneseImageIngestionOptions(
  argv: readonly string[],
): PokeDataJapaneseImageIngestionOptions {
  return Object.freeze({
    offset: boundedInteger(argv, 'offset', 0, 0, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(argv, 'limit', 50, 1, 50),
    writeConcurrency: boundedInteger(argv, 'writeConcurrency', 8, 1, 16),
    maxAttempts: boundedInteger(argv, 'maxAttempts', 3, 1, 6),
    requestTimeoutMs: boundedInteger(argv, 'requestTimeoutMs', 30_000, 1_000, 120_000),
    setPauseMs: boundedInteger(argv, 'setPauseMs', 750, 0, 30_000),
    retryBaseMs: boundedInteger(argv, 'retryBaseMs', 1_000, 0, 30_000),
    runKeyPrefix: safePrefix(cliArg(argv, 'runKey'), 'runKey'),
    requestIdPrefix: safePrefix(cliArg(argv, 'requestId'), 'requestId'),
  });
}

export function assertPokeDataStagingTarget(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
) {
  const target = cleanText(
    cliArg(argv, 'target')
    || environment.STACKR_CATALOGUE_IMPORT_TARGET
    || environment.STACKR_IMPORT_TARGET,
  )?.toLowerCase();
  const supabaseUrl = cleanText(environment.SUPABASE_URL);
  const key = cleanText(environment.SUPABASE_SERVICE_ROLE_KEY || environment.SUPABASE_SECRET_KEY);
  if (target !== 'staging') {
    throw new Error('PokeData Japanese image ingestion requires --target=staging.');
  }
  if (!supabaseUrl || !key) {
    throw new Error('SUPABASE_URL and backend-only Supabase credentials are required.');
  }
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL for canonical staging.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === `${PRODUCTION_SUPABASE_REF}.supabase.co`) {
    throw new Error(`Refusing PokeData ingestion against production Supabase ${PRODUCTION_SUPABASE_REF}.`);
  }
  if (parsed.origin !== `https://${STAGING_SUPABASE_REF}.supabase.co`
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password) {
    throw new Error(`PokeData ingestion requires canonical staging Supabase ${STAGING_SUPABASE_REF}.`);
  }
  return { supabaseUrl, key };
}

function printHelp() {
  console.log(`Ingest PokeData Japanese card-image references into existing StackR staging identities.

Usage:
  npm run catalogue:ingest-pokedata-japanese-images -- --target=staging --offset=0 --limit=50

Options:
  --offset=0                 Matched-set offset for a resumable shard.
  --limit=50                 Matched sets in this shard (1-50).
  --writeConcurrency=8       Concurrent staging writes within one set (1-16).
  --maxAttempts=3            Provider/set-run attempts (1-6).
  --requestTimeoutMs=30000   Per-request timeout (1000-120000).
  --setPauseMs=750           Delay between exact provider-set requests (0-30000).
  --retryBaseMs=1000         Exponential set-run retry base (0-30000).
  --runKey=<stable-prefix>   Optional resumable run-key prefix.
  --requestId=<prefix>       Optional audit request-id prefix.

The worker queries active Japanese catalogue sets first, matches unique exact
case-insensitive set codes, and imports assets only. It never creates metadata,
publishes, promotes, deploys, or accesses production.`);
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (argv.includes('--help')) {
    printHelp();
    return null;
  }
  const options = parsePokeDataJapaneseImageIngestionOptions(argv);
  const { supabaseUrl, key } = assertPokeDataStagingTarget(argv, environment);
  const db = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adapter = new PokeDataJapaneseImageSourceAdapter({
    language: 'ja',
    licenceStatus: 'approved',
    assetLicenceStatus: 'approved',
    requestAttempts: options.maxAttempts,
    requestTimeoutMs: options.requestTimeoutMs,
    requestDelayMs: options.setPauseMs,
  });
  const report = await ingestPokeDataJapaneseImages(db, adapter, options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      job: POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT,
      error: errorMessage(error),
      metadataCreated: false,
      productionModified: false,
    }, null, 2));
    process.exitCode = 1;
  });
}
