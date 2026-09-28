// Generates bounded staging-only subtransaction rehearsals. Every inserted row rolls back.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {validatePlan,payload,chunks,STAGE_JA} from './publish.mjs';
const receipt=JSON.parse(await readFile(new URL('./plan-receipt.json',import.meta.url)));
const rows=validatePlan(await readFile(new URL('./cohort.json.gz',import.meta.url)),receipt);
const out=process.argv[2];if(!out)throw Error('Output directory required');await mkdir(out,{recursive:true});
const quote=s=>"'"+s.replaceAll("'","''")+"'";
for(const [index,batch] of chunks(rows,100).entries()) {
  const data=batch.map(r=>({asset:payload(r,null,receipt,{approved:false,rehearsal_only:true},'staging'),source_code:r.source_code,version:r.language_code==='ja'?STAGE_JA:r.catalogue_version_id,language:r.language_code}));
  const keys=Object.keys(data[0].asset);
  const insert=`insert into catalog.assets(${keys.join(',')}) select ${keys.map(k=>k==='source_id'?'s.id':'a.'+k).join(',')} from jsonb_array_elements(expected) x cross join lateral jsonb_populate_record(null::catalog.assets,x->'asset') a join ingest.sources s on s.code=x->>'source_code' on conflict do nothing`;
  const link=`insert into catalog.catalogue_version_assets(catalogue_version_id,language_code,set_id,printing_id,variant_id,asset_id,asset_type) select (x->>'version')::uuid,x->>'language',a.set_id,a.printing_id,null,a.id,'card_image' from jsonb_array_elements(expected) x join catalog.assets a on a.asset_id=x->'asset'->>'asset_id' on conflict do nothing`;
  const sql=`set statement_timeout='45000'; do $rehearsal$
declare expected jsonb := ${quote(JSON.stringify(data))}::jsonb; changed integer; visible integer; asset_ids uuid[];
begin
 if exists(select 1 from catalog.assets where asset_id in(select x->'asset'->>'asset_id' from jsonb_array_elements(expected)x)) then raise exception 'Rehearsal requires absent cohort';end if;
 if exists(select 1 from ingest.sources where code='pokemon_card_tw_official') then raise exception 'Existing Taiwan source requires separate review';end if;
 begin
  insert into ingest.sources(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values('pokemon_card_tw_official','Pokémon Taiwan official artwork','image','https://asia.pokemon-card.com/tw','under_review',true,false,'Transaction rehearsal only; rolls back');
  ${insert};get diagnostics changed=row_count;if changed<>${batch.length} then raise exception 'Wrong inserted population';end if;
  ${link};get diagnostics changed=row_count;if changed<>${batch.length} then raise exception 'Wrong link population';end if;
  select array_agg(id) into asset_ids from catalog.assets where asset_id in(select x->'asset'->>'asset_id' from jsonb_array_elements(expected)x);
  select count(*) into visible from api.asset_manifest m where m.asset_row_id=any(asset_ids);
  if visible<>${batch.length} then raise exception 'Incomplete public manifest in rehearsal: %',visible;end if;
  ${insert};get diagnostics changed=row_count;if changed<>0 then raise exception 'Non-idempotent assets';end if;
  ${link};get diagnostics changed=row_count;if changed<>0 then raise exception 'Non-idempotent links';end if;
  raise exception using errcode='ZST01',message='Verified rehearsal rollback';
 exception when sqlstate 'ZST01' then null;
 end;
 if exists(select 1 from catalog.assets where asset_id in(select x->'asset'->>'asset_id' from jsonb_array_elements(expected)x)) or exists(select 1 from ingest.sources where code='pokemon_card_tw_official') then raise exception 'Rollback incomplete';end if;
end $rehearsal$;
select ${batch.length}::int as rehearsed_fronts,true as manifest_verified,true as idempotency_verified,true as rollback_verified,0::int as persistent_writes;`;
  await writeFile(`${out}/${index+1}.sql`,sql);
}

