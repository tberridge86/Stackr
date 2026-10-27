import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

const moduleText = await readFile(new URL('./reconcile-r2-interrupted-runs-20261027.mjs', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
const fingerprint = value => hash(JSON.stringify(canonical(value)));
const CURRENT = 'production-optimised-20261026b'; const PRIOR = 'production-resumed-20261026a';
const HISTORY = '62db634c-943e-4570-a606-d1039746a477'; const FAILURE = 'd50b4c8c-d641-4ca4-9b5b-3dc20bc253c0';
const SECRET = 'DO_NOT_LOG_SQL_BODY_OR_PASSWORD_54321';
const ENV = { RAILWAY_SERVICE_ID: 'b5410607-a591-420e-a506-fe184ce7455b',
  RAILWAY_ENVIRONMENT_ID: 'b4304736-cac8-4ca9-92a7-93f7f6499c2f', RAILWAY_PROJECT_ID: 'd205637b-5376-41aa-9169-1015ba88fec3',
  SUPABASE_URL: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
  SUPABASE_DB_URL: 'postgresql://postgres:' + SECRET + '@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres' };
const BUCKET = 'stackr-catalogue-public'; const BASE = 'https://assets.stackrtcg.com';
const SOURCE_URL = 'https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/94/08/9408ea91152362549183668e0d2f600bcbdd9459bf52dc80f1cd340e5142e8c2/detail-page.webp';
const OBJECT_BYTES = Buffer.from('data'); const SOURCE_BYTES = Buffer.alloc(146338, 71);
const historyBefore = { id: HISTORY, storage_provider: 'supabase_storage', marker: 'history', metadata: SECRET };
const historyAfter = { ...historyBefore, storage_provider: 's3_compatible' };
const actualBefore = '93e7cf97672dc35dfc5caedb45523442a7314b1b15190e962bb063fc89aee2e7';
const actualAfter = '199a02febbd5251c344a6d193be9e61bd4790ee50f72953f2a1a9904aac6ab02';
const actualSource = '9408ea91152362549183668e0d2f600bcbdd9459bf52dc80f1cd340e5142e8c2';
// Synthetic rows cannot reproduce recorded production SHA preimages. Replace
// only these three literals in this private test-loaded module; production has
// no exported argument, environment switch, or other test-pin override.
async function loadFactory({ deadlineMs } = {}) {
  let text = moduleText;
  for (const [needle, replacement] of [
    ["const HISTORY_BEFORE = '" + actualBefore + "';", "const HISTORY_BEFORE = '" + fingerprint(historyBefore) + "';"],
    ["const HISTORY_AFTER = '" + actualAfter + "';", "const HISTORY_AFTER = '" + fingerprint(historyAfter) + "';"],
    ["sha256: '" + actualSource + "'", "sha256: '" + hash(SOURCE_BYTES) + "'"],
  ]) { assert.equal(text.split(needle).length, 2); text = text.replace(needle, replacement); }
  if (deadlineMs) { assert.equal(text.split('}, 30000);').length, 2); text = text.replace('}, 30000);', '}, ' + deadlineMs + ');'); }
  return (await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'))).createInterruptedRunReconciler;
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
function runData(runId, dbRows) {
  const current = runId === CURRENT; const rows = current ? 26650 : 1700; const published = current ? 26641 : 1699;
  const checkpoints = current ? 1065 : 67; const tailPublished = current ? 16 : 24;
  const rowExpectations = [];
  for (let index = 0; index < rows; index++) {
    let id;
    if (current && index === 0 || !current && index === 1699) id = HISTORY;
    else if (current && index === 26641) id = FAILURE;
    else id = (current ? (index > 26641 ? 'd6000000' : 'd4000000') : '00000000') + '-0000-4000-8000-' + index.toString(16).padStart(12, '0');
    const before = id === HISTORY ? historyBefore : { id, storage_provider: 'supabase_storage', marker: runId + ':' + index, metadata: SECRET };
    const after = index < published ? { ...before, storage_provider: 's3_compatible' } : before;
    rowExpectations.push(expectation(before, after, index, index < published));
    if (!dbRows.has(id)) dbRows.set(id, structuredClone(after));
  }
  const samples = [];
  for (const row of [rowExpectations[0], rowExpectations[published - 1]]) for (const index of [-1, 0]) samples.push({
    runId, rowId: row.rowId, sequence: row.sequence, receiptSha256: row.receiptSha256, ...object(row.rowId, index) });
  const events = [];
  if (current) for (const row of rowExpectations.slice(26625, 26641)) events.push({ event: 'r2_tail_diagnostic_objects',
    runId, rowId: row.rowId, sequence: 1066, objectOffset: 0, totalObjects: 4,
    objects: [-1, 0, 1, 2].map(index => ({ ...object(row.rowId, index), pendingRecorded: true })) });
  const history = rowExpectations[0];
  return { summary: { runId, sourceCommit: '6dfe188166df76b41d44801ab66970b0a3881ae5', status: 'diagnostic',
    evidenceSha256: current ? 'd06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71' : '83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661',
    checkpointSha256: current ? 'd1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f' : 'b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8',
    checkpointCount: checkpoints, completedBatches: checkpoints, checkpointPublishedAssets: checkpoints * 25,
    tailPublishedAssets: tailPublished, journalPublishedAssets: published, journalAndCheckpointValidationPassed: true,
    databaseQueried: false, networkRequested: false, evidenceModified: false, runnerStarted: false, resumeAuthorized: false,
    tail: { sequence: checkpoints + 1, stage: 'journal_prefix', pendingPublication: null,
      assetCount: 25, publishedAssets: tailPublished, untouchedAssets: 25 - tailPublished } },
    rowExpectations, events, publicSamples: samples,
    historicalSuccessorReceipt: current ? { runId, rowId: HISTORY, sequence: history.sequence, inventoryIndex: history.inventoryIndex,
      operationId: history.operationId, beforeSnapshotSha256: fingerprint(historyBefore), afterSnapshotSha256: fingerprint(historyAfter),
      receiptSha256: history.receiptSha256, objects: [-1, 0, 1, 2].map(index => object(HISTORY, index)), databaseCompared: false } : null };
}
function response(url, { status = 200, body, mime = 'image/webp', redirected = false } = {}) {
  const bytes = body ?? (url === SOURCE_URL ? SOURCE_BYTES : OBJECT_BYTES);
  const value = new Response(bytes, { status, headers: { 'content-type': mime, 'content-length': String(bytes.length) } });
  Object.defineProperty(value, 'url', { value: url }); Object.defineProperty(value, 'redirected', { value: redirected }); return value;
}
function fixture({ factory = createReconciler, queryFailure, rollbackFailure = false, fetchFault, onRead, mode = 'on', counts, rowFault } = {}) {
  const dbRows = new Map(); const current = runData(CURRENT, dbRows); const prior = runData(PRIOR, dbRows);
  const logs = []; const activity = { reads: 0, clients: 0, open: 0, queries: [], rollbacks: 0, closes: 0,
    fetches: 0, activeFetches: 0, peakFetches: 0, attempts: new Map() };
  const reconcile = factory({
    async readExpectations({ runId, env }) {
      assert.equal(env, ENV); activity.reads++; const data = runId === CURRENT ? current : prior;
      return onRead ? onRead({ runId, data, activity, current, prior, dbRows }) ?? data : data;
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
          if (sql.startsWith('select clock_timestamp()')) return { rows: [{ checked_at: '2026-10-27 09:00:00.123456+00', pushed: '53001', remaining: '9097', total_eligible: '62098', ...counts }] };
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
  return { reconcile: () => reconcile({ env: ENV }), current, prior, dbRows, activity, logs };
}

test('reconciles full 28,349-row union twice with exact historical link and bounded public proof', async () => {
  const f = fixture(); const certificate = await f.reconcile();
  assert.equal(certificate.reconciliationPassed, true); assert.equal(certificate.resumeAuthorized, false);
  assert.equal(certificate.databaseReadOnly, true); assert.equal(certificate.transactionRolledBack, true); assert.equal(certificate.postcheckPassed, true);
  assert.deepEqual(certificate.rowCounts, { current: 26650, prior: 1700, unique: 28349, historicalOverlap: 1 });
  assert.deepEqual(certificate.databaseChecks.map(check => check.matchedRows), [28349, 28349]);
  assert.equal(certificate.databaseChecks[0].remaining, 9097); assert.equal(certificate.publicVerification.objectsVerified, 73);
  assert.equal(certificate.publicVerification.bytesRead, 72 * 4 + SOURCE_BYTES.length);
  assert.equal(certificate.sourceFailureRecheck.verified, true); assert.equal(certificate.sourceFailureRecheck.sha256, hash(SOURCE_BYTES));
  assert.equal(certificate.historicalLink.objectsVerified, 4); assert.equal(f.activity.reads, 4);
  assert.equal(f.activity.rollbacks, 2); assert.equal(f.activity.closes, 2); assert.equal(f.activity.open, 0);
  assert.ok(f.activity.peakFetches <= 4); assert.ok(f.logs.length <= 30);
  assert.ok(Buffer.byteLength(JSON.stringify(certificate)) < 8192);
  assert.ok(!JSON.stringify([certificate, f.logs]).includes(SECRET));
  assert.ok(f.activity.queries.every(({ sql }) => /^(select|begin isolation level repeatable read read only|rollback)/.test(sql)));
});

test('wrong predecessor/successor linkage and ambiguous tail expectations fail before DB or GET', async () => {
  for (const mutate of [f => { f.current.historicalSuccessorReceipt.receiptSha256 = 'a'.repeat(64); },
    f => { f.prior.rowExpectations.at(-1).beforeSnapshotSha256 = 'a'.repeat(64); },
    f => { const row = f.current.rowExpectations.at(-1); row.journalState = 'commit_without_receipt'; row.expectedSnapshotSha256 = null; },
    f => { f.current.summary.evidenceSha256 = 'a'.repeat(64); }]) {
    const f = fixture(); mutate(f); await assert.rejects(f.reconcile(), error => error.code.startsWith('reconciliation_'));
    assert.equal(f.activity.clients, 0); assert.equal(f.activity.fetches, 0);
  }
});

test('database row drift, duplicate IDs, and changed global counts fail with rollback and no GET', async () => {
  for (const opts of [
    { rowFault: rows => rows.map((row, index) => index ? row : { asset: { ...row.asset, changed: SECRET } }) },
    { rowFault: rows => rows.map((row, index) => index === 1 ? rows[0] : row) },
    { counts: { remaining: '9098', total_eligible: '62099' } },
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
    [url => url === SOURCE_URL ? response(url, { body: Buffer.alloc(146338, 72) }) : undefined, 'reconciliation_public_digest_mismatch'],
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
  assert.equal(certificate.publicVerification.retries, 2); assert.equal(certificate.sourceFailureRecheck.verified, true);
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
    if (activity.reads !== 3) return;
    const copy = { ...data, rowExpectations: [...data.rowExpectations] };
    copy.rowExpectations[1] = { ...copy.rowExpectations[1], beforeSnapshotSha256: 'a'.repeat(64) }; return copy;
  } });
  await assert.rejects(f.reconcile(), error => error.code === 'reconciliation_postcheck_evidence_drift'); assert.equal(f.activity.clients, 1);
  const g = fixture({ onRead({ activity, dbRows }) { if (activity.reads === 3) dbRows.set(HISTORY, { ...historyAfter, changed: SECRET }); } });
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
  assert.ok(moduleText.includes("const HISTORY_BEFORE = '" + actualBefore + "'"));
  assert.ok(moduleText.includes("const HISTORY_AFTER = '" + actualAfter + "'"));
  assert.ok(moduleText.includes("sha256: '" + actualSource + "'"));
  assert.ok(!/node:(?:fs|child_process)|writeFile|unlink|putObject|process\.env|testPins/.test(moduleText));
  assert.ok(!/\b(?:update|insert|delete|truncate|alter|create table)\s+catalog\./i.test(moduleText));
  const f = fixture(); const original = ENV.RAILWAY_SERVICE_ID; ENV.RAILWAY_SERVICE_ID = 'wrong';
  try { await assert.rejects(f.reconcile(), error => error.code === 'reconciliation_target_mismatch'); }
  finally { ENV.RAILWAY_SERVICE_ID = original; }
  assert.equal(f.activity.reads, 0); assert.equal(f.activity.clients, 0);
});
