-- TRANSLATION-MARNIE-001 bounded inverse rehearsal only.
-- It is valid only after the matching forward correction has been independently
-- verified. It ends in ROLLBACK and must never be used as broad name cleanup.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';
lock table catalog.card_printings, catalog.card_names, catalog.catalogue_versions,
  catalog.catalogue_version_printings, catalog.catalogue_version_variants,
  catalog.catalogue_change_log in share row exclusive mode;

create temporary table marnie_rollback_targets (
  printing_id uuid not null,
  variant_id uuid primary key,
  english_name_id uuid not null
) on commit drop;
create temporary table marnie_rollback_printings (
  printing_id uuid primary key,
  set_id uuid not null,
  collector_number text not null
) on commit drop;

insert into marnie_rollback_targets values
('1386b19f-ada3-447a-83d0-105acf48752c','4d1df959-e323-44c5-b26b-56eda54a7a97','e0a4fffb-ae6b-4d4c-ba4a-926f6dca7759'),
('3467f1b3-cfed-47c1-bddb-73a6507009b4','03f358c0-84a4-4b6e-98d0-9f5ba4dd7b8c','379f69f1-850f-477f-adae-446b68ec3d73'),
('44b54476-f33f-435f-8985-b412cb5edb4c','dbbc22b5-df74-4c2f-9c9c-84c8567d77d4','840bdc42-fb72-4139-a7cf-cfd0537594c2'),
('4a459e00-0853-43a7-b0a6-e9d0f56c42f6','28542b48-d40e-4cb8-8598-45a4c8720e4c','0070936d-d340-47ad-96d5-da42862035a7'),
('4a9af5de-61f9-4bb7-8133-5d28e2b356ad','ded5a7a6-8c57-481c-94eb-264e091906a1','31969f87-600d-45fe-898f-8e3afff13492'),
('4a9af5de-61f9-4bb7-8133-5d28e2b356ad','3c0cf56d-6413-47dc-b655-f6642111533e','ed115f7d-9902-49c2-a47b-6303803f416b'),
('63019ce2-f59b-4aed-a3e0-025789ecb7ab','fab226b8-7f2e-4b02-8f2b-0e858b977ae1','52a953c0-ea98-4c81-8f5f-63baceca8f38'),
('818b3095-25cf-491e-b536-6a2e7513a3a0','01e51188-e92f-4370-a7f4-ad5d3bfdfd87','acef624e-6440-4b91-b745-8424d893fea9'),
('971eba73-3c5f-4306-a6d5-700e8b748c9b','e319bdb2-763f-48e1-a61f-8dccc46867f0','9b2526f7-1b50-4457-8bbf-e82e85e34384'),
('a52f71c8-a76c-449a-8030-219ec64a61d8','1ce3153e-0a64-4697-a486-50f35c2cbede','a367df2a-938d-4d61-9d0c-b3d69bfff11f'),
('c3ee4722-7304-4cbf-a905-93162e371e76','2c460cdc-2735-4f7e-a569-01672fa514d5','aabed11b-9f46-4d5b-9f60-4b82b7d31916'),
('d2132ffe-de94-462d-be98-8b6fba08e8ad','4de6ad23-8639-4de7-a0bf-4ec2e8cf3057','d7aefa3d-1179-44c5-8ab1-e8d673037cb4'),
('f9c8c84e-1179-4585-8a38-9591727bb676','97460152-b00f-46b2-a25e-b2ded70e2ab3','d1ca9223-84a3-415e-9a3a-2f3eca600e05');
insert into marnie_rollback_printings values
('1386b19f-ada3-447a-83d0-105acf48752c','41251d8a-6a1c-4f91-8e84-22e2fe7737fd','120'),
('3467f1b3-cfed-47c1-bddb-73a6507009b4','4b4beb82-d593-4c0b-850f-3197e7dd0ac5','163'),
('44b54476-f33f-435f-8985-b412cb5edb4c','e6feffca-611b-479c-bfb2-43b80374458f','177'),
('4a459e00-0853-43a7-b0a6-e9d0f56c42f6','205ab185-9052-4965-b9f0-20fe44b7b61f','171'),
('4a9af5de-61f9-4bb7-8133-5d28e2b356ad','7201a603-407b-491c-b118-467f6549e400','160'),
('63019ce2-f59b-4aed-a3e0-025789ecb7ab','c816b27f-f145-413b-b971-3f7b1542f24c','156'),
('818b3095-25cf-491e-b536-6a2e7513a3a0','6c446b0c-155d-4926-b0ee-5369f6ac44d3','028'),
('971eba73-3c5f-4306-a6d5-700e8b748c9b','5578c7d0-f386-4945-b651-65dd2f3ee2d3','143'),
('a52f71c8-a76c-449a-8030-219ec64a61d8','d14fde0e-c786-41d0-93ef-6dc69cef94d0','156'),
('c3ee4722-7304-4cbf-a905-93162e371e76','1217161f-69bf-4176-acce-93f23e475d04','026'),
('d2132ffe-de94-462d-be98-8b6fba08e8ad','205ab185-9052-4965-b9f0-20fe44b7b61f','149'),
('f9c8c84e-1179-4585-8a38-9591727bb676','70184f97-2d37-457a-8ae4-21a4b40d270c','147');

do $guard$
begin
  if (select count(*) from marnie_rollback_targets) <> 13
    or (select count(distinct printing_id) from marnie_rollback_targets) <> 12 then
    raise exception 'Expected exact 12/13 Marnie rollback cohort';
  end if;
  if (select count(*) from catalog.catalogue_versions where id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid
      and language_code='zh-tw' and status='published' and deprecated_at is null) <> 1 then
    raise exception 'Captured Traditional Chinese publication is no longer current';
  end if;
  if (select count(*) from catalog.catalogue_version_printings cvp
      join marnie_rollback_printings t on t.printing_id=cvp.printing_id and t.set_id=cvp.set_id
      where cvp.catalogue_version_id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid and cvp.language_code='zh-tw') <> 12 then
    raise exception 'Every rollback printing must remain published';
  end if;
  if (select count(*) from catalog.catalogue_version_variants cvv join marnie_rollback_targets t on t.variant_id=cvv.variant_id
      join marnie_rollback_printings p on p.printing_id=t.printing_id and p.printing_id=cvv.printing_id and p.set_id=cvv.set_id
      where cvv.catalogue_version_id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid and cvv.language_code='zh-tw') <> 13 then
    raise exception 'Every rollback variant must remain published';
  end if;
  if (select count(*) from catalog.card_printings p join marnie_rollback_printings t on t.printing_id=p.id
      where p.set_id=t.set_id and p.collector_number=t.collector_number
      and p.language_code='zh-tw' and p.native_name='瑪俐' and p.supertype='Trainer'
      and p.english_display_name='Marnie' and p.deprecated_at is null) <> 12
    or (select count(*) from catalog.card_names n join marnie_rollback_targets t on t.english_name_id=n.id
      where n.printing_id=t.printing_id and n.variant_id=t.variant_id and n.language_code='en'
        and n.name_type='english_display' and n.name='Marnie' and n.normalized_name='marnie' and n.deprecated_at is null) <> 13 then
    raise exception 'Post-correction values differ; do not roll back';
  end if;
  if (select count(*) from catalog.catalogue_change_log where entity_key like 'marnie-canonical-correction-20261011:%') <> 25 then
    raise exception 'Matching forward receipt is absent or incomplete';
  end if;
  if (select count(*) from catalog.catalogue_change_log c
      where c.catalogue_version_id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid and c.change_type='correct' and c.mobile_syncable
        and ((c.entity_table='card_printings' and c.entity_id in(select distinct printing_id from marnie_rollback_targets)
          and c.entity_key='marnie-canonical-correction-20261011:printing:'||c.entity_id::text
          and c.public_change_summary @> '{"field":"english_display_name","previous":"Pikachu","current":"Marnie","beforeImageCanonicalSha256":"1c472427d8cff2f506a58d79cb975565e6af2231e86ecb744922430def533677"}')
          or (c.entity_table='card_names' and c.entity_id in(select english_name_id from marnie_rollback_targets)
          and c.entity_key='marnie-canonical-correction-20261011:name:'||c.entity_id::text
          and c.public_change_summary @> '{"field":"english_display_alias","previous":"Pikachu","current":"Marnie"}')) ) <> 25 then
    raise exception 'Matching forward receipt fields differ';
  end if;
  if exists (select 1 from catalog.card_printings p join marnie_rollback_printings t on t.printing_id=p.id
      join catalog.catalogue_change_log c on c.entity_id=p.id and c.entity_key='marnie-canonical-correction-20261011:printing:'||p.id::text
      where p.set_id<>t.set_id or p.collector_number<>t.collector_number or p.language_code<>'zh-tw' or p.native_name<>'瑪俐' or p.supertype<>'Trainer' or p.source_updated_at is not null
        or p.updated_at<>c.changed_at)
    or exists (select 1 from catalog.card_names n join marnie_rollback_targets t on t.english_name_id=n.id
      join catalog.catalogue_change_log c on c.entity_id=n.id and c.entity_key='marnie-canonical-correction-20261011:name:'||n.id::text
      where n.printing_id<>t.printing_id or n.variant_id<>t.variant_id or n.language_code<>'en'
        or n.name_type<>'english_display' or n.source_confidence<>0.85 or n.source_updated_at is not null
        or n.deprecated_at is not null or n.deprecated_reason is not null or n.updated_at<>c.changed_at) then
    raise exception 'A later identity, provenance or timestamp change blocks rollback';
  end if;
end $guard$;

update catalog.card_printings p set english_display_name='Pikachu',updated_at=now()
where p.id in(select distinct printing_id from marnie_rollback_targets);
update catalog.card_names n set name='Pikachu',normalized_name='pikachu',updated_at=now()
from marnie_rollback_targets t where n.id=t.english_name_id and n.printing_id=t.printing_id and n.variant_id=t.variant_id;
insert into catalog.catalogue_change_log
  (catalogue_version_id,entity_schema,entity_table,entity_id,entity_key,change_type,mobile_syncable,public_change_summary)
select cv.id,'catalog','card_printings',p.id,'marnie-canonical-correction-rollback-20261011:printing:'||p.id::text,
  'correct',true,jsonb_build_object('field','english_display_name','previous','Marnie','current','Pikachu')
from catalog.card_printings p cross join catalog.catalogue_versions cv
where p.id in(select distinct printing_id from marnie_rollback_targets) and cv.id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid;
insert into catalog.catalogue_change_log
  (catalogue_version_id,entity_schema,entity_table,entity_id,entity_key,change_type,mobile_syncable,public_change_summary)
select cv.id,'catalog','card_names',n.id,'marnie-canonical-correction-rollback-20261011:name:'||n.id::text,
  'correct',true,jsonb_build_object('field','english_display_alias','previous','Marnie','current','Pikachu', 'printingId',t.printing_id,'variantId',t.variant_id)
from catalog.card_names n join marnie_rollback_targets t on t.english_name_id=n.id
cross join catalog.catalogue_versions cv where cv.id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid;
update catalog.catalogue_versions cv
set max_change_sequence=(select max(change_sequence) from catalog.catalogue_change_log where catalogue_version_id=cv.id),
    updated_at=now()
where cv.id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid;
do $verify$
begin
  if (select count(*) from catalog.card_printings where id in(select distinct printing_id from marnie_rollback_targets) and english_display_name='Pikachu') <> 12
    or (select count(*) from catalog.card_names where id in(select english_name_id from marnie_rollback_targets) and name='Pikachu' and normalized_name='pikachu') <> 13 then
    raise exception 'Bounded inverse incomplete';
  end if;
  if (select count(*) from api.catalogue_delta_changes where entity_key like 'marnie-canonical-correction-rollback-20261011:%') <> 25
    or (select count(*) from api.catalogue_delta_changes where entity_key like 'marnie-canonical-correction%-20261011:%') <> 50 then
    raise exception 'Expected 25 reverse receipts and 50 visible correction receipts';
  end if;
  if (select count(*) from catalog.catalogue_change_log c where c.entity_key like 'marnie-canonical-correction-rollback-20261011:%'
      and c.change_type='correct' and c.mobile_syncable and ((c.entity_table='card_printings'
        and c.public_change_summary @> '{"field":"english_display_name","previous":"Marnie","current":"Pikachu"}')
        or (c.entity_table='card_names' and c.public_change_summary @> '{"field":"english_display_alias","previous":"Marnie","current":"Pikachu"}'))) <> 25 then
    raise exception 'Reverse receipt fields differ';
  end if;
end $verify$;
rollback;
select 'ROLLBACK_REHEARSAL_ROLLED_BACK' result;
