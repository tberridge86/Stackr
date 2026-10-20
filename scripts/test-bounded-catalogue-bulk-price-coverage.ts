import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = readFileSync('supabase/migrations/20261003224031_restore_full_catalogue_price_guide.sql', 'utf8');
const previous = source.match(/create function api\.catalogue_bulk_price_coverage[\s\S]*?\$function\$;/)?.[0];
if (!previous) throw new Error('Previous coverage helper was not found');
const replacement = readFileSync('supabase/migrations/20261004172210_bounded_catalogue_bulk_price_coverage.sql', 'utf8');
const db = new PGlite();

async function coverage() { return (await db.query<any>('select api.catalogue_bulk_price_coverage($1) value', [id(90)])).rows[0].value; }

async function main() {
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog; create schema market;
      create table api.catalogue_cards(variant_id uuid,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,variant_code text,finish_code text);
      create table catalog.catalogue_versions(id uuid primary key,language_code text,status text,deprecated_at timestamptz,published_at timestamptz,created_at timestamptz);
      create table catalog.catalogue_version_variants(catalogue_version_id uuid,variant_id uuid,printing_id uuid,set_id uuid,language_code text);
      create table catalog.languages(code text primary key); create table catalog.sets(id uuid primary key,language_code text,deprecated_at timestamptz);
      create table catalog.card_printings(id uuid primary key,set_id uuid,language_code text,deprecated_at timestamptz);
      create table catalog.card_variants(id uuid primary key,printing_id uuid,language_code text,variant_code text,finish_code text,deprecated_at timestamptz);
      create table market.catalogue_provider_cards(variant_id uuid,printing_id uuid,set_id uuid,language_code text,subtype text);
      create table market.catalogue_general_prices(variant_id uuid,printing_id uuid,set_id uuid,language_code text,catalogue_version_id uuid,stale_after timestamptz,provider text);
      create table market.catalogue_price_outcomes(variant_id uuid,catalogue_version_id uuid,reason text);
      create table market.catalogue_bulk_runs(id uuid,dataset_at timestamptz);
      create table market.catalogue_bulk_groups(run_id uuid,category_id int,status text);
      create table market.catalogue_price_repairs(status text);
      create function api.catalogue_provider_subtype(variant text,finish text) returns text language sql immutable as $$select case when variant='normal' and finish='normal' then 'Normal' when variant='reverse_holo' and finish='reverse_holo' then 'Reverse Holofoil' end$$;
      grant usage on schema api,catalog,market to service_role; grant select on all tables in schema api,catalog,market to service_role;
    `);
    const enOld=id(1),en=id(2),ja=id(3),ko=id(4),setEn=id(10),setJa=id(11),setKo=id(12),wrongSet=id(13);
    const a=id(20),b=id(21),c=id(22),d=id(23),deprecated=id(24),mismatch=id(25),wrongLanguageSet=id(26);
    const pa=id(30),pb=id(31),pc=id(32),pd=id(33),px=id(34),py=id(35);
    await db.query('insert into catalog.languages values($1),($2),($3)', ['en','ja','ko']);
    await db.query('insert into catalog.catalogue_versions values($1,$2,$3,null,now(),now()),($4,$2,$3,null,now(),now()),($5,$6,$3,null,now(),now()),($7,$8,$3,null,now(),now())',[enOld,'en','published',en,ja,'ja',ko,'ko']);
    await db.query('insert into catalog.sets values($1,$2,null),($3,$4,null),($5,$6,null),($7,$4,null)',[setEn,'en',setJa,'ja',setKo,'ko',wrongSet]);
    for (const [p,s,l] of [[pa,setEn,'en'],[pb,setEn,'en'],[pc,setJa,'ja'],[pd,setKo,'ko'],[px,setEn,'en'],[py,wrongSet,'en']] as const) await db.query('insert into catalog.card_printings values($1,$2,$3,null)',[p,s,l]);
    for (const [v,p,l,vc,fc] of [[a,pa,'en','normal','normal'],[b,pb,'en','reverse_holo','reverse_holo'],[c,pc,'ja','normal','normal'],[d,pd,'ko','normal','normal'],[deprecated,px,'en','normal','normal'],[mismatch,px,'en','normal','normal'],[wrongLanguageSet,py,'en','normal','normal']] as const) await db.query('insert into catalog.card_variants values($1,$2,$3,$4,$5,$6)',[v,p,l,vc,fc,v===deprecated?new Date().toISOString():null]);
    for (const [v,p,s,l] of [[a,pa,setEn,'en'],[b,pb,setEn,'en'],[c,pc,setJa,'ja'],[d,pd,setKo,'ko'],[deprecated,px,setEn,'en'],[mismatch,pa,setEn,'en'],[wrongLanguageSet,py,wrongSet,'en']] as const) await db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5)',[en,v,p,s,l]);
    await db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5)',[ja,c,pc,setJa,'ja']); await db.query('insert into catalog.catalogue_version_variants values($1,$2,$3,$4,$5)',[ko,d,pd,setKo,'ko']);
    for (const [v,p,s,l,vc,fc] of [[a,pa,setEn,'en','normal','normal'],[b,pb,setEn,'en','reverse_holo','reverse_holo'],[c,pc,setJa,'ja','normal','normal'],[d,pd,setKo,'ko','normal','normal']] as const) await db.query('insert into api.catalogue_cards values($1,$2,$3,$4,$5,$6,$7)',[v,p,s,l,l==='en'?en:l==='ja'?ja:ko,vc,fc]);
    await db.query('insert into market.catalogue_provider_cards values($1,$2,$3,$4,$5),($6,$7,$3,$4,$8)',[a,pa,setEn,'en','Normal',b,px,'Reverse Holofoil']);
    await db.query("insert into market.catalogue_general_prices values($1,$2,$3,$4,$5,now()+interval '1 day','cardmarket'),($6,$7,$3,$4,$5,now()-interval '1 day','tcgplayer')",[a,pa,setEn,'en',en,b,pb]);
    await db.query('insert into market.catalogue_price_outcomes values($1,$2,$3),($4,$5,$6)',[b,en,'provider_backoff',c,ja,'no_provider_quote']);
    await db.query('insert into market.catalogue_bulk_runs values($1,now()),($2,now()-interval \'1 day\')',[id(90),id(91)]);
    await db.query('insert into market.catalogue_bulk_groups values($1,3,$2),($1,85,$3),($1,3,$4)',[id(90),'pending','running','failed']); await db.query('insert into market.catalogue_price_repairs values($1)', ['open']);
    await db.exec(`begin; ${previous} commit; set role service_role;`);
    const before=await coverage();
    await db.exec(`reset role; begin; ${replacement} commit; set role service_role;`);
    const after=await coverage();
    assert.deepEqual(after,before,'bounded physical helper preserves the previous view-shaped coverage JSON');
    assert.equal(after.cards.reduce((n:number,row:any)=>n+row.total,0),4,'latest valid physical membership is the full denominator');
    assert.equal(after.cards.find((x:any)=>x.language_code==='en').priced,2,'priced counts current stored Cardmarket blended and TCG general estimates, without asserting provider-map eligibility');
    assert.equal(after.cards.find((x:any)=>x.language_code==='en').stale,1); assert.equal(after.cards.find((x:any)=>x.language_code==='ja').missing_quote,1); assert.equal(after.cards.find((x:any)=>x.language_code==='ko').unsupported,1); assert.equal(after.runStatus,'partial');
    await db.exec('reset role; set role anon'); await assert.rejects(coverage(),/permission denied/);
    console.log('Bounded catalogue bulk coverage passed: physical latest denominator and prior coverage semantics agree.');
  } finally { await db.close(); }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
