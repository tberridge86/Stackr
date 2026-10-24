#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, stat, statfs, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateCatalogueMigrationJournal } from './lib/r2-catalogue-migration.mjs';

export const PRODUCTION_REF = 'oakdbbzdqwurpjnoqhmu';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const HOST = { serviceId: 'b5410607-a591-420e-a506-fe184ce7455b', environmentId: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f', projectId: 'd205637b-5376-41aa-9169-1015ba88fec3' };
const BATCH_SIZE = 25;
const MAX_BATCHES = 10_000;
const MAX_JSON_BYTES = 32 * 1024 * 1024;
// Match the restart-capable rollback CLI evidence limit.
const MAX_JOURNAL_BYTES = 32 * 1024 * 1024;
const MAX_CONTROL_BYTES = 64 * 1024;
// Three 32 MiB evidence files (journal, two child results), 4 MiB inventory,
// four <=64 KiB control files, plus filesystem allocation slack fit in 128 MiB.
const BATCH_DISK_BYTES = 128n * 1024n * 1024n;
const DISK_RESERVE_BYTES = 512n * 1024n * 1024n;
const REQUIRED_FREE_INODES = 72n; // Eight possible batch files plus 64 spare inodes.

export async function migrationDiskCapacity(directory, readFs = statfs) {
  let info;
  try { info = await readFs(directory, { bigint: true }); }
  catch { check(false, 'runner_capacity_probe_failed'); }
  check(typeof info?.bavail === 'bigint' && info.bavail >= 0n
    && typeof info.bsize === 'bigint' && info.bsize > 0n
    && typeof info.ffree === 'bigint' && info.ffree >= 0n, 'runner_capacity_probe_failed');
  const available = info.bavail * info.bsize;
  const required = BATCH_DISK_BYTES + DISK_RESERVE_BYTES;
  return { admitted: available >= required && info.ffree >= REQUIRED_FREE_INODES,
    availableBytes: available.toString(), requiredBytes: required.toString(),
    freeInodes: info.ffree.toString(), requiredInodes: REQUIRED_FREE_INODES.toString() };
}
const CLI_PATH = fileURLToPath(new URL('./migrate-catalogue-to-r2.mjs', import.meta.url));
const BOUNDS = { maxObjectBytes: 12 * 1024 * 1024, maxBatchBytes: 250 * 1024 * 1024, objectTimeoutMs: 120_000 };

function check(value, code) { if (!value) throw Object.assign(new Error(code), { code }); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function same(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
function errorCode(error) { return /^[a-z][a-z0-9_]{0,127}$/.test(error?.code ?? '') ? error.code : 'runner_operation_failed'; }

export function runnerConfiguration(argv = []) {
  const allowed = new Set(['mode', 'expected-ref', 'run-id', 'max-batches', 'limit', 'resume', 'concurrency']);
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/.exec(arg);
    check(match && allowed.has(match[1]) && !Object.hasOwn(args, match[1]), 'unknown_or_duplicate_runner_argument');
    args[match[1]] = match[2];
  }
  const mode = args.mode ?? 'plan';
  check(['plan', 'execute'].includes(mode), 'unsupported_runner_mode');
  check(!args['expected-ref'] || args['expected-ref'] === PRODUCTION_REF, 'runner_production_ref_required');
  check(!args.limit || args.limit === String(BATCH_SIZE), 'runner_batch_size_must_be_25');
  check(!args['run-id'] || /^[a-z0-9][a-z0-9-]{0,63}$/.test(args['run-id']), 'invalid_runner_run_id');
  check(!args.resume || ['true', 'false'].includes(args.resume), 'invalid_runner_resume');
  const concurrency = Number(args.concurrency ?? 1);
  check(Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= 8, 'invalid_runner_concurrency');
  const maxBatches = args['max-batches'] === undefined ? null : Number(args['max-batches']);
  check(maxBatches === null || (Number.isSafeInteger(maxBatches) && maxBatches >= 1 && maxBatches <= MAX_BATCHES), 'invalid_runner_batch_bound');
  if (mode === 'execute') {
    check(args['expected-ref'] === PRODUCTION_REF, 'explicit_runner_production_ref_required');
    check(args['run-id'] && maxBatches !== null, 'explicit_runner_run_id_and_batch_bound_required');
  }
  return { mode, expectedRef: PRODUCTION_REF, batchSize: BATCH_SIZE, runId: args['run-id'] ?? null,
    maxBatches, resume: args.resume === 'true', concurrency };
}

export function assertRunnerProject(env) {
  const origin = `https://${PRODUCTION_REF}.supabase.co`;
  check([origin, `${origin}/`].includes(env.SUPABASE_URL), 'runner_supabase_url_pin_mismatch');
  let database;
  let username;
  try { database = new URL(env.SUPABASE_DB_URL); username = decodeURIComponent(database.username); }
  catch { check(false, 'runner_database_identity_required'); }
  const direct = database.hostname === `db.${PRODUCTION_REF}.supabase.co` && ['postgres', `postgres.${PRODUCTION_REF}`].includes(username);
  const pooled = database.hostname.endsWith('.pooler.supabase.com') && username === `postgres.${PRODUCTION_REF}`;
  check(['postgres:', 'postgresql:'].includes(database.protocol) && (direct || pooled)
    && database.pathname === '/postgres' && !database.hash, 'runner_database_project_pin_mismatch');
}

export async function assertHostedRunner(env, { platform = process.platform, resolvePath = realpath,
  readMounts = () => readFile('/proc/self/mountinfo', 'utf8') } = {}) {
  check(platform === 'linux' && UUID.test(env.RAILWAY_SERVICE_ID ?? '')
    && UUID.test(env.RAILWAY_ENVIRONMENT_ID ?? ''), 'runner_railway_execution_required');
  check(env.RAILWAY_SERVICE_ID === HOST.serviceId && env.RAILWAY_ENVIRONMENT_ID === HOST.environmentId
    && (!env.RAILWAY_PROJECT_ID || env.RAILWAY_PROJECT_ID === HOST.projectId), 'runner_railway_target_mismatch');
  check(env.RAILWAY_VOLUME_MOUNT_PATH === '/data' && await resolvePath('/data') === '/data', 'runner_data_volume_required');
  const mounted = (await readMounts()).split('\n').some((line) => {
    const fields = line.split(' ');
    return fields.length > 6 && fields[4] === '/data' && fields[5].split(',').includes('rw') && line.includes(' - ');
  });
  check(mounted, 'runner_data_mount_not_writable');
}

async function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function saveExclusive(filename, value, maximum = MAX_JSON_BYTES) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  check(bytes.length <= maximum, 'runner_result_too_large');
  const handle = await open(filename, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(path.dirname(filename));
  return hash(bytes);
}

async function loadBounded(filename, maximum = MAX_JSON_BYTES, json = true) {
  check((await stat(filename)).size <= maximum, 'runner_evidence_too_large');
  const bytes = await readFile(filename);
  check(bytes.length <= maximum, 'runner_evidence_too_large');
  return { value: json ? JSON.parse(bytes.toString('utf8')) : bytes.toString('utf8'), sha256: hash(bytes) };
}

/** No shell, no credentials in argv, bounded output, and no automatic retries. */
export async function spawnMigrationCli(argv, { env = process.env, timeoutMs = 4 * 60 * 60 * 1000 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks = [];
    let size = 0;
    let failed = null;
    let killTimer;
    const stop = (code) => {
      if (failed) return;
      failed = Object.assign(new Error(code), { code });
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    };
    const timer = setTimeout(() => stop('runner_cli_deadline'), timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) stop('runner_cli_output_too_large');
      else chunks.push(chunk);
    });
    // CLI stderr is deliberately not persisted: unexpected errors can contain connection details.
    child.stderr.on('data', () => {});
    child.on('error', () => { failed ??= Object.assign(new Error('runner_cli_spawn_failed'), { code: 'runner_cli_spawn_failed' }); });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (failed) return reject(failed);
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve({ exitCode, signal, result });
      } catch { reject(Object.assign(new Error('runner_cli_outcome_unknown'), { code: 'runner_cli_outcome_unknown' })); }
    });
  });
}

function batchFiles(directory, sequence) {
  const prefix = path.join(directory, `batch-${String(sequence).padStart(6, '0')}`);
  return { intent: `${prefix}.intent.json`, inventory: `${prefix}.inventory.json`, inventoryResult: `${prefix}.inventory-result.json`,
    digest: `${prefix}.inventory.json.sha256.json`, journal: `${prefix}.events.jsonl`, result: `${prefix}.execute-result.json`,
    checkpoint: `${prefix}.checkpoint.json`, error: `${prefix}.error.json` };
}

function cliArguments(mode, files, afterId, inventorySha256, concurrency = 1) {
  return [`--mode=${mode}`, `--expected-ref=${PRODUCTION_REF}`, `--inventory=${files.inventory}`, '--limit=25',
    `--max-object-bytes=${BOUNDS.maxObjectBytes}`, `--max-batch-bytes=${BOUNDS.maxBatchBytes}`,
    `--object-timeout-ms=${BOUNDS.objectTimeoutMs}`, ...(concurrency > 1 ? [`--concurrency=${concurrency}`] : []),
    ...(afterId ? [`--after-id=${afterId}`] : []),
    ...(mode === 'execute' ? [`--approved-inventory-sha256=${inventorySha256}`, `--journal=${files.journal}`] : [])];
}

function expectedManifest(config, env) {
  check(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.STACKR_R2_BUCKET ?? ''), 'runner_destination_bucket_required');
  const publicBaseUrl = String(env.STACKR_R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  check(publicBaseUrl.startsWith('https://') && !/[\s\\]/.test(publicBaseUrl), 'runner_public_base_url_required');
  return { schemaVersion: 1, kind: 'stackr-r2-sequential-run', runId: config.runId, expectedRef: PRODUCTION_REF,
    railwayServiceId: env.RAILWAY_SERVICE_ID, railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID,
    options: { sourceBucket: 'stackr-catalogue-public', destinationBucket: env.STACKR_R2_BUCKET,
      publicBaseUrl, maxAssets: BATCH_SIZE, ...BOUNDS,
      ...(config.concurrency > 1 ? { concurrency: config.concurrency } : {}) }, limit: BATCH_SIZE };
}

async function validateBatch(files, afterId, manifest, executeRequired) {
  const inventory = await loadBounded(files.inventory, 4 * 1024 * 1024);
  const document = inventory.value;
  const advertisedFile = await loadBounded(files.inventoryResult);
  const digestFile = await loadBounded(files.digest, 4096);
  const advertised = advertisedFile.value;
  const digest = digestFile.value;
  check(document?.schemaVersion === 1 && document.kind === 'stackr-r2-catalogue-inventory'
    && document.expectedRef === PRODUCTION_REF && document.sourceOrigin === `https://${PRODUCTION_REF}.supabase.co`
    && same(document.options, manifest.options) && document.limit === BATCH_SIZE && document.afterId === afterId
    && Array.isArray(document.assets) && document.assets.length <= BATCH_SIZE, 'runner_inventory_target_or_bounds_mismatch');
  let previous = afterId;
  for (const asset of document.assets) {
    check(UUID.test(asset?.id ?? '') && (!previous || asset.id > previous), 'runner_inventory_cursor_not_increasing');
    previous = asset.id;
  }
  check(document.nextAfterId === previous && document.exhausted === (document.assets.length < BATCH_SIZE), 'runner_inventory_cursor_or_exhaustion_mismatch');
  check(digest.inventoryFile === path.basename(files.inventory) && digest.inventorySha256 === inventory.sha256
    && advertised.exitCode === 0 && !advertised.signal && advertised.result?.status === 'inventory'
    && advertised.result.inventoryPath === files.inventory && advertised.result.digestPath === files.digest
    && advertised.result.inventorySha256 === inventory.sha256 && DIGEST.test(inventory.sha256)
    && advertised.result.assetCount === document.assets.length && advertised.result.assetBytesRead === 0
    && advertised.result.nextAfterId === previous && advertised.result.exhausted === document.exhausted,
  'runner_inventory_digest_or_result_mismatch');
  const evidence = { inventorySha256: inventory.sha256, inventoryResultSha256: advertisedFile.sha256,
    digestSha256: digestFile.sha256, assetCount: document.assets.length, nextAfterId: previous, exhausted: document.exhausted };
  if (!executeRequired) return { document, evidence };
  check(document.assets.length > 0, 'runner_empty_execution_not_allowed');
  const result = await loadBounded(files.result);
  check(result.value.exitCode === 0 && !result.value.signal && result.value.result?.status === 'complete'
    && result.value.result.remaining === 0 && Array.isArray(result.value.result.results)
    && result.value.result.results.length === document.assets.length, 'runner_execution_incomplete');
  const journal = await loadBounded(files.journal, MAX_JOURNAL_BYTES, false);
  check(journal.value.endsWith('\n'), 'runner_journal_truncated');
  const records = journal.value.trimEnd().split('\n').map((line) => JSON.parse(line));
  const operations = validateCatalogueMigrationJournal(records, document, inventory.sha256);
  check(operations.length === document.assets.length, 'runner_publication_count_mismatch');
  const receipts = new Map(operations.map((operation) => [operation.receipt.rowId, operation.receipt]));
  const seen = new Set();
  for (const item of result.value.result.results) {
    check(item.status === 'published' && !seen.has(item.rowId) && receipts.has(item.rowId)
      && same(item.receipt, receipts.get(item.rowId)), 'runner_publication_receipt_mismatch');
    seen.add(item.rowId);
  }
  return { document, evidence: { ...evidence, resultSha256: result.sha256, journalSha256: journal.sha256 } };
}

async function recoverCleanCheckpoints(directory, manifest, manifestSha256) {
  const names = await readdir(directory);
  const checkpointNames = names.filter((name) => /^batch-\d{6}\.checkpoint\.json$/.test(name)).sort();
  check(checkpointNames.length <= MAX_BATCHES, 'runner_total_batch_bound_reached');
  const allowed = new Set(['run.json', 'runner.lock']);
  let state = { sequence: 0, nextAfterId: null, exhausted: false, totalPublished: 0, checkpointSha256: null };
  for (const name of checkpointNames) {
    const sequence = state.sequence + 1;
    const files = batchFiles(directory, sequence);
    check(name === path.basename(files.checkpoint) && !state.exhausted, 'runner_stale_checkpoint');
    const checkpoint = await loadBounded(files.checkpoint, 64 * 1024);
    const intent = await loadBounded(files.intent, 64 * 1024);
    check(same(intent.value, { schemaVersion: 1, manifestSha256, sequence, afterId: state.nextAfterId,
      previousCheckpointSha256: state.checkpointSha256 }), 'runner_stale_intent');
    const completed = await validateBatch(files, state.nextAfterId, manifest, checkpoint.value.assetCount > 0);
    const expected = { schemaVersion: 1, manifestSha256, sequence, afterId: state.nextAfterId,
      previousCheckpointSha256: state.checkpointSha256, intentSha256: intent.sha256, ...completed.evidence,
      totalPublished: state.totalPublished + completed.evidence.assetCount };
    check(same(checkpoint.value, expected), 'runner_stale_checkpoint');
    for (const key of ['intent', 'inventory', 'inventoryResult', 'digest', 'checkpoint',
      ...(completed.evidence.assetCount > 0 ? ['journal', 'result'] : [])]) allowed.add(path.basename(files[key]));
    state = { sequence, nextAfterId: completed.evidence.nextAfterId, exhausted: completed.evidence.exhausted,
      totalPublished: expected.totalPublished, checkpointSha256: checkpoint.sha256 };
  }
  check(names.every((name) => allowed.has(name)), 'runner_incomplete_run_requires_reconciliation');
  return state;
}

/** Test seams are module arguments, never CLI switches or environment bypasses. */
export async function runR2MigrationRunner({ argv = process.argv.slice(2), env = process.env,
  assertHost = assertHostedRunner, volumeRoot = '/data', runCli = spawnMigrationCli, readCapacity = migrationDiskCapacity } = {}) {
  const config = runnerConfiguration(argv);
  if (config.mode === 'plan') return { status: 'plan', writes: false, ...config,
    command: 'Use --mode=execute with --expected-ref, --run-id and --max-batches on Railway mounted /data.' };
  assertRunnerProject(env);
  await assertHost(env);
  const manifest = expectedManifest(config, env);
  const parent = path.join(volumeRoot, 'r2-catalogue-migration');
  const directory = path.join(parent, config.runId);
  if (!config.resume) {
    await mkdir(parent, { recursive: true });
    await syncDirectory(volumeRoot);
    check(await realpath(parent) === parent, 'runner_state_directory_is_symlink');
    try { await mkdir(directory); } // Existing runs must never be silently restarted.
    catch (error) { if (error.code === 'EEXIST') check(false, 'runner_run_already_exists'); throw error; }
    await syncDirectory(parent);
  }
  check(await realpath(directory) === directory && await realpath(parent) === parent, 'runner_state_directory_is_symlink');
  // A crash deliberately leaves the lock. Reconciliation, not a restart policy, owns its removal.
  const lock = path.join(directory, 'runner.lock');
  try { await saveExclusive(lock, { schemaVersion: 1, processId: process.pid, startedAt: new Date().toISOString() }, MAX_CONTROL_BYTES); }
  catch (error) { if (error.code === 'EEXIST') check(false, 'runner_lock_requires_reconciliation'); throw error; }
  const manifestPath = path.join(directory, 'run.json');
  const manifestSha256 = config.resume ? (await loadBounded(manifestPath, 64 * 1024)).sha256 : await saveExclusive(manifestPath, manifest, MAX_CONTROL_BYTES);
  if (config.resume) check(same((await loadBounded(manifestPath, 64 * 1024)).value, manifest), 'runner_resume_target_mismatch');
  let state = await recoverCleanCheckpoints(directory, manifest, manifestSha256);
  let batches = 0;
  let capacityPause = null;
  while (!state.exhausted && batches < config.maxBatches) {
    check(state.sequence < MAX_BATCHES, 'runner_total_batch_bound_reached');
    const capacity = await readCapacity(directory);
    check(typeof capacity?.admitted === 'boolean', 'runner_capacity_probe_failed');
    if (!capacity.admitted) { capacityPause = capacity; break; }
    const sequence = state.sequence + 1;
    const files = batchFiles(directory, sequence);
    const intent = { schemaVersion: 1, manifestSha256, sequence, afterId: state.nextAfterId,
      previousCheckpointSha256: state.checkpointSha256 };
    const intentSha256 = await saveExclusive(files.intent, intent, MAX_CONTROL_BYTES);
    try {
      const advertised = await runCli(cliArguments('inventory', files, state.nextAfterId, undefined, config.concurrency), { env });
      await saveExclusive(files.inventoryResult, advertised);
      const inventory = await validateBatch(files, state.nextAfterId, manifest, false);
      let evidence = inventory.evidence;
      if (evidence.assetCount > 0) {
        const result = await runCli(cliArguments('execute', files, state.nextAfterId, evidence.inventorySha256, config.concurrency), { env });
        await saveExclusive(files.result, result);
        evidence = (await validateBatch(files, state.nextAfterId, manifest, true)).evidence;
      }
      const checkpoint = { schemaVersion: 1, manifestSha256, sequence, afterId: state.nextAfterId,
        previousCheckpointSha256: state.checkpointSha256, intentSha256, ...evidence,
        totalPublished: state.totalPublished + evidence.assetCount };
      const checkpointSha256 = await saveExclusive(files.checkpoint, checkpoint, MAX_CONTROL_BYTES);
      state = { sequence, nextAfterId: evidence.nextAfterId, exhausted: evidence.exhausted,
        totalPublished: checkpoint.totalPublished, checkpointSha256 };
      batches += 1;
    } catch (error) {
      await saveExclusive(files.error, { status: 'blocked', code: errorCode(error), sequence,
        afterId: state.nextAfterId, requiresReconciliation: true }, MAX_CONTROL_BYTES).catch(() => {});
      throw error;
    }
  }
  await unlink(lock);
  await syncDirectory(directory);
  return { status: capacityPause ? 'capacity_paused' : state.exhausted ? 'traversal_complete' : 'bounded',
    ...(capacityPause ? { capacity: capacityPause } : {}),
    verificationRequired: 'global_remaining_source_inventory', runId: config.runId, batchesThisInvocation: batches,
    completedBatches: state.sequence, publishedAssets: state.totalPublished, nextAfterId: state.nextAfterId,
    exhausted: state.exhausted, checkpointSha256: state.checkpointSha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runR2MigrationRunner().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(JSON.stringify({ status: 'blocked', code: errorCode(error), requiresReconciliation: true }));
    process.exitCode = 1;
  });
}