import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const REF = 'oakdbbzdqwurpjnoqhmu';
const SERVICE = 'b5410607-a591-420e-a506-fe184ce7455b';
const ENVIRONMENT = 'b4304736-cac8-4ca9-92a7-93f7f6499c2f';
const PROJECT = 'd205637b-5376-41aa-9169-1015ba88fec3';
const SOURCE_COMMIT = '6dfe188166df76b41d44801ab66970b0a3881ae5';
const HISTORY_ROW = '62db634c-943e-4570-a606-d1039746a477';
const HISTORY_BEFORE = '93e7cf97672dc35dfc5caedb45523442a7314b1b15190e962bb063fc89aee2e7';
const HISTORY_AFTER = '199a02febbd5251c344a6d193be9e61bd4790ee50f72953f2a1a9904aac6ab02';
const RUNS = Object.freeze([
  { runId: 'production-optimised-20261026b', evidenceSha256: 'd06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71',
    checkpoints: 1065, checkpointSha256: 'd1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f',
    rows: 26650, tailPublished: 16, published: 26641 },
  { runId: 'production-resumed-20261026a', evidenceSha256: '83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661',
    checkpoints: 67, checkpointSha256: 'b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8',
    rows: 1700, tailPublished: 24, published: 1699 },
]);
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const BUCKET = 'stackr-catalogue-public';
const PUBLIC_BASE = 'https://assets.stackrtcg.com';
// Exact public derivative implicated by the interrupted execution, independently
// matched to the current source row. This is not a general Supabase URL allowance.
const SOURCE_RECHECK = Object.freeze({ rowId: 'd50b4c8c-d641-4ca4-9b5b-3dc20bc253c0', role: 'detail-page',
  url: 'https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/94/08/9408ea91152362549183668e0d2f600bcbdd9459bf52dc80f1cd340e5142e8c2/detail-page.webp',
  mimeType: 'image/webp', byteSize: 146338, sha256: '9408ea91152362549183668e0d2f600bcbdd9459bf52dc80f1cd340e5142e8c2' });
const CLIENT_OPTIONS = Object.freeze({ connectionTimeoutMillis: 15000, statement_timeout: 30000, query_timeout: 45000 });
const ROW_QUERY = 'select to_jsonb(a) as asset from catalog.assets a where a.id = any($1::uuid[]) order by a.id';
const MODE_QUERY = "select current_setting('transaction_read_only') as read_only, current_setting('transaction_isolation') as isolation";
const COUNTS_QUERY = `select clock_timestamp()::text as checked_at,
 count(*) filter (where storage_provider='s3_compatible' and url like 'https://assets.stackrtcg.com/%')::text as pushed,
 count(*) filter (where storage_provider='supabase_storage')::text as remaining, count(*)::text as total_eligible
 from catalog.assets where storage_bucket='stackr-catalogue-public'
 and storage_provider in ('supabase_storage','s3_compatible') and rights_status='approved' and permission_status='approved'
 and asset_visibility='public_catalogue' and publicly_servable=true and retention_status='active'
 and deleted_at is null and deprecated_at is null`;
const fail = code => Object.assign(new Error(code), { code });
function check(value, code) { if (!value) throw fail(code); }
const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = value => hash(JSON.stringify(canonical(value)));
function identity(env) {
  check(env && env.RAILWAY_SERVICE_ID === SERVICE && env.RAILWAY_ENVIRONMENT_ID === ENVIRONMENT
    && env.RAILWAY_PROJECT_ID === PROJECT && ['https://' + REF + '.supabase.co', 'https://' + REF + '.supabase.co/'].includes(env.SUPABASE_URL),
  'reconciliation_target_mismatch');
  let url; let username;
  try { url = new URL(env.SUPABASE_DB_URL); username = decodeURIComponent(url.username); }
  catch { throw fail('reconciliation_database_identity_invalid'); }
  const direct = url.hostname === 'db.' + REF + '.supabase.co' && ['postgres', 'postgres.' + REF].includes(username);
  const pool = url.hostname.endsWith('.pooler.supabase.com') && username === 'postgres.' + REF;
  check(['postgres:', 'postgresql:'].includes(url.protocol) && (direct || pool) && url.pathname === '/postgres' && !url.hash,
    'reconciliation_database_identity_invalid');
}
function validateRun(result, pin) {
  const s = result?.summary; const tail = s?.tail;
  check(s?.runId === pin.runId && s.sourceCommit === SOURCE_COMMIT && s.status === 'diagnostic'
    && s.evidenceSha256 === pin.evidenceSha256 && s.checkpointSha256 === pin.checkpointSha256
    && s.checkpointCount === pin.checkpoints && s.completedBatches === pin.checkpoints
    && s.checkpointPublishedAssets === pin.checkpoints * 25 && s.tailPublishedAssets === pin.tailPublished
    && s.journalPublishedAssets === pin.published && s.journalAndCheckpointValidationPassed === true
    && s.databaseQueried === false && s.networkRequested === false && s.evidenceModified === false
    && s.runnerStarted === false && s.resumeAuthorized === false, 'reconciliation_evidence_pin_mismatch');
  check(tail?.sequence === pin.checkpoints + 1 && tail.stage === 'journal_prefix' && tail.pendingPublication === null
    && tail.assetCount === 25 && tail.publishedAssets === pin.tailPublished && tail.untouchedAssets === 25 - pin.tailPublished,
  'reconciliation_tail_state_mismatch');
  check(Array.isArray(result.rowExpectations) && result.rowExpectations.length === pin.rows,
    'reconciliation_expectation_count_mismatch');
  let previous = null;
  for (const [index, row] of result.rowExpectations.entries()) {
    const published = index < pin.published;
    check(UUID.test(row?.rowId ?? '') && (!previous || previous < row.rowId)
      && row.sequence === Math.floor(index / 25) + 1 && row.inventoryIndex === index % 25
      && SHA.test(row.beforeSnapshotSha256 ?? '') && SHA.test(row.expectedSnapshotSha256 ?? '')
      && row.published === published && row.journalState === (published ? 'published_receipt' : 'no_publication_record')
      && row.recordedCommitSnapshotSha256 === null
      && (published ? SHA.test(row.operationId ?? '') && SHA.test(row.receiptSha256 ?? '')
        : row.operationId === null && row.receiptSha256 === null && row.expectedSnapshotSha256 === row.beforeSnapshotSha256),
    'reconciliation_row_expectation_invalid');
    previous = row.rowId;
  }
  check(Array.isArray(result.publicSamples) && result.publicSamples.length > 0 && result.publicSamples.length <= 4,
    'reconciliation_sample_count_invalid');
}
function objectProof(object, rowId) {
  check(UUID.test(rowId ?? '') && object && /^[A-Za-z0-9_-]{1,128}$/.test(object.role ?? '')
    && Number.isInteger(object.index) && object.index >= -1 && object.index <= 15
    && (object.role === 'original' ? object.index === -1 : object.index >= 0)
    && object.bucket === BUCKET && Object.hasOwn(EXT, object.mimeType)
    && Number.isSafeInteger(object.byteSize) && object.byteSize > 0 && object.byteSize <= 12582912
    && SHA.test(object.sha256 ?? '') && object.verifiedRecorded === true && object.liveVerified === false,
  'reconciliation_public_metadata_invalid');
  const parts = typeof object.key === 'string' ? object.key.split('/') : [];
  check(parts.length === 6 && parts[0] === 'public' && /^[A-Za-z0-9_-]{1,128}$/.test(parts[1])
    && parts[2] === rowId && SHA.test(parts[3]) && parts[4] === object.sha256
    && parts[5] === object.role + '.' + EXT[object.mimeType]
    && object.url === PUBLIC_BASE + '/' + object.key, 'reconciliation_public_location_invalid');
  return { rowId, role: object.role, index: object.index, bucket: object.bucket, key: object.key, url: object.url,
    mimeType: object.mimeType, byteSize: object.byteSize, sha256: object.sha256 };
}
function prepareEvidence(results) {
  results.forEach((result, index) => validateRun(result, RUNS[index]));
  const [current, prior] = results;
  const currentById = new Map(current.rowExpectations.map(row => [row.rowId, row]));
  const failedSource = currentById.get(SOURCE_RECHECK.rowId);
  check(failedSource?.sequence === 1066 && failedSource.published === false
    && failedSource.journalState === 'no_publication_record'
    && failedSource.beforeSnapshotSha256 === failedSource.expectedSnapshotSha256, 'reconciliation_failed_source_row_mismatch');
  const expected = new Map(currentById); let overlaps = 0;
  const history = current.historicalSuccessorReceipt;
  const successor = currentById.get(HISTORY_ROW);
  const predecessor = prior.rowExpectations.find(row => row.rowId === HISTORY_ROW);
  check(successor?.published === true && successor.beforeSnapshotSha256 === HISTORY_BEFORE
    && successor.expectedSnapshotSha256 === HISTORY_AFTER && predecessor?.published === false
    && predecessor.beforeSnapshotSha256 === HISTORY_BEFORE && predecessor.expectedSnapshotSha256 === HISTORY_BEFORE,
  'reconciliation_historical_link_invalid');
  check(history?.runId === RUNS[0].runId && history.rowId === HISTORY_ROW && history.sequence === successor.sequence
    && history.inventoryIndex === successor.inventoryIndex && history.operationId === successor.operationId
    && history.receiptSha256 === successor.receiptSha256 && history.beforeSnapshotSha256 === HISTORY_BEFORE
    && history.afterSnapshotSha256 === HISTORY_AFTER && history.databaseCompared === false
    && Array.isArray(history.objects) && history.objects.length > 0 && history.objects.length <= 17
    && prior.historicalSuccessorReceipt === null, 'reconciliation_historical_receipt_invalid');
  for (const row of prior.rowExpectations) {
    if (expected.has(row.rowId)) { check(row.rowId === HISTORY_ROW, 'reconciliation_unexpected_overlap'); overlaps++; }
    else expected.set(row.rowId, row);
  }
  check(overlaps === 1 && expected.size === 28349, 'reconciliation_union_count_mismatch');
  const publicByUrl = new Map();
  function add(object, rowId) {
    const proof = objectProof(object, rowId); const previous = publicByUrl.get(proof.url);
    check(!previous || fingerprint(previous) === fingerprint(proof), 'reconciliation_conflicting_public_metadata');
    publicByUrl.set(proof.url, proof);
  }
  const publishedTail = current.rowExpectations.filter(row => row.sequence === 1066 && row.published);
  check(publishedTail.length === 16 && Array.isArray(current.events), 'reconciliation_tail_objects_missing');
  let tailObjects = 0;
  for (const row of publishedTail) {
    const chunks = current.events.filter(event => event.event === 'r2_tail_diagnostic_objects' && event.rowId === row.rowId);
    let offset = 0; let total = null; const roles = new Set();
    for (const event of chunks) {
      check(event.runId === RUNS[0].runId && event.sequence === 1066 && event.objectOffset === offset
        && Number.isInteger(event.totalObjects) && event.totalObjects > 0 && event.totalObjects <= 17
        && (total === null || total === event.totalObjects) && Array.isArray(event.objects)
        && event.objects.length > 0 && event.objects.length <= 4, 'reconciliation_tail_objects_invalid');
      total = event.totalObjects;
      for (const object of event.objects) {
        check(object.pendingRecorded === true && !roles.has(object.role) && object.index === offset - 1,
          'reconciliation_tail_objects_invalid');
        roles.add(object.role); add(object, row.rowId); offset++; tailObjects++;
      }
    }
    check(offset === total && roles.has('original'), 'reconciliation_tail_objects_incomplete');
  }
  check(tailObjects === 64, 'reconciliation_tail_object_count_mismatch');
  for (const [index, result] of results.entries()) {
    const rows = new Map(result.rowExpectations.map(row => [row.rowId, row]));
    for (const sample of result.publicSamples) {
      const row = rows.get(sample.rowId);
      check(sample.runId === RUNS[index].runId && row?.published && sample.sequence === row.sequence
        && sample.receiptSha256 === row.receiptSha256, 'reconciliation_sample_receipt_mismatch');
      add(sample, sample.rowId);
    }
  }
  const historyRoles = new Set();
  for (const [index, object] of history.objects.entries()) {
    check(object.index === index - 1 && !historyRoles.has(object.role), 'reconciliation_historical_objects_invalid');
    historyRoles.add(object.role); add(object, HISTORY_ROW);
  }
  check(historyRoles.has('original'), 'reconciliation_historical_original_missing');
  const objects = [...publicByUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
  check(objects.length > 0 && objects.length <= 256
    && objects.reduce((sum, object) => sum + object.byteSize, 0) <= 134217728, 'reconciliation_public_budget_exceeded');
  const rows = [...expected.values()].sort((a, b) => a.rowId.localeCompare(b.rowId));
  return { rows, objects, history,
    expectationSha256: fingerprint(results.map(result => ({ rows: result.rowExpectations,
      samples: result.publicSamples, history: result.historicalSuccessorReceipt }))) };
}
function timestamp(value) {
  check(typeof value === 'string' && value.length <= 64 && /^[0-9T Z:+.\-]+$/.test(value)
    && Number.isFinite(Date.parse(value)), 'reconciliation_timestamp_invalid');
  return value;
}
async function databasePass(env, evidence, createClient) {
  let client; let transactionAttempted = false; let result; let error;
  try {
    client = createClient(env.SUPABASE_DB_URL, 'stackr-r2-recovery-reconciliation', CLIENT_OPTIONS);
    check(client && ['connect', 'query', 'end'].every(name => typeof client[name] === 'function'), 'reconciliation_database_client_invalid');
    await client.connect(); transactionAttempted = true;
    await client.query('begin isolation level repeatable read read only');
    const mode = await client.query(MODE_QUERY);
    check(mode.rows?.length === 1 && mode.rows[0].read_only === 'on' && mode.rows[0].isolation === 'repeatable read',
      'reconciliation_database_not_read_only');
    let matchedRows = 0;
    for (let offset = 0; offset < evidence.rows.length; offset += 250) {
      const chunk = evidence.rows.slice(offset, offset + 250); const ids = chunk.map(row => row.rowId);
      const response = await client.query(ROW_QUERY, [ids]);
      check(Array.isArray(response.rows) && response.rows.length === chunk.length, 'reconciliation_database_row_count');
      const expected = new Map(chunk.map(row => [row.rowId, row.expectedSnapshotSha256])); const seen = new Set();
      for (const { asset } of response.rows) {
        check(asset && expected.has(asset.id) && !seen.has(asset.id), 'reconciliation_database_row_identity');
        check(fingerprint(asset) === expected.get(asset.id), 'reconciliation_database_row_drift'); seen.add(asset.id); matchedRows++;
      }
    }
    const aggregate = await client.query(COUNTS_QUERY);
    check(aggregate.rows?.length === 1, 'reconciliation_global_count_result');
    const row = aggregate.rows[0];
    check(String(row.pushed) === '53001' && String(row.remaining) === '9097' && String(row.total_eligible) === '62098',
      'reconciliation_global_count_drift');
    result = { checkedAt: timestamp(row.checked_at), matchedRows, pushed: 53001, remaining: 9097, totalEligible: 62098 };
  } catch (caught) {
    error = /^reconciliation_[a-z0-9_]+$/.test(caught?.code ?? '') ? caught : fail('reconciliation_database_check_failed');
  } finally {
    if (client && transactionAttempted) {
      try { await client.query('rollback'); } catch { error ??= fail('reconciliation_database_rollback_failed'); }
    }
    if (client && typeof client.end === 'function') {
      try { await client.end(); } catch { error ??= fail('reconciliation_database_close_failed'); }
    }
  }
  if (error) throw error;
  return result;
}
const RETRY_HTTP = new Set([408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const RETRY_NETWORK = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);
function retryable(error) {
  if (RETRY_HTTP.has(error?.status) && error.code === 'reconciliation_public_http_' + error.status) return true;
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth++) {
    if (RETRY_NETWORK.has(current.code)) return true;
  }
  return false;
}
async function verifyObject(object, fetchImpl, controllers, budget) {
  const controller = new AbortController(); controllers.add(controller);
  let rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => { rejectDeadline(fail('reconciliation_public_timeout')); controller.abort(); }, 30000);
  const abort = () => rejectDeadline(fail('reconciliation_public_cancelled'));
  controller.signal.addEventListener('abort', abort, { once: true });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      let reader; let response;
      try {
        check(!controller.signal.aborted, 'reconciliation_public_cancelled');
        const pending = Promise.resolve().then(() => fetchImpl(object.url,
          { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal }));
        pending.then(value => { if (controller.signal.aborted) void value?.body?.cancel().catch(() => {}); }, () => {});
        response = await Promise.race([pending, deadline]);
        check(response && response.redirected === false && response.url === object.url, 'reconciliation_public_response_invalid');
        check(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599, 'reconciliation_public_response_invalid');
        if (response.status !== 200) throw Object.assign(fail('reconciliation_public_http_' + response.status), { status: response.status });
        check(response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase() === object.mimeType,
          'reconciliation_public_mime_mismatch');
        const declared = response.headers.get('content-length');
        check(declared === null || (/^[0-9]+$/.test(declared) && Number(declared) === object.byteSize), 'reconciliation_public_length_mismatch');
        check(response.body && typeof response.body.getReader === 'function', 'reconciliation_public_body_missing');
        reader = response.body.getReader(); const digest = createHash('sha256'); let bytes = 0;
        while (true) {
          const part = await Promise.race([reader.read(), deadline]); if (part.done) break;
          check(part.value instanceof Uint8Array, 'reconciliation_public_chunk_invalid');
          bytes += part.value.byteLength; budget.bytesRead += part.value.byteLength;
          check(bytes <= object.byteSize && bytes <= 12582912, 'reconciliation_public_overflow');
          check(budget.bytesRead <= 134217728, 'reconciliation_public_read_budget_exceeded'); digest.update(part.value);
        }
        check(bytes === object.byteSize && digest.digest('hex') === object.sha256, 'reconciliation_public_digest_mismatch');
        return { url: object.url, sha256: object.sha256, byteSize: bytes, verified: true };
      } catch (error) {
        if (!controller.signal.aborted && attempt < 2 && retryable(error)) {
          budget.retries++;
          await Promise.race([delay(attempt === 0 ? 100 : 300, undefined, { signal: controller.signal }), deadline]);
        } else throw /^reconciliation_[a-z0-9_]+$/.test(error?.code ?? '') ? error : fail('reconciliation_public_request_failed');
      } finally {
        if (reader) void reader.cancel().catch(() => {});
        else if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      }
    }
    throw fail('reconciliation_public_attempts_exhausted');
  } finally {
    clearTimeout(timer); controller.signal.removeEventListener('abort', abort); controller.abort(); controllers.delete(controller);
  }
}
async function publicPass(objects, fetchImpl) {
  const controllers = new Set(); const proofs = new Array(objects.length); let next = 0; let error;
  const budget = { bytesRead: 0, retries: 0 };
  async function worker() {
    while (!error && next < objects.length) {
      const index = next++;
      try { proofs[index] = await verifyObject(objects[index], fetchImpl, controllers, budget); }
      catch (caught) { error ??= caught; for (const controller of controllers) controller.abort(); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, objects.length) }, worker));
  if (error) throw error;
  return { objectsVerified: proofs.length, bytesVerified: proofs.reduce((sum, proof) => sum + proof.byteSize, 0),
    proofSha256: fingerprint(proofs), bytesRead: budget.bytesRead, retries: budget.retries };
}
/** No writes, uploader, arbitrary SQL, or resume authority. Provider dependencies are supplied by the reviewed entry. */
export function createInterruptedRunReconciler({ readExpectations, createClient, fetchImpl, report = () => {}, now = () => new Date().toISOString() } = {}) {
  for (const fn of [readExpectations, createClient, fetchImpl, report, now]) check(typeof fn === 'function', 'reconciliation_dependencies_required');
  return async function reconcile({ env } = {}) {
    identity(env); const startedAt = timestamp(now());
    const emit = (phase, values = {}) => report({ event: 'r2_reconciliation_phase', phase, ...values });
    async function readRuns(phase) {
      const results = [];
      for (const pin of RUNS) { emit(phase, { runId: pin.runId }); results.push(await readExpectations({ runId: pin.runId, env })); }
      return prepareEvidence(results);
    }
    const evidence = await readRuns('read_evidence'); emit('database_first_started', { rows: evidence.rows.length });
    const first = await databasePass(env, evidence, createClient); emit('database_first_passed', { matchedRows: first.matchedRows });
    const publicObjects = [...evidence.objects, SOURCE_RECHECK];
    check(publicObjects.length <= 256 && publicObjects.reduce((sum, object) => sum + object.byteSize, 0) <= 134217728,
      'reconciliation_public_budget_exceeded');
    emit('public_verification_started', { objects: publicObjects.length });
    const publicVerification = await publicPass(publicObjects, fetchImpl);
    emit('public_verification_passed', { objects: publicVerification.objectsVerified, bytes: publicVerification.bytesVerified });
    const postcheck = await readRuns('recheck_evidence');
    check(postcheck.expectationSha256 === evidence.expectationSha256
      && fingerprint(postcheck.objects) === fingerprint(evidence.objects), 'reconciliation_postcheck_evidence_drift');
    emit('database_second_started', { rows: postcheck.rows.length });
    const second = await databasePass(env, postcheck, createClient); emit('database_second_passed', { matchedRows: second.matchedRows });
    return { schemaVersion: 1, kind: 'stackr-r2-interrupted-run-reconciliation', status: 'reconciled', startedAt, finishedAt: timestamp(now()),
      sourceCommit: SOURCE_COMMIT, projectRef: REF,
      runs: RUNS.map(pin => ({ runId: pin.runId, evidenceSha256: pin.evidenceSha256, checkpointSha256: pin.checkpointSha256,
        completedBatches: pin.checkpoints, inventoryRows: pin.rows, journalPublishedAssets: pin.published })),
      rowCounts: { current: 26650, prior: 1700, unique: 28349, historicalOverlap: 1 }, expectationSha256: evidence.expectationSha256,
      databaseChecks: [first, second], publicVerification,
      historicalLink: { rowId: HISTORY_ROW, beforeSnapshotSha256: HISTORY_BEFORE, afterSnapshotSha256: HISTORY_AFTER,
        sequence: evidence.history.sequence, operationId: evidence.history.operationId, receiptSha256: evidence.history.receiptSha256,
        objectsVerified: evidence.history.objects.length },
      sourceFailureRecheck: { rowId: SOURCE_RECHECK.rowId, role: SOURCE_RECHECK.role, status: 200,
        sha256: SOURCE_RECHECK.sha256, byteSize: SOURCE_RECHECK.byteSize, verified: true },
      databaseReadOnly: true, transactionRolledBack: true, postcheckPassed: true,
      evidenceModified: false, resumeAuthorized: false, reconciliationPassed: true };
  };
}
