import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

const moduleText = await readFile(new URL('./reconcile-r2-recovered-run-20261027.mjs', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
const fingerprint = value => hash(JSON.stringify(canonical(value)));
const CURRENT = 'production-recovered-20261027a';
const FAILURE = 'efa53563-2d1f-4eeb-8665-efa3a8ed5e4f';
const SECRET = 'DO_NOT_LOG_SQL_BODY_OR_PASSWORD_54321';
const ENV = { RAILWAY_SERVICE_ID: 'b5410607-a591-420e-a506-fe184ce7455b',
  RAILWAY_ENVIRONMENT_ID: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f', RAILWAY_PROJECT_ID: 'd205637b-5376-41aa-9169-1015ba88fec3',
  SUPABASE_URL: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres:' + SECRET + '@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
const BUCKET = 'stackr-catalogue-public'; const BASE = 'https://assets.stackrtcg.com';
const SOURCE_URL = 'https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/7c/83/7c83bcee90f015b28de1519aff90b589a3654150a5b438158d65a4a89c95c543/search-result.webp';
const OBJECT_BYTES = Buffer.from('data'); const SOURCE_BYTES = Buffer.alloc(3480, 71);
const HISTORICAL = [
  {
    "rowId": "d5056127-65e8-4706-bda1-b2a456715c9d",
    "beforeSnapshotSha256": "b345dd4e1891d93eb0352ea6df21b7eeff133af7d841dbf11c2317bb3296745f",
    "inventoryIndex": 16
  },
  {
    "rowId": "d5059ad3-69f2-49cb-b2de-884fab164f26",
    "beforeSnapshotSha256": "179df69124897417dd583ec6623dc14cbac36d3a8159a445b18b36348a5dd14d",
    "inventoryIndex": 17
  },
  {
    "rowId": "d508764e-03b4-470b-a74f-5db5b1e76898",
    "beforeSnapshotSha256": "42ae34712c934df0eb80e66e73d94c722098aa0a20107e34abe08ab62dd85510",
    "inventoryIndex": 18
  },
  {
    "rowId": "d509e99a-633e-4132-a88e-ce68cce56bb5",
    "beforeSnapshotSha256": "3c6693d3e18808f99681d525af0f2f6731233d3f184573ab59d7c965e65538a3",
    "inventoryIndex": 19
  },
  {
    "rowId": "d50ac605-1212-4f81-aa2f-b89063026a8c",
    "beforeSnapshotSha256": "cc4bee90554664768b58a60e11300b5d10c440b2715cc4ec070ba42bac4685e2",
    "inventoryIndex": 20
  },
  {
    "rowId": "d50b4c8c-d641-4ca4-9b5b-3dc20bc253c0",
    "beforeSnapshotSha256": "c0a6ee6da48e33b9bb43da8876a6f66d0fd8dbda5be83be0c5b883f7bddd39ae",
    "inventoryIndex": 21
  },
  {
    "rowId": "d51028c1-645c-4a13-9c6b-34cfbee45f16",
    "beforeSnapshotSha256": "588dfa0f6cf79c3a69790cffecd2ef1c0d111d48a24de11c0efdd223076bb525",
    "inventoryIndex": 22
  },
  {
    "rowId": "d511b5c7-5c35-4aa8-bfba-b33c45c360da",
    "beforeSnapshotSha256": "b39f46df4f7299a0336d721366aabe29b8d546bef49065677ebf18e1f3ca5e05",
    "inventoryIndex": 23
  },
  {
    "rowId": "d512f6f9-5370-4f74-9564-b3bb818accb1",
    "beforeSnapshotSha256": "0ec2357bb6ff5950f62cc7d60aca86e4ad9b47c3685ceb3ab90f401670c27550",
    "inventoryIndex": 24
  }
];
const TAIL_IDS = [
  "ef9b4fc2-e0ac-4f65-bd0e-3385669e37c4",
  "ef9cac1c-dc92-4898-b2e8-e2df23c57521",
  "ef9d7a55-eafa-406e-b779-a3204fe596bd",
  "ef9e9b42-175d-49d7-85f0-184844559a90",
  "ef9f44d8-d4ea-483b-ad34-cf19b8c82034",
  "efa020e9-685f-4d19-afc4-d16421f762b0",
  "efa07bda-37be-4803-8247-b5b81cded9c2",
  "efa0c04e-df57-408d-81ee-12562abc7e97",
  "efa0fa4e-f858-435a-9d9b-fd5155393b72",
  "efa11c5b-d198-4c0f-b98a-f53d4fdc292b",
  "efa1977a-7ea7-4c89-8213-3171d9cc0087",
  "efa53563-2d1f-4eeb-8665-efa3a8ed5e4f",
  "efa699c7-7f62-4911-9cd5-970c5a73d49c",
  "efa8aca5-ef0f-4db2-99b7-b969c04d66ed",
  "efa8fb6b-1bb3-40a1-a294-dad55bf2f15e",
  "efa8fdef-6f41-43fe-913e-19d48e923b39",
  "efab366a-aac9-46f2-986f-b6c83b6e6125",
  "efaf312c-86d6-4fb0-8038-b42b66147f83",
  "efb14bf0-e60e-441f-a306-069caa9aeb4b",
  "efb3bc81-a113-4bbb-8083-b28d5f9df9c1",
  "efb5217a-b773-4521-8471-cfaf7624c43c",
  "efb660dd-17ef-45dd-b646-32812bf574cb",
  "efb771c1-273f-4264-9c23-7392f7b1ec4b",
  "efb99a51-ecd8-4bad-9bf6-8f17603bb3cc",
  "efb9c57d-2dc2-428e-8093-784d218928ac"
];
const beforeRow = id => ({ id, storage_provider: 'supabase_storage', metadata: SECRET });
const afterRow = id => ({ ...beforeRow(id), storage_provider: 's3_compatible' });
const actualSource = '7c83bcee90f015b28de1519aff90b589a3654150a5b438158d65a4a89c95c543';
// Only a private test-loaded copy changes recorded hash preimages to synthetic
// values. Production exposes no test override argument, environment or export.
async function loadFactory({ deadlineMs } = {}) {
  let text = moduleText;
  const replacements = HISTORICAL.map(row => [row.beforeSnapshotSha256, fingerprint(beforeRow(row.rowId))]);
  replacements.push(['f7fceafa935c9dcf489f8319dd5f556eeba796e326d9b6b55693f4d2e44b1f62', fingerprint(beforeRow(FAILURE))]);
  for (const [needle, replacement] of replacements) { assert.equal(text.split(needle).length, 2); text = text.replace(needle, replacement); }
  const needle = "sha256: '" + actualSource + "'"; assert.equal(text.split(needle).length, 2);
  text = text.replace(needle, "sha256: '" + hash(SOURCE_BYTES) + "'");
  if (deadlineMs) { assert.equal(text.split('}, 30000);').length, 2); text = text.replace('}, 30000);', '}, ' + deadlineMs + ');'); }
  return (await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'))).createRecoveredRunReconciler;
}
const createReconciler = await loadFactory();
function object(rowId, index) {
  const role = index === -1 ? 'original' : 'grid' + index;
  const key = 'public/card_image/' + rowId + '/' + hash(rowId) + '/' + hash(OBJECT_BYTES) + '/' + role + '.webp';
  return { role, index, bucket: BUCKET, key, url: BASE + '/' + key, mimeType: 'image/webp',
    byteSize: OBJECT_BYTES.length, sha256: hash(OBJECT_BYTES), verifiedRecorded: true, liveVerified: false };
}
function expectation(before, after, index, published) {
  return { rowId: before.id, sequence: Math.floor(index / 25) + 1, inventoryIndex: index % 25,
    beforeSnapshotSha256: fingerprint(before), expectedSnapshotSha256: fingerprint(after), published,
    journalState: published ? 'published_receipt' : 'no_publication_record', recordedCommitSnapshotSha256: null,
    operationId: published ? hash('operation:' + before.id) : null, receiptSha256: published ? hash('receipt:' + before.id) : null };
}
function runData(dbRows) {
  const rowExpectations = [];
  for (let index = 0; index < 5750; index++) {
    const id = index < 9 ? HISTORICAL[index].rowId : index >= 5725 ? TAIL_IDS[index - 5725]
      : 'd6000000-0000-4000-8000-' + index.toString(16).padStart(12, '0');
    const before = beforeRow(id), after = index < 5733 ? afterRow(id) : before;
    rowExpectations.push(expectation(before, after, index, index < 5733)); dbRows.set(id, after);
  }
  const publicSamples = [];
  for (const row of [rowExpectations[0], rowExpectations[5732]]) for (const index of [-1, 0]) publicSamples.push({
    runId: CURRENT, rowId: row.rowId, sequence: row.sequence, receiptSha256: row.receiptSha256, ...object(row.rowId, index) });
  const events = [];
  for (const [index, row] of rowExpectations.slice(5725, 5733).entries()) events.push({ event: 'r2_tail_diagnostic_objects',
    runId: CURRENT, rowId: row.rowId, sequence: 230, objectOffset: 0, totalObjects: index === 2 ? 1 : 4,
    objects: (index === 2 ? [-1] : [-1, 0, 1, 2]).map(index => ({ ...object(row.rowId, index), pendingRecorded: true })) });
  events.push({ event: 'r2_tail_diagnostic_row', runId: CURRENT, rowId: FAILURE, sequence: 230, inventoryIndex: 11,
    status: 'no_publication_record', beforeSnapshotSha256: fingerprint(beforeRow(FAILURE)),
    transferFailures: [{ role: 'search-result', index: 1, code: 'source_public_read_failed', codeSha256: hash('source_public_read_failed') }] });
  events.push({ event: 'r2_tail_diagnostic_objects', runId: CURRENT, rowId: FAILURE, sequence: 230,
    objectOffset: 0, totalObjects: 4, objects: [{ role: 'search-result', index: 1, pendingRecorded: false, verifiedRecorded: false,
      failedSource: { provider: 'supabase_storage', bucket: BUCKET,
        key: SOURCE_URL.slice(('https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/' + BUCKET + '/').length),
        url: SOURCE_URL, mimeType: 'image/webp', byteSize: SOURCE_BYTES.length, sha256: hash(SOURCE_BYTES), liveVerified: false } }] });
  return { summary: { runId: CURRENT, sourceCommit: '6dfe188166df76b41d44801ab66970b0a3881ae5', status: 'diagnostic',
    evidenceSha256: '97f03b3fbaf5fd36c7ef3c209e8ef33d4919a7159b4d41c3e7781adaf79c8c8e',
    checkpointSha256: '6a1335924d03d03d3bcc181844370c9a2e7bc48d1ad7acfab52f93324e1b7251',
    checkpointCount: 229, completedBatches: 229, checkpointPublishedAssets: 5725,
    tailPublishedAssets: 8, journalPublishedAssets: 5733, journalAndCheckpointValidationPassed: true,
    databaseQueried: false, networkRequested: false, evidenceModified: false, runnerStarted: false, resumeAuthorized: false,
    acceptance: { receiptSha256: '45d5eb8d9e55cd014a0e43f49a4014581bd1936181c8cf44a09bb02b6c366d91',
      certificateSha256: '8c171b74bbde16a0645fd0aa0801139c36b3ed5f3277a6309425ebdef151386c', bytes: 3350,
      parentRunIds: ['production-optimised-20261026b', 'production-resumed-20261026a'], confirmedGlobalBaseline: 53001,
      eligibleTotal: 62098, newRunStartsFromNull: true, parentEvidencePreserved: true },
    tail: { sequence: 230, stage: 'journal_prefix', pendingPublication: null, assetCount: 25, publishedAssets: 8, untouchedAssets: 17,
      executionResultValueSha256: '54a6980fe2c2b0a3b942404088cb0f4637765f20e4f7b7136c385c4361795754', executionResultCount: 16, executionStatus: 'stopped' } },
    rowExpectations, events, publicSamples, historicalSuccessorReceipt: null };
}
function parentData(runId) {
  const current = runId === 'production-optimised-20261026b';
  const events = current ? Array.from({length: 25}, (_, index) => index < 16
    ? { event: 'r2_tail_diagnostic_row', rowId: index === 15 ? 'd5028f70-55c2-4542-9393-564dcd4b71e5' : 'unused', status: 'published_receipt' }
    : { event: 'r2_tail_diagnostic_row', rowId: HISTORICAL[index - 16].rowId, status: 'no_publication_record',
      beforeSnapshotSha256: fingerprint(beforeRow(HISTORICAL[index - 16].rowId)),
      journalExpectedSnapshotSha256: fingerprint(beforeRow(HISTORICAL[index - 16].rowId)),
      recordedCommitSnapshotSha256: null, operationId: null, receiptSha256: null }) : [];
  return { summary: { runId, sourceCommit: '6dfe188166df76b41d44801ab66970b0a3881ae5', status: 'diagnostic',
    evidenceSha256: current ? 'd06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71' : '83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661',
    checkpointSha256: current ? 'd1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f' : 'b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8',
    completedBatches: current ? 1065 : 67, checkpointCount: current ? 1065 : 67,
    journalPublishedAssets: current ? 26641 : 1699, tailPublishedAssets: current ? 16 : 24,
    journalAndCheckpointValidationPassed: true, databaseQueried: false, networkRequested: false,
    evidenceModified: false, runnerStarted: false, resumeAuthorized: false }, events };
}
function response(url, { status = 200, body, mime = 'image/webp', redirected = false } = {}) {
  const bytes = body ?? (url === SOURCE_URL ? SOURCE_BYTES : OBJECT_BYTES);
  const value = new Response(bytes, { status, headers: { 'content-type': mime, 'content-length': String(bytes.length) } });
  Object.defineProperty(value, 'url', { value: url }); Object.defineProperty(value, 'redirected', { value: redirected }); return value;
}
function fixture({ factory = createReconciler, queryFailure, rollbackFailure = false, fetchFault, onRead, mode = 'on', counts, rowFault } = {}) {
  const dbRows = new Map(); const current = runData(dbRows); const parents = ['production-optimised-20261026b', 'production-resumed-20261026a'].map(parentData);
  const logs = []; const activity = { reads: 0, parentReads: 0, clients: 0, open: 0, queries: [], rollbacks: 0, closes: 0,
    fetches: 0, activeFetches: 0, peakFetches: 0, attempts: new Map() };
  const reconcile = factory({
    async readExpectations({ runId, env }) {
      assert.equal(env, ENV); assert.equal(runId, CURRENT); activity.reads++;
      return onRead ? onRead({ runId, data: current, activity, current, parents, dbRows }) ?? current : current;
    },
    async readParentEvidence({ runId, env }) {
      assert.equal(env, ENV); activity.parentReads++; return parents.find(parent => parent.summary.runId === runId);
    },
    createClient(url, applicationName, options) {
      assert.equal(url, ENV.SUPABASE_DB_URL); assert.equal(applicationName, 'stackr-r2-recovery-reconciliation');
      assert.deepEqual(options, { connectionTimeoutMillis: 15000, statement_timeout: 30000, query_timeout: 45000 });
      activity.clients++; const clientIndex = activity.clients; let connected = false; let transaction = false;
      return {
        async connect() { assert.equal(connected, false); connected = true; activity.open++; },
        async query(sql, values) {
          assert.ok(connected); activity.queries.push({ sql, values, clientIndex });
          if (sql === 'begin isolation level repeatable read read only') { assert.equal(transaction, false); transaction = true; return { rows: [] }; }
          if (sql === 'rollback') { activity.rollbacks++; transaction = false; if (rollbackFailure) throw new Error(SECRET); return { rows: [] }; }
          assert.ok(transaction, 'all SQL reads must be in read-only transaction');
          if (sql.startsWith("select current_setting('transaction_read_only')")) return { rows: [{ read_only: mode, isolation: 'repeatable read' }] };
          if (sql.startsWith('select to_jsonb(a)')) {
            assert.equal(values.length, 1); assert.ok(values[0].length > 0 && values[0].length <= 250);
            if (queryFailure) throw new Error(SECRET);
            const rows = values[0].map(id => ({ asset: dbRows.get(id) })); return { rows: rowFault ? rowFault(rows, clientIndex) : rows };
          }
          if (sql.startsWith('select clock_timestamp()')) return { rows: [{ checked_at: '2026-10-27 09:00:00.123456+00', pushed: '58734', remaining: '3364', total_eligible: '62098', ...counts }] };
          assert.fail('Unexpected SQL: ' + sql);
        },
        async end() { assert.ok(connected); connected = false; activity.open--; activity.closes++; },
      };
    },
    async fetchImpl(url, options) {
      assert.equal(activity.open, 0, 'public GETs must never overlap a DB transaction or connection');
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
      assert.equal(options.headers, undefined); assert.ok(options.signal instanceof AbortSignal);
      assert.ok(url.startsWith(BASE + '/public/') || url === SOURCE_URL, 'only validated destination or pinned source URL');
      activity.fetches++; activity.activeFetches++; activity.peakFetches = Math.max(activity.peakFetches, activity.activeFetches);
      const attempt = (activity.attempts.get(url) ?? 0) + 1; activity.attempts.set(url, attempt);
      try { await delay(1); return fetchFault ? await fetchFault(url, attempt, options) ?? response(url) : response(url); }
      finally { activity.activeFetches--; }
    },
    report(value) { logs.push(value); }, now: () => '2026-10-27T09:00:00.000Z',
  });
  return { reconcile: () => reconcile({ env: ENV }), current, parents, dbRows, activity, logs };
}

test('reconciles all 5,750 successor rows twice with inherited baseline, nine lineage links and 29 published-tail objects', async t => {
  const f = fixture(); const certificate = await f.reconcile();
  assert.equal(certificate.reconciliationPassed, true); assert.equal(certificate.resumeAuthorized, false);
  assert.equal(certificate.databaseReadOnly, true); assert.equal(certificate.transactionRolledBack, true); assert.equal(certificate.postcheckPassed, true);
  assert.deepEqual(certificate.rowCounts, { current: 5750, unique: 5750, inheritedBaseline: 53001, historicalSupersessions: 9 });
  assert.deepEqual(certificate.databaseChecks.map(check => check.matchedRows), [5750, 5750]);
  assert.equal(certificate.databaseChecks[0].remaining, 3364); assert.equal(certificate.publicVerification.objectsVerified, 32);
  assert.equal(certificate.publicVerification.bytesRead, 31 * 4 + SOURCE_BYTES.length);
  assert.equal(certificate.sourceFailureRechecks[0].verified, true); assert.equal(certificate.sourceFailureRechecks[0].sha256, hash(SOURCE_BYTES));
  assert.equal(certificate.historicalLinks.length, 9); assert.equal(f.activity.reads, 2); assert.equal(f.activity.parentReads, 4);
  assert.equal(certificate.parentAcceptance.inheritedPushed, 53001); assert.equal(certificate.parentAcceptance.freshBaselineRowsCompared, false);
  assert.equal(certificate.parentManifests.length, 2);
  assert.equal(f.activity.queries.filter(q => q.sql.startsWith('select to_jsonb(a)')).length, 46);
  assert.equal(f.activity.rollbacks, 2); assert.equal(f.activity.closes, 2); assert.equal(f.activity.open, 0);
  assert.ok(f.activity.peakFetches <= 4); assert.ok(f.logs.length <= 30);
  assert.ok(Buffer.byteLength(JSON.stringify(certificate)) < 8192);
  const completionBytes = Buffer.byteLength(JSON.stringify({ event: 'r2_reconciliation_complete',
    sourceHashes: { inspector: 'a'.repeat(64), reconciler: 'b'.repeat(64), parentInspector: 'c'.repeat(64) },
    certificate, certificateSha256: 'd'.repeat(64), runnerStarted: false, resumeAuthorized: false }) + '\n');
  assert.ok(completionBytes <= 8192); t.diagnostic('Complete certificate log envelope: ' + completionBytes + ' bytes');
  assert.ok(!JSON.stringify([certificate, f.logs]).includes(SECRET));
  assert.ok(f.activity.queries.every(({ sql }) => /^(select|begin isolation level repeatable read read only|rollback)/.test(sql)));
});

test('wrong acceptance, parent drift, lineage mismatch, older-prefix rows and ambiguous tail fail before DB', async () => {
  for (const mutate of [
    f => { f.current.summary.acceptance.receiptSha256 = 'a'.repeat(64); },
    f => { f.parents[0].summary.evidenceSha256 = 'a'.repeat(64); },
    f => { f.parents[0].events[16].beforeSnapshotSha256 = 'a'.repeat(64); },
    f => { f.current.rowExpectations[0].beforeSnapshotSha256 = 'a'.repeat(64); },
    f => { f.current.rowExpectations[0].rowId = '00000000-0000-4000-8000-000000000000'; },
    f => { const row = f.current.rowExpectations.at(-1); row.journalState = 'commit_without_receipt'; row.expectedSnapshotSha256 = null; },
    f => { f.current.summary.evidenceSha256 = 'a'.repeat(64); },
  ]) {
    const f = fixture(); mutate(f); await assert.rejects(f.reconcile(), error => error.code.startsWith('reconciliation_'));
    assert.equal(f.activity.clients, 0); assert.equal(f.activity.fetches, 0);
  }
});

test('database row drift, duplicate IDs, and changed global counts fail with rollback and no GET', async () => {
  for (const opts of [
    { rowFault: rows => rows.map((row, index) => index ? row : { asset: { ...row.asset, changed: SECRET } }) },
    { rowFault: rows => rows.map((row, index) => index === 1 ? rows[0] : row) },
    { counts: { remaining: '3365', total_eligible: '62099' } },
  ]) {
    const f = fixture(opts); await assert.rejects(f.reconcile(), error => error.code.startsWith('reconciliation_'));
    assert.equal(f.activity.rollbacks, 1); assert.equal(f.activity.closes, 1); assert.equal(f.activity.fetches, 0);
  }
});

test('query errors, non-read-only transactions and rollback failure cannot produce a certificate', async () => {
  for (const opts of [{ queryFailure: true }, { mode: 'off' }, { rollbackFailure: true }]) {
    const f = fixture(opts); await assert.rejects(f.reconcile(), error => !error.message.includes(SECRET) && error.code.startsWith('reconciliation_'));
    assert.equal(f.activity.rollbacks, 1); assert.equal(f.activity.closes, 1); assert.equal(f.activity.open, 0); assert.equal(f.activity.fetches, 0);
  }
});

test('source 404 and source hash mismatch stop recovery without a second DB pass', async () => {
  for (const [fault, expectedCode] of [
    [url => url === SOURCE_URL ? response(url, { status: 404 }) : undefined, 'reconciliation_public_http_404'],
    [url => url === SOURCE_URL ? response(url, { body: Buffer.alloc(3480, 72) }) : undefined, 'reconciliation_public_digest_mismatch'],
  ]) {
    const f = fixture({ fetchFault: fault }); await assert.rejects(f.reconcile(), error => error.code === expectedCode);
    assert.equal(f.activity.clients, 1); assert.equal(f.activity.attempts.get(SOURCE_URL), 1); assert.equal(f.activity.open, 0);
  }
});

test('CDN content mismatch and redirected responses are never retried or accepted', async () => {
  for (const fault of [url => response(url, { body: Buffer.from('evil') }), url => response(url, { redirected: true })]) {
    const f = fixture({ fetchFault: fault }); await assert.rejects(f.reconcile(), error => error.code.startsWith('reconciliation_public_'));
    assert.ok([...f.activity.attempts.values()].every(value => value === 1)); assert.equal(f.activity.clients, 1);
  }
});

test('only ordinary transient failures retry twice inside one object deadline', async () => {
  const f = fixture({ fetchFault(url, attempt) {
    if (url !== SOURCE_URL) return;
    if (attempt === 1) return response(url, { status: 503 });
    if (attempt === 2) throw Object.assign(new Error(SECRET), { cause: { code: 'ECONNRESET' } });
  } });
  const certificate = await f.reconcile(); assert.equal(f.activity.attempts.get(SOURCE_URL), 3);
  assert.equal(certificate.publicVerification.retries, 2); assert.equal(certificate.sourceFailureRechecks[0].verified, true);
  const bad = fixture({ fetchFault: url => url === SOURCE_URL ? response(url, { status: 503 }) : undefined });
  await assert.rejects(bad.reconcile(), error => error.code === 'reconciliation_public_http_503');
  assert.equal(bad.activity.attempts.get(SOURCE_URL), 3);
});

test('retry waiting does not reset the absolute per-object deadline', async () => {
  const factory = await loadFactory({ deadlineMs: 50 });
  const f = fixture({ factory, fetchFault: url => url === SOURCE_URL ? response(url, { status: 503 }) : undefined });
  await assert.rejects(f.reconcile(), error => error.code === 'reconciliation_public_timeout');
  assert.equal(f.activity.attempts.get(SOURCE_URL), 1); assert.equal(f.activity.clients, 1);
});

test('postcheck evidence drift and second-pass DB drift prevent a certificate', async () => {
  const f = fixture({ onRead({ activity, data }) {
    if (activity.reads !== 2) return;
    const copy = { ...data, rowExpectations: [...data.rowExpectations] };
    copy.rowExpectations[20] = { ...copy.rowExpectations[20], beforeSnapshotSha256: 'a'.repeat(64) }; return copy;
  } });
  await assert.rejects(f.reconcile(), error => error.code === 'reconciliation_postcheck_evidence_drift'); assert.equal(f.activity.clients, 1);
  const g = fixture({ onRead({ activity, dbRows }) { if (activity.reads === 2) dbRows.set(HISTORICAL[0].rowId, { ...afterRow(HISTORICAL[0].rowId), changed: SECRET }); } });
  await assert.rejects(g.reconcile(), error => error.code === 'reconciliation_database_row_drift');
  assert.equal(g.activity.rollbacks, 2); assert.equal(g.activity.closes, 2);
});

test('unsafe sample locations and conflicting duplicate metadata fail before any network access', async () => {
  const f = fixture(); f.current.publicSamples[0].url = 'https://example.org/' + SECRET;
  await assert.rejects(f.reconcile(), error => error.code === 'reconciliation_public_location_invalid'); assert.equal(f.activity.fetches, 0);
  const g = fixture(); g.current.publicSamples.at(-1).byteSize = 5;
  await assert.rejects(g.reconcile(), error => error.code === 'reconciliation_conflicting_public_metadata'); assert.equal(g.activity.fetches, 0);
});

test('production entry has fixed pins, no test override and no filesystem/uploader/mutation imports', async () => {
  assert.ok(HISTORICAL.every(row => moduleText.includes(row.beforeSnapshotSha256)));
  assert.ok(!moduleText.includes('9408ea91152362549183668e0d2f600bcbdd9459bf52dc80f1cd340e5142e8c2'));
  assert.ok(moduleText.includes("sha256: '" + actualSource + "'"));
  assert.ok(!/node:(?:fs|child_process)|writeFile|unlink|putObject|process\.env|testPins/.test(moduleText));
  assert.ok(!/\b(?:update|insert|delete|truncate|alter|create table)\s+catalog\./i.test(moduleText));
  const f = fixture(); const original = ENV.RAILWAY_SERVICE_ID; ENV.RAILWAY_SERVICE_ID = 'wrong';
  try { await assert.rejects(f.reconcile(), error => error.code === 'reconciliation_target_mismatch'); }
  finally { ENV.RAILWAY_SERVICE_ID = original; }
  assert.equal(f.activity.reads, 0); assert.equal(f.activity.clients, 0);
});
