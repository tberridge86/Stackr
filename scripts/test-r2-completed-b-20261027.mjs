import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const CORE_SHA = 'd05fdae0f9d7280b70f03aad681eb2b01e6b31b7d4c11acab31745c4ed14b922';
const corePath = process.env.STACKR_DIAGNOSTIC_TEST_CORE ?? new URL('./lib/r2-catalogue-migration.mjs', import.meta.url);
const coreBytes = await readFile(corePath);
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(hash(coreBytes), CORE_SHA, 'Tests require the exact production-pinned pure core');
const core = await import('data:text/javascript;base64,' + coreBytes.toString('base64'));
const inspectorBytes = await readFile(new URL('./inspect-r2-completed-b-20261027.mjs', import.meta.url));
const inspectorText = inspectorBytes.toString('utf8');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const fingerprint = value => hash(JSON.stringify(canonical(value)));
const encode = value => Buffer.from(JSON.stringify(value));
const REF = 'oakdbbzdqwurpjnoqhmu';
const SERVICE = 'b5410607-a591-420e-a506-fe184ce7455b';
const ENVIRONMENT = 'b4304736-cac8-4ca9-92a7-93f7f6499c2f';
const PROJECT = 'd205637b-5376-41aa-9169-1015ba88fec3';
const CURRENT = 'production-recovered-20261027b';
const OLD = 'production-resumed-20261026a';
const ROOT = '/data/r2-catalogue-migration/';
const CACHE = 'public, max-age=31536000, immutable';
const ENV = { RAILWAY_SERVICE_ID: SERVICE, RAILWAY_ENVIRONMENT_ID: ENVIRONMENT, RAILWAY_PROJECT_ID: PROJECT };
const OPTIONS = { sourceBucket: 'stackr-catalogue-public', destinationBucket: 'stackr-catalogue-public',
  publicBaseUrl: 'https://assets.stackrtcg.com', maxAssets: 25, maxObjectBytes: 12582912,
  maxBatchBytes: 262144000, objectTimeoutMs: 120000, concurrency: 8 };
const SOURCE_PINS = {
  'run-r2-catalogue-migration.mjs': '015b6b36f19840c367be96a5a8a18605e4ad36fe2d813e7ff574f10e4a1adadc',
  'inspect-r2-bulk-run.mjs': '72b5c6765e03d74d98aef38b21f0148627f7ec437298f23661c83320e453e7d3',
  'migrate-catalogue-to-r2.mjs': '757abcbc4347d186ce481746f4d704c63228f3b7644df9890f56e73b0a8f13dd',
  'lib/r2-catalogue-migration.mjs': CORE_SHA,
  'deploy/verified-supabase-postgres.mjs': '8e2bf4f392a465fad9bd6669dba5b68fb081a6ca9489b5b4d3b75ac5e5327cb7',
};
const PREFIX = number => 'batch-' + String(number).padStart(6, '0') + '.';
const SECRET = 'DO_NOT_LOG_PRIVATE_METADATA_OR_PROVIDER_TOKEN_12345';
const certificate = { kind: 'test-private-certificate', metadata: SECRET };
const certificateSha = hash(JSON.stringify(certificate));
const acceptance = { schemaVersion: 1, kind: 'stackr-r2-linked-continuation', runId: CURRENT,
  parentRunIds: ['production-recovered-20261027a'], certificateSha256: certificateSha, certificate,
  confirmedGlobalBaseline: 58734, eligibleTotal: 62098, newRunStartsFromNull: true,
  parentEvidencePreserved: true, sourceObjectsDeleted: 0 };
const acceptanceBytes = Buffer.from(JSON.stringify(acceptance, null, 2) + '\n');
// Production has no test override. Only this private test-loaded copy replaces
// the two recorded production hashes with hashes of the synthetic acceptance.
const testInspector = inspectorText
  .replace("const ACCEPTANCE_SHA = 'bd06069c8ee2670a0d9c763df80b40f6b42a11f6ce67e16ec3ad7e703a219327';",
    "const ACCEPTANCE_SHA = '" + hash(acceptanceBytes) + "';")
  .replace("const CERTIFICATE_SHA = '11a6eaf278ab4f45e99097a6e40a636a9016cffa1fc024a6a9b04a81eca0bfb2';",
    "const CERTIFICATE_SHA = '" + certificateSha + "';");
assert.notEqual(testInspector, inspectorText);

function asset(number, derivativeCount = 1) {
  return { id: '00000000-0000-4000-8000-' + number.toString(16).padStart(12, '0'),
    asset_id: SECRET + '-' + number, asset_type: 'card', updated_at: '2026-10-26T08:00:00.000Z',
    source_id: null, variant_id: null, rights_status: 'approved', permission_status: 'approved',
    asset_visibility: 'public_catalogue', publicly_servable: true, retention_status: 'active',
    deleted_at: null, deprecated_at: null, storage_provider: 'supabase_storage',
    storage_bucket: OPTIONS.sourceBucket, storage_key: SECRET + '/original', storage_path: SECRET + '/original',
    url: 'https://' + REF + '.supabase.co/storage/v1/object/public/' + OPTIONS.sourceBucket + '/' + SECRET,
    content_sha256: hash('data'), sha256: hash('data'), byte_size: 4, mime_type: 'image/webp',
    cache_control: null, archival_storage_key: null, metadata: { secret: SECRET },
    derivative_list: Array.from({ length: derivativeCount }, (_, index) => ({ role: 'grid' + index,
      mimeType: 'image/webp', storageKey: SECRET + '/grid' + index, byteSize: 4,
      contentSha256: hash('data'), metadata: { secret: SECRET } })),
  };
}
function object(row, descriptor) {
  const key = 'public/' + row.asset_type + '/' + row.id + '/' + hash(row.asset_id)
    + '/' + hash('data') + '/' + descriptor.role + '.webp';
  return { role: descriptor.role, index: descriptor.index, bucket: OPTIONS.destinationBucket, key,
    url: OPTIONS.publicBaseUrl + '/' + key, mimeType: 'image/webp', byteSize: 4, sha256: hash('data') };
}
function prepared(row, plan, objects) {
  const original = objects[0];
  const patch = { storage_provider: 's3_compatible', storage_bucket: original.bucket, storage_key: original.key,
    storage_path: original.key, url: original.url, content_sha256: original.sha256, sha256: original.sha256,
    byte_size: original.byteSize, derivative_list: row.derivative_list.map((derivative, index) => ({ ...derivative,
      storageProvider: 's3_compatible', storageBucket: objects[index + 1].bucket, storageKey: objects[index + 1].key,
      contentSha256: objects[index + 1].sha256, byteSize: objects[index + 1].byteSize,
      cacheControl: CACHE, url: objects[index + 1].url, deliveryUrl: objects[index + 1].url })), cache_control: CACHE };
  return { ...plan, objects, patch, operationId: fingerprint({ rowId: row.id, snapshotHash: plan.snapshotHash, patch }) };
}
function fixture(runId = CURRENT) {
  const files = new Map(); const directory = ROOT + runId; const receiptState = { bytes: acceptanceBytes };
  const manifest = { schemaVersion: 1, kind: 'stackr-r2-sequential-run', runId, expectedRef: REF,
    railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT, options: OPTIONS, limit: 25 };
  files.set('run.json', encode(manifest));

  let lastId = null; let lastCheckpointSha = null; let publishedTotal = 0;
  function batch(sequence, { count = 25, receipts = count, ambiguous = null, derivativeCount = 1,
    complete = false, sensitiveCode = false, historicalSuccessor = false, contentAddressedSources = false } = {}) {
    const start = (sequence - 1) * 25 + 1; const rows = Array.from({ length: count }, (_, index) => asset(start + index, derivativeCount));
    if (contentAddressedSources) for (const row of rows) {
      const base = 'public/card_image/' + hash('data').slice(0, 2) + '/' + hash('data').slice(2, 4) + '/' + hash('data') + '/';
      row.storage_key = base + 'original.webp'; row.storage_path = row.storage_key;
      row.url = 'https://' + REF + '.supabase.co/storage/v1/object/public/' + OPTIONS.sourceBucket + '/' + row.storage_key;
      for (const derivative of row.derivative_list) derivative.storageKey = base + derivative.role + '.webp';
    }
    if (historicalSuccessor) { assert.equal(count, 1); rows[0].id = '62db634c-943e-4570-a606-d1039746a477'; }
    const inventory = { schemaVersion: 1, kind: 'stackr-r2-catalogue-inventory', expectedRef: REF,
      sourceOrigin: 'https://' + REF + '.supabase.co', options: OPTIONS, limit: 25, afterId: lastId,
      nextAfterId: rows.at(-1)?.id ?? lastId, exhausted: count < 25, assets: rows };
    const prefix = PREFIX(sequence); const manifestSha256 = hash(files.get('run.json'));
    files.set(prefix + 'intent.json', encode({ schemaVersion: 1, manifestSha256, sequence,
      afterId: lastId, previousCheckpointSha256: lastCheckpointSha }));
    files.set(prefix + 'inventory.json', encode(inventory));
    const inventorySha256 = hash(files.get(prefix + 'inventory.json'));
    files.set(prefix + 'inventory.json.sha256.json', encode({ inventoryFile: prefix + 'inventory.json', inventorySha256 }));
    files.set(prefix + 'inventory-result.json', encode({ exitCode: 0, signal: null, result: { status: 'inventory',
      assetCount: rows.length, assetBytesRead: 0, inventorySha256, inventoryPath: directory + '/' + prefix + 'inventory.json',
      digestPath: directory + '/' + prefix + 'inventory.json.sha256.json', nextAfterId: inventory.nextAfterId, exhausted: inventory.exhausted } }));
    const journal = [{ event: 'migration_preflight', inventorySha256, inventory,
      railwayServiceId: SERVICE, railwayEnvironmentId: ENVIRONMENT }];
    const results = []; let objectCount = 0;
    for (let offset = 0; offset < rows.length; offset += 8) {
      if (offset > receipts || (offset === receipts && !ambiguous)) break;
      const window = rows.slice(offset, offset + 8);
      const plans = window.map(row => core.planCatalogueAssetMigration(row, OPTIONS));
      const preparedPlans = window.map((row, index) => {
        const objects = plans[index].objects.map(descriptor => {
          const pending = object(row, descriptor); objectCount++;
          journal.push({ event: 'object_pending', rowId: row.id, object: pending });
          const verified = { ...pending, reused: false };
          journal.push({ event: 'object_verified', rowId: row.id, object: verified });
          return verified;
        });
        return prepared(row, plans[index], objects);
      });
      for (let index = 0; index < window.length; index++) {
        const row = window[index]; const plan = preparedPlans[index]; const globalIndex = offset + index;
        if (globalIndex < receipts || (globalIndex === receipts && ambiguous)) {
          journal.push({ event: 'publication_pending', plan });
          const after = { ...row, ...plan.patch, updated_at: '2026-10-26T21:33:10.000Z' };
          if (globalIndex < receipts || ambiguous === 'commit') journal.push({ event: 'database_cas_committed',
            operationId: plan.operationId, rowId: row.id, before: row, after });
          if (globalIndex < receipts) {
            const receipt = { ...plan, updatedAt: after.updated_at, status: 'published' };
            journal.push({ event: 'publication_complete', receipt });
            results.push({ rowId: row.id, status: 'published', receipt }); continue;
          }
        }
        results.push({ rowId: row.id,
          status: globalIndex === receipts && ambiguous ? 'publication_requires_reconciliation' : 'failed',
          code: sensitiveCode ? SECRET : 'publication_window_stopped',
          transfers: plan.objects.map(entry => ({ role: entry.role, index: entry.index, status: 'verified', stage: 'verified', object: entry })) });
      }
      if (results.length > receipts) break;
    }
    const processedBytes = objectCount * 4;
    const phaseMetrics = { concurrency: 8, elapsedMs: 1,
      ...Object.fromEntries(['source', 'put', 'r2Read', 'cdn', 'journal', 'publish'].map(phase => [phase,
        { count: phase === 'publish' ? receipts : phase === 'journal' ? 2 * objectCount + 2 * receipts : objectCount, elapsedMs: 1 }])) };
    const execute = { exitCode: complete ? 0 : 1, signal: null, result: { status: complete ? 'complete' : 'stopped',
      processedBytes, results, remaining: count - results.length, phaseMetrics } };
    files.set(prefix + 'events.jsonl', Buffer.from(journal.map(record => JSON.stringify(record)).join('\n') + '\n'));
    files.set(prefix + 'execute-result.json', encode(execute));
    if (complete) {
      publishedTotal += rows.length;
      const checkpoint = { schemaVersion: 1, manifestSha256, sequence, afterId: lastId, previousCheckpointSha256: lastCheckpointSha,
        intentSha256: hash(files.get(prefix + 'intent.json')), inventorySha256,
        inventoryResultSha256: hash(files.get(prefix + 'inventory-result.json')), digestSha256: hash(files.get(prefix + 'inventory.json.sha256.json')),
        assetCount: rows.length, nextAfterId: inventory.nextAfterId, exhausted: inventory.exhausted,
        resultSha256: hash(files.get(prefix + 'execute-result.json')), journalSha256: hash(files.get(prefix + 'events.jsonl')),
        totalPublished: publishedTotal };
      files.set(prefix + 'checkpoint.json', encode(checkpoint)); lastId = inventory.nextAfterId; lastCheckpointSha = hash(files.get(prefix + 'checkpoint.json'));
    }
    return { rows, inventory, journal, execute };
  }
  const activity = { reads: 0, lists: 0, sourceChecks: 0 };
  const deps = {
    assertBulkInspectionUid() {}, assertRunnerProject() {}, async assertHostedRunner() {},
    async verifySourceFiles() { activity.sourceChecks++; return Object.entries(SOURCE_PINS).map(([name, sha256]) => ({ name, bytes: 1, sha256 })); },
    async realpath(path) { return path; },
    async list(path) { assert.equal(path, directory); activity.lists++; return [...files.keys()].map(name => ({ name, regular: true })); },
    async readBulkInspectionFile(path, maximum, retain = true) {
      assert.ok(path.startsWith(directory + '/') || path === directory + '.acceptance.json');
      const bytes = path === directory + '.acceptance.json' ? receiptState.bytes : files.get(path.slice(directory.length + 1));
      assert.ok(bytes, 'only fixture evidence paths may be read'); assert.ok(bytes.length <= maximum); activity.reads++;
      return { bytes: bytes.length, sha256: hash(bytes), ...(retain ? { content: bytes } : {}) };
    },
    planCatalogueAssetMigration: core.planCatalogueAssetMigration,
    validateCatalogueMigrationJournal: core.validateCatalogueMigrationJournal,
    createCatalogueMigrationRollback: core.createCatalogueMigrationRollback,
    createDb() { assert.fail('DB is forbidden'); }, fetch() { assert.fail('network is forbidden'); },
    runR2MigrationRunner() { assert.fail('runner is forbidden'); }, writeFile() { assert.fail('writes are forbidden'); },
  };
  return { files, batch, deps, activity, runId, receiptState, inspect: () => inspectCompletedB20261027({ env: ENV, dependencies: deps }) };
}


function completeFixture() {
  const f = fixture();
  for (let i = 1; i <= 135; i++) f.batch(i, { count: i === 135 ? 14 : 25, complete: true });
  return f;
}
const reference = completeFixture();
const terminalSha = hash(JSON.stringify(JSON.parse(reference.files.get(PREFIX(135) + 'execute-result.json')).result));
const fixtureInspector = testInspector.replace(
  "const TERMINAL_EXECUTION_RESULT_SHA = '6a18551d52189e8b29bac59162037cff42a9283b122a9d2bf4df738bf13d359a';",
  "const TERMINAL_EXECUTION_RESULT_SHA = '" + terminalSha + "';");
assert.notEqual(fixtureInspector, testInspector);
const { inspectCompletedB20261027 } = await import('data:text/javascript;base64,' + Buffer.from(fixtureInspector).toString('base64'));

test('complete 135-batch/3364-publication chain produces bounded sanitized receipt and public samples', async () => {
  const before = [...reference.files].map(([name, bytes]) => [name, hash(bytes)]);
  const result = await reference.inspect();
  const c = result.certificate;
  assert.equal(c.status, 'recorded_traversal_verified');
  assert.equal(c.completedBatches, 135); assert.equal(c.publishedAssets, 3364);
  assert.equal(c.terminalCheckpoint.exhausted, true); assert.equal(c.lockPresent, false);
  assert.equal(c.terminalExecutionResultValueSha256, terminalSha);
  assert.equal(c.acceptance.receiptSha256, hash(acceptanceBytes));
  assert.equal(c.inheritedBaseline + c.publishedAssets, c.resultingEligibleTotal);
  assert.equal(c.completionVerified, false); assert.equal(c.publicRetrievalVerified, false);
  assert.equal(c.databaseQueried, false); assert.equal(c.networkRequested, false); assert.equal(c.runnerStarted, false);
  assert.equal(c.sourceObjectsDeleted, 0); assert.equal(c.evidenceModified, false);
  assert.equal(result.certificateSha256, hash(JSON.stringify(c)));
  assert.equal(result.publicSamples.length, 4);
  assert.deepEqual(result.publicSamples.map(x => x.sequence), [1, 1, 135, 135]);
  assert.ok(result.publicSamples.every(x => x.liveVerified === false && x.verifiedRecorded === true));
  assert.ok(!JSON.stringify(result).includes(SECRET));
  const lines=result.events.map(x=>JSON.stringify(x)+'\n');
  assert.ok(lines.every(x=>Buffer.byteLength(x)<=8192));
  assert.equal(result.events.at(-1).precedingEventsSha256, hash(lines.slice(0,-1).join('')));
  assert.deepEqual([...reference.files].map(([name, bytes]) => [name, hash(bytes)]), before);
  assert.equal(reference.activity.lists, 2); assert.equal(reference.activity.sourceChecks, 2);
});

test('unfinished or non-exhausted traversal and lock presence fail closed', async () => {
  const missing=fixture(); missing.batch(1,{complete:true});
  await assert.rejects(missing.inspect(),e=>e.code==='closeout_traversal_incomplete');
  const locked=fixture(); locked.files.set('runner.lock',encode({schemaVersion:1,processId:3,startedAt:'2026-10-27T14:00:00Z'}));
  await assert.rejects(locked.inspect(),e=>e.code==='closeout_lock_present');
  const tail=fixture(); tail.batch(1,{count:14,receipts:1,ambiguous:'commit'});
  await assert.rejects(tail.inspect(),e=>e.code==='closeout_traversal_incomplete');
});

test('acceptance and host identity must match exact recovery B before evidence reads', async () => {
  const f=fixture(); f.receiptState.bytes=Buffer.from('{}');
  await assert.rejects(f.inspect(),e=>e.code==='cutover_acceptance_mismatch');
  for(const options of [{runId:CURRENT},{mode:'execute'},{env:{...ENV,RAILWAY_SERVICE_ID:'other'}}])
    await assert.rejects(inspectCompletedB20261027({...options,dependencies:fixture().deps}));
});

test('source pins, links, file bounds and unexpected files are rejected', async () => {
  for(const mutate of [
    f=>{f.deps.verifySourceFiles=async()=>[];},
    f=>{f.deps.realpath=async()=>'/elsewhere';},
    f=>{f.deps.list=async()=>[{name:'run.json',regular:false}];},
    f=>{f.files.set('final-receipt.json',Buffer.from('{}'));},
    f=>{f.files.set('../../other',Buffer.from('x'));},
  ]){const f=fixture();mutate(f);await assert.rejects(f.inspect());}
});

test('journal truncation, invalid receipt and checkpoint digest tampering fail closed', async()=>{
  for(const mutate of [
    f=>{const k=PREFIX(1)+'events.jsonl';f.files.set(k,f.files.get(k).subarray(0,-1));},
    f=>{const k=PREFIX(1)+'events.jsonl';const rows=f.files.get(k).toString().trimEnd().split('\n').map(JSON.parse);
      rows.find(x=>x.event==='publication_complete').receipt.patch.url='https://evil.example';f.files.set(k,Buffer.from(rows.map(JSON.stringify).join('\n')+'\n'));},
    f=>{const k=PREFIX(1)+'checkpoint.json';const c=JSON.parse(f.files.get(k));c.inventorySha256='0'.repeat(64);f.files.set(k,encode(c));},
  ]){const f=fixture();f.batch(1,{complete:true});mutate(f);await assert.rejects(f.inspect());}
});

test('complete chain still rejects terminal runtime-result hash mismatch',async()=>{
  const f=completeFixture();
  const key=PREFIX(135)+'execute-result.json';const v=JSON.parse(f.files.get(key));v.result.phaseMetrics.elapsedMs=2;f.files.set(key,encode(v));
  const ck=PREFIX(135)+'checkpoint.json';const c=JSON.parse(f.files.get(ck));c.resultSha256=hash(f.files.get(key));f.files.set(ck,encode(c));
  await assert.rejects(f.inspect(),e=>e.code==='closeout_terminal_execution_mismatch');
});

test('final snapshot drift and acceptance drift invalidate derived receipt',async()=>{
  const f=completeFixture();const old=f.deps.list;
  f.deps.list=async p=>{if(f.activity.lists===1)f.files.set('run.json',Buffer.from('{}'));return old(p);};
  await assert.rejects(f.inspect(),e=>e.code==='cutover_snapshot_changed');
  const a=completeFixture();const read=a.deps.readBulkInspectionFile;let reads=0;
  a.deps.readBulkInspectionFile=async(...args)=>{if(args[0].endsWith('.acceptance.json')&&++reads===2)a.receiptState.bytes=Buffer.from('{}');return read(...args);};
  await assert.rejects(a.inspect(),e=>e.code==='cutover_acceptance_mismatch');
});

test('production module contains no mutation or network invocation and has no override for production pins',()=>{
  assert.ok(inspectorText.includes("const MAX_BATCHES = 135;"));
  assert.ok(inspectorText.includes("const TERMINAL_EXECUTION_RESULT_SHA = '6a18551d52189e8b29bac59162037cff42a9283b122a9d2bf4df738bf13d359a';"));
  assert.ok(inspectorText.includes('constants.O_RDONLY | constants.O_NOFOLLOW'));
  assert.ok(!/\b(?:writeFile|appendFile|unlink|rename|mkdir|fetch|spawn|execFile)\s*\(/.test(inspectorText));
  assert.ok(!inspectorText.includes('STACKR_DIAGNOSTIC_TEST_CORE'));
  assert.deepEqual([...inspectorText.matchAll(/^export (?:async )?function (\w+)/gm)].map(x=>x[1]),['inspectCompletedB20261027']);
});
