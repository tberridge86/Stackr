-- Production: oakdbbzdqwurpjnoqhmu; exact reviewed data repair, not a schema migration.
-- Restores shared artwork without changing images, variant/finish identity or publication membership.
begin;
set local lock_timeout='3s';
set local statement_timeout='90s';
do $repair$
declare modified_count integer; audit_count integer; log_count integer;
begin

with duplicates as materialized (
 select a.* from catalog.assets a
 where a.asset_type='card_image' and a.storage_provider='unavailable'
 and a.unavailable_reason ~ '^duplicate_content:[0-9a-f-]{36}$'
 and a.permission_status='approved' and a.rights_status='approved'
 and a.asset_visibility='public_catalogue' and a.retention_status='unavailable'
 and a.deleted_at is null and a.deprecated_at is null
), candidates as materialized (
 select d.id duplicate_id,t.id target_asset_id,v.id variant_id,tv.id target_variant_id,
 v.language_code,v.set_id,v.printing_id,v.collector_number,v.variant_code,v.finish_code,
 v.canonical_key,tv.updated_at target_variant_updated_at,v.updated_at variant_updated_at,d.updated_at duplicate_updated_at,t.updated_at target_updated_at,
 d.content_sha256,t.storage_bucket,t.storage_key,t.derivative_list,t.width,t.height,
 vv.catalogue_version_id
 from duplicates d
 join catalog.card_variants v on v.id=d.variant_id
 join catalog.assets t on t.id=split_part(d.unavailable_reason,':',2)::uuid
 join catalog.card_variants tv on tv.id=t.variant_id
 join ingest.sources source on source.id=d.source_id
 join ingest.sources ts on ts.id=t.source_id
 join catalog.catalogue_version_variants vv on vv.variant_id=v.id
 join catalog.catalogue_versions cv on cv.id=vv.catalogue_version_id
 join catalog.catalogue_version_assets va on va.asset_id=t.id and va.catalogue_version_id=vv.catalogue_version_id and va.variant_id=tv.id
 where v.deprecated_at is null and v.native_image_status='available' and v.same_artwork_as_variant_id is null
 and tv.deprecated_at is null and tv.native_image_status='available' and tv.same_artwork_as_variant_id is null
 and ((v.artwork_key is not null and tv.artwork_key=v.artwork_key)
 or (v.artwork_key is null and tv.artwork_key is null
 and v.variant_code in ('normal','holo','reverse_holo') and tv.variant_code in ('normal','holo','reverse_holo')
 and v.finish_code=v.variant_code and tv.finish_code=tv.variant_code))
 and tv.printing_id=v.printing_id and tv.set_id=v.set_id and tv.language_code=v.language_code
 and tv.game_code=v.game_code and tv.collector_number=v.collector_number and tv.id<>v.id
 and cv.status='published' and cv.deprecated_at is null and cv.language_code=v.language_code
 and source.active and source.licence_status='approved' and source.deprecated_at is null
 and ts.active and ts.licence_status='approved' and ts.deprecated_at is null
 and d.content_sha256=t.content_sha256 and t.content_sha256 ~ '^[0-9a-f]{64}$'
 and t.asset_type='card_image' and t.storage_provider='supabase_storage' and t.storage_bucket='stackr-catalogue-public'
 and t.permission_status='approved' and t.rights_status='approved' and t.publicly_servable
 and t.asset_visibility='public_catalogue' and t.retention_status='active'
 and t.deleted_at is null and t.deprecated_at is null
 and not exists(select 1 from catalog.assets a where a.variant_id=v.id and a.storage_provider<>'unavailable' and a.permission_status='approved' and a.rights_status='approved' and a.publicly_servable and a.retention_status='active' and a.deleted_at is null and a.deprecated_at is null)
)
, renditions as materialized (
 select c.variant_id,c.storage_bucket bucket,c.storage_key key,'original' role from candidates c
 union all
 select c.variant_id,d->>'storageBucket',d->>'storageKey',d->>'role'
 from candidates c cross join lateral jsonb_array_elements(c.derivative_list) d
 where d->>'role' in ('card-grid','search-result','detail-page')
 and d->>'storageProvider'='supabase_storage' and d->>'storageBucket'='stackr-catalogue-public'
 and d->>'contentSha256' ~ '^[0-9a-f]{64}$'
 and (d->>'width')::integer>0 and (d->>'height')::integer>0 and (d->>'byteSize')::bigint>0
), verified_renditions as materialized (
 select r.variant_id from renditions r join storage.objects o on o.bucket_id=r.bucket and o.name=r.key
 group by r.variant_id having count(distinct r.role)=4
), verified as materialized (
 select c.* from candidates c join verified_renditions r using(variant_id)
 where c.width>0 and c.height>0
), locked as materialized (
 select c.* from verified c
 join catalog.assets d on d.id=c.duplicate_id and d.updated_at=c.duplicate_updated_at
 join catalog.assets t on t.id=c.target_asset_id and t.updated_at=c.target_updated_at
 join catalog.card_variants tv on tv.id=c.target_variant_id and tv.updated_at=c.target_variant_updated_at
 join catalog.catalogue_versions cv on cv.id=c.catalogue_version_id
 join ingest.sources s on s.id=d.source_id join ingest.sources ts on ts.id=t.source_id
 where tv.native_image_status='available' and tv.same_artwork_as_variant_id is null and tv.deprecated_at is null
 and t.publicly_servable and t.permission_status='approved' and t.rights_status='approved'
 and t.retention_status='active' and t.deleted_at is null and t.deprecated_at is null
 and t.storage_provider='supabase_storage' and cv.status='published' and cv.deprecated_at is null
 and s.active and s.licence_status='approved' and s.deprecated_at is null
 and ts.active and ts.licence_status='approved' and ts.deprecated_at is null
 for share of d,t,tv,cv,s,ts
),
evidence as materialized (
 select count(*) n,count(distinct variant_id) unique_variants,
 encode(digest(string_agg(duplicate_id::text||'|'||target_asset_id::text||'|'||variant_id::text||'|'||target_variant_id::text||'|'||catalogue_version_id::text||'|'||content_sha256,E'\n' order by variant_id),'sha256'),'hex') digest
 from locked
), updated as (
 update catalog.card_variants v
 set native_image_status='same_artwork_reference',same_artwork_as_variant_id=c.target_variant_id
 from locked c cross join evidence e
 where v.id=c.variant_id and v.updated_at=c.variant_updated_at
 and v.native_image_status='available' and v.same_artwork_as_variant_id is null
 and e.n=5271 and e.unique_variants=5271 and e.digest='34794a13e68b519ec28d6638a55600986db396c11672cfbcaaa5ae034ce723db'
 returning v.id,v.updated_at
), audit_rows as (
 insert into audit.catalogue_events(request_id,actor_role,event_type,entity_schema,entity_table,entity_id,canonical_key,event_payload,internal_notes)
 select 'captured-artwork-restore-20260910-34794a13e68b','catalogue_repair_cli','captured_same_printing_artwork_restored','catalog','card_variants',u.id,c.canonical_key,
 jsonb_build_object('evidenceDigest','34794a13e68b519ec28d6638a55600986db396c11672cfbcaaa5ae034ce723db','duplicateAssetId',c.duplicate_id,'targetAssetId',c.target_asset_id,
 'targetVariantId',c.target_variant_id,'catalogueVersionId',c.catalogue_version_id,'contentSha256',c.content_sha256,
 'languageCode',c.language_code,'setId',c.set_id,'printingId',c.printing_id,'collectorNumber',c.collector_number,
 'variantCode',c.variant_code,'finishCode',c.finish_code,
 'beforeNativeImageStatus','available','beforeSameArtworkAsVariantId',null,
 'beforeUpdatedAt',c.variant_updated_at,'afterUpdatedAt',u.updated_at),
 'Existing approved capture bytes equal current same-printing, same-language artwork. Explicit shared-artwork display; finish identity preserved.'
 from updated u join locked c on c.variant_id=u.id returning entity_id
), log_rows as (
 insert into catalog.catalogue_change_log(entity_schema,entity_table,entity_id,change_type,mobile_syncable,public_change_summary)
 select 'catalog','card_variants',u.id,'update',true,
 jsonb_build_object('languageCode',c.language_code,'setId',c.set_id,'printingId',c.printing_id,
 'sharedArtworkRestored',true,'evidenceDigest','34794a13e68b519ec28d6638a55600986db396c11672cfbcaaa5ae034ce723db')
 from updated u join locked c on c.variant_id=u.id returning entity_id
)
select (select count(*) from updated),(select count(*) from audit_rows),(select count(*) from log_rows)
into modified_count,audit_count,log_count;
if modified_count<>5271 or audit_count<>5271 or log_count<>5271 then
 raise exception 'Artwork repair scope changed; transaction cancelled: updated %, audited %, logged %',modified_count,audit_count,log_count;
end if;
end
$repair$;
commit;
select event_payload->>'languageCode' language,count(*) restored_variants
from audit.catalogue_events where request_id='captured-artwork-restore-20260910-34794a13e68b' group by 1 order by 1;
