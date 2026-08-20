import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const LANGUAGES = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'] as const;
const SOURCES = ['tcgdex', 'pokemon-tcg-api'] as const;
const PAGE_SIZE = 1000;

type LanguageCode = typeof LANGUAGES[number];
type SourceCode = typeof SOURCES[number];
type JsonObject = Record<string, unknown>;

type ImportRun = {
  id: string;
  source_id: string;
  run_key: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_requested: number | null;
  records_retrieved: number | null;
  records_inserted: number | null;
  records_updated: number | null;
  records_skipped: number | null;
  records_conflicted: number | null;
  metadata: JsonObject | null;
};

type RawRecord = {
  external_id: string;
  language_code: string | null;
  record_type: string;
  validation_status: string | null;
  validation_errors: unknown;
  raw_payload: JsonObject;
};

type ResidualRow = {
  source: SourceCode;
  language: LanguageCode;
  recordType: 'set' | 'card';
  externalId: string;
  missingFields: string[];
  validationStatus: string | null;
  validationErrors: unknown;
};

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nested(value: unknown, pathParts: string[]): unknown {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as JsonObject)[part];
  }
  return current;
}

function first(payload: JsonObject, paths: string[][]): unknown {
  for (const candidate of paths) {
    const value = nested(payload, candidate);
    if (Array.isArray(value) ? value.length > 0 : clean(value)) return value;
  }
  return null;
}

function setId(payload: JsonObject) {
  const value = first(payload, [
    ['set', 'id'],
    ['setId'],
    ['set_id'],
    ['expansion', 'id'],
    ['expansionId'],
  ]);
  return clean(value);
}

function collectorNumber(payload: JsonObject) {
  return clean(first(payload, [
    ['localId'],
    ['local_id'],
    ['number'],
    ['collectorNumber'],
    ['collector_number'],
    ['card_number'],
  ]));
}

const CARD_FIELDS: Record<string, string[][]> = {
  name: [['name'], ['localName'], ['local_name']],
  collectorNumber: [['localId'], ['local_id'], ['number'], ['collectorNumber'], ['collector_number'], ['card_number']],
  setId: [['set', 'id'], ['setId'], ['set_id'], ['expansion', 'id'], ['expansionId']],
  rarity: [['rarity']],
  variants: [['variants'], ['variant']],
  category: [['category'], ['supertype']],
  regulationMark: [['regulationMark'], ['regulation_mark']],
  hp: [['hp']],
  types: [['types']],
  abilities: [['abilities'], ['ability']],
  attacks: [['attacks']],
  weaknesses: [['weaknesses']],
  resistances: [['resistances']],
  retreat: [['retreat'], ['retreatCost'], ['convertedRetreatCost']],
  legalities: [['legal'], ['legalities']],
  dexId: [['dexId'], ['dex_id'], ['nationalPokedexNumbers']],
  artist: [['illustrator'], ['artist']],
  imageReference: [['image'], ['images', 'large'], ['images', 'small'], ['image_url']],
};

const SET_FIELDS: Record<string, string[][]> = {
  name: [['name'], ['localName'], ['local_name']],
  series: [['serie', 'id'], ['serie', 'name'], ['series'], ['series', 'id'], ['series', 'name']],
  releaseDate: [['releaseDate'], ['release_date']],
  printedTotal: [['cardCount', 'official'], ['printedTotal'], ['printed_total']],
  total: [['cardCount', 'total'], ['total']],
  logoReference: [['logo'], ['images', 'logo']],
  symbolReference: [['symbol'], ['images', 'symbol']],
};

function missingRequiredFields(recordType: 'set' | 'card', payload: JsonObject) {
  if (recordType === 'set') {
    return [
      clean(first(payload, SET_FIELDS.name)) ? null : 'name',
      clean(first(payload, SET_FIELDS.series)) ? null : 'series',
      clean(first(payload, SET_FIELDS.releaseDate)) ? null : 'releaseDate',
    ].filter((value): value is string => Boolean(value));
  }
  return [
    clean(first(payload, CARD_FIELDS.name)) ? null : 'name',
    collectorNumber(payload) ? null : 'collectorNumber',
    setId(payload) ? null : 'setId',
  ].filter((value): value is string => Boolean(value));
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function stableJson(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function checksum(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stagingClient() {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL and backend-only service credentials are required.');
  if (!url.includes(STAGING_SUPABASE_REF) || url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Metadata audit must use StackR staging project ${STAGING_SUPABASE_REF}.`);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sourceIds(db: SupabaseClient) {
  const { data, error } = await db
    .schema('ingest')
    .from('sources')
    .select('id, code')
    .in('code', [...SOURCES]);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.code as SourceCode, row.id as string]));
}

async function importRuns(db: SupabaseClient, sourceId: string, source: SourceCode, sinceIso: string) {
  const { data, error } = await db
    .schema('ingest')
    .from('import_runs')
    .select('id, source_id, run_key, status, started_at, finished_at, records_requested, records_retrieved, records_inserted, records_updated, records_skipped, records_conflicted, metadata')
    .eq('source_id', sourceId)
    .gte('started_at', sinceIso)
    .ilike('run_key', `%full-metadata:%`)
    .order('started_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, source } as ImportRun & { source: SourceCode }));
}

async function rawRecordsForRuns(
  db: SupabaseClient,
  runIds: string[],
  language: LanguageCode,
  recordType: 'set' | 'card',
) {
  const results: RawRecord[] = [];
  const chunks: string[][] = [];
  for (let index = 0; index < runIds.length; index += 75) chunks.push(runIds.slice(index, index + 75));
  for (const runChunk of chunks) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await db
        .schema('ingest')
        .from('raw_source_records')
        .select('external_id, language_code, record_type, validation_status, validation_errors, raw_payload')
        .in('import_run_id', runChunk)
        .eq('language_code', language)
        .eq('record_type', recordType)
        .order('external_id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as RawRecord[];
      results.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  const unique = new Map<string, RawRecord>();
  for (const row of results) unique.set(row.external_id, row);
  return [...unique.values()];
}

function languageFromRun(run: ImportRun): LanguageCode | null {
  const language = clean(run.metadata?.language)?.toLowerCase().replace(/_/g, '-');
  return LANGUAGES.includes(language as LanguageCode) ? language as LanguageCode : null;
}

function fieldCoverage(records: RawRecord[], fields: Record<string, string[][]>) {
  return Object.fromEntries(Object.entries(fields).map(([field, paths]) => {
    const present = records.filter((row) => {
      const value = first(row.raw_payload, paths);
      return Array.isArray(value) ? value.length > 0 : Boolean(clean(value));
    }).length;
    return [field, {
      present,
      missing: records.length - present,
      coveragePercent: records.length ? Number(((present / records.length) * 100).toFixed(2)) : 0,
    }];
  }));
}

async function canonicalCount(db: SupabaseClient, table: 'sets' | 'card_variants', language: LanguageCode) {
  const { count, error } = await db
    .schema('catalog')
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('language_code', language)
    .is('deprecated_at', null);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const sinceHours = Number(arg('sinceHours', '24'));
  if (!Number.isFinite(sinceHours) || sinceHours < 1 || sinceHours > 720) {
    throw new Error('--sinceHours must be from 1 to 720.');
  }
  const outputRoot = path.resolve(arg('outputRoot', 'reports/catalogue-metadata-audit'));
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
  const db = stagingClient();
  const ids = await sourceIds(db);
  const allRuns = (await Promise.all(SOURCES.map(async (source) => {
    const sourceId = ids.get(source);
    return sourceId ? importRuns(db, sourceId, source, sinceIso) : [];
  }))).flat();

  const residuals: ResidualRow[] = [];
  const languages: Record<string, unknown> = {};

  for (const language of LANGUAGES) {
    const sourceReports: Record<string, unknown> = {};
    for (const source of SOURCES) {
      if (source === 'pokemon-tcg-api' && language !== 'en') continue;
      const runs = allRuns.filter((run) => (
        (run as ImportRun & { source: SourceCode }).source === source
        && languageFromRun(run) === language
      ));
      const runIds = runs.map((run) => run.id);
      const sets = runIds.length ? await rawRecordsForRuns(db, runIds, language, 'set') : [];
      const cards = runIds.length ? await rawRecordsForRuns(db, runIds, language, 'card') : [];

      for (const [recordType, records] of [['set', sets], ['card', cards]] as const) {
        for (const row of records) {
          const missingFields = missingRequiredFields(recordType, row.raw_payload);
          if (missingFields.length || row.validation_status === 'invalid') {
            residuals.push({
              source,
              language,
              recordType,
              externalId: row.external_id,
              missingFields,
              validationStatus: row.validation_status,
              validationErrors: row.validation_errors,
            });
          }
        }
      }

      sourceReports[source] = {
        runs: runs.length,
        runStatus: Object.fromEntries([...new Set(runs.map((run) => run.status))].map((status) => [
          status,
          runs.filter((run) => run.status === status).length,
        ])),
        records: {
          sets: sets.length,
          cards: cards.length,
        },
        importerTotals: {
          requested: runs.reduce((sum, run) => sum + numberValue(run.records_requested), 0),
          retrieved: runs.reduce((sum, run) => sum + numberValue(run.records_retrieved), 0),
          inserted: runs.reduce((sum, run) => sum + numberValue(run.records_inserted), 0),
          updated: runs.reduce((sum, run) => sum + numberValue(run.records_updated), 0),
          skipped: runs.reduce((sum, run) => sum + numberValue(run.records_skipped), 0),
          conflicted: runs.reduce((sum, run) => sum + numberValue(run.records_conflicted), 0),
        },
        requiredIdentityResiduals: residuals.filter((row) => row.source === source && row.language === language).length,
        fieldCoverage: {
          sets: fieldCoverage(sets, SET_FIELDS),
          cards: fieldCoverage(cards, CARD_FIELDS),
        },
      };
    }
    languages[language] = {
      canonical: {
        sets: await canonicalCount(db, 'sets', language),
        variants: await canonicalCount(db, 'card_variants', language),
      },
      sources: sourceReports,
    };
  }

  const reportWithoutChecksum = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stagingProject: STAGING_SUPABASE_REF,
    sinceIso,
    languages,
    residualSummary: {
      total: residuals.length,
      byLanguage: Object.fromEntries(LANGUAGES.map((language) => [
        language,
        residuals.filter((row) => row.language === language).length,
      ])),
      bySource: Object.fromEntries(SOURCES.map((source) => [
        source,
        residuals.filter((row) => row.source === source).length,
      ])),
    },
  };
  const report = { ...reportWithoutChecksum, sha256: checksum(reportWithoutChecksum) };

  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, 'metadata-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const csvLines = [
    ['source', 'language', 'record_type', 'external_id', 'missing_fields', 'validation_status', 'validation_errors'].join(','),
    ...residuals.map((row) => [
      row.source,
      row.language,
      row.recordType,
      row.externalId,
      row.missingFields,
      row.validationStatus,
      JSON.stringify(row.validationErrors ?? null),
    ].map(csvCell).join(',')),
  ];
  await writeFile(path.join(outputRoot, 'metadata-residuals.csv'), `${csvLines.join('\n')}\n`, 'utf8');

  const incompleteLanguages = LANGUAGES.filter((language) => {
    const sourceReport = (languages[language] as JsonObject)?.sources as JsonObject | undefined;
    const tcgdex = sourceReport?.tcgdex as JsonObject | undefined;
    return numberValue((tcgdex?.records as JsonObject | undefined)?.cards) === 0;
  });

  console.log(JSON.stringify({
    ok: incompleteLanguages.length === 0,
    outputRoot,
    residuals: residuals.length,
    incompleteLanguages,
    sha256: report.sha256,
  }, null, 2));
  if (incompleteLanguages.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});