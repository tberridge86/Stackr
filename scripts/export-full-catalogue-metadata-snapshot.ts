import 'dotenv/config';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import {
  normaliseLanguageCode,
  type SupportedCatalogueLanguageCode,
} from './catalogue-ingestion/sourceAdapter';

const DEFAULT_LANGUAGES: SupportedCatalogueLanguageCode[] = ['en', 'ja', 'zh-tw', 'zh-cn', 'ko'];
const SUPPORTED_SOURCES = new Set(['tcgdex', 'pokemon-tcg-api']);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type SnapshotSource = 'tcgdex' | 'pokemon-tcg-api';

type SnapshotOptions = {
  sources: SnapshotSource[];
  languages: SupportedCatalogueLanguageCode[];
  tcgdexBaseUrl: string;
  pokemonBaseUrl: string;
  outputDir: string;
  detailConcurrency: number;
  maxAttempts: number;
  requestTimeoutMs: number;
  maxRecords: number | null;
};

type RequestResult = {
  value: unknown;
  status: number;
  attempts: number;
  url: string;
  etag: string | null;
  lastModified: string | null;
};

type SnapshotFile = {
  file: string;
  count: number;
  bytes: number;
  sha256: string;
};

type SnapshotFailure = {
  source: SnapshotSource;
  language: string;
  resource: string;
  id: string | null;
  url: string;
  error: string;
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

export function normaliseSnapshotSources(values: string[]): SnapshotSource[] {
  const sources = values.map((value) => value.trim().toLowerCase().replace(/_/g, '-')).map((value) => {
    if (value === 'pokemontcg' || value === 'pokemon-tcg') return 'pokemon-tcg-api';
    return value;
  });
  for (const source of sources) {
    if (!SUPPORTED_SOURCES.has(source)) {
      throw new Error(`Unsupported metadata snapshot source ${source}. Use tcgdex or pokemon-tcg-api.`);
    }
  }
  return [...new Set(sources)] as SnapshotSource[];
}

export function normaliseSnapshotLanguages(values: string[]): SupportedCatalogueLanguageCode[] {
  return [...new Set(values.map((value) => normaliseLanguageCode(value)))] as SupportedCatalogueLanguageCode[];
}

function parseOptions(): SnapshotOptions {
  return {
    sources: normaliseSnapshotSources(csv(arg('sources', 'tcgdex,pokemon-tcg-api'))),
    languages: normaliseSnapshotLanguages(csv(arg('languages', DEFAULT_LANGUAGES.join(',')))),
    tcgdexBaseUrl: arg('tcgdexBaseUrl', process.env.TCGDEX_API_BASE_URL || 'https://api.tcgdex.net/v2').replace(/\/$/, ''),
    pokemonBaseUrl: arg('pokemonBaseUrl', process.env.POKEMON_TCG_API_BASE_URL || 'https://api.pokemontcg.io/v2').replace(/\/$/, ''),
    outputDir: path.resolve(arg('outputDir', 'reports/catalogue/full-metadata-snapshot')),
    detailConcurrency: boundedInteger('detailConcurrency', 16, 1, 48),
    maxAttempts: boundedInteger('maxAttempts', 4, 1, 8),
    requestTimeoutMs: boundedInteger('requestTimeoutMs', 60_000, 1000, 180_000),
    maxRecords: optionalPositiveInteger('maxRecords'),
  };
}

function printHelp() {
  console.log(`StackR complete catalogue metadata snapshot exporter

Exports raw, provider-complete metadata without downloading artwork or writing
to StackR's database. TCGdex supplies EN, JA, ZH-TW, ZH-CN and KO; the Pokémon
TCG Developers API supplies the secondary English reconciliation snapshot.

Usage:
  npx tsx scripts/export-full-catalogue-metadata-snapshot.ts \\
    --sources=tcgdex,pokemon-tcg-api \\
    --languages=en,ja,zh-tw,zh-cn,ko \\
    --tcgdexBaseUrl=http://127.0.0.1:3300/v2 \\
    --outputDir=reports/catalogue/full-metadata-snapshot

Options:
  --detailConcurrency=16
  --maxAttempts=4
  --requestTimeoutMs=60000
  --maxRecords=<n>       Bounded smoke/acceptance export per collection.

The output includes full card and set records, series metadata, provider field
dictionaries, counts, failures, byte sizes and SHA-256 checksums.`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryAfterMs(value: string | null, now = Date.now()) {
  const raw = clean(value);
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

async function fetchJson(
  url: string,
  options: {
    headers?: Record<string, string>;
    maxAttempts: number;
    requestTimeoutMs: number;
  },
): Promise<RequestResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      });
      const body = response.status === 204 ? '' : await response.text();
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${body.slice(0, 320)}`);
        Object.assign(error, { status: response.status, retryAfter: response.headers.get('retry-after') });
        throw error;
      }
      let value: unknown = null;
      if (body) {
        try {
          value = JSON.parse(body);
        } catch (error) {
          throw new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return {
        value,
        status: response.status,
        attempts: attempt,
        url,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
      };
    } catch (error) {
      lastError = error;
      const status = Number((error as { status?: number }).status ?? 0);
      if (status && !RETRYABLE_STATUSES.has(status)) throw error;
      if (attempt === options.maxAttempts) throw error;
      const providerDelay = retryAfterMs((error as { retryAfter?: string | null }).retryAfter ?? null);
      const delay = providerDelay ?? Math.min(750 * (2 ** (attempt - 1)), 15_000);
      await sleep(delay);
      await response?.body?.cancel().catch(() => undefined);
    }
  }
  throw lastError ?? new Error(`Request failed for ${url}.`);
}

export function arrayPayload(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data;
  }
  throw new Error(`${label} did not return an array.`);
}

export function providerRecordId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return clean(value);
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return clean(record.id ?? record.slug ?? record.code);
}

export function uniqueProviderIds(values: unknown[], label: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = providerRecordId(value);
    if (!id) throw new Error(`${label} contains a record without an id.`);
    if (seen.has(id)) throw new Error(`${label} contains duplicate id ${id}.`);
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let next = 0;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (next < values.length && firstError === undefined) {
      const index = next;
      next += 1;
      try {
        results[index] = await mapper(values[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  });
  await Promise.all(workers);
  if (firstError !== undefined) throw firstError;
  return results;
}

class JsonArrayWriter {
  readonly finalPath: string;
  readonly temporaryPath: string;
  readonly stream;
  readonly hash = createHash('sha256');
  count = 0;
  bytes = 0;
  closed = false;

  private constructor(finalPath: string) {
    this.finalPath = finalPath;
    this.temporaryPath = `${finalPath}.partial`;
    this.stream = createWriteStream(this.temporaryPath, { encoding: 'utf8' });
  }

  static async create(finalPath: string) {
    await mkdir(path.dirname(finalPath), { recursive: true });
    await rm(`${finalPath}.partial`, { force: true });
    const writer = new JsonArrayWriter(finalPath);
    await writer.writeRaw('[');
    return writer;
  }

  async writeRaw(text: string) {
    if (this.closed) throw new Error(`Cannot write to closed snapshot ${this.finalPath}.`);
    this.hash.update(text);
    this.bytes += Buffer.byteLength(text);
    if (!this.stream.write(text)) await once(this.stream, 'drain');
  }

  async append(value: unknown) {
    await this.writeRaw(`${this.count ? ',' : ''}${JSON.stringify(value)}`);
    this.count += 1;
  }

  async close(): Promise<SnapshotFile> {
    if (this.closed) throw new Error(`Snapshot ${this.finalPath} is already closed.`);
    await this.writeRaw(']\n');
    this.closed = true;
    this.stream.end();
    await finished(this.stream);
    await rename(this.temporaryPath, this.finalPath);
    const details = await stat(this.finalPath);
    return {
      file: this.finalPath,
      count: this.count,
      bytes: details.size,
      sha256: this.hash.digest('hex'),
    };
  }

  async abort() {
    if (!this.closed) {
      this.closed = true;
      this.stream.destroy();
    }
    await rm(this.temporaryPath, { force: true });
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<SnapshotFile> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, body, 'utf8');
  return {
    file: filePath,
    count: Array.isArray(value) ? value.length : 1,
    bytes: Buffer.byteLength(body),
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

async function exportTcgdexDetails(
  resource: 'cards' | 'sets',
  language: SupportedCatalogueLanguageCode,
  options: SnapshotOptions,
  failures: SnapshotFailure[],
): Promise<SnapshotFile> {
  const listUrl = `${options.tcgdexBaseUrl}/${language}/${resource}`;
  const list = arrayPayload((await fetchJson(listUrl, options)).value, `TCGdex ${language} ${resource}`);
  const ids = uniqueProviderIds(list, `TCGdex ${language} ${resource}`);
  const selected = options.maxRecords == null ? ids : ids.slice(0, options.maxRecords);
  const filePath = path.join(options.outputDir, 'tcgdex', language, `${resource}.json`);
  const writer = await JsonArrayWriter.create(filePath);

  try {
    for (let start = 0; start < selected.length; start += 500) {
      const chunk = selected.slice(start, start + 500);
      const results = await mapWithConcurrency(chunk, options.detailConcurrency, async (id) => {
        const url = `${options.tcgdexBaseUrl}/${language}/${resource}/${encodeURIComponent(id)}`;
        try {
          return { id, value: (await fetchJson(url, options)).value, url, error: null };
        } catch (error) {
          return {
            id,
            value: null,
            url,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      for (const result of results) {
        if (result.error || !result.value || typeof result.value !== 'object') {
          failures.push({
            source: 'tcgdex',
            language,
            resource,
            id: result.id,
            url: result.url,
            error: result.error ?? 'Provider returned an empty detail record.',
          });
          continue;
        }
        await writer.append(result.value);
      }
    }
    return await writer.close();
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

export async function exportTcgdexLanguageSnapshot(
  language: SupportedCatalogueLanguageCode,
  options: SnapshotOptions,
  failures: SnapshotFailure[],
) {
  const cards = await exportTcgdexDetails('cards', language, options, failures);
  const sets = await exportTcgdexDetails('sets', language, options, failures);
  const seriesUrl = `${options.tcgdexBaseUrl}/${language}/series`;
  const series = arrayPayload((await fetchJson(seriesUrl, options)).value, `TCGdex ${language} series`);
  const seriesFile = await writeJsonFile(
    path.join(options.outputDir, 'tcgdex', language, 'series.json'),
    options.maxRecords == null ? series : series.slice(0, options.maxRecords),
  );
  return {
    source: 'tcgdex' as const,
    language,
    cards,
    sets,
    series: seriesFile,
    listCounts: {
      cards: cards.count + failures.filter((failure) => failure.source === 'tcgdex' && failure.language === language && failure.resource === 'cards').length,
      sets: sets.count + failures.filter((failure) => failure.source === 'tcgdex' && failure.language === language && failure.resource === 'sets').length,
      series: seriesFile.count,
    },
  };
}

function pokemonHeaders() {
  const key = clean(process.env.POKEMON_TCG_API_KEY);
  return key ? { 'X-Api-Key': key } : {};
}

async function exportPokemonCollection(
  resource: 'cards' | 'sets',
  options: SnapshotOptions,
): Promise<SnapshotFile & { providerTotal: number; pages: number }> {
  const filePath = path.join(options.outputDir, 'pokemon-tcg-api', 'en', `${resource}.json`);
  const writer = await JsonArrayWriter.create(filePath);
  const seen = new Set<string>();
  const pageSize = 250;
  let expectedTotal: number | null = null;
  let pages = 0;

  try {
    for (let page = 1; page <= 5000; page += 1) {
      const url = new URL(`${options.pokemonBaseUrl}/${resource}`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', String(pageSize));
      url.searchParams.set('orderBy', 'id');
      const payload = (await fetchJson(url.toString(), {
        ...options,
        headers: pokemonHeaders(),
      })).value;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`Pokémon TCG API ${resource} page ${page} returned an invalid object.`);
      }
      const envelope = payload as Record<string, unknown>;
      const rows = arrayPayload(envelope.data, `Pokémon TCG API ${resource} page ${page}`);
      const responsePage = Number(envelope.page ?? page);
      const responsePageSize = Number(envelope.pageSize ?? pageSize);
      const responseCount = Number(envelope.count ?? rows.length);
      const responseTotal = Number(envelope.totalCount);
      if (responsePage !== page || responsePageSize > pageSize || responseCount !== rows.length) {
        throw new Error(`Pokémon TCG API ${resource} returned inconsistent pagination metadata on page ${page}.`);
      }
      if (!Number.isInteger(responseTotal) || responseTotal < 0) {
        throw new Error(`Pokémon TCG API ${resource} response omitted totalCount.`);
      }
      if (expectedTotal == null) expectedTotal = responseTotal;
      if (expectedTotal !== responseTotal) {
        throw new Error(`Pokémon TCG API ${resource} totalCount changed from ${expectedTotal} to ${responseTotal}.`);
      }

      pages += 1;
      for (const row of rows) {
        const id = providerRecordId(row);
        if (!id) throw new Error(`Pokémon TCG API ${resource} page ${page} returned a record without an id.`);
        if (seen.has(id)) throw new Error(`Pokémon TCG API ${resource} returned duplicate id ${id}.`);
        seen.add(id);
        await writer.append(row);
        if (options.maxRecords != null && writer.count >= options.maxRecords) break;
      }

      if (options.maxRecords != null && writer.count >= options.maxRecords) break;
      if (rows.length === 0 || rows.length < responsePageSize || writer.count >= responseTotal) break;
    }

    const file = await writer.close();
    if (options.maxRecords == null && expectedTotal != null && file.count !== expectedTotal) {
      throw new Error(`Pokémon TCG API ${resource} export ended at ${file.count} of ${expectedTotal}.`);
    }
    return { ...file, providerTotal: expectedTotal ?? file.count, pages };
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

export async function exportPokemonTcgSnapshot(options: SnapshotOptions) {
  const cards = await exportPokemonCollection('cards', options);
  const sets = await exportPokemonCollection('sets', options);
  const fields: Record<string, unknown[]> = {};
  for (const resource of ['types', 'subtypes', 'supertypes', 'rarities']) {
    const url = `${options.pokemonBaseUrl}/${resource}`;
    const payload = (await fetchJson(url, { ...options, headers: pokemonHeaders() })).value;
    fields[resource] = arrayPayload(payload, `Pokémon TCG API ${resource}`);
  }
  const fieldsFile = await writeJsonFile(
    path.join(options.outputDir, 'pokemon-tcg-api', 'en', 'fields.json'),
    fields,
  );
  return {
    source: 'pokemon-tcg-api' as const,
    language: 'en' as const,
    apiKeyConfigured: Boolean(clean(process.env.POKEMON_TCG_API_KEY)),
    cards,
    sets,
    fields: fieldsFile,
  };
}

async function writeManifest(outputDir: string, manifest: Record<string, unknown>) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function runFullCatalogueMetadataSnapshot() {
  if (hasFlag('help')) {
    printHelp();
    return;
  }
  const options = parseOptions();
  await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(options.outputDir, { recursive: true });
  const startedAt = new Date();
  const failures: SnapshotFailure[] = [];
  const results: unknown[] = [];

  if (options.sources.includes('tcgdex')) {
    for (const language of options.languages) {
      try {
        results.push(await exportTcgdexLanguageSnapshot(language, options, failures));
      } catch (error) {
        failures.push({
          source: 'tcgdex',
          language,
          resource: 'language',
          id: null,
          url: `${options.tcgdexBaseUrl}/${language}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (options.sources.includes('pokemon-tcg-api') && options.languages.includes('en')) {
    try {
      results.push(await exportPokemonTcgSnapshot(options));
    } catch (error) {
      failures.push({
        source: 'pokemon-tcg-api',
        language: 'en',
        resource: 'snapshot',
        id: null,
        url: options.pokemonBaseUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const finishedAt = new Date();
  const manifest = {
    schemaVersion: 1,
    job: 'stackr-full-catalogue-metadata-snapshot',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    metadataOnly: true,
    imagesDownloaded: false,
    sources: options.sources,
    languages: options.languages,
    maxRecords: options.maxRecords,
    complete: failures.length === 0,
    results,
    failures,
  };
  await writeManifest(options.outputDir, manifest);
  console.log(JSON.stringify({
    complete: manifest.complete,
    sources: options.sources,
    languages: options.languages,
    failures: failures.length,
    outputDir: options.outputDir,
  }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  runFullCatalogueMetadataSnapshot().catch((error) => {
    console.error(JSON.stringify({
      complete: false,
      job: 'stackr-full-catalogue-metadata-snapshot',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  });
}
