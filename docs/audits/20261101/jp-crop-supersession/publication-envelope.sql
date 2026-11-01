begin read only;
set local statement_timeout='5s'; set local lock_timeout='1s';
with candidate_ids as materialized (select id from catalog.assets where asset_id='reviewed:set-logo:e8e16a23-fc7a-4ec8-abfe-b74448fa5f27:7dcfb743b476c6cba7771d20a6ace737ba67201c1fa53b8b260d0079967c0383'
union
select id from catalog.assets where storage_provider='s3_compatible' and storage_bucket='stackr-catalogue-public' and storage_key='public/set_logo/7d/cf/7dcfb743b476c6cba7771d20a6ace737ba67201c1fa53b8b260d0079967c0383/original.png' and deleted_at is null
union
select id from catalog.assets where content_sha256='7dcfb743b476c6cba7771d20a6ace737ba67201c1fa53b8b260d0079967c0383' and deleted_at is null and set_id='e8e16a23-fc7a-4ec8-abfe-b74448fa5f27'::uuid and asset_type='set_logo'
union
select id from catalog.assets where asset_id='reviewed:set-logo:7dbeff79-cfb7-4ac8-8a4f-d7c73a523349:f11661657260c1c19e1da24ceeeb5ef69fd59a16f436fedfa204a473da103add'
union
select id from catalog.assets where storage_provider='s3_compatible' and storage_bucket='stackr-catalogue-public' and storage_key='public/set_logo/f1/16/f11661657260c1c19e1da24ceeeb5ef69fd59a16f436fedfa204a473da103add/original.png' and deleted_at is null
union
select id from catalog.assets where content_sha256='f11661657260c1c19e1da24ceeeb5ef69fd59a16f436fedfa204a473da103add' and deleted_at is null and set_id='7dbeff79-cfb7-4ac8-8a4f-d7c73a523349'::uuid and asset_type='set_logo'), candidates as (
 select a.* from candidate_ids wanted join catalog.assets a on a.id=wanted.id order by a.id limit 1001
)
select jsonb_build_object('schemaVersion','stackr-jp-crop-publication-envelope-v1',
 'declaredProjectRef','oakdbbzdqwurpjnoqhmu','capturedAt',now(),
 'sets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'game_code',s.game_code,'language_code',s.language_code,
   'set_code',s.set_code,'provider_set_code',s.provider_set_code,'native_name',s.native_name,
   'english_display_name',s.english_display_name,'deprecated_at',s.deprecated_at) order by s.id)
   from catalog.sets s where s.id in ('e8e16a23-fc7a-4ec8-abfe-b74448fa5f27'::uuid,'7dbeff79-cfb7-4ac8-8a4f-d7c73a523349'::uuid)),'[]'::jsonb),
 'publishedMemberships',coalesce((select jsonb_agg(to_jsonb(p) order by p.set_id,p.catalogue_version_id)
   from (select set_id,catalogue_version_id,language_code from api.catalogue_sets where set_id in ('e8e16a23-fc7a-4ec8-abfe-b74448fa5f27'::uuid,'7dbeff79-cfb7-4ac8-8a4f-d7c73a523349'::uuid) limit 101) p),'[]'::jsonb),
 'candidateAssets',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from candidates a),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code)) from ingest.sources s where s.code='stackr_manual'),'[]'::jsonb)
) as publication_envelope;
rollback;
