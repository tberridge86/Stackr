import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const REF = 'oakdbbzdqwurpjnoqhmu';
const SERVICE = 'b5410607-a591-420e-a506-fe184ce7455b';
const ENVIRONMENT = 'b4304736-cac8-4ca9-92a7-93f7f6499c2f';
const PROJECT = 'd205637b-5376-41aa-9169-1015ba88fec3';
const SOURCE_COMMIT = '6dfe188166df76b41d44801ab66970b0a3881ae5';
const RUN = Object.freeze({ runId: 'production-recovered-20261027a',
  evidenceSha256: '97f03b3fbaf5fd36c7ef3c209e8ef33d4919a7159b4d41c3e7781adaf79c8c8e',
  checkpointSha256: '6a1335924d03d03d3bcc181844370c9a2e7bc48d1ad7acfab52f93324e1b7251',
  checkpoints: 229, rows: 5750, tailPublished: 8, published: 5733, tailObjects: 29,
  executionResultValueSha256: '54a6980fe2c2b0a3b942404088cb0f4637765f20e4f7b7136c385c4361795754' });
const ACCEPTANCE_SHA = '45d5eb8d9e55cd014a0e43f49a4014581bd1936181c8cf44a09bb02b6c366d91';
const CERTIFICATE_SHA = '8c171b74bbde16a0645fd0aa0801139c36b3ed5f3277a6309425ebdef151386c';
const LAST_PARENT_PUBLISHED = 'd5028f70-55c2-4542-9393-564dcd4b71e5';
const PARENTS = Object.freeze([
  { runId: 'production-optimised-20261026b', evidenceSha256: 'd06e9a223cd8a7985ec2cc641d03eceea32f4c6eb7cffc7275e41927f94c0e71',
    checkpointSha256: 'd1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f', checkpoints: 1065, published: 26641, tailPublished: 16 },
  { runId: 'production-resumed-20261026a', evidenceSha256: '83755a507c55824e96f5dee71085399891e4a1b5bbc329794dcc6a3acfc7c661',
    checkpointSha256: 'b59da552b04a09fe066eb5036de3f624b9c294f058bce6d214f0039cdd0401b8', checkpoints: 67, published: 1699, tailPublished: 24 },
]);
const HISTORICAL_SOURCE = Object.freeze([
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
]);
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const BUCKET = 'stackr-catalogue-public';
const PUBLIC_BASE = 'https://assets.stackrtcg.com';
// One explicit source failure; other failed transfers are cancellation followers.
const SOURCE_RECHECKS = Object.freeze([{ rowId: 'efa53563-2d1f-4eeb-8665-efa3a8ed5e4f', role: 'search-result', index: 1,
  beforeSnapshotSha256: 'f7fceafa935c9dcf489f8319dd5f556eeba796e326d9b6b55693f4d2e44b1f62',
  url: 'https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/7c/83/7c83bcee90f015b28de1519aff90b589a3654150a5b438158d65a4a89c95c543/search-result.webp',
  mimeType: 'image/webp', byteSize: 3480, sha256: '7c83bcee90f015b28de1519aff90b589a3654150a5b438158d65a4a89c95c543' }]);
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
  check(tail.executionResultValueSha256 === RUN.executionResultValueSha256 && tail.executionResultCount === 16
    && tail.executionStatus === 'stopped', 'reconciliation_execution_pin_mismatch');
  const acceptance = s.acceptance;
  check(acceptance?.receiptSha256 === ACCEPTANCE_SHA && acceptance.certificateSha256 === CERTIFICATE_SHA
    && acceptance.bytes === 3350 && fingerprint(acceptance.parentRunIds) === fingerprint(PARENTS.map(parent => parent.runId))
    && acceptance.confirmedGlobalBaseline === 53001 && acceptance.eligibleTotal === 62098
    && acceptance.newRunStartsFromNull === true && acceptance.parentEvidencePreserved === true,
    'reconciliation_parent_acceptance_mismatch');
  check(Array.isArray(result.rowExpectations) && result.rowExpectations.length === pin.rows,
    'reconciliation_expectation_count_mismatch');
  let previous = LAST_PARENT_PUBLISHED;
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

function validateParent(result, pin) {
  const s = result?.summary;
  check(s?.runId === pin.runId && s.sourceCommit === SOURCE_COMMIT && s.status === 'diagnostic'
    && s.evidenceSha256 === pin.evidenceSha256 && s.checkpointSha256 === pin.checkpointSha256
    && s.completedBatches === pin.checkpoints && s.checkpointCount === pin.checkpoints
    && s.journalPublishedAssets === pin.published && s.tailPublishedAssets === pin.tailPublished
    && s.journalAndCheckpointValidationPassed === true && s.databaseQueried === false
    && s.networkRequested === false && s.evidenceModified === false && s.runnerStarted === false
    && s.resumeAuthorized === false, 'reconciliation_parent_manifest_mismatch');
  if (pin.runId === PARENTS[0].runId) {
    const rows = result.events?.filter(event => event.event === 'r2_tail_diagnostic_row');
    check(Array.isArray(rows) && rows.length === 25 && rows[15].rowId === LAST_PARENT_PUBLISHED
      && rows[15].status === 'published_receipt', 'reconciliation_parent_prefix_mismatch');
    for (const historical of HISTORICAL_SOURCE) {
      const row = rows[historical.inventoryIndex];
      check(row?.rowId === historical.rowId && row.status === 'no_publication_record'
        && row.beforeSnapshotSha256 === historical.beforeSnapshotSha256
        && row.journalExpectedSnapshotSha256 === historical.beforeSnapshotSha256
        && row.recordedCommitSnapshotSha256 === null && row.operationId === null && row.receiptSha256 === null,
      'reconciliation_parent_tail_mismatch');
    }
  }
  return { runId: pin.runId, evidenceSha256: pin.evidenceSha256, checkpointSha256: pin.checkpointSha256, unchanged: true };
}
function prepareEvidence(result) {
  validateRun(result, RUN);
  check(result.historicalSuccessorReceipt === null && Array.isArray(result.events), 'reconciliation_unexpected_historical_selector');
  const rows = result.rowExpectations;
  const historicalLinks = HISTORICAL_SOURCE.map((historical, index) => {
    const row = rows[index];
    check(row.rowId === historical.rowId && row.beforeSnapshotSha256 === historical.beforeSnapshotSha256
      && row.published === true && row.expectedSnapshotSha256 !== row.beforeSnapshotSha256,
    'reconciliation_historical_link_invalid');
    return { rowId: row.rowId, beforeSnapshotSha256: row.beforeSnapshotSha256,
      afterSnapshotSha256: row.expectedSnapshotSha256, sequence: row.sequence,
      operationId: row.operationId, receiptSha256: row.receiptSha256 };
  });
  const publicByUrl = new Map();
  function add(object, rowId) {
    const proof = objectProof(object, rowId); const previous = publicByUrl.get(proof.url);
    check(!previous || fingerprint(previous) === fingerprint(proof), 'reconciliation_conflicting_public_metadata');
    publicByUrl.set(proof.url, proof);
  }
  let tailObjects = 0;
  const publishedTail = rows.filter(row => row.sequence === RUN.checkpoints + 1 && row.published);
  check(publishedTail.length === RUN.tailPublished, 'reconciliation_tail_object_count_mismatch');
  for (const row of publishedTail) {
    const chunks = result.events.filter(event => event.event === 'r2_tail_diagnostic_objects' && event.rowId === row.rowId);
    let offset = 0; let total = null; const roles = new Set();
    for (const event of chunks) {
      check(event.runId === RUN.runId && event.sequence === RUN.checkpoints + 1 && event.objectOffset === offset
        && Number.isInteger(event.totalObjects) && event.totalObjects > 0 && event.totalObjects <= 17
        && (total === null || total === event.totalObjects) && Array.isArray(event.objects)
        && event.objects.length > 0 && event.objects.length <= 4, 'reconciliation_tail_objects_invalid');
      total = event.totalObjects;
      for (const object of event.objects) {
        check(object.pendingRecorded === true && !roles.has(object.role) && object.index === offset - 1
          && !Object.hasOwn(object, 'failedSource'), 'reconciliation_tail_objects_invalid');
        roles.add(object.role); add(object, row.rowId); offset++; tailObjects++;
      }
    }
    check(offset === total && roles.has('original'), 'reconciliation_tail_objects_incomplete');
  }
  check(tailObjects === RUN.tailObjects, 'reconciliation_tail_object_count_mismatch');
  const byId = new Map(rows.map(row => [row.rowId, row]));
  for (const sample of result.publicSamples) {
    const row = byId.get(sample.rowId);
    check(sample.runId === RUN.runId && row?.published && sample.sequence === row.sequence
      && sample.receiptSha256 === row.receiptSha256
      && [rows[0].rowId, rows[RUN.published - 1].rowId].includes(row.rowId), 'reconciliation_sample_receipt_mismatch');
    add(sample, sample.rowId);
  }
  check(result.publicSamples.some(sample => sample.rowId === rows[0].rowId && sample.role === 'original')
    && result.publicSamples.some(sample => sample.rowId === rows[RUN.published - 1].rowId && sample.role === 'original'),
    'reconciliation_first_last_samples_required');
  const explicitFailures = result.events.filter(event => event.event === 'r2_tail_diagnostic_row')
    .flatMap(event => (event.transferFailures ?? []).filter(failure => failure.code === 'source_public_read_failed')
      .map(failure => ({ event, failure })));
  check(explicitFailures.length === SOURCE_RECHECKS.length, 'reconciliation_source_failure_count_mismatch');
  for (const source of SOURCE_RECHECKS) {
    const row = byId.get(source.rowId);
    const actual = explicitFailures.find(value => value.event.rowId === source.rowId && value.failure.role === source.role);
    check(row?.sequence === RUN.checkpoints + 1 && row.inventoryIndex === 11 && row.published === false
      && row.beforeSnapshotSha256 === source.beforeSnapshotSha256 && row.expectedSnapshotSha256 === row.beforeSnapshotSha256
      && actual?.event.status === 'no_publication_record' && actual.event.beforeSnapshotSha256 === source.beforeSnapshotSha256
      && actual.failure.index === source.index && actual.failure.codeSha256 === hash('source_public_read_failed'),
      'reconciliation_failed_source_row_mismatch');
    const objects = result.events.filter(event => event.event === 'r2_tail_diagnostic_objects' && event.rowId === source.rowId)
      .flatMap(event => event.objects);
    const object = objects.find(value => value.role === source.role && value.index === source.index);
    const proof = object?.failedSource;
    check(object?.pendingRecorded === false && object.verifiedRecorded === false && proof?.provider === 'supabase_storage'
      && proof.bucket === BUCKET && proof.liveVerified === false && proof.url === source.url
      && proof.key === source.url.slice(('https://' + REF + '.supabase.co/storage/v1/object/public/' + BUCKET + '/').length)
      && proof.sha256 === source.sha256 && proof.byteSize === source.byteSize && proof.mimeType === source.mimeType,
      'reconciliation_failed_source_proof_mismatch');
  }
  const objects = [...publicByUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
  check(objects.length <= 256 && objects.reduce((sum, object) => sum + object.byteSize, 0) <= 134217728,
    'reconciliation_public_budget_exceeded');
  return { rows, objects, historicalLinks,
    expectationSha256: fingerprint({ rows, samples: result.publicSamples, historicalLinks }) };
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
    check(String(row.pushed) === '58734' && String(row.remaining) === '3364' && String(row.total_eligible) === '62098',
      'reconciliation_global_count_drift');
    result = { checkedAt: timestamp(row.checked_at), matchedRows, pushed: 58734, remaining: 3364, totalEligible: 62098 };
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

/** Reconcile only this successor. Its 53,001-row baseline is inherited from the
 * exact acceptance, not represented as a fresh comparison of older DB rows. */
export function createRecoveredRunReconciler({ readExpectations, readParentEvidence, createClient, fetchImpl,
  report = () => {}, now = () => new Date().toISOString() } = {}) {
  for (const fn of [readExpectations, readParentEvidence, createClient, fetchImpl, report, now])
    check(typeof fn === 'function', 'reconciliation_dependencies_required');
  return async function reconcile({ env } = {}) {
    identity(env); const startedAt = timestamp(now());
    const emit = (phase, values = {}) => report({ event: 'r2_reconciliation_phase', phase, ...values });
    async function readPhase(phase) {
      const parents = [];
      for (const pin of PARENTS) {
        emit(phase, { runId: pin.runId });
        parents.push(validateParent(await readParentEvidence({ runId: pin.runId, env }), pin));
      }
      emit(phase, { runId: RUN.runId });
      return { evidence: prepareEvidence(await readExpectations({ runId: RUN.runId, env })), parents };
    }
    const initial = await readPhase('read_evidence'); const evidence = initial.evidence;
    emit('database_first_started', { rows: evidence.rows.length });
    const first = await databasePass(env, evidence, createClient); emit('database_first_passed', { matchedRows: first.matchedRows });
    const objects = [...evidence.objects, ...SOURCE_RECHECKS];
    check(objects.length <= 256 && objects.reduce((sum, object) => sum + object.byteSize, 0) <= 134217728,
      'reconciliation_public_budget_exceeded');
    emit('public_verification_started', { objects: objects.length });
    const publicVerification = await publicPass(objects, fetchImpl);
    emit('public_verification_passed', { objects: publicVerification.objectsVerified, bytes: publicVerification.bytesVerified });
    const final = await readPhase('recheck_evidence');
    check(final.evidence.expectationSha256 === evidence.expectationSha256
      && fingerprint(final.evidence.objects) === fingerprint(evidence.objects)
      && fingerprint(final.parents) === fingerprint(initial.parents), 'reconciliation_postcheck_evidence_drift');
    emit('database_second_started', { rows: final.evidence.rows.length });
    const second = await databasePass(env, final.evidence, createClient); emit('database_second_passed', { matchedRows: second.matchedRows });
    const certificate = { schemaVersion: 1, kind: 'stackr-r2-recovered-run-reconciliation', status: 'reconciled',
      startedAt, finishedAt: timestamp(now()), sourceCommit: SOURCE_COMMIT, projectRef: REF,
      runs: [{ runId: RUN.runId, evidenceSha256: RUN.evidenceSha256, checkpointSha256: RUN.checkpointSha256,
        completedBatches: RUN.checkpoints, inventoryRows: RUN.rows, journalPublishedAssets: RUN.published }],
      rowCounts: { current: RUN.rows, unique: RUN.rows, inheritedBaseline: 53001, historicalSupersessions: 9 },
      parentAcceptance: { runId: RUN.runId, receiptSha256: ACCEPTANCE_SHA, certificateSha256: CERTIFICATE_SHA,
        inheritedPushed: 53001, eligibleTotal: 62098, freshBaselineRowsCompared: false },
      parentManifests: final.parents, historicalLinks: evidence.historicalLinks,
      expectationSha256: evidence.expectationSha256, databaseChecks: [first, second], publicVerification,
      sourceFailureRechecks: SOURCE_RECHECKS.map(source => ({ rowId: source.rowId, role: source.role, status: 200,
        sha256: source.sha256, byteSize: source.byteSize, verified: true })),
      databaseReadOnly: true, transactionRolledBack: true, postcheckPassed: true,
      evidenceModified: false, resumeAuthorized: false, reconciliationPassed: true };
    check(Buffer.byteLength(JSON.stringify(certificate)) <= 7800, 'reconciliation_certificate_bound');
    return certificate;
  };
}
