import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
async function candidates(after = 0) { return (await db.query<any>('select * from api.list_cardmarket_current_provenance_candidates($1,$2)', [after, 100])).rows; }
async function main() { try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema api; create schema ingest; create schema catalog;
    create table ingest.sources(id uuid primary key, code text not null);
    create table ingest.raw_source_records(id uuid primary key, source_id uuid, external_id text, language_code text, payload_hash text, source_updated_at timestamptz, retrieved_at timestamptz, raw_payload jsonb, deprecated_at timestamptz);
    create table catalog.catalogue_versions(id uuid primary key, language_code text, status text, deprecated_at timestamptz, published_at timestamptz, created_at timestamptz);
    create table catalog.catalogue_version_external_identifiers(source_id uuid, external_id text, language_code text, catalogue_version_id uuid, printing_id uuid, variant_id uuid);
    create table catalog.catalogue_version_variants(catalogue_version_id uuid, variant_id uuid);
    create table catalog.card_variants(id uuid primary key, printing_id uuid, language_code text, variant_code text, finish_code text, deprecated_at timestamptz);
    create table catalog.card_printings(id uuid primary key, language_code text, deprecated_at timestamptz);
    grant usage on schema api,ingest,catalog to service_role; grant select on all tables in schema ingest,catalog to service_role;
    insert into ingest.sources values('${id(1)}','tcgdex');
    insert into catalog.catalogue_versions values('${id(2)}','en','published',null,now(),now()),('${id(3)}','ja','published',null,now(),now());
    insert into catalog.card_printings values('${id(10)}','en',null),('${id(11)}','en',null),('${id(12)}','ja',null);
    insert into catalog.card_variants values('${id(20)}','${id(10)}','en','normal','normal',null),('${id(21)}','${id(10)}','en','holo','holo',null),('${id(22)}','${id(11)}','en','normal','normal',null),('${id(23)}','${id(12)}','ja','normal','normal',null);
    insert into catalog.catalogue_version_variants values('${id(2)}','${id(20)}'),('${id(2)}','${id(21)}'),('${id(2)}','${id(22)}'),('${id(3)}','${id(23)}');
    insert into catalog.catalogue_version_external_identifiers values('${id(1)}','a','en','${id(2)}','${id(10)}','${id(20)}'),('${id(1)}','b','en','${id(2)}','${id(10)}','${id(21)}'),('${id(1)}','c','en','${id(2)}','${id(11)}','${id(22)}'),('${id(1)}','d','ja','${id(3)}','${id(12)}','${id(23)}');
    insert into ingest.raw_source_records values
      ('${id(30)}','${id(1)}','a','en','a',now(),now(),'{"pricing":{"cardmarket":{"idProduct":100}}}',null),
      ('${id(31)}','${id(1)}','b','en','b',now(),now(),'{"pricing":{"cardmarket":{"idProduct":100}}}',null),
      ('${id(32)}','${id(1)}','c','en','c',now(),now(),'{"pricing":{"cardmarket":{"idProduct":200}}}',null),
      ('${id(33)}','${id(1)}','d','ja','d',now(),now(),'{"pricing":{"cardmarket":{"idProduct":200}}}',null);
  `);
  for (const migration of ['20261004084237_cardmarket_current_provenance_candidates.sql', '20261004084956_cardmarket_bounded_provenance_candidates.sql']) {
    await db.exec(`begin; ${readFileSync(`supabase/migrations/${migration}`, 'utf8')} commit;`);
  }
  await db.exec('set role anon'); await assert.rejects(candidates(), /permission denied/); await db.exec('reset role; set role service_role');
  const rows = await candidates(); assert.equal(rows.length, 1); assert.equal(rows[0].provider_product_id, 100); assert.equal(rows[0].printing_id, id(10)); assert.equal(rows[0].language_code, 'en');
  assert.deepEqual(rows[0].provenance.finishCodes, ['holo', 'normal']); assert.equal(rows[0].provenance.finishScope, 'blended_public_guide_not_exact_finish');
  console.log('Cardmarket provenance candidates expose only service-only unambiguous printing/language rows while retaining blended finish evidence.');
} finally { await db.close(); } }
void main().catch(error => { console.error(error); process.exitCode = 1; });


