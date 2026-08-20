#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
const CATALOGUE_SCHEMA = 'catalog';
const PAGE_SIZE = 1000;
const IMPORT_ROWS_PER_BATCH = 250;
const IMPORT_MAX_BYTES = 3_500_000;
const MAX_ATTEMPTS = 5;

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function requiredEnvironment() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    '',
  ).trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL and a backend-only Supabase service credential are required.');
  }
  return { url, key };
}

function projectRefFromUrl(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co$/i.exec(url);
  return match?.[1] || null;
}

function targetGuard(command, projectRef) {
  if (command === 'export' && projectRef !== STAGING_PROJECT_REF) {
    throw new Error(`Export must run against StackR staging ${STAGING_PROJECT_REF}; received ${projectRef || 'unknown'}.`);
  }
  if ((command === 'import' || command === 'verify') && projectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error(`Production operation must target ${PRODUCTION_PROJECT_REF}; received ${projectRef || 'unknown'}.`);
  }
}

function restHeaders(key, schema, write = false) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    ...(write ? { 'Content-Profile': schema } : { 'Accept-Profile': schema }),
  };
}

async function fetchWithRetry(url, init, label) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(120_000),
      });
      const text = await response.text();
      if (response.ok) return { response, text };
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      const error = new Error(`${label} failed (${response.status} ${response.statusText}): ${text.slice(0, 500)}`);
      if (!retryable || attempt === MAX_ATTEMPTS) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 15_000)));
  }
  throw lastError || new Error(`${label} failed.`);
}

async function fetchOpenApi(url, key, schema) {
  const { text } = await fetchWithRetry(
    `${url}/rest/v1/`,
    {
      method: 'GET',
      headers: {
        ...restHeaders(key, schema),
        Accept: 'application/openapi+json',
      },
    },
    `OpenAPI discovery for ${schema}`,
  );
  const document = JSON.parse(text);
  const definitions = document.definitions || document.components?.schemas || {};
  const tables = Object.entries(document.paths || {})
    .filter(([route, methods]) => {
      if (!route.startsWith('/') || route.startsWith('/rpc/')) return false;
      if (route.slice(1).includes('/')) return false;
      return Boolean(methods?.get && methods?.post);
    })
    .map(([route]) => decodeURIComponent(route.slice(1)))
    .filter(Boolean)
    .map((table) => {
      const definition = definitions[table] || {};
      const properties = definition.properties || {};
      const readOnlyColumns = Object.entries(properties)
        .filter(([, value]) => value?.readOnly === true || value?.['x-generated'] === true)
        .map(([column]) => column);
      return { table, readOnlyColumns };
    });
  if (!tables.length) {
    throw new Error(`No writable tables were exposed for schema ${schema}.`);
  }
  return { document, tables };
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fetchAllRows(url, key, schema, table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = `${url}/rest/v1/${encodeURIComponent(table)}?select=*`;
    const { text } = await fetchWithRetry(
      endpoint,
      {
        method: 'GET',
        headers: {
          ...restHeaders(key, schema),
          'Range-Unit': 'items',
          Range: `${offset}-${offset + PAGE_SIZE - 1}`,
          Prefer: 'count=exact',
        },
      },
      `Export ${schema}.${table} offset ${offset}`,
    );
    const page = JSON.parse(text || '[]');
    if (!Array.isArray(page)) throw new Error(`${schema}.${table} did not return an array.`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function exactCount(url, key, schema, table) {
  const endpoint = `${url}/rest/v1/${encodeURIComponent(table)}?select=*`;
  const { response } = await fetchWithRetry(
    endpoint,
    {
      method: 'GET',
      headers: {
        ...restHeaders(key, schema),
        'Range-Unit': 'items',
        Range: '0-0',
        Prefer: 'count=exact',
      },
    },
    `Count ${schema}.${table}`,
  );
  const contentRange = response.headers.get('content-range') || '';
  const match = /\/(\d+)$/.exec(contentRange);
  if (!match) throw new Error(`No exact count was returned for ${schema}.${table}.`);
  return Number(match[1]);
}

function tablePriority(table) {
  const name = table.toLowerCase();
  if (/language|provider|source|series|rarit|type|artist/.test(name)) return 0;
  if (/set/.test(name) && !/asset|card/.test(name)) return 10;
  if (/card/.test(name) && !/asset|price|market|link|relation/.test(name)) return 20;
  if (/asset|image|logo|symbol/.test(name)) return 30;
  if (/link|relation|mapping|member|variant/.test(name)) return 40;
  return 25;
}

function batchRows(rows) {
  const batches = [];
  let current = [];
  let currentBytes = 2;
  for (const row of rows) {
    const rowBytes = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
    if (current.length && (current.length >= IMPORT_ROWS_PER_BATCH || currentBytes + rowBytes > IMPORT_MAX_BYTES)) {
      batches.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(row);
    currentBytes += rowBytes;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function upsertRows(url, key, schema, table, rows, readOnlyColumns) {
  const excluded = new Set(readOnlyColumns || []);
  const cleanRows = rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([column]) => !excluded.has(column)),
  ));
  let written = 0;
  for (const batch of batchRows(cleanRows)) {
    await fetchWithRetry(
      `${url}/rest/v1/${encodeURIComponent(table)}`,
      {
        method: 'POST',
        headers: {
          ...restHeaders(key, schema, true),
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,missing=default,return=minimal',
        },
        body: JSON.stringify(batch),
      },
      `Upsert ${schema}.${table}`,
    );
    written += batch.length;
  }
  return written;
}

async function exportSnapshot(outputDirectory, sourceEvidencePath) {
  const { url, key } = requiredEnvironment();
  const projectRef = projectRefFromUrl(url);
  targetGuard('export', projectRef);
  const { tables } = await fetchOpenApi(url, key, CATALOGUE_SCHEMA);
  await mkdir(outputDirectory, { recursive: true });

  let sourceEvidence = null;
  if (sourceEvidencePath) {
    sourceEvidence = JSON.parse(await readFile(sourceEvidencePath, 'utf8'));
    if (!sourceEvidence?.ok || sourceEvidence?.summary?.failures !== 0) {
      throw new Error('The staging backfill evidence is not successful and cannot be promoted.');
    }
  }

  const manifest = {
    schemaVersion: 1,
    kind: 'stackr-canonical-catalogue-snapshot',
    generatedAt: new Date().toISOString(),
    sourceProjectRef: projectRef,
    targetProjectRef: PRODUCTION_PROJECT_REF,
    schema: CATALOGUE_SCHEMA,
    promotionMode: 'upsert-only-no-deletes',
    sourceEvidence: sourceEvidence ? {
      job: sourceEvidence.job,
      version: sourceEvidence.version,
      sources: sourceEvidence.sources,
      languages: sourceEvidence.languages,
      summary: sourceEvidence.summary,
    } : null,
    tables: [],
  };

  for (const descriptor of tables.sort((a, b) => tablePriority(a.table) - tablePriority(b.table) || a.table.localeCompare(b.table))) {
    const rows = await fetchAllRows(url, key, CATALOGUE_SCHEMA, descriptor.table);
    const payload = `${JSON.stringify(rows)}\n`;
    const file = `${safeFileName(descriptor.table)}.json`;
    await writeFile(path.join(outputDirectory, file), payload, 'utf8');
    manifest.tables.push({
      table: descriptor.table,
      file,
      rows: rows.length,
      sha256: sha256(payload),
      readOnlyColumns: descriptor.readOnlyColumns,
      priority: tablePriority(descriptor.table),
    });
    console.log(JSON.stringify({ exported: `${CATALOGUE_SCHEMA}.${descriptor.table}`, rows: rows.length }));
  }

  if (!manifest.tables.length || manifest.tables.reduce((sum, table) => sum + table.rows, 0) === 0) {
    throw new Error('Canonical catalogue snapshot is empty.');
  }
  const manifestPayload = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(outputDirectory, 'manifest.json'), manifestPayload, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    projectRef,
    tables: manifest.tables.length,
    rows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
    outputDirectory,
  }, null, 2));
}

async function readManifest(snapshotDirectory) {
  const manifest = JSON.parse(await readFile(path.join(snapshotDirectory, 'manifest.json'), 'utf8'));
  if (manifest.kind !== 'stackr-canonical-catalogue-snapshot') throw new Error('Unexpected snapshot format.');
  if (manifest.sourceProjectRef !== STAGING_PROJECT_REF) throw new Error('Snapshot is not from canonical StackR staging.');
  if (manifest.targetProjectRef !== PRODUCTION_PROJECT_REF) throw new Error('Snapshot is not approved for StackR production.');
  if (manifest.schema !== CATALOGUE_SCHEMA) throw new Error('Snapshot schema is not the canonical catalogue schema.');
  for (const table of manifest.tables || []) {
    const payload = await readFile(path.join(snapshotDirectory, table.file), 'utf8');
    if (sha256(payload) !== table.sha256) throw new Error(`Checksum mismatch for ${table.file}.`);
    const rows = JSON.parse(payload);
    if (!Array.isArray(rows) || rows.length !== table.rows) throw new Error(`Row-count mismatch for ${table.file}.`);
  }
  return manifest;
}

async function importSnapshot(snapshotDirectory, reportPath) {
  const { url, key } = requiredEnvironment();
  const projectRef = projectRefFromUrl(url);
  targetGuard('import', projectRef);
  const manifest = await readManifest(snapshotDirectory);
  const { tables: targetTables } = await fetchOpenApi(url, key, CATALOGUE_SCHEMA);
  const targetMap = new Map(targetTables.map((table) => [table.table, table]));

  const report = {
    schemaVersion: 1,
    kind: 'stackr-canonical-catalogue-promotion-report',
    startedAt: new Date().toISOString(),
    sourceProjectRef: manifest.sourceProjectRef,
    targetProjectRef: projectRef,
    schema: CATALOGUE_SCHEMA,
    mode: 'upsert-only-no-deletes',
    tables: [],
    failures: [],
  };

  let pending = [...manifest.tables]
    .sort((a, b) => (a.priority ?? tablePriority(a.table)) - (b.priority ?? tablePriority(b.table)) || a.table.localeCompare(b.table));

  for (let pass = 1; pass <= Math.max(3, pending.length); pass += 1) {
    if (!pending.length) break;
    const deferred = [];
    let progressed = false;
    for (const table of pending) {
      const target = targetMap.get(table.table);
      if (!target) {
        deferred.push({ ...table, lastError: `Production does not expose writable table ${CATALOGUE_SCHEMA}.${table.table}.` });
        continue;
      }
      try {
        const rows = JSON.parse(await readFile(path.join(snapshotDirectory, table.file), 'utf8'));
        const written = rows.length
          ? await upsertRows(url, key, CATALOGUE_SCHEMA, table.table, rows, target.readOnlyColumns)
          : 0;
        const productionRows = await exactCount(url, key, CATALOGUE_SCHEMA, table.table);
        if (productionRows < table.rows) {
          throw new Error(`Production count ${productionRows} is below snapshot count ${table.rows}.`);
        }
        report.tables.push({
          table: table.table,
          snapshotRows: table.rows,
          rowsSubmitted: written,
          productionRows,
          pass,
          status: 'promoted',
        });
        progressed = true;
        console.log(JSON.stringify({ promoted: `${CATALOGUE_SCHEMA}.${table.table}`, rows: written, productionRows, pass }));
      } catch (error) {
        deferred.push({ ...table, lastError: error instanceof Error ? error.message : String(error) });
      }
    }
    pending = deferred;
    if (!progressed) break;
  }

  report.failures = pending.map((table) => ({ table: table.table, error: table.lastError || 'Unresolved dependency or write failure.' }));
  report.finishedAt = new Date().toISOString();
  report.ok = report.failures.length === 0;
  report.summary = {
    tablesPromoted: report.tables.length,
    tablesFailed: report.failures.length,
    snapshotRows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
    rowsSubmitted: report.tables.reduce((sum, table) => sum + table.rowsSubmitted, 0),
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
  if (!report.ok) throw new Error(`Production catalogue promotion left ${report.failures.length} unresolved tables.`);
}

async function verifySnapshot(snapshotDirectory, reportPath) {
  const { url, key } = requiredEnvironment();
  const projectRef = projectRefFromUrl(url);
  targetGuard('verify', projectRef);
  const manifest = await readManifest(snapshotDirectory);
  const checks = [];
  for (const table of manifest.tables) {
    const productionRows = await exactCount(url, key, CATALOGUE_SCHEMA, table.table);
    checks.push({
      table: table.table,
      snapshotRows: table.rows,
      productionRows,
      passed: productionRows >= table.rows,
    });
  }
  const report = {
    schemaVersion: 1,
    kind: 'stackr-canonical-catalogue-production-verification',
    generatedAt: new Date().toISOString(),
    sourceProjectRef: manifest.sourceProjectRef,
    targetProjectRef: projectRef,
    schema: CATALOGUE_SCHEMA,
    checks,
    ok: checks.every((check) => check.passed),
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: report.ok, tables: checks.length, failed: checks.filter((check) => !check.passed).length }, null, 2));
  if (!report.ok) throw new Error('Production catalogue verification failed.');
}

async function main() {
  const command = process.argv[2];
  if (!['export', 'import', 'verify'].includes(command)) {
    throw new Error('Usage: node scripts/catalogue-production-snapshot.mjs <export|import|verify> --directory=<path> [--evidence=<path>] [--report=<path>]');
  }
  const directory = path.resolve(option('directory', 'reports/catalogue/production-snapshot'));
  const evidence = option('evidence');
  const report = path.resolve(option('report', `reports/catalogue/${command}-production-catalogue.json`));
  if (command === 'export') await exportSnapshot(directory, evidence ? path.resolve(evidence) : '');
  if (command === 'import') await importSnapshot(directory, report);
  if (command === 'verify') await verifySnapshot(directory, report);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
