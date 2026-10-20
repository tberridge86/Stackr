import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const migration = readFileSync('supabase/migrations/20261004090339_cardmarket_resumable_provenance_index.sql', 'utf8');
const db = new PGlite();
const rpc = async (name, args = []) => {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
  return (await db.query(`select api.${name}(${placeholders}) result`, args)).rows.map(row => row.result);
};
const rawPayload = productId => productId === null
  ? { pricing: { cardmarket: {} } }
  : { pricing: { cardmarket: { idProduct: productId } } };

async function insertIdentifier({ externalId, variantId, printingId, productId, recordId, sourceUpdatedAt = '2026-10-03T00:00:00Z' }) {
  await db.query(
    'insert into catalog.catalogue_version_external_identifiers values($1,$2,$3,$4,$5,$6,$7)',
    [id(1), id(2), 'card', externalId, 'en', printingId, variantId],
  );
  await db.query('insert into catalog.catalogue_version_variants values($1,$2) on conflict do nothing', [id(1), variantId]);
  await db.query(
    'insert into ingest.raw_source_records values($1,$2,$3,$4,null,$5,$6,$7::jsonb,$8)',
    [recordId, id(2), externalId, 'en', sourceUpdatedAt, sourceUpdatedAt, JSON.stringify(rawPayload(productId)), `hash-${recordId}`],
  );
}

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema api; create schema catalog; create schema ingest; create schema market;
    create table catalog.catalogue_versions(id uuid primary key,language_code text not null,status text not null,deprecated_at timestamptz,published_at timestamptz,created_at timestamptz not null);
    create table catalog.card_printings(id uuid primary key,language_code text not null,deprecated_at timestamptz);
    create table catalog.card_variants(id uuid primary key,printing_id uuid not null references catalog.card_printings(id),language_code text not null,variant_code text,finish_code text,deprecated_at timestamptz);
    create table catalog.catalogue_version_variants(catalogue_version_id uuid not null,variant_id uuid not null,primary key(catalogue_version_id,variant_id));
    create table catalog.catalogue_version_external_identifiers(catalogue_version_id uuid not null,source_id uuid not null,source_entity_type text not null,external_id text not null,language_code text not null,printing_id uuid,variant_id uuid,primary key(catalogue_version_id,source_id,source_entity_type,external_id,language_code));
    create table ingest.sources(id uuid primary key,code text not null);
    create table ingest.raw_source_records(id uuid primary key,source_id uuid not null,external_id text not null,language_code text not null,deprecated_at timestamptz,source_updated_at timestamptz,retrieved_at timestamptz not null,raw_payload jsonb not null,payload_hash text);
    insert into catalog.catalogue_versions values('${id(1)}','en','published',null,'2026-10-03T00:00:00Z','2026-10-03T00:00:00Z');
    insert into ingest.sources values('${id(2)}','tcgdex');
    insert into catalog.card_printings values('${id(10)}','en',null),('${id(11)}','en',null);
    insert into catalog.card_variants values('${id(20)}','${id(10)}','en','normal','normal',null),('${id(21)}','${id(10)}','en','holo','holo',null),('${id(22)}','${id(11)}','en','normal','normal',null);
    grant usage on schema api,catalog,ingest,market to service_role;
    grant select on all tables in schema catalog,ingest to service_role;
  `);
  await db.exec(`begin; ${migration} commit;`);
  await insertIdentifier({ externalId: 'stable-normal', variantId: id(20), printingId: id(10), productId: 100, recordId: id(100) });
  await insertIdentifier({ externalId: 'stable-holo', variantId: id(21), printingId: id(10), productId: 100, recordId: id(101) });
  await insertIdentifier({ externalId: 'collision-one', variantId: id(20), printingId: id(10), productId: 200, recordId: id(102) });
  await insertIdentifier({ externalId: 'collision-two', variantId: id(22), printingId: id(11), productId: 200, recordId: id(103) });
  await insertIdentifier({ externalId: 'removed-product', variantId: id(20), printingId: id(10), productId: 50, recordId: id(104), sourceUpdatedAt: '2026-10-01T00:00:00Z' });
  await db.query('insert into ingest.raw_source_records values($1,$2,$3,$4,null,$5,$6,$7::jsonb,$8)', [id(105), id(2), 'removed-product', 'en', '2026-10-03T01:00:00Z', '2026-10-03T01:00:00Z', JSON.stringify(rawPayload(null)), 'hash-removed']);
  for (let index = 0; index < 500; index += 1) {
    await insertIdentifier({ externalId: `page-${String(index).padStart(3, '0')}`, variantId: id(20), printingId: id(10), productId: 300, recordId: id(1000 + index) });
  }

  await db.exec('set role anon');
  await assert.rejects(rpc('begin_cardmarket_provenance_run'), /permission denied/);
  await db.exec('reset role; set role service_role');
  const begun = (await rpc('begin_cardmarket_provenance_run'))[0];
  assert.equal(begun.status, 'running');
  const firstPage = (await rpc('process_cardmarket_provenance_page', [begun.runId]))[0];
  assert.deepEqual({ status: firstPage.status, processed: Number(firstPage.processed) }, { status: 'running', processed: 500 }, 'the exact composite cursor leaves a resumable second page');
  const secondPage = (await rpc('process_cardmarket_provenance_page', [begun.runId]))[0];
  assert.deepEqual({ status: secondPage.status, processed: Number(secondPage.processed) }, { status: 'complete', processed: 5 });
  const rows = (await db.query('select * from api.list_cardmarket_completed_provenance_candidates($1,$2,$3)', [begun.runId, 0, 500])).rows;
  assert.deepEqual(rows.map(row => Number(row.provider_product_id)), [100, 300], 'shared normal/holo variants retain one printing candidate, while collisions and removed ids are excluded');
  const stable = rows.find(row => Number(row.provider_product_id) === 100);
  assert.equal(stable.printing_id, id(10));
  assert.deepEqual(stable.provenance.finishCodes.sort(), ['holo', 'normal']);
  assert.equal(stable.provenance.finishScope, 'blended_public_guide_not_exact_finish');
  assert.equal((await rpc('process_cardmarket_provenance_page', [begun.runId]))[0].processed, 0, 'completed runs are idempotent');
  await assert.rejects(db.query('select * from api.list_cardmarket_completed_provenance_candidates($1,$2,$3)', [begun.runId, 0, 501]), /invalid provenance candidate page/);

  await db.exec('reset role');
  await db.exec(`insert into catalog.catalogue_versions values('${id(3)}','en','published',null,'2026-10-04T00:00:00Z','2026-10-04T00:00:00Z')`);
  await db.exec('set role service_role');
  await assert.rejects(db.query('select * from api.list_cardmarket_completed_provenance_candidates($1,$2,$3)', [begun.runId, 0, 500]), /no longer current/, 'the export cannot outlive its catalogue snapshot');
  console.log('Cardmarket resumable provenance: service-only access, 500-row cursor resume, current raw evidence, collision quarantine, blended finish scope and current-version guard passed.');
} finally {
  await db.close();
}
