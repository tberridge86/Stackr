import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { connectPostgresWithRetry } from './deploy/postgres-initial-connection.mjs';
import { normalizePostgresUrl } from './deploy/prepare-postgres-urls.mjs';
import {
  assertRawSourceRecordJsonContract,
  assertRawSourceRecordDirectCopyContract,
  assertRawSourceRecordCanonicalTableRlsEnabled,
  captureRawSourceRecordIndexes,
  captureRawSourceRecordRlsState,
  copyRawSourceRecordRows,
  copyRawSourceRecordRowsDirectToCanonical,
  disableRawSourceRecordRlsForIsolatedDirectCopy,
  dropRawSourceRecordIndexes,
  rawSourceRecordCopyBatches,
  rawSourceRecordDirectCopySql,
  rawSourceRecordCopySql,
  rawSourceRecordCopyStageCreateSql,
  rawSourceRecordCopyStageInsertSql,
  rawSourceRecordCopyStageTruncateSql,
  resetRawSourceRecordCopyStagePreparation,
  rawSourceRecordInsertSql,
  rawSourceRecordJsonBatches,
  rawSourceRecordRlsPolicyFingerprint,
  resetRawSourceRecordDirectCopyPreparation,
  restoreRawSourceRecordRlsAfterIsolatedDirectCopy,
  restoreRawSourceRecordIndexes,
  verifyRawSourceRecordIndexes,
} from './deploy/raw-source-record-bulk-load.mjs';

const columns = [
  { column_name: 'id', udt_name: 'uuid', is_identity: 'NO' },
  { column_name: 'external_id', udt_name: 'text', is_identity: 'NO' },
  { column_name: 'retrieved_at', udt_name: 'timestamptz', is_identity: 'NO' },
  { column_name: 'raw_payload', udt_name: 'jsonb', is_identity: 'NO' },
  { column_name: 'internal_notes', udt_name: 'text', is_identity: 'NO' },
];
const metadata = { columns };
const columnNames = columns.map((column) => column.column_name);
const require = createRequire(import.meta.url);
assert.equal(typeof require('pg-copy-streams').from, 'function');

assert.doesNotThrow(() => assertRawSourceRecordJsonContract(metadata, columnNames));
assert.throws(
  () => assertRawSourceRecordJsonContract(
    { columns: [{ column_name: 'count', udt_name: 'int8', is_identity: 'NO' }] },
    ['count'],
  ),
  /raw_source_record_json_types_unsupported:count/,
);

const insertSql = rawSourceRecordInsertSql(metadata, columnNames);
assert.match(insertSql, /^insert into "ingest"\."raw_source_records"/);
assert.match(insertSql, /select "id", "external_id", "retrieved_at", "raw_payload", "internal_notes"/);
assert.match(
  insertSql,
  /jsonb_populate_recordset\(null::"ingest"\."raw_source_records", \$1::jsonb\)/,
);
assert.equal(insertSql.match(/\$1/g)?.length, 1);
assert.doesNotMatch(insertSql, /select \*/i);

const copySql = rawSourceRecordCopySql(metadata, columnNames);
assert.equal(
  copySql,
  'copy "stackr_raw_source_records_copy_stage" ("id", "external_id", "retrieved_at", "raw_payload", "internal_notes") from stdin with (format text)',
);
assert.doesNotMatch(copySql, /select \*/i);
assert.equal(
  rawSourceRecordCopyStageCreateSql(metadata, columnNames),
  'create temporary table "stackr_raw_source_records_copy_stage" on commit drop as select "id", "external_id", "retrieved_at", "raw_payload", "internal_notes" from "ingest"."raw_source_records" where false',
);
assert.equal(
  rawSourceRecordCopyStageInsertSql(metadata, columnNames),
  'insert into "ingest"."raw_source_records" ("id", "external_id", "retrieved_at", "raw_payload", "internal_notes") select "id", "external_id", "retrieved_at", "raw_payload", "internal_notes" from "stackr_raw_source_records_copy_stage"',
);
assert.equal(rawSourceRecordCopyStageTruncateSql(), 'truncate "stackr_raw_source_records_copy_stage"');
assert.equal(
  rawSourceRecordDirectCopySql(metadata, columnNames),
  'copy "ingest"."raw_source_records" ("id", "external_id", "retrieved_at", "raw_payload", "internal_notes") from stdin with (format text)',
);
assert.throws(
  () => assertRawSourceRecordDirectCopyContract(
    { columns: [{ ...columns[0], is_identity: 'YES' }] },
    ['id'],
  ),
  /raw_source_record_direct_copy_identity_unsupported:id/,
);
assert.throws(
  () => assertRawSourceRecordDirectCopyContract(
    { columns: [{ ...columns[0], is_generated: 'ALWAYS' }] },
    ['id'],
  ),
  /raw_source_record_direct_copy_generated_unsupported:id/,
);

const rows = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    external_id: 'ポケモン "雪"',
    retrieved_at: new Date('2026-08-25T12:34:56.789Z'),
    raw_payload: { nested: ['one', { quote: "O'Brien", enabled: true }], count: 2 },
    internal_notes: null,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    external_id: '繁體中文\\path',
    retrieved_at: new Date('2026-08-25T13:34:56.789Z'),
    raw_payload: { nested: [], missing: null },
    internal_notes: undefined,
  },
];
const jsonBatches = rawSourceRecordJsonBatches(rows, columnNames, 550);
assert.ok(jsonBatches.length >= 1);
assert.ok(jsonBatches.every((batch) => batch.payloadBytes <= 550));
const roundTripped = jsonBatches.flatMap((batch) => JSON.parse(batch.payload));
assert.deepEqual(roundTripped, [
  {
    ...rows[0],
    retrieved_at: '2026-08-25T12:34:56.789Z',
  },
  {
    ...rows[1],
    retrieved_at: '2026-08-25T13:34:56.789Z',
    internal_notes: null,
  },
]);
assert.throws(
  () => rawSourceRecordJsonBatches([{ ...rows[0], raw_payload: { bytes: Buffer.from('x') } }], columnNames),
  /raw_source_record_json_buffer_unsupported/,
);
assert.throws(
  () => rawSourceRecordJsonBatches([{ ...rows[0], raw_payload: { count: 1n } }], columnNames),
  /raw_source_record_json_bigint_unsupported/,
);

const copyRows = [{
  ...rows[0],
  external_id: 'ポケ\tmon\nline\rreturn\\slash\\N',
  raw_payload: '{"nested":["one",{"quote":"O\'Brien","enabled":true}],"count":2}',
}];
const copyBatches = rawSourceRecordCopyBatches(copyRows, metadata, columnNames, 1_000);
assert.equal(copyBatches.length, 1);
assert.equal(copyBatches[0].rowCount, 1);
assert.equal(
  copyBatches[0].payload.toString('utf8'),
  '11111111-1111-4111-8111-111111111111\tポケ\\tmon\\nline\\rreturn\\\\slash\\\\N\t2026-08-25T12:34:56.789Z\t{"nested":["one",{"quote":"O\'Brien","enabled":true}],"count":2}\t\\N\n',
);
const copyLineBytes = copyBatches[0].payloadBytes;
const splitCopyBatches = rawSourceRecordCopyBatches(
  [copyRows[0], { ...copyRows[0], id: '33333333-3333-4333-8333-333333333333' }],
  metadata,
  columnNames,
  copyLineBytes,
);
assert.equal(splitCopyBatches.length, 2);
assert.ok(splitCopyBatches.every((batch) => batch.payloadBytes <= copyLineBytes));
assert.throws(
  () => rawSourceRecordCopyBatches(copyRows, metadata, columnNames, 10),
  /raw_source_record_copy_row_too_large/,
);
assert.throws(
  () => rawSourceRecordCopyBatches([{ ...copyRows[0], raw_payload: { count: 2 } }], metadata, columnNames),
  /raw_source_record_copy_jsonb_text_required:raw_payload/,
);

class FakeRlsClient {
  constructor(rowSecurityEnabled) {
    this.rowSecurityEnabled = rowSecurityEnabled;
    this.queries = [];
  }

  async query(sql) {
    this.queries.push(sql);
    return { rows: [{ row_security_enabled: this.rowSecurityEnabled }] };
  }
}

const rlsEnabledClient = new FakeRlsClient(true);
assert.deepEqual(
  await assertRawSourceRecordCanonicalTableRlsEnabled(rlsEnabledClient),
  { rowSecurityEnabled: true },
);
assert.match(rlsEnabledClient.queries[0], /table_class\.relrowsecurity/);
await assert.rejects(
  () => assertRawSourceRecordCanonicalTableRlsEnabled(new FakeRlsClient(false)),
  /raw_source_record_copy_rls_not_enabled/,
);

class FakeCopyClient {
  constructor({ copyError = null } = {}) {
    this.copyError = copyError;
    this.rlsQueryCount = 0;
    this.copyPayloads = [];
    this.queries = [];
  }

  query(statement) {
    this.queries.push(statement);
    if (typeof statement === 'string') {
      if (statement.includes('table_class.relrowsecurity')) {
        this.rlsQueryCount += 1;
        return Promise.resolve({ rows: [{ row_security_enabled: true }], rowCount: 1 });
      }
      if (statement.startsWith('insert into "ingest"."raw_source_records"')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    const chunks = [];
    const client = this;
    return new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        if (client.copyError) callback(client.copyError);
        else callback();
      },
      final(callback) {
        client.copyPayloads.push(Buffer.concat(chunks));
        callback();
      },
    });
  }
}

const fakeCopyFrom = (sql) => ({ copySql: sql });
const fakeCopyClient = new FakeCopyClient();
const copyResult = await copyRawSourceRecordRows(
  fakeCopyClient,
  metadata,
  columnNames,
  copyRows,
  { copyFrom: fakeCopyFrom },
);
assert.deepEqual(copyResult, {
  batchCount: 1,
  rowCount: 1,
  payloadBytes: fakeCopyClient.copyPayloads[0].byteLength,
});
assert.equal(fakeCopyClient.rlsQueryCount, 1);
assert.equal(fakeCopyClient.copyPayloads.length, 1);
assert.match(fakeCopyClient.queries[1], /^create temporary table /);
assert.equal(fakeCopyClient.queries[2].copySql, copySql);
assert.match(fakeCopyClient.queries[3], /^insert into "ingest"/);
assert.equal(fakeCopyClient.queries[4], 'truncate "stackr_raw_source_records_copy_stage"');
await copyRawSourceRecordRows(
  fakeCopyClient,
  metadata,
  columnNames,
  copyRows,
  { copyFrom: fakeCopyFrom },
);
assert.equal(fakeCopyClient.rlsQueryCount, 1);
resetRawSourceRecordCopyStagePreparation(fakeCopyClient);
await copyRawSourceRecordRows(
  fakeCopyClient,
  metadata,
  columnNames,
  copyRows,
  { copyFrom: fakeCopyFrom },
);
assert.equal(fakeCopyClient.rlsQueryCount, 2);

const copyDatabaseError = Object.assign(new Error('foreign key rejected'), { code: '23503' });
await assert.rejects(
  () => copyRawSourceRecordRows(
    new FakeCopyClient({ copyError: copyDatabaseError }),
    metadata,
    columnNames,
    copyRows,
    { copyFrom: fakeCopyFrom },
  ),
  (error) => error.code === '23503'
    && /raw_source_record_copy_failed:copy_batch_0:postgres_23503/.test(error.message),
);

const directCopyOptions = {
  allowIsolatedDirectCopy: true,
  isolatedTargetVerified: true,
  copyFrom: fakeCopyFrom,
};
const directCopyPolicies = [{
  policy_name: 'ingest service role manages raw records',
  policy_command: '*',
  policy_roles: '{16384}',
  policy_permissive: true,
  using_expression: 'true',
  check_expression: 'true',
}];

class FakeDirectCopyClient {
  constructor({ copyError = null, reportedRowCount = undefined, policies = directCopyPolicies } = {}) {
    this.copyError = copyError;
    this.reportedRowCount = reportedRowCount;
    this.policies = structuredClone(policies);
    this.rowSecurityEnabled = true;
    this.forceRowSecurityEnabled = false;
    this.copyPayloads = [];
    this.queries = [];
  }

  query(statement) {
    this.queries.push(statement);
    if (typeof statement === 'string') {
      if (statement.startsWith('lock table ')) return Promise.resolve({ rows: [], rowCount: 0 });
      if (statement.includes('table_class.relforcerowsecurity')) {
        return Promise.resolve({
          rows: [{
            row_security_enabled: this.rowSecurityEnabled,
            force_row_security_enabled: this.forceRowSecurityEnabled,
          }],
          rowCount: 1,
        });
      }
      if (statement.includes('from pg_policy policy_entry')) {
        return Promise.resolve({ rows: structuredClone(this.policies), rowCount: this.policies.length });
      }
      if (statement.startsWith('alter table "ingest"."raw_source_records" disable row level security')) {
        this.rowSecurityEnabled = false;
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (statement.startsWith('alter table "ingest"."raw_source_records" enable row level security')) {
        this.rowSecurityEnabled = true;
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      throw new Error(`unexpected_direct_copy_query:${statement}`);
    }
    const chunks = [];
    const client = this;
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        if (client.copyError) callback(client.copyError);
        else callback();
      },
      final(callback) {
        client.copyPayloads.push(Buffer.concat(chunks));
        if (client.reportedRowCount !== undefined) stream.rowCount = client.reportedRowCount;
        callback();
      },
    });
    return stream;
  }
}

const directRlsClient = new FakeDirectCopyClient();
const rlsStateBefore = await captureRawSourceRecordRlsState(directRlsClient);
assert.equal(rlsStateBefore.rowSecurityEnabled, true);
assert.equal(rlsStateBefore.forceRowSecurityEnabled, false);
assert.equal(rlsStateBefore.policyCount, 1);
assert.equal(
  rlsStateBefore.policyFingerprint,
  rawSourceRecordRlsPolicyFingerprint([{
    name: 'ingest service role manages raw records',
    command: '*',
    roles: '{16384}',
    permissive: true,
    usingExpression: 'true',
    checkExpression: 'true',
  }]),
);
await assert.rejects(
  () => disableRawSourceRecordRlsForIsolatedDirectCopy(directRlsClient),
  /raw_source_record_direct_copy_isolated_target_confirmation_required/,
);
const directRlsSnapshot = await disableRawSourceRecordRlsForIsolatedDirectCopy(
  directRlsClient,
  directCopyOptions,
);
assert.equal(directRlsClient.rowSecurityEnabled, false);
const restoredRlsState = await restoreRawSourceRecordRlsAfterIsolatedDirectCopy(
  directRlsClient,
  directRlsSnapshot,
  directCopyOptions,
);
assert.equal(restoredRlsState.rowSecurityEnabled, true);

const changedPolicyClient = new FakeDirectCopyClient();
const changedPolicySnapshot = await disableRawSourceRecordRlsForIsolatedDirectCopy(
  changedPolicyClient,
  directCopyOptions,
);
changedPolicyClient.policies[0].check_expression = 'false';
await assert.rejects(
  () => restoreRawSourceRecordRlsAfterIsolatedDirectCopy(
    changedPolicyClient,
    changedPolicySnapshot,
    directCopyOptions,
  ),
  /raw_source_record_direct_copy_rls_restore_verification_failed/,
);
assert.equal(changedPolicyClient.rowSecurityEnabled, true);
resetRawSourceRecordDirectCopyPreparation(changedPolicyClient);

const noPolicyClient = new FakeDirectCopyClient({ policies: [] });
await assert.rejects(
  () => disableRawSourceRecordRlsForIsolatedDirectCopy(noPolicyClient, directCopyOptions),
  /raw_source_record_direct_copy_policies_missing/,
);

const directCopyClient = new FakeDirectCopyClient({ reportedRowCount: 1 });
await assert.rejects(
  () => copyRawSourceRecordRowsDirectToCanonical(
    directCopyClient,
    metadata,
    columnNames,
    copyRows,
    directCopyOptions,
  ),
  /raw_source_record_direct_copy_rls_preparation_required/,
);
const directCopyRlsSnapshot = await disableRawSourceRecordRlsForIsolatedDirectCopy(
  directCopyClient,
  directCopyOptions,
);
const directCopyResult = await copyRawSourceRecordRowsDirectToCanonical(
  directCopyClient,
  metadata,
  columnNames,
  copyRows,
  directCopyOptions,
);
assert.equal(directCopyResult.rowCount, 1);
assert.equal(directCopyResult.reportedCopyRowCount, 1);
assert.equal(directCopyClient.rowSecurityEnabled, false);
const secondDirectCopyResult = await copyRawSourceRecordRowsDirectToCanonical(
  directCopyClient,
  metadata,
  columnNames,
  copyRows,
  directCopyOptions,
);
assert.equal(secondDirectCopyResult.rowCount, 1);
assert.equal(directCopyClient.copyPayloads.length, 2);
assert.match(directCopyClient.queries[0], /^lock table "ingest"."raw_source_records" in access exclusive mode$/);
await restoreRawSourceRecordRlsAfterIsolatedDirectCopy(
  directCopyClient,
  directCopyRlsSnapshot,
  directCopyOptions,
);
assert.equal(directCopyClient.rowSecurityEnabled, true);
await assert.rejects(
  () => copyRawSourceRecordRowsDirectToCanonical(
    directCopyClient,
    metadata,
    columnNames,
    copyRows,
    directCopyOptions,
  ),
  /raw_source_record_direct_copy_rls_preparation_required/,
);
assert.equal(
  directCopyClient.queries.filter((query) => typeof query === 'string'
    && query.startsWith('lock table "ingest"."raw_source_records"')).length,
  1,
);
assert.equal(
  directCopyClient.queries.filter((query) => typeof query === 'string'
    && query.startsWith('alter table "ingest"."raw_source_records"')).length,
  2,
);
assert.ok(directCopyClient.queries.some((query) => query?.copySql === rawSourceRecordDirectCopySql(metadata, columnNames)));

const directCopyMismatchClient = new FakeDirectCopyClient({ reportedRowCount: 2 });
await disableRawSourceRecordRlsForIsolatedDirectCopy(
  directCopyMismatchClient,
  directCopyOptions,
);
await assert.rejects(
  () => copyRawSourceRecordRowsDirectToCanonical(
    directCopyMismatchClient,
    metadata,
    columnNames,
    copyRows,
    directCopyOptions,
  ),
  /raw_source_record_direct_copy_failed:copy_batch_0:postgres_unknown/,
);
assert.equal(directCopyMismatchClient.rowSecurityEnabled, false);
resetRawSourceRecordDirectCopyPreparation(directCopyMismatchClient);

const directCopyErrorClient = new FakeDirectCopyClient({ copyError: copyDatabaseError });
await disableRawSourceRecordRlsForIsolatedDirectCopy(
  directCopyErrorClient,
  directCopyOptions,
);
await assert.rejects(
  () => copyRawSourceRecordRowsDirectToCanonical(
    directCopyErrorClient,
    metadata,
    columnNames,
    copyRows,
    directCopyOptions,
  ),
  (error) => error.code === '23503'
    && /raw_source_record_direct_copy_failed:copy_batch_0:postgres_23503/.test(error.message),
);
assert.equal(directCopyErrorClient.rowSecurityEnabled, false);
resetRawSourceRecordDirectCopyPreparation(directCopyErrorClient);

const indexFixtures = [
  {
    schema_name: 'ingest',
    index_name: 'raw_source_records_lookup_idx',
    definition: 'CREATE INDEX raw_source_records_lookup_idx ON ingest.raw_source_records USING btree (source_id)',
    index_comment: null,
    is_unique: false,
    is_valid: true,
    is_ready: true,
    is_live: true,
    is_clustered: false,
    is_replica_identity: false,
  },
  {
    schema_name: 'ingest',
    index_name: 'raw_source_records_import_run_identity_uidx',
    definition: "CREATE UNIQUE INDEX raw_source_records_import_run_identity_uidx ON ingest.raw_source_records USING btree (source_id, import_run_id) WHERE (import_run_id IS NOT NULL)",
    index_comment: "O'Brien identity guard",
    is_unique: true,
    is_valid: true,
    is_ready: true,
    is_live: true,
    is_clustered: false,
    is_replica_identity: false,
  },
];

class FakeIndexClient {
  constructor({ failOnCreate = false } = {}) {
    this.indexes = structuredClone(indexFixtures);
    this.failOnCreate = failOnCreate;
    this.queries = [];
  }

  async query(sql) {
    this.queries.push(sql);
    if (sql.includes('not index_entry.indisprimary')) {
      return { rows: structuredClone(this.indexes), rowCount: this.indexes.length };
    }
    if (sql.includes("constraint_entry.contype = 'p'")) {
      return {
        rows: [{
          index_name: 'raw_source_records_pkey',
          definition: 'CREATE UNIQUE INDEX raw_source_records_pkey ON ingest.raw_source_records USING btree (id)',
        }],
        rowCount: 1,
      };
    }
    if (/^drop index /i.test(sql)) {
      const indexName = sql.match(/\."([^"]+)"$/)?.[1];
      this.indexes = this.indexes.filter((index) => index.index_name !== indexName);
      return { rows: [], rowCount: 0 };
    }
    if (/^CREATE (UNIQUE )?INDEX /i.test(sql)) {
      if (this.failOnCreate) throw Object.assign(new Error('injected_create_failure'), { code: 'XX000' });
      const [, uniqueKeyword, indexName] = sql.match(/^CREATE (UNIQUE )?INDEX ([^ ]+) /i);
      this.indexes.push({
        schema_name: 'ingest',
        index_name: indexName.replaceAll('"', ''),
        definition: sql,
        index_comment: null,
        is_unique: Boolean(uniqueKeyword),
        is_valid: true,
        is_ready: true,
        is_live: true,
        is_clustered: false,
        is_replica_identity: false,
      });
      return { rows: [], rowCount: 0 };
    }
    if (/^comment on index /i.test(sql)) {
      const [, indexName, literal] = sql.match(/^comment on index "ingest"\."([^"]+)" is (.+)$/i);
      const index = this.indexes.find((candidate) => candidate.index_name === indexName);
      index.index_comment = literal === 'null'
        ? null
        : literal.slice(1, -1).replaceAll("''", "'");
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`unexpected_fake_query:${sql}`);
  }
}

const client = new FakeIndexClient();
const before = await captureRawSourceRecordIndexes(client);
assert.equal(before.count, 2);
assert.equal(before.primaryKey.index_name, 'raw_source_records_pkey');
assert.match(client.queries[0], /not exists[\s\S]+from pg_constraint/);
assert.match(client.queries[0], /not index_entry\.indisprimary/);
const dropped = await dropRawSourceRecordIndexes(client, before);
assert.equal(dropped.droppedCount, 2);
assert.equal(client.indexes.length, 0);
assert.equal(dropped.primaryKey.index_name, 'raw_source_records_pkey');
const restored = await restoreRawSourceRecordIndexes(client, before);
assert.equal(restored.fingerprint, before.fingerprint);
assert.equal(restored.count, before.count);
assert.equal(
  client.indexes.find((index) => index.index_name.endsWith('_uidx')).index_comment,
  "O'Brien identity guard",
);
const postCommit = await verifyRawSourceRecordIndexes(client, before, 'postcommit');
assert.equal(postCommit.fingerprint, before.fingerprint);

const roleBearingClient = new FakeIndexClient();
roleBearingClient.indexes[0].is_replica_identity = true;
await assert.rejects(
  () => captureRawSourceRecordIndexes(roleBearingClient),
  /raw_source_record_deferred_index_role_unsupported:raw_source_records_lookup_idx/,
);

const failingClient = new FakeIndexClient({ failOnCreate: true });
const failingBefore = await captureRawSourceRecordIndexes(failingClient);
await dropRawSourceRecordIndexes(failingClient, failingBefore);
await assert.rejects(
  () => restoreRawSourceRecordIndexes(failingClient, failingBefore),
  /raw_source_record_index_restore_failed:ingest\.raw_source_records_import_run_identity_uidx:postgres_XX000/,
);

async function runPostgresCopyIntegration() {
  const targetProjectRef = process.env.SUPABASE_RESTORE_PROJECT_REF;
  const productionProjectRef = process.env.SUPABASE_PRODUCTION_PROJECT_REF;
  if (targetProjectRef !== 'isfybjkwvcuqpqtmkujo'
      || productionProjectRef !== 'oakdbbzdqwurpjnoqhmu'
      || targetProjectRef === productionProjectRef) {
    throw new Error('raw_source_record_copy_integration_target_not_isolated');
  }
  const targetUrl = process.env.STACKR_RESTORE_DB_URL;
  if (!targetUrl) throw new Error('raw_source_record_copy_integration_url_missing');
  const normalizedTargetUrl = normalizePostgresUrl(targetUrl, targetProjectRef).normalized;
  const { client } = await connectPostgresWithRetry({
    connectionString: normalizedTargetUrl,
    applicationName: 'stackr-raw-copy-integration',
    statementTimeoutMs: 120_000,
    maxAttempts: 6,
    retryDelayMs: 20_000,
  });
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await client.query("set local lock_timeout = '30s'");
    await assertRawSourceRecordCanonicalTableRlsEnabled(client);
    const integrationRlsSnapshot =
      await disableRawSourceRecordRlsForIsolatedDirectCopy(client, directCopyOptions);
    const integrationRlsRestored =
      await restoreRawSourceRecordRlsAfterIsolatedDirectCopy(
        client,
        integrationRlsSnapshot,
        directCopyOptions,
      );
    assert.deepEqual(integrationRlsRestored, integrationRlsSnapshot);
    await client.query(rawSourceRecordCopyStageCreateSql(metadata, columnNames));

    const payloadJson = '{"large_integer":900719925474099312345,"nested":{"enabled":true}}';
    const integrationRow = {
      id: '44444444-4444-4444-8444-444444444444',
      external_id: '日本語\t繁體中文\n简体中文\\path',
      retrieved_at: new Date('2026-08-25T14:34:56.789Z'),
      raw_payload: payloadJson,
      internal_notes: '\\N\rnot-null',
    };
    const [batch] = rawSourceRecordCopyBatches(
      [integrationRow],
      metadata,
      columnNames,
    );
    const copyFrom = require('pg-copy-streams').from;
    const stream = client.query(copyFrom(rawSourceRecordCopySql(metadata, columnNames)));
    const completion = finished(stream);
    stream.end(batch.payload);
    await completion;

    const result = await client.query(`
      select
        id::text,
        external_id,
        retrieved_at,
        raw_payload = $1::jsonb as payload_matches,
        raw_payload::text as payload_text,
        internal_notes
      from stackr_raw_source_records_copy_stage
    `, [payloadJson]);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].id, integrationRow.id);
    assert.equal(result.rows[0].external_id, integrationRow.external_id);
    assert.equal(result.rows[0].retrieved_at.toISOString(), integrationRow.retrieved_at.toISOString());
    assert.equal(result.rows[0].payload_matches, true);
    assert.match(result.rows[0].payload_text, /900719925474099312345/);
    assert.equal(result.rows[0].internal_notes, integrationRow.internal_notes);
    await client.query('rollback');
    transactionOpen = false;
  } finally {
    if (transactionOpen) await client.query('rollback').catch(() => {});
    resetRawSourceRecordDirectCopyPreparation(client);
    await client.end();
  }
  process.stdout.write('Isolated PostgreSQL COPY and RLS guard passed and rolled back.\n');
}

if (process.argv.includes('--postgres-integration')) {
  await runPostgresCopyIntegration();
}

process.stdout.write('Raw source record bulk-load tests passed.\n');
