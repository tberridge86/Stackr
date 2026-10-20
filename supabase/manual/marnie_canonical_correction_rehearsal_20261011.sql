-- TRANSLATION-MARNIE-001: reviewed canonical-name correction rehearsal only.
-- This script deliberately ends in ROLLBACK. Do not change that terminator
-- without a separately approved live write, fresh before-image and review.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';
lock table catalog.card_printings, catalog.card_variants, catalog.card_names,
  catalog.catalogue_versions, catalog.catalogue_version_printings, catalog.catalogue_version_variants,
  catalog.catalogue_change_log in share row exclusive mode;

create temporary table marnie_targets (
  printing_id uuid not null,
  variant_id uuid primary key,
  english_name_id uuid not null,
  set_id uuid not null,
  collector_number text not null,
  variant_code text not null,
  finish_code text not null,
  expected_updated_at timestamptz not null
) on commit drop;

insert into marnie_targets(printing_id, variant_id, english_name_id, set_id, collector_number, variant_code, finish_code, expected_updated_at) values
('1386b19f-ada3-447a-83d0-105acf48752c','4d1df959-e323-44c5-b26b-56eda54a7a97','e0a4fffb-ae6b-4d4c-ba4a-926f6dca7759','41251d8a-6a1c-4f91-8e84-22e2fe7737fd','120','normal','normal','2026-10-06T19:49:23.353178+01:00'),
('3467f1b3-cfed-47c1-bddb-73a6507009b4','03f358c0-84a4-4b6e-98d0-9f5ba4dd7b8c','379f69f1-850f-477f-adae-446b68ec3d73','4b4beb82-d593-4c0b-850f-3197e7dd0ac5','163','normal','normal','2026-10-06T19:49:17.96426+01:00'),
('44b54476-f33f-435f-8985-b412cb5edb4c','dbbc22b5-df74-4c2f-9c9c-84c8567d77d4','840bdc42-fb72-4139-a7cf-cfd0537594c2','e6feffca-611b-479c-bfb2-43b80374458f','177','normal','normal','2026-10-06T19:49:04.857771+01:00'),
('4a459e00-0853-43a7-b0a6-e9d0f56c42f6','28542b48-d40e-4cb8-8598-45a4c8720e4c','0070936d-d340-47ad-96d5-da42862035a7','205ab185-9052-4965-b9f0-20fe44b7b61f','171','normal','normal','2026-10-06T19:49:16.223958+01:00'),
('4a9af5de-61f9-4bb7-8133-5d28e2b356ad','ded5a7a6-8c57-481c-94eb-264e091906a1','31969f87-600d-45fe-898f-8e3afff13492','7201a603-407b-491c-b118-467f6549e400','160','normal','normal','2026-10-06T19:49:11.435254+01:00'),
('4a9af5de-61f9-4bb7-8133-5d28e2b356ad','3c0cf56d-6413-47dc-b655-f6642111533e','ed115f7d-9902-49c2-a47b-6303803f416b','7201a603-407b-491c-b118-467f6549e400','160','reverse_holo','reverse_holo','2026-10-06T19:49:11.435254+01:00'),
('63019ce2-f59b-4aed-a3e0-025789ecb7ab','fab226b8-7f2e-4b02-8f2b-0e858b977ae1','52a953c0-ea98-4c81-8f5f-63baceca8f38','c816b27f-f145-413b-b971-3f7b1542f24c','156','normal','normal','2026-10-06T19:49:26.171478+01:00'),
('818b3095-25cf-491e-b536-6a2e7513a3a0','01e51188-e92f-4370-a7f4-ad5d3bfdfd87','acef624e-6440-4b91-b745-8424d893fea9','6c446b0c-155d-4926-b0ee-5369f6ac44d3','028','normal','normal','2026-10-06T19:50:07.078228+01:00'),
('971eba73-3c5f-4306-a6d5-700e8b748c9b','e319bdb2-763f-48e1-a61f-8dccc46867f0','9b2526f7-1b50-4457-8bbf-e82e85e34384','5578c7d0-f386-4945-b651-65dd2f3ee2d3','143','normal','normal','2026-10-06T19:49:26.171478+01:00'),
('a52f71c8-a76c-449a-8030-219ec64a61d8','1ce3153e-0a64-4697-a486-50f35c2cbede','a367df2a-938d-4d61-9d0c-b3d69bfff11f','d14fde0e-c786-41d0-93ef-6dc69cef94d0','156','normal','normal','2026-10-06T19:49:23.353178+01:00'),
('c3ee4722-7304-4cbf-a905-93162e371e76','2c460cdc-2735-4f7e-a569-01672fa514d5','aabed11b-9f46-4d5b-9f60-4b82b7d31916','1217161f-69bf-4176-acce-93f23e475d04','026','normal','normal','2026-10-06T19:50:07.078228+01:00'),
('d2132ffe-de94-462d-be98-8b6fba08e8ad','4de6ad23-8639-4de7-a0bf-4ec2e8cf3057','d7aefa3d-1179-44c5-8ab1-e8d673037cb4','205ab185-9052-4965-b9f0-20fe44b7b61f','149','normal','normal','2026-10-06T19:49:16.223958+01:00'),
('f9c8c84e-1179-4585-8a38-9591727bb676','97460152-b00f-46b2-a25e-b2ded70e2ab3','d1ca9223-84a3-415e-9a3a-2f3eca600e05','70184f97-2d37-457a-8ae4-21a4b40d270c','147','normal','normal','2026-10-06T19:49:57.558818+01:00');

do $guard$
begin
  if (select count(*) from marnie_targets) <> 13
    or (select count(distinct printing_id) from marnie_targets) <> 12 then
    raise exception 'Expected exactly 12 printings and 13 variants';
  end if;
  if (select count(*) from catalog.catalogue_versions
      where id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid
        and language_code='zh-tw' and status='published' and deprecated_at is null) <> 1
    or (select count(*) from catalog.catalogue_versions
      where language_code='zh-tw' and status='published' and deprecated_at is null) <> 1 then
    raise exception 'Expected captured published Traditional Chinese catalogue version';
  end if;
  if (select count(*) from catalog.card_printings p join (select distinct printing_id,set_id,collector_number from marnie_targets) t on t.printing_id=p.id
      where p.set_id=t.set_id and p.collector_number=t.collector_number
        and p.language_code='zh-tw' and p.native_name='瑪俐' and p.supertype='Trainer'
        and p.english_display_name='Pikachu' and p.source_updated_at is null and p.deprecated_at is null
        and p.corrected_by_printing_id is null) <> 12 then
    raise exception 'Marnie printing identity or current English display drifted';
  end if;
  if exists (select 1 from catalog.card_printings p join marnie_targets t on t.printing_id=p.id
      where p.updated_at <> t.expected_updated_at) then
    raise exception 'Marnie printing timestamp drifted; capture a fresh before-image';
  end if;
  if (select count(*) from catalog.card_variants v join marnie_targets t on t.variant_id=v.id
      where v.printing_id=t.printing_id and v.set_id=t.set_id and v.collector_number=t.collector_number
        and v.variant_code=t.variant_code and v.finish_code=t.finish_code and v.language_code='zh-tw'
        and v.source_updated_at is null and v.deprecated_at is null) <> 13 then
    raise exception 'Marnie variant identity drifted';
  end if;
  if (select count(*) from catalog.card_variants v where v.printing_id in(select distinct printing_id from marnie_targets)
      and v.deprecated_at is null) <> 13 then
    raise exception 'An unreviewed active Marnie variant or finish exists';
  end if;
  if (select count(*) from catalog.card_names n join marnie_targets t on t.english_name_id=n.id
      where n.printing_id=t.printing_id and n.variant_id=t.variant_id
        and n.language_code='en' and n.name_type='english_display'
        and n.name='Pikachu' and n.normalized_name='pikachu' and n.source_confidence=0.85
        and n.source_updated_at is null and n.deprecated_at is null and n.deprecated_reason is null
        and n.updated_at=t.expected_updated_at) <> 13 then
    raise exception 'Scoped English aliases or timestamps drifted';
  end if;
  if (select count(*) from catalog.card_names n join marnie_targets t on t.variant_id=n.variant_id
      where n.printing_id=t.printing_id and n.language_code='zh-tw' and n.name_type='native'
        and n.name='瑪俐' and n.normalized_name='瑪俐' and n.deprecated_at is null) <> 13 then
    raise exception 'Native aliases drifted; do not continue';
  end if;
  if exists (select 1 from marnie_targets t left join catalog.card_names n
      on n.printing_id=t.printing_id and n.variant_id=t.variant_id and n.language_code='en'
        and n.name_type='english_display' and n.deprecated_at is null
      group by t.variant_id having count(n.id) <> 1) then
    raise exception 'Unexpected active English alias cardinality';
  end if;
  if (select count(*) from catalog.card_names n where n.printing_id in(select distinct printing_id from marnie_targets)
      and n.language_code='en' and n.name_type='english_display' and n.deprecated_at is null) <> 13
    or exists (select 1 from catalog.card_names n where n.printing_id in(select distinct printing_id from marnie_targets)
      and n.language_code='en' and n.name_type='english_display' and n.deprecated_at is null
      and n.id not in(select english_name_id from marnie_targets)) then
    raise exception 'Unexpected printing-level English alias exists';
  end if;
  if exists (select 1 from catalog.card_names n where n.language_code='zh-tw' and n.name='皮卡丘'
      and n.printing_id in (select distinct printing_id from marnie_targets)) then
    raise exception 'Target overlap with genuine Pikachu cohort';
  end if;
  if (select count(distinct cvp.printing_id) from catalog.catalogue_version_printings cvp
      join marnie_targets t on t.printing_id=cvp.printing_id and t.set_id=cvp.set_id
      join catalog.catalogue_versions cv on cv.id=cvp.catalogue_version_id
      where cv.id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid and cvp.language_code='zh-tw'
        and cv.language_code='zh-tw' and cv.status='published' and cv.deprecated_at is null) <> 12 then
    raise exception 'Every target printing must remain published';
  end if;
  if (select count(*) from catalog.catalogue_version_variants cvv join marnie_targets t on t.variant_id=cvv.variant_id
        and t.printing_id=cvv.printing_id and t.set_id=cvv.set_id
      join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id
      where cv.id='f15e8ee8-c3ae-43e8-bc06-7cbd4adac70e'::uuid and cvv.language_code='zh-tw'
        and cv.language_code='zh-tw' and cv.status='published' and cv.deprecated_at is null) <> 13 then
    raise exception 'Every target variant must remain published';
  end if;
end $guard$;

update catalog.card_printings p
set english_display_name='Marnie', updated_at=now()
where p.id in (select distinct printing_id from marnie_targets);

update catalog.card_names n
set name='Marnie', normalized_name='marnie', updated_at=now()
from marnie_targets t
where n.id=t.english_name_id and n.printing_id=t.printing_id and n.variant_id=t.variant_id;

insert into catalog.catalogue_change_log
  (catalogue_version_id,entity_schema,entity_table,entity_id,entity_key,change_type,mobile_syncable,public_change_summary)
select cv.id,'catalog','card_printings',p.id,'marnie-canonical-correction-20261011:printing:'||p.id::text,
  'correct',true,jsonb_build_object('field','english_display_name','previous','Pikachu','current','Marnie',
    'sourceProposal','docs/audits/20261010/marnie-alias-correction.json',
    'beforeImageCanonicalSha256','1c472427d8cff2f506a58d79cb975565e6af2231e86ecb744922430def533677')
from catalog.card_printings p cross join catalog.catalogue_versions cv
where p.id in (select distinct printing_id from marnie_targets)
  and cv.language_code='zh-tw' and cv.status='published' and cv.deprecated_at is null;

insert into catalog.catalogue_change_log
  (catalogue_version_id,entity_schema,entity_table,entity_id,entity_key,change_type,mobile_syncable,public_change_summary)
select cv.id,'catalog','card_names',n.id,'marnie-canonical-correction-20261011:name:'||n.id::text,
  'correct',true,jsonb_build_object('field','english_display_alias','previous','Pikachu','current','Marnie',
    'printingId',t.printing_id,'variantId',t.variant_id)
from catalog.card_names n join marnie_targets t on t.english_name_id=n.id
cross join catalog.catalogue_versions cv
where cv.language_code='zh-tw' and cv.status='published' and cv.deprecated_at is null;

update catalog.catalogue_versions cv
set max_change_sequence=(select max(change_sequence) from catalog.catalogue_change_log where catalogue_version_id=cv.id),
    updated_at=now()
where cv.language_code='zh-tw' and cv.status='published' and cv.deprecated_at is null;

do $verify$
begin
  if (select count(*) from catalog.card_printings where id in(select distinct printing_id from marnie_targets)
      and english_display_name='Marnie') <> 12
    or (select count(*) from catalog.card_names where id in(select english_name_id from marnie_targets)
      and name='Marnie' and normalized_name='marnie') <> 13 then
    raise exception 'Scoped Marnie update incomplete';
  end if;
  if (select count(*) from catalog.card_names n join marnie_targets t on t.variant_id=n.variant_id
      where n.printing_id=t.printing_id and n.language_code='zh-tw' and n.name_type='native'
        and n.name='瑪俐' and n.deprecated_at is null) <> 13 then
    raise exception 'Native aliases were not preserved';
  end if;
  if (select count(*) from api.catalogue_delta_changes
      where entity_key like 'marnie-canonical-correction-20261011:%') <> 25 then
    raise exception 'Expected 25 mobile-syncable correction receipts';
  end if;
end $verify$;

-- Rehearsal is non-destructive by default.
rollback;
select 'REHEARSAL_ROLLED_BACK' result;
