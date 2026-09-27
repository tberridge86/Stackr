import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {MIGRATION} from './publish.mjs';
const url=process.argv.find(a=>a.startsWith('--db-url='))?.slice(9);
if(!url||new URL(url).hostname!=='127.0.0.1')throw Error('Isolated local test database required');
const db=new pg.Client({connectionString:url});await db.connect();
try {
  await db.query('begin');
  await db.query(`create schema newsets480_fixture;
    create table newsets480_fixture.card_variants (
      id uuid primary key,printing_id uuid not null,game_code text not null,language_code text not null,set_id uuid not null,collector_number text not null,variant_code text not null,canonical_key text unique not null,
      unique(printing_id,variant_code),
      constraint card_variants_check check(canonical_key=lower(game_code||':'||language_code||':'||set_id::text||':'||collector_number||':'||variant_code))
    )`);
  const set='00000000-0000-4000-a000-000000000001';
  const key=`pokemon:en:${set}:106:holo`;
  const insert=(id,p,k)=>db.query("insert into newsets480_fixture.card_variants values($1,$2,'pokemon','en',$3,'106','holo',$4)",[id,p,set,k]);
  const a='00000000-0000-4000-a000-000000000002',b='00000000-0000-4000-a000-000000000003',d='00000000-0000-4000-a000-000000000004';
  await insert(a,a,key);
  const migration=await readFile(new URL(`../../supabase/migrations/${MIGRATION}.sql`,import.meta.url),'utf8');
  await db.query(migration.replaceAll('catalog.','newsets480_fixture.'));
  await insert(b,b,`${key}:printing:${b}`);await insert(d,d,`${key}:printing:${d}`);
  assert.equal((await db.query('select count(*)::int as n from newsets480_fixture.card_variants')).rows[0].n,3);
  for(const bad of [`${key}:printing:${a}`,key+':printing:invented',key.replace(':106:',':106p:')]) {
    await db.query('savepoint bad_key');
    await assert.rejects(db.query('update newsets480_fixture.card_variants set canonical_key=$1 where id=$2',[bad,b]),e=>e.code==='23514'&&e.constraint==='card_variants_check');
    await db.query('rollback to savepoint bad_key');
  }
  await db.query('savepoint duplicate');
  await assert.rejects(insert('00000000-0000-4000-a000-000000000005',a,`${key}:printing:${a}`),e=>e.code==='23505');
  await db.query('rollback to savepoint duplicate');
  assert.equal((await db.query('select canonical_key from newsets480_fixture.card_variants where id=$1',[a])).rows[0].canonical_key,key);
  console.log('Repeated-number migration preserves legacy keys and rejects mismatched identities.');
} finally {await db.query('rollback');await db.end();}
