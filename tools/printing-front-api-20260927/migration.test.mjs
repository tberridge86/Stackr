import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const url=process.argv.find(a=>a.startsWith('--db-url='))?.slice(9);
if(!url||new URL(url).hostname!=='127.0.0.1')throw Error('Isolated local database required');
const db=new pg.Client({connectionString:url});await db.connect();
const id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
try {
 await db.query('begin');
 await db.query(`do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
 end $$;
 create schema front_api_fixture;
 create table front_api_fixture.catalogue_cards(variant_id uuid,printing_id uuid,set_id uuid,catalogue_version_id uuid,language_code text,same_artwork_as_variant_id uuid);
 create table front_api_fixture.catalogue_versions(id uuid,status text,deprecated_at timestamptz);
 create table front_api_fixture.catalogue_version_assets(asset_id uuid,set_id uuid,printing_id uuid,variant_id uuid,catalogue_version_id uuid);
 create table front_api_fixture.assets(id uuid,asset_id text,asset_type text,game_code text,storage_provider text,storage_bucket text,storage_key text,url text,original_source_url text,source_attribution text,attribution_text text,permission_status text,rights_status text,content_sha256 text,perceptual_hash text,mime_type text,width int,height int,byte_size bigint,derivative_list jsonb,cache_control text,externally_referenced boolean,unavailable_reason text,last_verified_at timestamptz,created_at timestamptz,updated_at timestamptz,asset_visibility text,publicly_servable boolean,retention_status text,deleted_at timestamptz,deprecated_at timestamptz);`);
 const sql=await readFile(new URL('../../supabase/migrations/20260927162633_expose_printing_fronts_in_fast_set_cards.sql',import.meta.url),'utf8');
 await db.query(sql.replaceAll('api.','front_api_fixture.').replaceAll('catalog.','front_api_fixture.'));
 await db.query("insert into front_api_fixture.catalogue_versions values($1,'published',null),($2,'published',null)",[id(10),id(11)]);
 await db.query("insert into front_api_fixture.catalogue_cards values($1,$3,$4,$5,'en',null),($2,$3,$4,$5,'en',null)",[id(1),id(2),id(20),id(30),id(10)]);
 async function add(n,variant,provider='supabase_storage',version=id(10)){
  await db.query("insert into front_api_fixture.assets(id,asset_id,asset_type,game_code,storage_provider,storage_bucket,storage_key,url,permission_status,rights_status,derivative_list,asset_visibility,publicly_servable,retention_status) values($1,$2,'card_image','pokemon',$3,'bucket','path','https://example.com/card.png','approved','approved',$4,'public_catalogue',true,'active')",[id(n),'asset-'+n,provider,JSON.stringify(['card-grid','search-result','detail-page'].map(role=>({role})))]);
  await db.query('insert into front_api_fixture.catalogue_version_assets values($1,$2,$3,$4,$5)',[id(n),id(30),id(20),variant,version]);
 }
 async function chosen(){const r=await db.query('select card_row->>\'variant_id\' as id,image_row->>\'asset_id\' as asset from front_api_fixture.catalogue_set_card_rows($1,\'en\',null,100)',[id(30)]);return r.rows.map(x=>x.asset);}
 await add(40,null);assert.deepEqual(await chosen(),['asset-40','asset-40']);
 await add(41,id(2));assert.deepEqual(await chosen(),['asset-40','asset-41']);
 await db.query('delete from front_api_fixture.catalogue_version_assets where asset_id=$1',[id(40)]);assert.deepEqual(await chosen(),[null,'asset-41']);
 await add(42,null,'external_reference');assert.deepEqual(await chosen(),['asset-42','asset-41']);
 for(const [field,value] of [['permission_status','under_review'],['rights_status','under_review'],['unavailable_reason','revoked'],['deprecated_at','2026-01-01'],['deleted_at','2026-01-01']]){
  await db.query('savepoint rejected');await db.query(`update front_api_fixture.assets set ${field}=$1 where id=$2`,[value,id(42)]);assert.deepEqual(await chosen(),[null,'asset-41']);await db.query('rollback to savepoint rejected');
 }
 await db.query('update front_api_fixture.catalogue_version_assets set catalogue_version_id=$1 where asset_id=$2',[id(11),id(42)]);assert.deepEqual(await chosen(),[null,'asset-41']);
 await db.query('update front_api_fixture.catalogue_version_assets set catalogue_version_id=$1 where asset_id=$2',[id(10),id(42)]);
 await add(43,id(3));await db.query('update front_api_fixture.catalogue_cards set same_artwork_as_variant_id=$1 where variant_id=$2',[id(3),id(1)]);assert.deepEqual(await chosen(),['asset-43','asset-41']);
 await add(44,id(1));assert.deepEqual(await chosen(),['asset-44','asset-41']);
 const permissions=(await db.query("select p.prosecdef,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as auth,has_function_privilege('service_role',p.oid,'execute') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='front_api_fixture'")).rows[0];
 assert.deepEqual(permissions,{prosecdef:false,anon:false,auth:false,service:true});
 const cursor=(await db.query("select card_row->>'variant_id' as id from front_api_fixture.catalogue_set_card_rows($1,'en',$2,1)",[id(30),id(1)])).rows;assert.deepEqual(cursor,[{id:id(2)}]);
 assert.equal((await db.query("select * from front_api_fixture.catalogue_set_card_rows($1,'ja',null,100)",[id(30)])).rows.length,0);
 console.log('Printing fronts, exact variants, aliases, language/version scope, rights, deletion, cursor and service-only execution passed.');
} finally {await db.query('rollback');await db.end();}
