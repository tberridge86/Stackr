import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  boundedQueueError,
  buildCatalogueMirrorCliArgs,
  claimNextCatalogueQueueItem,
  completeCatalogueQueueItem,
  failCatalogueQueueItem,
  recoverStaleCatalogueClaims,
} from './catalogue-ingestion/queueWorker';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';

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

function requireStaging() {
  const target = String(
    process.env.STACKR_CATALOGUE_IMPORT_TARGET
      ?? process.env.STACKR_IMPORT_TARGET
      ?? '',
  ).trim().toLowerCase();
  const url = String(process.env.SUPABASE_URL ?? '');
  if (target !== 'staging') {
    throw new Error('Catalogue queue processing requires STACKR_CATALOGUE_IMPORT_TARGET=staging.');
  }
  if (!url.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Catalogue queue processing requires staging Supabase ${STAGING_SUPABASE_REF}.`);
  }
  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing catalogue queue processing against production Supabase ${PRODUCTION_SUPABASE_REF}.`);
  }
}

function adminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and backend-only service credentials are required.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function executablePath() {
  const name = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  return path.resolve(process.cwd(), 'node_modules', '.bin', name);
}

function boundedOutput(value: unknown, maximum = 6000) {
  const text = String(value ?? '').trim();
  return text.length <= maximum ? text : `[truncated]\n${text.slice(-maximum)}`;
}

function executeQueueItem(item: Parameters<typeof buildCatalogueMirrorCliArgs>[0]) {
  const args = buildCatalogueMirrorCliArgs(item);
  const result = spawnSync(executablePath(), args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STACKR_CATALOGUE_IMPORT_TARGET: 'staging',
      FORCE_COLOR: '0',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: integerArg('itemTimeoutMinutes', 70, 5, 180) * 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  return {
    passed: exitCode === 0 && !result.error,
    exitCode,
    signal: result.signal ?? null,
    stdout: boundedOutput(result.stdout),
    stderr: boundedOutput(result.stderr || result.error?.message),
    command: [executablePath(), ...args].join(' '),
  };
}

function printHelp() {
  console.log(`StackR catalogue ingestion queue processor

Usage:
  npx --no-install tsx scripts/process-catalogue-ingestion-queue.ts --maxItems=3

Options:
  --maxItems=1              Maximum claimed items in this run (1-20).
  --workerId=<id>           Stable worker identity for claim ownership.
  --staleAfterMinutes=120   Recover abandoned claims older than this.
  --itemTimeoutMinutes=70   Per-import timeout.
  --failOnRetry             Return non-zero when an item is requeued.
`);
}

async function main() {
  if (hasFlag('help')) {
    printHelp();
    return;
  }
  requireStaging();
  const maxItems = integerArg('maxItems', 1, 1, 20);
  const staleAfterMinutes = integerArg('staleAfterMinutes', 120, 15, 1440);
  const workerId = arg(
    'workerId',
    `catalogue-worker:${process.env.GITHUB_RUN_ID ?? process.env.RAILWAY_DEPLOYMENT_ID ?? process.pid}`,
  );
  if (!/^[A-Za-z0-9._:-]{1,255}$/.test(workerId)) throw new Error('--workerId contains unsupported characters.');

  const supabase = adminSupabase();
  const recoveredClaims = await recoverStaleCatalogueClaims(supabase, new Date(), staleAfterMinutes);
  const summary = {
    ok: true,
    workerId,
    recoveredClaims,
    claimed: 0,
    completed: 0,
    requeued: 0,
    failed: 0,
    items: [] as Array<Record<string, unknown>>,
  };

  for (let index = 0; index < maxItems; index += 1) {
    const item = await claimNextCatalogueQueueItem(supabase, workerId);
    if (!item) break;
    summary.claimed += 1;
    const startedAt = Date.now();
    try {
      const execution = executeQueueItem(item);
      if (!execution.passed) {
        const diagnostic = [execution.stderr, execution.stdout]
          .filter(Boolean)
          .join('\n') || `catalogue_mirror_exit_${execution.exitCode}`;
        const nextStatus = await failCatalogueQueueItem(
          supabase,
          item,
          workerId,
          diagnostic,
        );
        if (nextStatus === 'pending') summary.requeued += 1;
        else summary.failed += 1;
        summary.ok = false;
        summary.items.push({
          id: item.id,
          command: item.command,
          source: item.payload?.source ?? null,
          status: nextStatus,
          durationMs: Date.now() - startedAt,
          exitCode: execution.exitCode,
          error: boundedQueueError(diagnostic),
        });
        continue;
      }

      await completeCatalogueQueueItem(supabase, item, workerId);
      summary.completed += 1;
      summary.items.push({
        id: item.id,
        command: item.command,
        source: item.payload?.source ?? null,
        status: 'completed',
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const nextStatus = await failCatalogueQueueItem(supabase, item, workerId, error);
      if (nextStatus === 'pending') summary.requeued += 1;
      else summary.failed += 1;
      summary.ok = false;
      summary.items.push({
        id: item.id,
        command: item.command,
        source: item.payload?.source ?? null,
        status: nextStatus,
        durationMs: Date.now() - startedAt,
        error: boundedQueueError(error),
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0 || (hasFlag('failOnRetry') && summary.requeued > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: boundedQueueError(error),
  }, null, 2));
  process.exitCode = 1;
});
