import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = 'supabase/migrations/20261004174528_cardmarket_raw_retention_contract.sql';
const sql = readFileSync(migration, 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
const payload = marker => ({ id: 'SV9a-039', marker, pricing: { cardmarket: { idProduct: 699710 } } });
const rawRow = async rawId => (await db.query('select to_jsonb(r) row from ingest.raw_source_records r where id=$1', [rawId])).rows[0].row;
const call = async (runId, body, sourceUrl) => (await db.query(`select ingest.retain_raw_source_record($1,$2,'variant','SV9a-039:normal','SV9a-039:normal','zh-cn',$3,$3,'2026-10-04T17:45:00Z','2026-10-04T00:40:00Z','approved','TCGdex',$4,$5::jsonb,'{"request":"fixture"}'::jsonb,'valid','[]'::jsonb) result`, [id(1), runId, sourceUrl, `hash-${body.marker}`, JSON.stringify(body)])).rows[0].result;

async function main() {
  try {
    assert.match(sql, /set local lock_timeout = '5s';[\s\S]+set local statement_timeout = '60s';/i);
    assert.match(sql, /create table if not exists ingest\.raw_source_record_observations[\s\S]+primary key \(import_run_id, raw_record_id\)/i);
    assert.match(sql, /create or replace function ingest\.retain_raw_source_record\([\s\S]+p_validation_errors jsonb[\s\S]+returns jsonb/i);
    assert.match(sql, /revoke all on function ingest\.retain_raw_source_record[\s\S]+from public, anon, authenticated[\s\S]+grant execute on function ingest\.retain_raw_source_record[\s\S]+to service_role/i);
    assert.doesNotMatch(sql, /security definer/i);
    assert.doesNotMatch(sql, /\b(insert|update|delete)\s+(?:into\s+)?catalog\./i, 'forward contract must not mutate canonical catalogue tables');
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema ingest; create schema catalog; create schema audit;
      create function audit.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      create table catalog.languages(code text primary key);
      create table ingest.sources(id uuid primary key);
      create table ingest.import_runs(id uuid primary key);
      create table ingest.raw_source_records(
        id uuid primary key default gen_random_uuid(), source_id uuid not null references ingest.sources(id), import_run_id uuid references ingest.import_runs(id),
        record_type text not null, external_id text not null, provider_record_id text not null, language_code text references catalog.languages(code),
        source_url text, source_endpoint text, retrieved_at timestamptz not null, source_updated_at timestamptz,
        licence_status text not null check(licence_status in ('approved','under_review','restricted','denied','unknown')),
        attribution_text text, payload_hash text not null, raw_payload jsonb not null, http_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(http_metadata)='object'),
        validation_status text not null check(validation_status in ('pending','valid','invalid','quarantined')), validation_errors jsonb not null default '[]'::jsonb check(jsonb_typeof(validation_errors)='array'),
        deprecated_at timestamptz, deprecated_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      insert into catalog.languages values('zh-cn'); insert into ingest.sources values('${id(1)}'); insert into ingest.import_runs values('${id(2)}'),('${id(3)}');
      grant usage on schema ingest to service_role;
      grant select, insert, update on ingest.sources, ingest.import_runs, ingest.raw_source_records to service_role;
      ${sql}
    `);
    await db.exec(sql); // Existing Stage bridge must tolerate this forward migration unchanged.
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => db.query('select * from ingest.raw_source_record_observations'), /permission denied/);
      await assert.rejects(() => call(id(2), payload('A'), 'https://api.tcgdex.net/v2/zh-cn/cards/SV9a-039'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const first = await call(id(2), payload('A'), 'https://api.tcgdex.net/v2/zh-cn/cards/SV9a-039');
    assert.equal(first.changed, 'inserted');
    const rawId = first.id;
    const rawBeforeExactRetry = await rawRow(rawId);
    const retry = await call(id(2), payload('A'), 'https://api.tcgdex.net/v2/zh-cn/cards/SV9a-039?retry=1');
    assert.deepEqual(retry, { id: rawId, changed: 'updated' }, 'same-run exact retry retains the first raw revision and refreshes only its observation');
    assert.deepEqual(await rawRow(rawId), rawBeforeExactRetry, 'same-run exact retry does not mutate any retained raw provenance field');
    assert.equal((await db.query('select count(*)::int count from ingest.raw_source_records')).rows[0].count, 1);
    assert.equal((await db.query('select count(*)::int count from ingest.raw_source_record_observations where import_run_id=$1', [id(2)])).rows[0].count, 1);
    const changed = await call(id(2), payload('B'), 'https://api.tcgdex.net/v2/zh-cn/cards/SV9a-039');
    assert.deepEqual(changed, { id: rawId, changed: 'updated' }, 'changed input only updates the owning run revision');
    assert.equal((await db.query('select raw_payload->>\'marker\' marker from ingest.raw_source_records where id=$1', [rawId])).rows[0].marker, 'B');
    const rawBeforeCrossRunReuse = await rawRow(rawId);
    const reused = await call(id(3), payload('B'), 'https://api.tcgdex.net/v2/zh-cn/cards/SV9a-039');
    assert.deepEqual(reused, { id: rawId, changed: 'reused' }, 'cross-run identical payload reuses the immutable retained revision');
    assert.deepEqual(await rawRow(rawId), rawBeforeCrossRunReuse, 'cross-run reuse cannot mutate any retained raw provenance field');
    assert.equal((await db.query('select count(*)::int count from ingest.raw_source_records')).rows[0].count, 1);
    assert.equal((await db.query('select count(*)::int count from ingest.raw_source_record_observations')).rows[0].count, 2, 'each run receives its own compact observation');
    console.log('Cardmarket raw-retention forward contract preserves role boundaries, idempotent deployment, and immutable retry/reuse provenance.');
  } finally { await db.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });