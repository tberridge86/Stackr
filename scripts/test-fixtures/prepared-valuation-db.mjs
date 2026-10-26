import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export const ownerA = '00000000-0000-4000-8000-000000000001';
export const ownerB = '00000000-0000-4000-8000-000000000002';
export const id = (n) => '10000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const schema = JSON.parse(readFileSync(new URL('./prepared-valuation-schema.json',import.meta.url),'utf8'));
const original = readFileSync(new URL('../../supabase/migrations/20260919100104_catalogue_pricing_cycles.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n');
export const baselineFunction = original.slice(original.indexOf('create function api.collection_valuation_inputs('), original.indexOf('\ncreate table public.collection_valuation_generations')).trim();
export const baselineQuery = baselineFunction.split('as $$')[1].split('$$;')[0].trim().replace(/;$/,'').replaceAll('p_owner','$1::uuid');
export const materializedQuery = baselineQuery.replace('payload as (','payload as materialized (');
// OFFSET 0 keeps the single payload row behind a subquery boundary without a
// MATERIALIZED payload tuplestore. Recheck the plan after PostgreSQL upgrades.
export const candidateFunction = baselineFunction.replace('create function','create or replace function')
  .replace(' payload as (', ' -- Prevent repeated JSON aggregation without materializing a second large tuple.\n -- OFFSET 0 is a planner barrier: retain the plan regression on PostgreSQL upgrades.\n payload as (')
  .replace(')) body)', ')) body offset 0)');
export const candidateQuery = baselineQuery.replace(')) body)', ')) body offset 0)');
const type = (c) => c.udt==='_text'?'text[]':c.udt;
export async function createPreparedDatabase(db = new PGlite()) {
  await db.exec("create schema api; create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public,api to service_role,anon,authenticated; set timezone='UTC'; set work_mem='2184kB';");
  for (const table of ['binders','binder_cards','user_card_variants']) {
    const columns=schema.columns.filter(c=>c.table===table);
    await db.exec('create table public.'+table+' ('+columns.map(c=>'"'+c.column+'" '+type(c)).join(',')+');');
    for(const idx of schema.indexes.filter(x=>x.table===table)) await db.exec(idx.definition);
    await db.exec('alter table public.'+table+' enable row level security; grant select on public.'+table+' to service_role;');
  }
  await db.exec(baselineFunction);
  const generationSql=original.slice(original.indexOf('create table public.collection_valuation_generations'),original.indexOf('create function api.claim_collection_valuation(')).replace(' references auth.users(id) on delete cascade','');
  await db.exec(generationSql);
  await db.exec('revoke all on function api.request_collection_valuation(uuid,boolean) from public,anon,authenticated; grant execute on function api.request_collection_valuation(uuid,boolean) to service_role;');
  await db.exec('revoke all on function api.collection_valuation_inputs(uuid) from public,anon,authenticated; grant execute on function api.collection_valuation_inputs(uuid) to service_role;');
  async function seed(count, ownedCount, multilingual=false, foreignCount=2500) {
    await db.exec('reset role; truncate public.binders,public.binder_cards,public.user_card_variants;');
    const languages=multilingual?['en','ja','zh-cn','zh-tw','ko']:['en'];
    const binders=languages.map((language,i)=>({id:id(i+1),user_id:ownerA,language,name:'Synthetic '+language,type:'official',source_set_id:'fixture',created_at:'2026-10-26T00:00:00Z',is_public:false,edition:'unlimited',default_condition:'Near Mint',card_mode:'raw',gradient:['#fff','#000'],lifecycle_version:1}));
    if(!count&&!ownedCount)binders.length=0;
    binders.push({id:id(99),user_id:ownerB,language:'ja',name:'Foreign public fixture',is_public:true});
    const cards=Array.from({length:count},(_,i)=>({id:id(1000+i),binder_id:id(i%languages.length+1),card_id:languages[i%languages.length]+':'+i,set_id:'fixture',slot_order:i,owned:i%7!==0,owned_quantity:i%3+1,language:languages[i%languages.length],notes:'Synthetic retained note '.repeat(8),card_name:multilingual?'ピカチュウ 皮卡丘 피카츄':'Pikachu',card_number:String(multilingual?Math.floor(i/languages.length):i),created_at:'2026-10-26T00:00:00.123Z',image_url:i%2?'https://legacy.example.invalid/card.webp':'https://r2.example.invalid/card.webp',slab_image_url:i%11?'':'https://private.example.invalid/slab.webp',cert_number:i%11?null:'synthetic-certificate',set_name:'Synthetic full-width set',set_total:count,api_card_id:'api:'+i,api_set_id:'fixture',tcg_price:i%4?12.34:null,ebay_price:null,cardmarket_price:i%5?11.25:null,condition:'Near Mint',grade_company:null,grade:null,graded_value:null,last_price_update:'2026-10-25T12:00:00Z',lifecycle_version:1}));
    cards.push(...Array.from({length:foreignCount},(_,i)=>({id:id(100000+i),binder_id:id(99),card_id:'foreign:'+i,set_id:'fixture',language:'ja',notes:'foreign private fixture',owned:true,owned_quantity:1})));
    const owned=Array.from({length:ownedCount},(_,i)=>({id:id(50000+i),user_id:ownerA,card_id:languages[i%languages.length]+':'+i,set_id:'fixture',variant:i%2?'holo':'normal',quantity:i%3+1,condition:'Near Mint',grade_company:'',grade:'',created_at:'2026-10-26T00:00:00Z',updated_at:'2026-10-26T01:02:03.456Z',lifecycle_version:1}));
    owned.push({id:id(90000),user_id:ownerA,card_id:'excluded-zero',set_id:'fixture',quantity:0},{id:id(90001),user_id:ownerA,card_id:'excluded-negative',set_id:'fixture',quantity:-1},
      ...Array.from({length:foreignCount},(_,i)=>({id:id(200000+i),user_id:ownerB,card_id:'foreign:'+i,set_id:'fixture',quantity:1})));
    for(const [table,rows] of [['binders',binders],['binder_cards',cards],['user_card_variants',owned]]) {
      const cols=schema.columns.filter(c=>c.table===table), names=cols.map(c=>'"'+c.column+'"').join(',');
      await db.query('insert into public.'+table+'('+names+') select '+names+' from jsonb_to_recordset($1::jsonb) as t('+cols.map(c=>'"'+c.column+'" '+type(c)).join(',')+')',[JSON.stringify(rows)]);
      await db.exec('analyze public.'+table);
    }
    await db.exec('set role service_role');
    return {saved:count,owned:ownedCount,binders:binders.length-1,foreignSaved:foreignCount,foreignOwned:foreignCount,languages};
  }
  return {db,seed};
}
