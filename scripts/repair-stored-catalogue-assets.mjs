#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  assertApprovedCatalogueAssetRepairScope,
  assertStagingCatalogueAssetRepairTarget,
  countStoredCatalogueAssetRepairCandidates,
  listStoredCatalogueAssetRepairBatch,
  repairStoredCatalogueAsset,
  resolveCatalogueAssetRepairSource,
} from '../backend/lib/catalogueAssetRepair.js';
import { SupabaseObjectStorageAdapter } from '../backend/lib/objectStorage.js';

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}, received ${value}.`);
  }
  return parsed;
}

function optionalUuid(value, name) {
  const result = String(value ?? '').trim().toLowerCase();
  if (!result) return '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result)) {
    throw new Error(`Expected --${name} to be a UUID.`);
  }
  return result;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function boundedSupabaseFetch(input, init = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
}

function adminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Staging Supabase URL and backend-only service credentials are required.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: boundedSupabaseFetch },
  });
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function printHelp() {
  console.log(`Stackr stored catalogue asset repair

Repairs metadata and required derivatives for the audited Japanese official-source
card images already held in the staging stackr-catalogue-public Supabase Storage
bucket with an empty derivative list. The default mode is read-only. Pass --execute
to download controlled objects and write repairs.

Examples:
  node scripts/repair-stored-catalogue-assets.mjs --target=staging --source=pokemon_card_jp_official --language=ja --count
  node scripts/repair-stored-catalogue-assets.mjs --target=staging --source=pokemon_card_jp_official --language=ja --limit=100
  node scripts/repair-stored-catalogue-assets.mjs --target=staging --source=pokemon_card_jp_official --language=ja --execute --limit=100 --maxAssets=2500 --concurrency=2
  node scripts/repair-stored-catalogue-assets.mjs --target=staging --source=pokemon_card_jp_official --language=ja --afterId=<uuid>

Options:
  --target=staging     Required fail-closed target.
  --source=<code>      Required audited source: pokemon_card_jp_official.
  --language=ja        Required audited language.
  --count              Read-only exact remaining-candidate count.
  --execute            Perform repairs; omitted means dry-run.
  --afterId=<uuid>     Resume after the last scanned asset ID.
  --limit=<number>     Assets per deterministic page, default 100, max 500.
  --maxAssets=<number> Total assets to inspect, default one page, hard max 2500.
  --concurrency=<n>    Repairs in flight, default 2, max 4.
  --maxBytes=<number>  Maximum controlled object size, default 12 MiB, max 25 MiB.
`);
}

async function main() {
  if (hasFlag('help') || hasFlag('h')) {
    printHelp();
    return;
  }
  if (hasFlag('execute') && (hasFlag('dry-run') || hasFlag('dryRun'))) {
    throw new Error('--execute cannot be combined with a dry-run flag.');
  }
  if (hasFlag('execute') && hasFlag('count')) throw new Error('--execute cannot be combined with --count.');

  const execute = hasFlag('execute');
  const target = arg('target');
  assertStagingCatalogueAssetRepairTarget({ target, supabaseUrl: process.env.SUPABASE_URL });
  const source = arg('source');
  const language = arg('language');
  assertApprovedCatalogueAssetRepairScope({ source, language });
  const limit = boundedInteger(arg('limit', '100'), 100, 1, 500);
  const maxAssets = boundedInteger(arg('maxAssets', String(limit)), limit, 1, 2500);
  const concurrency = boundedInteger(arg('concurrency', '2'), 2, 1, 4);
  const maxBytes = boundedInteger(
    arg('maxBytes', String(12 * 1024 * 1024)),
    12 * 1024 * 1024,
    1024,
    25 * 1024 * 1024,
  );
  const afterId = optionalUuid(arg('afterId'), 'afterId');
  const supabase = adminSupabase();
  const resolvedSource = await resolveCatalogueAssetRepairSource(supabase, source);
  if (hasFlag('count')) {
    const count = await countStoredCatalogueAssetRepairCandidates(supabase, {
      source,
      sourceId: resolvedSource.id,
      language,
    });
    console.log(JSON.stringify({
      schemaVersion: 1,
      ok: true,
      command: 'repair-stored-catalogue-assets',
      target: 'staging',
      dryRun: true,
      countOnly: true,
      scope: { source, language, derivativeList: 'empty' },
      candidates: count,
    }, null, 2));
    return;
  }
  const storage = new SupabaseObjectStorageAdapter(supabase);
  const results = [];
  let scanned = 0;
  let candidates = 0;
  let pages = 0;
  let nextAfterId = afterId || null;
  let exhausted = false;
  while (!exhausted && scanned < maxAssets) {
    const pageLimit = Math.min(limit, maxAssets - scanned);
    const batch = await listStoredCatalogueAssetRepairBatch(supabase, {
      source,
      sourceId: resolvedSource.id,
      language,
      afterId: nextAfterId,
      limit: pageLimit,
    });
    pages += 1;
    const pageResults = await mapWithConcurrency(batch.candidates, concurrency, async (asset) => {
      try {
        return await repairStoredCatalogueAsset(supabase, storage, asset, { execute, maxBytes });
      } catch (error) {
        return { id: asset.id, status: 'failed', repairReasons: asset.repairReasons, error: errorMessage(error) };
      }
    });
    results.push(...pageResults);
    scanned += batch.scanned.length;
    candidates += batch.candidates.length;
    exhausted = batch.cursor.exhausted;
    if (batch.cursor.nextAfterId) {
      if (nextAfterId && batch.cursor.nextAfterId <= nextAfterId) {
        throw new Error('Stored catalogue repair cursor did not advance.');
      }
      nextAfterId = batch.cursor.nextAfterId;
    }
    if (batch.scanned.length === 0) exhausted = true;
  }
  const summary = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
  const ok = !summary.failed;

  console.log(JSON.stringify({
    schemaVersion: 1,
    ok,
    command: 'repair-stored-catalogue-assets',
    target: 'staging',
    dryRun: !execute,
    scope: { source, language, derivativeList: 'empty' },
    range: { afterId: afterId || null },
    limits: { pageSize: limit, maxAssets, concurrency, maxBytes },
    pages,
    scanned,
    candidates,
    cursor: {
      nextAfterId,
      exhausted,
      capped: !exhausted && scanned >= maxAssets,
    },
    summary,
    results,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    command: 'repair-stored-catalogue-assets',
    error: errorMessage(error),
  }, null, 2));
  process.exitCode = 1;
});
