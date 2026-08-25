import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  assertRawSourceRecordJsonContract,
  captureRawSourceRecordIndexes,
  dropRawSourceRecordIndexes,
  rawSourceRecordInsertSql,
  rawSourceRecordJsonBatches,
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

process.stdout.write('Raw source record bulk-load tests passed.\n');
